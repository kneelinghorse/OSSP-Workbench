import { Kafka, Consumer, EachMessagePayload, PartitionAssigners } from 'kafkajs';
import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';

/**
 * Consumer for payments.avro
 * Purpose: Event channel: payments.avro
 *
 * Governance:
 * - PII fields: None
 * - DLQ configured: ⚠️ No
 * - Auth support: SASL/SCRAM-256, SASL/SCRAM-512, SASL/PLAIN, mTLS (SSL), OAuth
 * - Consumer config: sessionTimeout, heartbeatInterval, rebalanceTimeout, autoOffsetReset, maxPollRecords
 * - Consumer defaults (from bindings when present): autoOffsetReset=latest, maxPollRecords=500, batchMode=message, partitionStrategy=roundrobin
 * - Serialization: AVRO via Confluent Schema Registry (application/vnd.apache.avro+binary)
 * - Schema evolution: BACKWARD_TRANSITIVE compatibility with optional AVRO reader schema override
 * - ℹ️ Evolution: 100% required fields limits evolution
 */
export class PaymentsAvroConsumer {
  kafka;
  consumer;
  schemaRegistry = null;
  schemaRegistryConfig;
  monitoring;
  auth = {};
  consumerOptions;

  constructor(config) {
    this.auth = config.auth || {};
    this.consumerOptions = {
      sessionTimeout: this.toNumber(config.sessionTimeout, process.env.KAFKA_SESSION_TIMEOUT, 30000),
      heartbeatInterval: this.toNumber(config.heartbeatInterval, process.env.KAFKA_HEARTBEAT_INTERVAL, 3000),
      rebalanceTimeout: this.toNumber(config.rebalanceTimeout, process.env.KAFKA_REBALANCE_TIMEOUT, 60000),
      autoOffsetReset: this.normalizeOffsetReset(config.autoOffsetReset || process.env.KAFKA_AUTO_OFFSET_RESET || 'latest'),
      maxPollRecords: this.toNumber(config.maxPollRecords, process.env.KAFKA_MAX_POLL_RECORDS, 500),
      batchMode: this.normalizeBatchMode(config.batchMode || process.env.KAFKA_BATCH_MODE || 'message'),
      batchMaxMessages: this.toNumber(config.batchMaxMessages, process.env.KAFKA_BATCH_MAX_MESSAGES, 500),
      partitionAssignmentStrategy: this.resolvePartitionAssignmentStrategies(
        config.partitionAssignmentStrategy ||
        process.env.KAFKA_PARTITION_ASSIGNMENT_STRATEGY ||
        'roundrobin'
      )
    };

    const kafkaConfig = this.buildKafkaConfig(config.brokers);
    this.kafka = new Kafka(kafkaConfig);
    const partitionAssigners = this.buildPartitionAssigners(this.consumerOptions.partitionAssignmentStrategy);

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: this.consumerOptions.sessionTimeout,
      heartbeatInterval: this.consumerOptions.heartbeatInterval,
      rebalanceTimeout: this.consumerOptions.rebalanceTimeout,
      ...(partitionAssigners ? { partitionAssigners } : {})
    });

    this.monitoring = config.monitoring || { enabled: false };
    this.schemaRegistryConfig = {
      enabled: config.schemaRegistry?.enabled ?? true,
      host: config.schemaRegistry?.host || process.env.SCHEMA_REGISTRY_URL || process.env.KAFKA_SCHEMA_REGISTRY_URL || '',
      username: config.schemaRegistry?.username || process.env.SCHEMA_REGISTRY_USERNAME || '',
      password: config.schemaRegistry?.password || process.env.SCHEMA_REGISTRY_PASSWORD || '',
      compatibility: this.normalizeSchemaCompatibility(
        config.schemaRegistry?.compatibility || process.env.SCHEMA_REGISTRY_COMPATIBILITY || 'BACKWARD_TRANSITIVE'
      ),
      readerSchema: this.parseReaderSchema(config.schemaRegistry?.readerSchema || process.env.SCHEMA_REGISTRY_READER_SCHEMA)
    };
    this.schemaRegistry = this.createSchemaRegistryClient();
  }

  toNumber(value, envValue, fallback, allowZero = false) {
    const normalized = value ?? envValue;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : fallback;
  }

  isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
  }

  normalizeOffsetReset(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'earliest' || normalized === 'latest' || normalized === 'none') {
      return normalized;
    }
    return 'latest';
  }

  normalizeBatchMode(value) {
    return String(value || '').toLowerCase().trim() === 'batch' ? 'batch' : 'message';
  }

  resolvePartitionAssignmentStrategies(value) {
    const rawValues = Array.isArray(value) ? value : String(value || '').split(',');
    const normalized = [];

    for (const item of rawValues) {
      const token = String(item || '').toLowerCase().trim();
      if (!token) {
        continue;
      }

      const canonical = (
        token === 'round-robin' ||
        token === 'round_robin' ||
        token === 'roundrobin'
      )
        ? 'roundrobin'
        : token;

      if (!normalized.includes(canonical)) {
        normalized.push(canonical);
      }
    }

    return normalized.length > 0 ? normalized : ['roundrobin'];
  }

  buildPartitionAssigners(strategies) {
    const normalized = this.resolvePartitionAssignmentStrategies(strategies);
    const assigners = [];

    if (normalized.includes('roundrobin') && typeof PartitionAssigners?.roundRobin === 'function') {
      assigners.push(PartitionAssigners.roundRobin);
    }

    return assigners.length > 0 ? assigners : undefined;
  }


  normalizeSchemaCompatibility(value) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const supported = new Set([
      'NONE',
      'BACKWARD',
      'FORWARD',
      'FULL',
      'BACKWARD_TRANSITIVE',
      'FORWARD_TRANSITIVE',
      'FULL_TRANSITIVE'
    ]);

    return supported.has(normalized) ? normalized : 'BACKWARD_TRANSITIVE';
  }

  parseReaderSchema(value) {
    if (value == null || value === '') {
      return null;
    }

    if (typeof value === 'object') {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('Invalid schema registry reader schema JSON in SCHEMA_REGISTRY_READER_SCHEMA');
    }
  }

  createSchemaRegistryClient() {
    if (!this.schemaRegistryConfig.enabled) {
      return null;
    }

    if (!this.schemaRegistryConfig.host) {
      throw new Error('Schema Registry URL is required for Avro/Protobuf deserialization. Set schemaRegistry.host or SCHEMA_REGISTRY_URL.');
    }

    const clientConfig = {
      host: this.schemaRegistryConfig.host
    };

    if (this.schemaRegistryConfig.username && this.schemaRegistryConfig.password) {
      clientConfig.auth = {
        username: this.schemaRegistryConfig.username,
        password: this.schemaRegistryConfig.password
      };
    }

    return new SchemaRegistry(clientConfig);
  }

  buildSchemaDecodeOptions() {
    if (this.schemaRegistryConfig.readerSchema) {
      return {
        [SchemaType.AVRO]: {
          readerSchema: this.schemaRegistryConfig.readerSchema
        }
      };
    }
    return undefined;
  }

  isConfluentWireFormat(buffer) {
    return Buffer.isBuffer(buffer) && buffer.length > 5 && buffer[0] === 0;
  }

  async deserializeMessageValue(value) {
    if (value == null) {
      return {};
    }

    const messageBuffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    if (this.schemaRegistry) {
      const decodeOptions = this.buildSchemaDecodeOptions();
      try {
        return await this.schemaRegistry.decode(messageBuffer, decodeOptions);
      } catch (error) {
        const hasConfluentWirePrefix = this.isConfluentWireFormat(messageBuffer);
        await this.log('warn', 'schema_registry_decode_failed', {
          message: 'Schema Registry decode failed, attempting JSON fallback',
          error: error?.message || String(error),
          compatibility: this.schemaRegistryConfig.compatibility,
          hasConfluentWirePrefix
        });

        if (hasConfluentWirePrefix) {
          throw error;
        }
      }
    }

    const rawValue = messageBuffer.toString('utf8').trim();
    if (!rawValue) {
      return {};
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      throw new Error(`Failed to deserialize Kafka payload as AVRO/JSON: ${error?.message || String(error)}`);
    }
  }

  buildKafkaConfig(brokers) {
    const kafkaConfig = {
      clientId: 'payments.avro-consumer',
      brokers
    };

    const sslConfig = this.buildSSLConfig();
    if (sslConfig) {
      kafkaConfig.ssl = sslConfig;
    }

    const saslConfig = this.buildSaslConfig();
    if (saslConfig) {
      kafkaConfig.sasl = saslConfig;
    }

    return kafkaConfig;
  }

  buildSSLConfig() {
    const authMode = String(this.auth?.mode || process.env.KAFKA_AUTH_MODE || 'none').toLowerCase();
    const sslEnabled = authMode === 'mtls' || this.auth?.ssl?.enabled === true || this.isTruthy(process.env.KAFKA_SSL_ENABLED);
    if (!sslEnabled) {
      return null;
    }

    const ca = this.auth?.ssl?.ca || process.env.KAFKA_SSL_CA;
    const cert = this.auth?.ssl?.cert || process.env.KAFKA_SSL_CERT;
    const key = this.auth?.ssl?.key || process.env.KAFKA_SSL_KEY;

    const sslConfig = {
      rejectUnauthorized: this.auth?.ssl?.rejectUnauthorized ?? !this.isTruthy(process.env.KAFKA_SSL_INSECURE)
    };

    if (ca) {
      sslConfig.ca = [ca];
    }
    if (cert) {
      sslConfig.cert = cert;
    }
    if (key) {
      sslConfig.key = key;
    }

    return sslConfig;
  }

  buildSaslConfig() {
    const authMode = String(this.auth?.mode || process.env.KAFKA_AUTH_MODE || 'none').toLowerCase();
    const username = this.auth?.username || process.env.KAFKA_SASL_USERNAME;
    const password = this.auth?.password || process.env.KAFKA_SASL_PASSWORD;

    switch (authMode) {
      case 'scram256':
      case 'scram-sha-256':
      case 'sasl/scram-256':
        if (!username || !password) return null;
        return { mechanism: 'scram-sha-256', username, password };
      case 'scram512':
      case 'scram-sha-512':
      case 'sasl/scram-512':
        if (!username || !password) return null;
        return { mechanism: 'scram-sha-512', username, password };
      case 'plain':
      case 'sasl/plain':
        if (!username || !password) return null;
        return { mechanism: 'plain', username, password };
      case 'oauth':
      case 'oauthbearer': {
        const token = this.auth?.oauth?.token || process.env.KAFKA_OAUTH_BEARER_TOKEN;
        if (!token) return null;
        return {
          mechanism: 'oauthbearer',
          oauthBearerProvider: async () => ({ value: token })
        };
      }
      default:
        return null;
    }
  }

  isMonitoringEnabled() {
    return this.monitoring?.enabled === true;
  }

  async log(level, event, data = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      transport: 'kafka',
      consumer: 'PaymentsAvroConsumer',
      ...data
    };

    if (this.isMonitoringEnabled()) {
      const logger = this.monitoring?.logger;
      if (logger && typeof logger[level] === 'function') {
        logger[level](payload);
        return;
      }

      const serialized = JSON.stringify(payload);
      if (level === 'error') {
        console.error(serialized);
      } else {
        console.log(serialized);
      }
      return;
    }

    if (level === 'error') {
      console.error(payload.message || event, payload.error || '');
      return;
    }

    console.log(payload.message || event, payload.payload || '');
  }

  startSpan(spanName, attributes = {}) {
    if (!this.isMonitoringEnabled()) {
      return null;
    }

    const tracer = this.monitoring?.tracer;
    if (!tracer || typeof tracer.startSpan !== 'function') {
      return null;
    }

    return tracer.startSpan(spanName, { attributes });
  }

  recordSuccessMetrics(durationMs, payload) {
    if (!this.isMonitoringEnabled()) {
      return;
    }

    const metrics = this.monitoring?.metrics;
    metrics?.incrementMessagesProcessed?.({
      transport: 'kafka',
      topic: 'payments.avro',
      event: 'payments.avro'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'kafka',
      topic: 'payments.avro',
      event: 'payments.avro'
    });

    const highWatermark = Number(payload?.batch?.highWatermark || 0);
    const currentOffset = Number(payload?.message?.offset || 0);
    if (Number.isFinite(highWatermark) && Number.isFinite(currentOffset) && highWatermark >= currentOffset) {
      metrics?.setConsumerLag?.(highWatermark - currentOffset, {
        transport: 'kafka',
        topic: 'payments.avro',
        event: 'payments.avro'
      });
    }
  }

  recordErrorMetrics(durationMs) {
    if (!this.isMonitoringEnabled()) {
      return;
    }

    const metrics = this.monitoring?.metrics;
    metrics?.incrementErrors?.({
      transport: 'kafka',
      topic: 'payments.avro',
      event: 'payments.avro'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'kafka',
      topic: 'payments.avro',
      event: 'payments.avro',
      outcome: 'error'
    });
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'payments.avro',
      fromBeginning: this.consumerOptions.autoOffsetReset === 'earliest'
    });

    await this.log('info', 'consumer_started', {
      message: 'Kafka consumer started',
      topic: 'payments.avro',
      autoOffsetReset: this.consumerOptions.autoOffsetReset,
      maxPollRecords: this.consumerOptions.maxPollRecords,
      batchMode: this.consumerOptions.batchMode,
      batchMaxMessages: this.consumerOptions.batchMaxMessages,
      partitionAssignmentStrategy: this.consumerOptions.partitionAssignmentStrategy,
      schemaEncoding: 'AVRO',
      schemaRegistryEnabled: this.schemaRegistryConfig.enabled,
      schemaCompatibility: this.schemaRegistryConfig.compatibility
    });

    const runConfig = {
      partitionsConsumedConcurrently: Math.max(1, Math.min(this.consumerOptions.maxPollRecords, 16))
    };

    if (this.consumerOptions.batchMode === 'batch') {
      runConfig.eachBatchAutoResolve = false;
      runConfig.eachBatch = async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isRunning, isStale }) => {
        const batchMessages = Array.isArray(batch?.messages) ? batch.messages : [];
        const maxMessages = Math.max(1, this.consumerOptions.batchMaxMessages);
        const messagesToProcess = batchMessages.slice(0, maxMessages);

        for (const message of messagesToProcess) {
          if (typeof isRunning === 'function' && !isRunning()) {
            break;
          }
          if (typeof isStale === 'function' && isStale()) {
            break;
          }

          await this.processPayload({
            topic: batch.topic,
            partition: batch.partition,
            message,
            batch
          });

          if (typeof resolveOffset === 'function') {
            resolveOffset(message.offset);
          }
          if (typeof heartbeat === 'function') {
            await heartbeat();
          }
        }

        if (typeof commitOffsetsIfNecessary === 'function') {
          await commitOffsetsIfNecessary();
        }
      };
    } else {
      runConfig.eachMessage = async (payload) => {
        await this.processPayload(payload);
      };
    }

    await this.consumer.run(runConfig);
  }

  async processPayload(payload) {
    const startedAt = Date.now();
    const span = this.startSpan('consumer.process_message', {
      transport: 'kafka',
      topic: 'payments.avro',
      event: 'payments.avro'
    });

    try {
      await this.handleMessage(payload);
      this.recordSuccessMetrics(Date.now() - startedAt, payload);
      span?.setStatus?.({ code: 1 });
    } catch (error) {
      this.recordErrorMetrics(Date.now() - startedAt);
      span?.recordException?.(error);
      span?.setStatus?.({
        code: 2,
        message: error?.message || 'processing_failed'
      });
      await this.handleError(error, payload);
    } finally {
      span?.end?.();
    }
  }

  async handleMessage(payload) {
    const { message } = payload;
    const event = await this.deserializeMessageValue(message.value);

    await this.log('info', 'message_processed', { message: 'Processing event', payload: event });

    // TODO: Implement business logic

    // Commit offset after successful processing
    // (Kafka auto-commits by default, explicit commit for at-least-once)
  }


  async handleError(error, payload) {
    await this.log('error', 'message_failed', {
      message: 'Error processing message',
      error: error?.message || String(error),
      stack: error?.stack
    });

    // ⚠️ No DLQ configured - message will be retried or lost
    // TODO: Implement error handling strategy
  }

  async stop() {
    await this.consumer.disconnect();
    await this.log('info', 'consumer_stopped', {
      message: 'Kafka consumer stopped',
      topic: 'payments.avro'
    });
  }
}
