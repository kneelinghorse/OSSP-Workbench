/**
 * Tests for Kafka Consumer Generator
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKafkaConsumer, toClassName } from '../../packages/runtime/generators/consumers/kafka-consumer-generator.js';

describe('Kafka Consumer Generator', () => {
  describe('toClassName', () => {
    it('should convert event names to class names', () => {
      expect(toClassName('user.created')).toBe('UserCreated');
      expect(toClassName('order-shipped')).toBe('OrderShipped');
      expect(toClassName('payment_processed')).toBe('PaymentProcessed');
      expect(toClassName('smartylighting/streetlights/{id}/turn/on')).toBe('SmartylightingStreetlightsIdTurnOn');
    });

    it('should handle single word names', () => {
      expect(toClassName('event')).toBe('Event');
    });
  });

  describe('generateKafkaConsumer', () => {
    it('should generate basic Kafka consumer', () => {
      const manifest = {
        event: { name: 'user.created' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.created'
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Notify when user is created' }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('export class UserCreatedConsumer');
      expect(code).toContain("import { Kafka, Consumer, EachMessagePayload, PartitionAssigners } from 'kafkajs'");
      expect(code).toContain("topic: 'users.created'");
      expect(code).toContain('Notify when user is created');
    });

    it('should include PII masking imports when PII fields exist', () => {
      const manifest = {
        event: { name: 'user.registered' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.registered'
          }
        },
        schema: {
          fields: [
            { name: 'email', pii: true },
            { name: 'name', pii: true }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['email', 'name'])");
    });

    it('should generate DLQ routing when DLQ configured', () => {
      const manifest = {
        event: { name: 'payment.processed' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'payments.processed',
            dlq: 'payments.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('sendToDLQ');
      expect(code).toContain('ensureDLQProducerConnected');
      expect(code).toContain("topic: 'payments.dlq'");
      expect(code).toContain('await this.sendToDLQ(payload, error)');
      expect(code).toContain('this.dlqProducer = this.kafka.producer()');
      expect(code).toContain('await this.dlqProducer.connect()');
      expect(code).toContain('await this.dlqProducer.disconnect()');
      expect(code).not.toContain('const producer = this.kafka.producer()');
      expect(code).not.toContain('await producer.connect()');
      expect(code).not.toContain('await producer.disconnect()');
    });

    it('should include warning when DLQ missing', () => {
      const manifest = {
        event: { name: 'order.created' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'orders.created'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'missing_dlq',
              message: 'No DLQ configured for event stream'
            }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('⚠️ WARNING: No DLQ configured for event stream');
      expect(code).toContain('⚠️ No DLQ configured - message will be retried or lost');
    });

    it('should include ordering pattern comments', () => {
      const manifest = {
        event: { name: 'user.updated' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'users.updated'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'user_keyed_ordering',
              message: 'Messages partitioned by userId for ordering'
            }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('ℹ️ Ordering: Messages partitioned by userId for ordering');
    });

    it('should include fanout and evolution governance comments', () => {
      const manifest = {
        event: { name: 'customer.updated' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'customers.updated'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'high_fanout',
              message: '4 subscribers detected'
            },
            {
              pattern: 'backward_compatible_schema',
              message: '80% optional fields suggests backward compatibility'
            }
          ]
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('ℹ️ Fanout: 4 subscribers detected');
      expect(code).toContain('ℹ️ Evolution: 80% optional fields suggests backward compatibility');
    });

    it('should include opt-in monitoring hooks', () => {
      const manifest = {
        event: { name: 'metrics.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'metrics.topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('this.monitoring = config.monitoring || { enabled: false }');
      expect(code).toContain('recordSuccessMetrics');
      expect(code).toContain('recordErrorMetrics');
      expect(code).toContain('incrementMessagesProcessed');
      expect(code).toContain('incrementErrors');
      expect(code).toContain('observeLatency');
      expect(code).toContain('setConsumerLag');
      expect(code).toContain("startSpan('consumer.process_message'");
    });

    it('should include Kafka auth mode support by default', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'secure.topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("mechanism: 'scram-sha-256'");
      expect(code).toContain("mechanism: 'scram-sha-512'");
      expect(code).toContain("mechanism: 'plain'");
      expect(code).toContain("mechanism: 'oauthbearer'");
      expect(code).toContain('KAFKA_SASL_USERNAME');
      expect(code).toContain('KAFKA_SASL_PASSWORD');
      expect(code).toContain('KAFKA_OAUTH_BEARER_TOKEN');
      expect(code).toContain('KAFKA_SSL_CA');
      expect(code).toContain('KAFKA_SSL_CERT');
      expect(code).toContain('KAFKA_SSL_KEY');
    });

    it('should render auth blocks conditionally from metadata', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'secure.topic',
            metadata: {
              authModes: ['scram256', 'mtls']
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("mechanism: 'scram-sha-256'");
      expect(code).toContain('authMode === \'mtls\'');
      expect(code).not.toContain("mechanism: 'scram-sha-512'");
      expect(code).not.toContain("mechanism: 'plain'");
      expect(code).not.toContain("mechanism: 'oauthbearer'");
    });

    it('should generate Avro schema registry deserialization when contentType indicates Avro', () => {
      const manifest = {
        event: { name: 'payments.avro' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'payments.avro',
            metadata: {
              contentType: 'application/vnd.apache.avro+binary',
              schemaFormat: 'application/vnd.apache.avro;version=1.9.0',
              schemaCompatibility: 'backward_transitive'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry'");
      expect(code).toContain('this.schemaRegistry = this.createSchemaRegistryClient();');
      expect(code).toContain('Schema Registry URL is required for Avro/Protobuf deserialization');
      expect(code).toContain('[SchemaType.AVRO]');
      expect(code).toContain('SCHEMA_REGISTRY_READER_SCHEMA');
      expect(code).toContain('await this.schemaRegistry.decode(messageBuffer, decodeOptions)');
      expect(code).toContain('Schema evolution: BACKWARD_TRANSITIVE compatibility');
    });

    it('should generate Protobuf schema registry deserialization when contentType indicates Protobuf', () => {
      const manifest = {
        event: { name: 'payments.protobuf' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'payments.protobuf',
            metadata: {
              contentType: 'application/protobuf',
              schemaFormat: 'application/vnd.google.protobuf;version=3',
              schemaCompatibility: 'forward'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain("import { SchemaRegistry } from '@kafkajs/confluent-schema-registry'");
      expect(code).not.toContain('SchemaType.AVRO');
      expect(code).toContain('await this.schemaRegistry.decode(messageBuffer, decodeOptions)');
      expect(code).toContain('Schema evolution: FORWARD compatibility');
    });

    it('should keep JSON deserialization path when schema registry hints are absent', () => {
      const manifest = {
        event: { name: 'json.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'json.topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).not.toContain("@kafkajs/confluent-schema-registry");
      expect(code).toContain('const messageBuffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));');
      expect(code).toContain('return JSON.parse(rawValue);');
      expect(code).toContain('schemaEncoding: \'JSON\'');
    });

    it('should include consumer connection and group configuration fields', () => {
      const manifest = {
        event: { name: 'configurable.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'configurable.topic',
            metadata: {
              'auto.offset.reset': 'earliest',
              'max.poll.records': 200,
              'session.timeout.ms': 42000,
              'heartbeat.interval.ms': 4500,
              'partition.assignment.strategy': 'roundrobin',
              'batch.mode': 'batch',
              'batch.max.messages': 100
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('sessionTimeout');
      expect(code).toContain('heartbeatInterval');
      expect(code).toContain('rebalanceTimeout');
      expect(code).toContain('autoOffsetReset');
      expect(code).toContain('maxPollRecords');
      expect(code).toContain('batchMode');
      expect(code).toContain('batchMaxMessages');
      expect(code).toContain('partitionAssignmentStrategy');
      expect(code).toContain('buildPartitionAssigners');
      expect(code).toContain("if (this.consumerOptions.batchMode === 'batch')");
      expect(code).toContain('runConfig.eachBatch');
      expect(code).toContain('runConfig.eachMessage');
      expect(code).toContain('fromBeginning: this.consumerOptions.autoOffsetReset === \'earliest\'');
      expect(code).toContain("autoOffsetReset: this.normalizeOffsetReset(config.autoOffsetReset || process.env.KAFKA_AUTO_OFFSET_RESET || 'earliest')");
      expect(code).toContain('maxPollRecords: this.toNumber(config.maxPollRecords, process.env.KAFKA_MAX_POLL_RECORDS, 200)');
      expect(code).toContain('sessionTimeout: this.toNumber(config.sessionTimeout, process.env.KAFKA_SESSION_TIMEOUT, 42000)');
      expect(code).toContain('heartbeatInterval: this.toNumber(config.heartbeatInterval, process.env.KAFKA_HEARTBEAT_INTERVAL, 4500)');
      expect(code).toContain('KAFKA_BATCH_MODE');
      expect(code).toContain('KAFKA_PARTITION_ASSIGNMENT_STRATEGY');
    });

    it('should include retry/circuit-breaker/poison-pill handling when retry policy signals resilience', () => {
      const manifest = {
        event: { name: 'resilient.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'resilient.topic',
            retry_policy: 'exponential',
            metadata: {
              'retry.backoff.ms': 2500,
              retries: 4
            },
            dlq: 'resilient.topic.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('this.resilienceConfig = {');
      expect(code).toContain('maxRetries: this.toNumber(config.retry?.maxRetries, process.env.KAFKA_RETRY_MAX_RETRIES, 4, true)');
      expect(code).toContain('backoffMs: this.toNumber(config.retry?.backoffMs, process.env.KAFKA_RETRY_BACKOFF_MS, 2500)');
      expect(code).toContain('executeWithRetry(payload, async () => {');
      expect(code).toContain("policy: 'exponential'");
      expect(code).toContain('handlePoisonPill');
      expect(code).toContain('poison_pill_retry');
      expect(code).toContain('circuit_breaker_opened');
    });

    it('should not generate resilience control blocks when retry policy is none', () => {
      const manifest = {
        event: { name: 'simple.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'simple.topic',
            retry_policy: 'none'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).not.toContain('this.resilienceConfig = {');
      expect(code).not.toContain('executeWithRetry(payload, async () => {');
      expect(code).not.toContain('handlePoisonPill');
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'kafka',
            topic: 'test.topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateKafkaConsumer(manifest, { typescript: false });

      // TypeScript annotations should not be present
      expect(code).not.toContain(': Kafka');
      expect(code).not.toContain(': Consumer');
      expect(code).not.toContain(': EachMessagePayload');
      expect(code).not.toContain('private ');
    });

    it('should handle manifests without optional fields', () => {
      const manifest = {
        event: { name: 'minimal.event' },
        delivery: {
          contract: {
            transport: 'kafka'
          }
        }
      };

      const code = generateKafkaConsumer(manifest);

      expect(code).toContain('export class MinimalEventConsumer');
      expect(code).toContain("topic: 'minimal.event'"); // Fallback to event name
    });

    it('should support template directory overrides', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kafka-template-'));

      try {
        fs.writeFileSync(
          path.join(tempDir, 'kafka.hbs'),
          '// custom kafka template for {{eventName}}'
        );

        const manifest = {
          event: { name: 'user.created' },
          delivery: {
            contract: {
              transport: 'kafka',
              topic: 'users.created'
            }
          },
          schema: { fields: [] }
        };

        const code = generateKafkaConsumer(manifest, { templateDir: tempDir });
        expect(code.trim()).toBe('// custom kafka template for user.created');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
