import { Kafka, Consumer, EachMessagePayload, PartitionAssigners } from 'kafkajs';
import { maskPII } from './utils/pii-masking';

/**
 * Consumer for orders.created
 * Purpose: Order creation events
 *
 * Governance:
 * - PII fields: [customerId, customerEmail, shippingAddress.street, shippingAddress.city, shippingAddress.zipCode, shippingAddress.country]
 * - DLQ configured: ✅ Yes
 * - Auth support: SASL/SCRAM-256, SASL/SCRAM-512, SASL/PLAIN, mTLS (SSL), OAuth
 * - Consumer config: sessionTimeout, heartbeatInterval, rebalanceTimeout, autoOffsetReset, maxPollRecords
 * - Consumer defaults (from bindings when present): autoOffsetReset=earliest, maxPollRecords=250, batchMode=batch, partitionStrategy=roundrobin
 * - Serialization: JSON (application/json)
 * - Error resilience: retry policy exponential (maxRetries=5, backoffMs=1000, multiplier=2)
 * - Poison pill handling: skip undecodable payloads after 5 retries
 * - Circuit breaker: threshold=6, resetTimeoutMs=5000
 * - DLQ producer lifecycle: shared producer connection reused across failures
 * - ℹ️ Evolution: 64% optional fields provides moderate flexibility
 */
export class OrdersCreatedConsumer {
  kafka;
  consumer;
  monitoring;
  auth = {};
  dlqProducer = null;
  poisonPillFailures = new Map();
  circuitState = {
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: null
  };
  resilienceConfig;
  consumerOptions;

  constructor(config) {
    this.auth = config.auth || {};
    this.consumerOptions = {
      sessionTimeout: this.toNumber(config.sessionTimeout, process.env.KAFKA_SESSION_TIMEOUT, 45000),
      heartbeatInterval: this.toNumber(config.heartbeatInterval, process.env.KAFKA_HEARTBEAT_INTERVAL, 5000),
      rebalanceTimeout: this.toNumber(config.rebalanceTimeout, process.env.KAFKA_REBALANCE_TIMEOUT, 70000),
      autoOffsetReset: this.normalizeOffsetReset(config.autoOffsetReset || process.env.KAFKA_AUTO_OFFSET_RESET || 'earliest'),
      maxPollRecords: this.toNumber(config.maxPollRecords, process.env.KAFKA_MAX_POLL_RECORDS, 250),
      batchMode: this.normalizeBatchMode(config.batchMode || process.env.KAFKA_BATCH_MODE || 'batch'),
      batchMaxMessages: this.toNumber(config.batchMaxMessages, process.env.KAFKA_BATCH_MAX_MESSAGES, 120),
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
    this.resilienceConfig = {
      enabled: config.retry?.enabled ?? true,
      retry: {
        maxRetries: this.toNumber(config.retry?.maxRetries, process.env.KAFKA_RETRY_MAX_RETRIES, 5, true),
        backoffMs: this.toNumber(config.retry?.backoffMs, process.env.KAFKA_RETRY_BACKOFF_MS, 1000),
        backoffMultiplier: this.toNumber(config.retry?.backoffMultiplier, process.env.KAFKA_RETRY_BACKOFF_MULTIPLIER, 2),
        maxBackoffMs: this.toNumber(config.retry?.maxBackoffMs, process.env.KAFKA_RETRY_MAX_BACKOFF_MS, 60000),
        poisonPillMaxRetries: this.toNumber(
          config.retry?.poisonPillMaxRetries,
          process.env.KAFKA_POISON_PILL_MAX_RETRIES,
          5
        )
      },
      circuitBreaker: {
        enabled: config.circuitBreaker?.enabled ?? true,
        failureThreshold: this.toNumber(
          config.circuitBreaker?.failureThreshold,
          process.env.KAFKA_CIRCUIT_BREAKER_THRESHOLD,
          6
        ),
        resetTimeoutMs: this.toNumber(
          config.circuitBreaker?.resetTimeoutMs,
          process.env.KAFKA_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
          5000
        )
      }
    };
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

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  resolveMessageIdentity(payload) {
    const topic = payload?.topic || 'orders.created';
    const partition = payload?.partition ?? 'unknown';
    const offset = payload?.message?.offset ?? 'unknown';
    return `${topic}:${partition}:${offset}`;
  }

  isDeserializationError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('deserialize') || message.includes('schema registry decode failed');
  }

  trackPoisonPillFailure(messageKey) {
    const nextCount = (this.poisonPillFailures.get(messageKey) || 0) + 1;
    this.poisonPillFailures.set(messageKey, nextCount);
    return nextCount;
  }

  clearPoisonPillFailure(messageKey) {
    this.poisonPillFailures.delete(messageKey);
  }

  calculateRetryDelay(attempt) {
    const retryConfig = this.resilienceConfig.retry;
    const baseDelay = retryConfig.backoffMs * Math.pow(retryConfig.backoffMultiplier, attempt);
    return Math.min(baseDelay, retryConfig.maxBackoffMs);
  }

  shouldUseCircuitBreaker() {
    return this.resilienceConfig.enabled && this.resilienceConfig.circuitBreaker.enabled;
  }

  async ensureCircuitCanExecute() {
    if (!this.shouldUseCircuitBreaker()) {
      return;
    }

    if (this.circuitState.state !== 'open') {
      return;
    }

    const openedAt = this.circuitState.openedAt || 0;
    const elapsed = Date.now() - openedAt;
    if (elapsed >= this.resilienceConfig.circuitBreaker.resetTimeoutMs) {
      this.circuitState.state = 'half_open';
      this.circuitState.consecutiveFailures = 0;
      await this.log('warn', 'circuit_breaker_half_open', {
        message: 'Circuit breaker moved to half-open',
        elapsedMs: elapsed
      });
      return;
    }

    throw new Error('Circuit breaker is open. Processing temporarily paused.');
  }

  async registerProcessingFailure(error) {
    if (!this.shouldUseCircuitBreaker()) {
      return;
    }

    this.circuitState.consecutiveFailures += 1;

    if (this.circuitState.consecutiveFailures >= this.resilienceConfig.circuitBreaker.failureThreshold) {
      this.circuitState.state = 'open';
      this.circuitState.openedAt = Date.now();
      await this.log('warn', 'circuit_breaker_opened', {
        message: 'Circuit breaker opened after repeated failures',
        failureCount: this.circuitState.consecutiveFailures,
        threshold: this.resilienceConfig.circuitBreaker.failureThreshold,
        reason: error?.message || String(error)
      });
    }
  }

  registerProcessingSuccess() {
    if (!this.shouldUseCircuitBreaker()) {
      return;
    }

    this.circuitState.consecutiveFailures = 0;
    this.circuitState.openedAt = null;
    this.circuitState.state = 'closed';
  }

  async executeWithRetry(payload, operation) {
    if (!this.resilienceConfig.enabled) {
      await operation();
      return;
    }

    const maxRetries = this.resilienceConfig.retry.maxRetries;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await this.ensureCircuitCanExecute();
        await operation();
        this.registerProcessingSuccess();
        return;
      } catch (error) {
        await this.registerProcessingFailure(error);

        if (attempt >= maxRetries) {
          throw error;
        }

        const retryDelay = this.calculateRetryDelay(attempt);
        await this.log('warn', 'message_retry_scheduled', {
          message: 'Retrying failed message processing',
          attempt: attempt + 1,
          maxRetries,
          retryDelayMs: retryDelay,
          policy: 'exponential',
          error: error?.message || String(error)
        });

        await this.sleep(retryDelay);
        attempt += 1;
      }
    }
  }


  async deserializeMessageValue(value) {
    if (value == null) {
      return {};
    }

    const messageBuffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));

    const rawValue = messageBuffer.toString('utf8').trim();
    if (!rawValue) {
      return {};
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      throw new Error(`Failed to deserialize Kafka payload as JSON/JSON: ${error?.message || String(error)}`);
    }
  }

  buildKafkaConfig(brokers) {
    const kafkaConfig = {
      clientId: 'orders.created-consumer',
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
      consumer: 'OrdersCreatedConsumer',
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
      topic: 'orders.created',
      event: 'orders.created'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'kafka',
      topic: 'orders.created',
      event: 'orders.created'
    });

    const highWatermark = Number(payload?.batch?.highWatermark || 0);
    const currentOffset = Number(payload?.message?.offset || 0);
    if (Number.isFinite(highWatermark) && Number.isFinite(currentOffset) && highWatermark >= currentOffset) {
      metrics?.setConsumerLag?.(highWatermark - currentOffset, {
        transport: 'kafka',
        topic: 'orders.created',
        event: 'orders.created'
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
      topic: 'orders.created',
      event: 'orders.created'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'kafka',
      topic: 'orders.created',
      event: 'orders.created',
      outcome: 'error'
    });
  }

  async start() {
    await this.consumer.connect();
    await this.ensureDLQProducerConnected();
    await this.consumer.subscribe({
      topic: 'orders.created',
      fromBeginning: this.consumerOptions.autoOffsetReset === 'earliest'
    });

    await this.log('info', 'consumer_started', {
      message: 'Kafka consumer started',
      topic: 'orders.created',
      autoOffsetReset: this.consumerOptions.autoOffsetReset,
      maxPollRecords: this.consumerOptions.maxPollRecords,
      batchMode: this.consumerOptions.batchMode,
      batchMaxMessages: this.consumerOptions.batchMaxMessages,
      partitionAssignmentStrategy: this.consumerOptions.partitionAssignmentStrategy,
      schemaEncoding: 'JSON',
      retryPolicy: 'exponential',
      retryEnabled: this.resilienceConfig.enabled,
      retryMaxRetries: this.resilienceConfig.retry.maxRetries,
      retryBackoffMs: this.resilienceConfig.retry.backoffMs,
      circuitBreakerEnabled: this.resilienceConfig.circuitBreaker.enabled
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
      topic: 'orders.created',
      event: 'orders.created'
    });

    try {
      await this.executeWithRetry(payload, async () => {
        await this.handleMessage(payload);
      });
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
    const messageKey = this.resolveMessageIdentity(payload);
    let event;

    try {
      event = await this.deserializeMessageValue(message.value);
      this.clearPoisonPillFailure(messageKey);
    } catch (error) {
      if (!this.isDeserializationError(error)) {
        throw error;
      }

      const failureCount = this.trackPoisonPillFailure(messageKey);
      const maxRetries = this.resilienceConfig.retry.poisonPillMaxRetries;

      await this.log('warn', 'poison_pill_retry', {
        message: 'Undeserializable payload detected',
        messageKey,
        failureCount,
        maxRetries,
        error: error?.message || String(error)
      });

      if (failureCount >= maxRetries) {
        await this.handlePoisonPill(payload, error, messageKey, failureCount);
        this.clearPoisonPillFailure(messageKey);
        return;
      }

      throw error;
    }

    // Mask PII for logging
    const safeEvent = maskPII(event, ['customerId', 'customerEmail', 'shippingAddress.street', 'shippingAddress.city', 'shippingAddress.zipCode', 'shippingAddress.country']);
    await this.log('info', 'message_processed', { message: 'Processing event', payload: safeEvent });

    // TODO: Implement business logic

    // Commit offset after successful processing
    // (Kafka auto-commits by default, explicit commit for at-least-once)
  }

  async handlePoisonPill(payload, error, messageKey, failureCount) {
    await this.log('warn', 'poison_pill_skipped', {
      message: 'Skipping poison-pill payload after retry threshold',
      messageKey,
      failureCount,
      maxRetries: this.resilienceConfig.retry.poisonPillMaxRetries,
      error: error?.message || String(error)
    });

    await this.sendToDLQ(payload, error);
  }

  async handleError(error, payload) {
    await this.log('error', 'message_failed', {
      message: 'Error processing message',
      error: error?.message || String(error),
      stack: error?.stack
    });

    // Route to DLQ: orders.created.dlq
    await this.sendToDLQ(payload, error);
  }

  async ensureDLQProducerConnected() {
    if (this.dlqProducer) {
      return;
    }

    this.dlqProducer = this.kafka.producer();
    await this.dlqProducer.connect();
  }

  async sendToDLQ(payload, error) {
    await this.ensureDLQProducerConnected();

    await this.dlqProducer.send({
      topic: 'orders.created.dlq',
      messages: [{
        key: payload.message.key,
        value: payload.message.value,
        headers: {
          ...payload.message.headers,
          'x-error': error.message,
          'x-original-topic': 'orders.created'
        }
      }]
    });
  }

  async stop() {
    this.poisonPillFailures.clear();
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect();
      this.dlqProducer = null;
    }
    await this.consumer.disconnect();
    await this.log('info', 'consumer_stopped', {
      message: 'Kafka consumer stopped',
      topic: 'orders.created'
    });
  }
}
