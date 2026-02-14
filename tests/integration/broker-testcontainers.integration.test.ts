import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { Kafka } from 'kafkajs';
import * as amqp from 'amqplib';
import mqtt from 'mqtt';
import { GenericContainer, Network, Wait } from 'testcontainers';
import { KafkaContainer } from '@testcontainers/kafka';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { generateEventConsumer } from '../../packages/runtime/generators/consumers/index.js';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATED_TMP_ROOT = path.join(REPO_ROOT, 'artifacts', 'tmp-broker-int');
const RUN_BROKER_INTEGRATION = process.env.RUN_BROKER_INTEGRATION === '1';
const describeBroker = RUN_BROKER_INTEGRATION ? describe : describe.skip;

const KAFKA_IMAGE = process.env.KAFKA_TEST_IMAGE || 'confluentinc/cp-kafka:7.8.0';
const RABBITMQ_IMAGE = process.env.RABBITMQ_TEST_IMAGE || 'rabbitmq:3.13-alpine';
const MOSQUITTO_IMAGE = process.env.MOSQUITTO_TEST_IMAGE || 'eclipse-mosquitto:2';
const SCHEMA_REGISTRY_IMAGE =
  process.env.SCHEMA_REGISTRY_TEST_IMAGE || 'confluentinc/cp-schema-registry:7.8.0';

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function toClassName(eventName) {
  const baseName = String(eventName || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  if (!baseName) {
    return 'GeneratedEvent';
  }

  if (/^\d/.test(baseName)) {
    return `Event${baseName}`;
  }

  return baseName;
}

async function waitFor(check, timeoutMs = 30000, intervalMs = 200) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}

async function buildGeneratedConsumerModule(manifest) {
  const eventName = manifest.event.name;
  const className = toClassName(eventName);
  const generated = generateEventConsumer(manifest, {
    typescript: false,
    includeTests: false,
    includePIIUtil: false
  });

  await fs.mkdir(GENERATED_TMP_ROOT, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(GENERATED_TMP_ROOT, 'run-'));
  const fileName = `${eventName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-consumer.js`;
  const consumerFilePath = path.join(tempDir, fileName);
  await fs.writeFile(consumerFilePath, generated.consumer, 'utf8');

  const imported = await import(consumerFilePath);
  return {
    ConsumerClass: imported[`${className}Consumer`],
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

function mqttConnect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, options);
    const onConnect = () => {
      cleanup();
      resolve(client);
    };
    const onError = (error) => {
      cleanup();
      client.end(true);
      reject(error);
    };
    const cleanup = () => {
      client.off('connect', onConnect);
      client.off('error', onError);
    };
    client.on('connect', onConnect);
    client.on('error', onError);
  });
}

async function createKafkaKeystore(passphrase) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-kafka-cert-'));
  const keyPath = path.join(tempDir, 'kafka.key.pem');
  const certPath = path.join(tempDir, 'kafka.cert.pem');
  const pkcs12Path = path.join(tempDir, 'kafka.keystore.p12');

  await execFile('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=localhost',
    '-days',
    '1'
  ]);

  await execFile('openssl', [
    'pkcs12',
    '-export',
    '-inkey',
    keyPath,
    '-in',
    certPath,
    '-out',
    pkcs12Path,
    '-name',
    'kafka-server',
    '-passout',
    `pass:${passphrase}`
  ]);

  const content = await fs.readFile(pkcs12Path);
  return {
    content,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

describeBroker('real broker integration (testcontainers)', () => {
  describe('generated consumers with real brokers', () => {
    let kafkaContainer;
    let rabbitContainer;
    let mosquittoContainer;

    beforeAll(async () => {
      kafkaContainer = await new KafkaContainer(KAFKA_IMAGE).withKraft().start();
      rabbitContainer = await new RabbitMQContainer(RABBITMQ_IMAGE).start();
      mosquittoContainer = await new GenericContainer(MOSQUITTO_IMAGE)
        .withExposedPorts(1883)
        .withStartupTimeout(120000)
        .start();
    }, 240000);

    afterAll(async () => {
      await Promise.allSettled([
        kafkaContainer?.stop(),
        rabbitContainer?.stop(),
        mosquittoContainer?.stop()
      ]);
    });

    test('Kafka generated consumer connects, consumes, and handles processing errors', async () => {
      const broker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`;
      const topic = randomId('orders-topic');
      const groupId = randomId('orders-group');

      const kafka = new Kafka({ clientId: randomId('kafka-client'), brokers: [broker] });
      const admin = kafka.admin();
      await admin.connect();
      await admin.createTopics({
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
      });
      await admin.disconnect();

      const manifest = {
        event: { name: 'order.created' },
        delivery: { contract: { transport: 'kafka', topic } },
        schema: { fields: [] },
        semantics: { purpose: 'Integration test event' }
      };

      const { ConsumerClass, cleanup } = await buildGeneratedConsumerModule(manifest);

      let consumedValue = null;
      let errorMessage = null;

      class TrackingKafkaConsumer extends ConsumerClass {
        async handleMessage(payload) {
          const value = payload.message.value?.toString() || '{}';
          const parsed = JSON.parse(value);
          if (parsed.forceError) {
            throw new Error('forced-kafka-error');
          }
          consumedValue = parsed;
        }

        async handleError(error) {
          errorMessage = error.message;
        }
      }

      const consumer = new TrackingKafkaConsumer({
        brokers: [broker],
        groupId
      });

      const producer = kafka.producer();
      await producer.connect();

      try {
        await consumer.start();
        await new Promise((resolve) => setTimeout(resolve, 1500));

        await producer.send({
          topic,
          messages: [{ value: JSON.stringify({ orderId: 'A-1001', amount: 42 }) }]
        });

        await waitFor(() => consumedValue?.orderId === 'A-1001', 30000);

        await producer.send({
          topic,
          messages: [{ value: JSON.stringify({ forceError: true }) }]
        });

        await waitFor(() => errorMessage === 'forced-kafka-error', 30000);
      } finally {
        await consumer.stop();
        await producer.disconnect();
        await cleanup();
      }
    }, 240000);

    test('RabbitMQ generated consumer connects, consumes, and handles processing errors', async () => {
      const amqpUrl = rabbitContainer.getAmqpUrl();
      const queue = randomId('orders-queue');

      const manifest = {
        event: { name: 'order.created' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue,
              durable: false,
              prefetch: 1
            }
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Integration test event' }
      };

      const { ConsumerClass, cleanup } = await buildGeneratedConsumerModule(manifest);

      let consumedOrderId = null;
      let errorMessage = null;

      class TrackingAmqpConsumer extends ConsumerClass {
        async handleMessage(msg) {
          const parsed = JSON.parse(msg.content.toString());
          if (parsed.forceError) {
            throw new Error('forced-amqp-error');
          }
          consumedOrderId = parsed.orderId;
        }

        async handleError(error, msg) {
          errorMessage = error.message;
          await super.handleError(error, msg);
        }
      }

      const consumer = new TrackingAmqpConsumer(amqpUrl);
      const publisherConnection = await amqp.connect(amqpUrl);
      const publisherChannel = await publisherConnection.createChannel();
      await publisherChannel.assertQueue(queue, { durable: false });

      try {
        await consumer.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await publisherChannel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify({ orderId: 'B-2002' }))
        );
        await waitFor(() => consumedOrderId === 'B-2002', 30000);

        await publisherChannel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify({ forceError: true }))
        );
        await waitFor(() => errorMessage === 'forced-amqp-error', 30000);
      } finally {
        await consumer.stop();
        await publisherChannel.close();
        await publisherConnection.close();
        await cleanup();
      }
    }, 180000);

    test('Mosquitto generated consumer connects, consumes, and handles processing errors', async () => {
      const mqttUrl = `mqtt://${mosquittoContainer.getHost()}:${mosquittoContainer.getMappedPort(1883)}`;
      const topic = randomId('orders/topic');

      const manifest = {
        event: { name: 'order.created' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic,
            metadata: {
              qos: 1,
              cleanSession: true
            }
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Integration test event' }
      };

      const { ConsumerClass, cleanup } = await buildGeneratedConsumerModule(manifest);

      let consumedOrderId = null;
      let errorMessage = null;

      class TrackingMqttConsumer extends ConsumerClass {
        async handleMessage(_topic, message) {
          const parsed = JSON.parse(message.toString());
          if (parsed.forceError) {
            throw new Error('forced-mqtt-error');
          }
          consumedOrderId = parsed.orderId;
        }

        async handleError(error) {
          errorMessage = error.message;
        }
      }

      const consumer = new TrackingMqttConsumer(mqttUrl);
      const publisher = await mqttConnect(mqttUrl);

      try {
        await consumer.start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        publisher.publish(topic, JSON.stringify({ orderId: 'C-3003' }), { qos: 1 });
        await waitFor(() => consumedOrderId === 'C-3003', 30000);

        publisher.publish(topic, JSON.stringify({ forceError: true }), { qos: 1 });
        await waitFor(() => errorMessage === 'forced-mqtt-error', 30000);
      } finally {
        await consumer.stop();
        publisher.end(true);
        await cleanup();
      }
    }, 180000);
  });

  describe('broker auth modes', () => {
    test.each([
      ['SCRAM-SHA-256', 'scram-sha-256'],
      ['SCRAM-SHA-512', 'scram-sha-512']
    ])(
      'Kafka SASL auth works with %s',
      async (containerMechanism, clientMechanism) => {
        const passphrase = 'changeit';
        const username = 'broker-user';
        const password = 'broker-pass';
        const securePort = 19094;

        const { content: keystoreContent, cleanup } = await createKafkaKeystore(passphrase);

        const kafkaContainer = await new KafkaContainer(KAFKA_IMAGE)
          .withKraft()
          .withSaslSslListener({
            port: securePort,
            sasl: {
              mechanism: containerMechanism,
              user: {
                name: username,
                password
              }
            },
            keystore: {
              content: keystoreContent,
              passphrase
            }
          })
          .start();

        const secureBroker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(securePort)}`;
        const topic = randomId('auth-topic');
        const kafka = new Kafka({
          clientId: randomId('auth-client'),
          brokers: [secureBroker],
          ssl: { rejectUnauthorized: false },
          sasl: {
            mechanism: clientMechanism,
            username,
            password
          }
        });

        const admin = kafka.admin();
        const producer = kafka.producer();

        try {
          await admin.connect();
          await admin.createTopics({
            topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
          });
          await admin.disconnect();

          await producer.connect();
          await producer.send({
            topic,
            messages: [{ value: JSON.stringify({ status: 'ok' }) }]
          });
        } finally {
          await producer.disconnect().catch(() => undefined);
          await admin.disconnect().catch(() => undefined);
          await kafkaContainer.stop();
          await cleanup();
        }
      },
      240000
    );

    test('RabbitMQ username/password auth path is valid', async () => {
      const username = 'ossp-user';
      const password = 'ossp-pass';
      const rabbitContainer = await new RabbitMQContainer(RABBITMQ_IMAGE)
        .withEnvironment({
          RABBITMQ_DEFAULT_USER: username,
          RABBITMQ_DEFAULT_PASS: password
        })
        .start();

      const amqpUrl = new URL(rabbitContainer.getAmqpUrl());

      const connection = await amqp.connect({
        protocol: amqpUrl.protocol.replace(':', ''),
        hostname: amqpUrl.hostname,
        port: Number(amqpUrl.port),
        username,
        password,
        vhost: amqpUrl.pathname.slice(1) || '/'
      });

      try {
        const channel = await connection.createChannel();
        await channel.assertQueue(randomId('auth-check'), { durable: false });
        await channel.close();
      } finally {
        await connection.close();
        await rabbitContainer.stop();
      }
    }, 120000);
  });

  describe('schema registry integration', () => {
    test('Confluent Schema Registry container encodes/decodes Avro over Kafka', async () => {
      const network = await new Network().start();

      const kafkaContainer = await new KafkaContainer(KAFKA_IMAGE)
        .withKraft()
        .withNetwork(network)
        .withNetworkAliases('kafka')
        .start();

      const schemaRegistryContainer = await new GenericContainer(SCHEMA_REGISTRY_IMAGE)
        .withNetwork(network)
        .withNetworkAliases('schema-registry')
        .withExposedPorts(8081)
        .withStartupTimeout(240000)
        .withEnvironment({
          SCHEMA_REGISTRY_HOST_NAME: 'schema-registry',
          SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081',
          SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'PLAINTEXT://kafka:9092'
        })
        .withWaitStrategy(Wait.forLogMessage('Server started, listening for requests'))
        .start();

      const broker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9093)}`;
      const schemaRegistryHost = `http://${schemaRegistryContainer.getHost()}:${schemaRegistryContainer.getMappedPort(8081)}`;
      const topic = randomId('schema-topic');
      const groupId = randomId('schema-group');

      const kafka = new Kafka({
        clientId: randomId('schema-client'),
        brokers: [broker]
      });
      const admin = kafka.admin();
      const producer = kafka.producer();
      const consumer = kafka.consumer({ groupId });
      const registry = new SchemaRegistry({ host: schemaRegistryHost });

      let decodedMessage = null;

      try {
        await admin.connect();
        await admin.createTopics({
          topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
        });
        await admin.disconnect();

        const schema = {
          type: 'record',
          name: 'PaymentEvent',
          namespace: 'ossp.integration',
          fields: [
            { name: 'paymentId', type: 'string' },
            { name: 'amount', type: 'double' }
          ]
        };

        const { id } = await registry.register({
          type: SchemaType.AVRO,
          schema: JSON.stringify(schema)
        });

        const payload = { paymentId: 'pay-1', amount: 99.95 };
        const encoded = await registry.encode(id, payload);

        await consumer.connect();
        await consumer.subscribe({ topic, fromBeginning: true });
        await consumer.run({
          eachMessage: async ({ message }) => {
            decodedMessage = await registry.decode(message.value);
          }
        });

        await producer.connect();
        await producer.send({
          topic,
          messages: [{ value: encoded }]
        });

        await waitFor(() => decodedMessage?.paymentId === 'pay-1', 60000);
      } finally {
        await consumer.disconnect().catch(() => undefined);
        await producer.disconnect().catch(() => undefined);
        await admin.disconnect().catch(() => undefined);
        await schemaRegistryContainer.stop();
        await kafkaContainer.stop();
        await network.stop();
      }
    }, 300000);
  });
});

describe('real broker integration toggle', () => {
  if (!RUN_BROKER_INTEGRATION) {
    test('skips broker integration suite when RUN_BROKER_INTEGRATION is not set', () => {
      expect(RUN_BROKER_INTEGRATION).toBe(false);
    });
  }
});
