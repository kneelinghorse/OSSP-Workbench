import * as amqp from 'amqplib';

/**
 * AMQP Consumer for {queue}
 * Purpose: Event channel: {queue}
 *
 * Governance:
 * - Exchange: default
 * - Queue: unnamed
 * - Routing Key: {queue}
 * - Durable: Yes
 * - Prefetch (default): 1
 * - Heartbeat seconds (default): 30
 * - Channel pool size (default): 1
 * - Connection retry: none (maxRetries=0, backoffMs=1000, multiplier=1)
 * - Auth support: Username/Password, mTLS (Client Certificates)
 * - PII fields: None
 * - DLQ configured: ⚠️ No
 */
export class QueueConsumer {
  connection = null;
  channel = null;
  channelPool = [];
  connectionUrl;
  auth = {};
  consumerOptions;
  resilienceConfig;
  monitoring;

  constructor(config) {
    const normalizedConfig = typeof config === 'string' ? { connectionUrl: config } : (config || {});
    this.connectionUrl = normalizedConfig.connectionUrl || process.env.AMQP_CONNECTION_URL || process.env.AMQP_URL || '';
    this.monitoring = normalizedConfig.monitoring || { enabled: false };
    this.auth = normalizedConfig.auth || {};
    this.consumerOptions = {
      prefetch: this.toNumber(normalizedConfig.prefetch, process.env.AMQP_PREFETCH, 1),
      heartbeatSeconds: this.toNumber(
        normalizedConfig.heartbeatSeconds ?? normalizedConfig.heartbeat,
        process.env.AMQP_HEARTBEAT_SECONDS ?? process.env.AMQP_HEARTBEAT,
        30
      ),
      channelPoolSize: this.toNumber(normalizedConfig.channelPoolSize, process.env.AMQP_CHANNEL_POOL_SIZE, 1)
    };

    const retryConfig = normalizedConfig.retry || {};
    this.resilienceConfig = {
      retryPolicy: this.normalizeRetryPolicy(retryConfig.policy || process.env.AMQP_RETRY_POLICY || 'none'),
      maxRetries: this.toNumber(
        retryConfig.maxRetries,
        process.env.AMQP_RETRY_MAX_RETRIES,
        0,
        true
      ),
      backoffMs: this.toNumber(
        retryConfig.backoffMs,
        process.env.AMQP_RETRY_BACKOFF_MS,
        1000
      ),
      backoffMultiplier: this.toNumber(
        retryConfig.backoffMultiplier,
        process.env.AMQP_RETRY_BACKOFF_MULTIPLIER,
        1
      ),
      maxBackoffMs: this.toNumber(
        retryConfig.maxBackoffMs,
        process.env.AMQP_RETRY_MAX_BACKOFF_MS,
        60000
      )
    };

    if (this.resilienceConfig.retryPolicy === 'none') {
      this.resilienceConfig.maxRetries = 0;
    }
  }

  toNumber(value, envValue, fallback, allowZero = false) {
    const normalized = value ?? envValue;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : fallback;
  }

  isTruthy(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
  }

  normalizeRetryPolicy(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'none') {
      return 'none';
    }
    if (normalized === 'fixed') {
      return 'fixed';
    }
    return 'exponential';
  }

  coercePemValue(value) {
    if (typeof value !== 'string') {
      return value;
    }
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
  }

  resolveAuthMode() {
    const explicit = String(this.auth?.mode || process.env.AMQP_AUTH_MODE || '').toLowerCase().trim();
    if (explicit === 'none') {
      return 'none';
    }

    if ([
      'username_password',
      'username-password',
      'userpass',
      'basic',
      'plain',
      'sasl/plain',
      'sasl_plain'
    ].includes(explicit)) {
      return 'username_password';
    }
    if (['mtls', 'tls', 'ssl', 'client_cert', 'client-certificate', 'certificate'].includes(explicit)) {
      return 'mtls';
    }
    if (explicit) {
      throw new Error(`Unsupported AMQP auth mode: ${explicit}`);
    }

    const username = this.auth?.username || process.env.AMQP_USERNAME;
    const password = this.auth?.password || process.env.AMQP_PASSWORD;
    if (username && password) {
      return 'username_password';
    }
    const cert = this.auth?.cert || process.env.AMQP_TLS_CERT;
    const key = this.auth?.key || process.env.AMQP_TLS_KEY;
    if (cert && key) {
      return 'mtls';
    }
    return 'none';
  }

  buildAuthConfig() {
    const authMode = this.resolveAuthMode();
    const connectOptions = {};

    if (authMode === 'username_password') {
      const username = this.auth?.username || process.env.AMQP_USERNAME;
      const password = this.auth?.password || process.env.AMQP_PASSWORD;
      if (!username || !password) {
        throw new Error('AMQP username/password auth requires AMQP_USERNAME and AMQP_PASSWORD (or auth.username/auth.password).');
      }
      connectOptions.username = username;
      connectOptions.password = password;
      return connectOptions;
    }
    if (authMode === 'mtls') {
      const cert = this.coercePemValue(this.auth?.cert || process.env.AMQP_TLS_CERT);
      const key = this.coercePemValue(this.auth?.key || process.env.AMQP_TLS_KEY);
      const ca = this.coercePemValue(this.auth?.ca || process.env.AMQP_TLS_CA);
      const servername = this.auth?.servername || process.env.AMQP_TLS_SERVERNAME;
      const rejectUnauthorizedRaw = this.auth?.rejectUnauthorized ?? process.env.AMQP_TLS_REJECT_UNAUTHORIZED;

      if (!cert || !key) {
        throw new Error('AMQP mTLS auth requires client certificate and key (AMQP_TLS_CERT and AMQP_TLS_KEY).');
      }

      connectOptions.cert = cert;
      connectOptions.key = key;
      if (ca) {
        connectOptions.ca = ca;
      }
      if (servername) {
        connectOptions.servername = servername;
      }
      connectOptions.rejectUnauthorized = (
        rejectUnauthorizedRaw == null || rejectUnauthorizedRaw === ''
          ? true
          : this.isTruthy(rejectUnauthorizedRaw)
      );
      return connectOptions;
    }
    return connectOptions;
  }

  buildConnectOptions() {
    return {
      heartbeat: this.consumerOptions.heartbeatSeconds,
      clientProperties: {
        connection_name: 'QueueConsumer'
      },
      ...this.buildAuthConfig()
    };
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  calculateRetryDelay(attempt) {
    const exponent = this.resilienceConfig.retryPolicy === 'exponential' ? attempt : 0;
    const baseDelay = this.resilienceConfig.backoffMs * Math.pow(this.resilienceConfig.backoffMultiplier, exponent);
    return Math.min(baseDelay, this.resilienceConfig.maxBackoffMs);
  }

  async connectWithRetry() {
    if (!this.connectionUrl) {
      throw new Error('AMQP connection URL is required. Set config.connectionUrl or AMQP_CONNECTION_URL.');
    }

    let attempt = 0;
    const maxRetries = this.resilienceConfig.maxRetries;

    while (attempt <= maxRetries) {
      try {
        const connectOptions = this.buildConnectOptions();
        return await amqp.connect(this.connectionUrl, connectOptions);
      } catch (error) {
        if (attempt >= maxRetries) {
          throw error;
        }

        const retryDelayMs = this.calculateRetryDelay(attempt);
        await this.log('warn', 'connection_retry_scheduled', {
          message: 'AMQP connection failed, scheduling retry',
          attempt: attempt + 1,
          maxRetries,
          retryDelayMs,
          policy: this.resilienceConfig.retryPolicy,
          error: error?.message || String(error)
        });
        await this.sleep(retryDelayMs);
        attempt += 1;
      }
    }

    throw new Error('AMQP connection retries exhausted');
  }

  async prepareChannel(channel, queue) {
    await channel.assertQueue(queue, {
      durable: true
    });

    // Bind queue to exchange if specified

    // Set prefetch for flow control
    await channel.prefetch(this.consumerOptions.prefetch);
  }

  isMonitoringEnabled() {
    return this.monitoring?.enabled === true;
  }

  async log(level, event, data = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      transport: 'amqp',
      consumer: 'QueueConsumer',
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

  recordSuccessMetrics(durationMs) {
    if (!this.isMonitoringEnabled()) {
      return;
    }

    const metrics = this.monitoring?.metrics;
    metrics?.incrementMessagesProcessed?.({
      transport: 'amqp',
      queue: 'unnamed',
      event: '{queue}'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'amqp',
      queue: 'unnamed',
      event: '{queue}'
    });
  }

  recordErrorMetrics(durationMs) {
    if (!this.isMonitoringEnabled()) {
      return;
    }

    const metrics = this.monitoring?.metrics;
    metrics?.incrementErrors?.({
      transport: 'amqp',
      queue: 'unnamed',
      event: '{queue}'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'amqp',
      queue: 'unnamed',
      event: '{queue}',
      outcome: 'error'
    });
  }

  async start() {
    this.connection = await this.connectWithRetry();

    const queue = 'unnamed';
    const channelPoolSize = Math.max(1, this.consumerOptions.channelPoolSize);

    for (let index = 0; index < channelPoolSize; index += 1) {
      const channel = await this.connection.createChannel();
      this.channelPool.push(channel);
      if (!this.channel) {
        this.channel = channel;
      }

      await this.prepareChannel(channel, queue);

      await channel.consume(queue, async (msg) => {
        if (!msg) return;

        const startedAt = Date.now();
        const span = this.startSpan('consumer.process_message', {
          transport: 'amqp',
          queue,
          event: '{queue}'
        });

        try {
          await this.handleMessage(msg);
          this.recordSuccessMetrics(Date.now() - startedAt);
          span?.setStatus?.({ code: 1 });
          channel.ack(msg);
        } catch (error) {
          this.recordErrorMetrics(Date.now() - startedAt);
          span?.recordException?.(error);
          span?.setStatus?.({
            code: 2,
            message: error?.message || 'processing_failed'
          });
          await this.handleError(error, msg, channel);
        } finally {
          span?.end?.();
        }
      });
    }

    await this.log('info', 'consumer_started', {
      message: 'AMQP consumer started',
      queue,
      channelPoolSize: this.channelPool.length,
      prefetch: this.consumerOptions.prefetch,
      heartbeatSeconds: this.consumerOptions.heartbeatSeconds
    });
  }

  async handleMessage(msg) {
    const event = JSON.parse(msg.content.toString());

    await this.log('info', 'message_processed', { message: 'Processing event', payload: event });

    // TODO: Implement business logic
  }

  async handleError(error, msg, channel) {
    await this.log('error', 'message_failed', {
      message: 'Error processing message',
      error: error?.message || String(error),
      stack: error?.stack
    });

    // ⚠️ No DLQ configured - rejecting and not requeuing
    // Message will be lost unless a DLQ is configured at the queue level
    channel?.nack(msg, false, false);

  }


  async stop() {
    for (const channel of this.channelPool) {
      await channel?.close();
    }
    this.channelPool = [];
    this.channel = null;

    await this.connection?.close();
    this.connection = null;
    await this.log('info', 'consumer_stopped', {
      message: 'AMQP consumer stopped',
      queue: 'unnamed'
    });
  }
}
