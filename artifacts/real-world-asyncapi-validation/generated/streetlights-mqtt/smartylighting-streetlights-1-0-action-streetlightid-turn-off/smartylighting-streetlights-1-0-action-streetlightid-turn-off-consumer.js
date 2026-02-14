import mqtt from 'mqtt';

/**
 * MQTT Consumer for smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 * Purpose: Event channel: smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 *
 * Governance:
 * - Topic: smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 * - QoS: 0 (At most once)
 * - Retained publish flag (default): No
 * - Clean Session: Yes
 * - Keep Alive seconds (default): 60
 * - Auto reconnect: exponential (maxAttempts=5, baseDelayMs=1000, multiplier=2)
 * - Auth support: Username/Password, mTLS (Client Certificates)
 * - Retained message handling: process
 * - Error topic: smartylighting/streetlights/1/0/action/{streetlightId}/turn/off/errors
 * - Last Will enabled: No
 * - PII fields: None
 */
export class SmartylightingStreetlights10ActionStreetlightIdTurnOffConsumer {
  client = null;
  brokerUrl;
  clientId;
  monitoring;
  auth = {};
  consumerOptions;
  reconnectConfig;
  reconnectState = { attempt: 0 };
  retainedHandling;
  errorHandling;
  willConfig;

  constructor(config) {
    const normalizedConfig = typeof config === 'string' ? { brokerUrl: config } : (config || {});

    this.brokerUrl = normalizedConfig.brokerUrl || process.env.MQTT_BROKER_URL || process.env.MQTT_URL || '';
    this.clientId = normalizedConfig.clientId || process.env.MQTT_CLIENT_ID || 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off-consumer-' + Math.random().toString(16).slice(2, 10);
    this.monitoring = normalizedConfig.monitoring || { enabled: false };
    this.auth = normalizedConfig.auth || {};

    this.consumerOptions = {
      qos: this.normalizeQos(normalizedConfig.qos ?? process.env.MQTT_QOS ?? 0),
      cleanSession: (
        normalizedConfig.cleanSession == null
          ? true
          : normalizedConfig.cleanSession !== false
      ),
      keepAliveSeconds: this.toNumber(
        normalizedConfig.keepAliveSeconds,
        process.env.MQTT_KEEP_ALIVE_SECONDS,
        60
      ),
      retained: normalizedConfig.retained == null ? false : normalizedConfig.retained === true
    };

    const reconnectConfig = normalizedConfig.reconnect || {};
    this.reconnectConfig = {
      policy: this.normalizeReconnectPolicy(reconnectConfig.policy || process.env.MQTT_RECONNECT_POLICY || 'exponential'),
      maxReconnectAttempts: this.toNumber(
        reconnectConfig.maxReconnectAttempts,
        process.env.MQTT_MAX_RECONNECT_ATTEMPTS,
        5,
        true
      ),
      baseDelayMs: this.toNumber(
        reconnectConfig.baseDelayMs,
        process.env.MQTT_RECONNECT_BASE_DELAY_MS,
        1000
      ),
      backoffMultiplier: this.toNumber(
        reconnectConfig.backoffMultiplier,
        process.env.MQTT_RECONNECT_BACKOFF_MULTIPLIER,
        2
      ),
      maxBackoffMs: this.toNumber(
        reconnectConfig.maxBackoffMs,
        process.env.MQTT_RECONNECT_MAX_BACKOFF_MS,
        60000
      ),
      connectTimeoutMs: this.toNumber(
        reconnectConfig.connectTimeoutMs,
        process.env.MQTT_CONNECT_TIMEOUT_MS,
        30000
      )
    };

    if (this.reconnectConfig.policy === 'none') {
      this.reconnectConfig.maxReconnectAttempts = 0;
    }

    this.retainedHandling = this.normalizeRetainedHandling(
      normalizedConfig.retainedHandling || process.env.MQTT_RETAINED_HANDLING || 'process'
    );
    this.errorHandling = {
      enabled: normalizedConfig.errorTopicEnabled == null
        ? true
        : normalizedConfig.errorTopicEnabled !== false,
      errorTopic: normalizedConfig.errorTopic || process.env.MQTT_ERROR_TOPIC || 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off/errors',
      includePayload: normalizedConfig.errorTopicIncludePayload == null
        ? true
        : normalizedConfig.errorTopicIncludePayload !== false
    };
    this.willConfig = this.buildWillOptions(normalizedConfig.will);
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

  normalizeQos(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(2, parsed));
  }

  normalizeReconnectPolicy(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'none') {
      return 'none';
    }
    if (normalized === 'fixed') {
      return 'fixed';
    }
    return 'exponential';
  }

  normalizeRetainedHandling(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'ignore') {
      return 'ignore';
    }
    if (normalized === 'log') {
      return 'log';
    }
    return 'process';
  }

  coercePemValue(value) {
    if (typeof value !== 'string') {
      return value;
    }
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
  }

  resolveAuthMode() {
    const explicit = String(this.auth?.mode || process.env.MQTT_AUTH_MODE || '').toLowerCase().trim();
    if (explicit === 'none') {
      return 'none';
    }

    if ([
      'username_password',
      'username-password',
      'userpass',
      'basic',
      'plain'
    ].includes(explicit)) {
      return 'username_password';
    }
    if (['mtls', 'tls', 'ssl', 'client_cert', 'client-certificate', 'certificate'].includes(explicit)) {
      return 'mtls';
    }
    if (explicit) {
      throw new Error(`Unsupported MQTT auth mode: ${explicit}`);
    }

    const username = this.auth?.username || process.env.MQTT_USERNAME;
    const password = this.auth?.password || process.env.MQTT_PASSWORD;
    if (username && password) {
      return 'username_password';
    }
    const cert = this.auth?.cert || process.env.MQTT_TLS_CERT;
    const key = this.auth?.key || process.env.MQTT_TLS_KEY;
    if (cert && key) {
      return 'mtls';
    }
    return 'none';
  }

  buildAuthOptions() {
    const authMode = this.resolveAuthMode();
    const authOptions = {};

    if (authMode === 'username_password') {
      const username = this.auth?.username || process.env.MQTT_USERNAME;
      const password = this.auth?.password || process.env.MQTT_PASSWORD;
      if (!username || !password) {
        throw new Error('MQTT username/password auth requires MQTT_USERNAME and MQTT_PASSWORD (or auth.username/auth.password).');
      }
      authOptions.username = username;
      authOptions.password = password;
      return authOptions;
    }
    if (authMode === 'mtls') {
      const cert = this.coercePemValue(this.auth?.cert || process.env.MQTT_TLS_CERT);
      const key = this.coercePemValue(this.auth?.key || process.env.MQTT_TLS_KEY);
      const ca = this.coercePemValue(this.auth?.ca || process.env.MQTT_TLS_CA);
      const rejectUnauthorizedRaw = this.auth?.rejectUnauthorized ?? process.env.MQTT_TLS_REJECT_UNAUTHORIZED;

      if (!cert || !key) {
        throw new Error('MQTT mTLS auth requires MQTT_TLS_CERT and MQTT_TLS_KEY (or auth.cert/auth.key).');
      }

      authOptions.protocol = 'mqtts';
      authOptions.cert = cert;
      authOptions.key = key;
      if (ca) {
        authOptions.ca = ca;
      }
      authOptions.rejectUnauthorized = (
        rejectUnauthorizedRaw == null || rejectUnauthorizedRaw === ''
          ? true
          : this.isTruthy(rejectUnauthorizedRaw)
      );
      return authOptions;
    }
    return authOptions;
  }

  buildWillOptions(overrideWill = null) {
    const configuredWill = overrideWill || null;

    if (!configuredWill || !configuredWill.topic) {
      return undefined;
    }

    const normalizedPayload = typeof configuredWill.payload === 'string'
      ? configuredWill.payload
      : JSON.stringify(configuredWill.payload || {});

    return {
      topic: configuredWill.topic,
      payload: normalizedPayload,
      qos: this.normalizeQos(configuredWill.qos ?? 0),
      retain: configuredWill.retain === true
    };
  }

  buildClientOptions() {
    const reconnectPeriod = this.reconnectConfig.policy === 'none'
      ? 0
      : this.reconnectConfig.baseDelayMs;

    const clientOptions = {
      clientId: this.clientId,
      clean: this.consumerOptions.cleanSession,
      keepalive: this.consumerOptions.keepAliveSeconds,
      reconnectPeriod,
      connectTimeout: this.reconnectConfig.connectTimeoutMs,
      ...this.buildAuthOptions()
    };

    if (this.willConfig) {
      clientOptions.will = this.willConfig;
    }

    return clientOptions;
  }

  calculateReconnectDelay(attempt) {
    const exponent = this.reconnectConfig.policy === 'exponential' ? attempt : 0;
    const delay = this.reconnectConfig.baseDelayMs * Math.pow(this.reconnectConfig.backoffMultiplier, exponent);
    return Math.min(delay, this.reconnectConfig.maxBackoffMs);
  }

  isMonitoringEnabled() {
    return this.monitoring?.enabled === true;
  }

  async log(level, event, data = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      transport: 'mqtt',
      consumer: 'SmartylightingStreetlights10ActionStreetlightIdTurnOffConsumer',
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
      transport: 'mqtt',
      topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'mqtt',
      topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
    });
  }

  recordErrorMetrics(durationMs) {
    if (!this.isMonitoringEnabled()) {
      return;
    }

    const metrics = this.monitoring?.metrics;
    metrics?.incrementErrors?.({
      transport: 'mqtt',
      topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
    });
    metrics?.observeLatency?.(durationMs, {
      transport: 'mqtt',
      topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      outcome: 'error'
    });
  }

  async publishToErrorTopic(error, topic, message, context = {}) {
    if (!this.errorHandling.enabled || !this.errorHandling.errorTopic || !this.client) {
      return;
    }

    const envelope = {
      failedAt: new Date().toISOString(),
      sourceTopic: topic,
      transport: 'mqtt',
      event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
      retained: context.retained === true,
      error: error?.message || String(error)
    };

    if (this.errorHandling.includePayload) {
      envelope.originalMessage = message.toString();
    }

    await new Promise((resolve) => {
      this.client?.publish(
        this.errorHandling.errorTopic,
        JSON.stringify(envelope),
        { qos: Math.min(1, this.consumerOptions.qos), retain: false },
        (publishError) => {
          if (publishError) {
            this.log('error', 'error_topic_publish_failed', {
              message: 'Failed to publish to MQTT error topic',
              topic: this.errorHandling.errorTopic,
              error: publishError?.message || String(publishError)
            });
          } else {
            this.log('warn', 'message_routed_to_error_topic', {
              message: 'Published failed message metadata to MQTT error topic',
              topic: this.errorHandling.errorTopic
            });
          }
          resolve();
        }
      );
    });
  }

  async start() {
    if (!this.brokerUrl) {
      throw new Error('MQTT broker URL is required. Set config.brokerUrl or MQTT_BROKER_URL.');
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      this.client = mqtt.connect(this.brokerUrl, this.buildClientOptions());

      this.client.on('connect', () => {
        this.reconnectState.attempt = 0;
        if (this.client?.options) {
          this.client.options.reconnectPeriod = this.reconnectConfig.baseDelayMs;
        }

        this.log('info', 'consumer_connected', {
          message: 'Connected to MQTT broker',
          topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
        });

        this.client?.subscribe('smartylighting/streetlights/1/0/action/{streetlightId}/turn/off', { qos: this.consumerOptions.qos }, (err) => {
          if (err) {
            if (!settled) {
              settled = true;
              reject(err);
            }
            return;
          }

          if (!settled) {
            settled = true;
            resolve();
          }
        });
      });

      this.client.on('reconnect', () => {
        this.reconnectState.attempt += 1;

        if (
          this.reconnectConfig.maxReconnectAttempts > 0 &&
          this.reconnectState.attempt > this.reconnectConfig.maxReconnectAttempts
        ) {
          this.log('error', 'consumer_reconnect_exhausted', {
            message: 'Maximum MQTT reconnect attempts reached, closing client',
            attempts: this.reconnectState.attempt
          });
          this.client?.end(true);
          return;
        }

        const nextDelayMs = this.calculateReconnectDelay(this.reconnectState.attempt);
        if (this.client?.options) {
          this.client.options.reconnectPeriod = nextDelayMs;
        }

        this.log('warn', 'consumer_reconnecting', {
          message: 'MQTT reconnect attempt scheduled',
          attempt: this.reconnectState.attempt,
          nextDelayMs,
          policy: this.reconnectConfig.policy
        });
      });

      this.client.on('error', (err) => {
        this.log('error', 'consumer_connection_error', {
          message: 'MQTT connection error',
          error: err?.message || String(err)
        });

        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.client.on('message', async (topic, message, packet) => {
        const context = {
          retained: packet?.retain === true
        };

        if (context.retained && this.retainedHandling === 'ignore') {
          await this.log('info', 'retained_message_skipped', {
            message: 'Skipping retained MQTT message per retainedHandling policy',
            topic,
            retained: true
          });
          return;
        }

        const startedAt = Date.now();
        const span = this.startSpan('consumer.process_message', {
          transport: 'mqtt',
          topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
          event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
          retained: context.retained === true
        });

        try {
          await this.handleMessage(topic, message, context);
          this.recordSuccessMetrics(Date.now() - startedAt);
          span?.setStatus?.({ code: 1 });
        } catch (error) {
          this.recordErrorMetrics(Date.now() - startedAt);
          span?.recordException?.(error);
          span?.setStatus?.({
            code: 2,
            message: error?.message || 'processing_failed'
          });
          await this.handleError(error, topic, message, context);
        } finally {
          span?.end?.();
        }
      });
    });
  }

  async handleMessage(topic, message, context = {}) {
    const event = JSON.parse(message.toString());

    await this.log('info', 'message_processed', { message: 'Processing event', payload: event, retained: context.retained === true });

    // TODO: Implement business logic
  }

  async handleError(error, topic, message, context = {}) {
    await this.log('error', 'message_failed', {
      message: 'Error processing message',
      error: error?.message || String(error),
      stack: error?.stack,
      topic,
      retained: context.retained === true
    });

    await this.publishToErrorTopic(error, topic, message, context);
  }

  async stop() {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(false, {}, () => {
        this.client = null;
        this.log('info', 'consumer_stopped', {
          message: 'MQTT consumer stopped',
          topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
        });
        resolve();
      });
    });
  }
}
