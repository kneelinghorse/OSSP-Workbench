import mqtt from 'mqtt';

/**
 * MQTT Consumer for smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 * Purpose: Event channel: smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 *
 * Governance:
 * - Topic: smartylighting/streetlights/1/0/action/{streetlightId}/turn/off
 * - QoS: 0 (At most once)
 * - Retained: No
 * - Clean Session: Yes
 * - PII fields: None
 */
export class SmartylightingStreetlights10ActionStreetlightIdTurnOffConsumer {
  client = null;
  brokerUrl;
  monitoring;

  constructor(config) {
    if (typeof config === 'string') {
      this.brokerUrl = config;
      this.monitoring = { enabled: false };
    } else {
      this.brokerUrl = config.brokerUrl;
      this.monitoring = config.monitoring || { enabled: false };
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

  async start() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off-consumer-' + Math.random().toString(16).substr(2, 8),
        clean: true,
        qos: 0
      });

      this.client.on('connect', () => {
        this.log('info', 'consumer_connected', {
          message: 'Connected to MQTT broker',
          topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
        });
        this.client.subscribe('smartylighting/streetlights/1/0/action/{streetlightId}/turn/off', { qos: 0 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.client.on('error', (err) => {
        this.log('error', 'consumer_connection_error', {
          message: 'MQTT connection error',
          error: err?.message || String(err)
        });
        reject(err);
      });

      this.client.on('message', async (topic, message) => {
        const startedAt = Date.now();
        const span = this.startSpan('consumer.process_message', {
          transport: 'mqtt',
          topic: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off',
          event: 'smartylighting/streetlights/1/0/action/{streetlightId}/turn/off'
        });

        try {
          await this.handleMessage(topic, message);
          this.recordSuccessMetrics(Date.now() - startedAt);
          span?.setStatus?.({ code: 1 });
        } catch (error) {
          this.recordErrorMetrics(Date.now() - startedAt);
          span?.recordException?.(error);
          span?.setStatus?.({
            code: 2,
            message: error?.message || 'processing_failed'
          });
          await this.handleError(error, topic, message);
        } finally {
          span?.end?.();
        }
      });
    });
  }

  async handleMessage(topic, message) {
    const event = JSON.parse(message.toString());

    await this.log('info', 'message_processed', { message: 'Processing event', payload: event });
    // TODO: Implement business logic
  }

  async handleError(error, topic, message) {
    await this.log('error', 'message_failed', {
      message: 'Error processing message',
      error: error?.message || String(error),
      stack: error?.stack
    });

    // ℹ️ MQTT typically doesn't support DLQ at the protocol level
    // Consider implementing application-level error handling:
    // - Publish to an error topic
    // - Store in a local database for retry
    // - Send to external monitoring service
    // TODO: Implement error handling strategy
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
