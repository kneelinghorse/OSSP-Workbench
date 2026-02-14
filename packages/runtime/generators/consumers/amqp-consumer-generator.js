/**
 * AMQP Consumer Generator
 * Generates TypeScript consumer code for RabbitMQ/AMQP from Event Protocol manifests
 */

import { toClassName } from './kafka-consumer-generator.js';
import { renderConsumerTemplate } from './template-engine.js';

function toPositiveNumber(value, fallback, options = {}) {
  const { allowZero = false } = options;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (allowZero ? parsed >= 0 : parsed > 0) {
    return parsed;
  }

  return fallback;
}

function normalizeRetryPolicy(policy) {
  const normalized = String(policy || '').toLowerCase().trim();

  if (normalized === 'none') {
    return 'none';
  }

  if (normalized === 'fixed') {
    return 'fixed';
  }

  return 'exponential';
}

function parseTopicTopology(topic) {
  const value = String(topic || '');
  if (!value) {
    return {};
  }

  const separator = value.indexOf(':');
  if (separator <= 0 || separator >= value.length - 1) {
    return {
      queue: value
    };
  }

  return {
    exchange: value.slice(0, separator),
    queue: value.slice(separator + 1)
  };
}

function normalizeAuthMode(mode) {
  const normalized = String(mode || '').toLowerCase().trim();

  if (!normalized) {
    return null;
  }

  if (
    [
      'username_password',
      'username-password',
      'userpass',
      'basic',
      'plain',
      'sasl/plain',
      'sasl_plain'
    ].includes(normalized)
  ) {
    return 'usernamePassword';
  }

  if (['mtls', 'tls', 'ssl', 'client_cert', 'client-certificate', 'certificate'].includes(normalized)) {
    return 'mtls';
  }

  if (normalized === 'none') {
    return 'none';
  }

  return null;
}

function resolveAuthModeFlags(amqpMeta = {}) {
  const configuredModes = amqpMeta.authModes || amqpMeta.auth_modes || amqpMeta.auth?.modes || amqpMeta.auth?.mode;
  const normalizedModes = new Set();

  if (configuredModes) {
    const modeList = Array.isArray(configuredModes) ? configuredModes : [configuredModes];
    for (const mode of modeList) {
      const normalized = normalizeAuthMode(mode);
      if (normalized) {
        normalizedModes.add(normalized);
      }
    }
  }

  const includeAll = normalizedModes.size === 0;

  return {
    includeUsernamePassword: includeAll || normalizedModes.has('usernamePassword'),
    includeMtls: includeAll || normalizedModes.has('mtls')
  };
}

function resolveHeartbeatSeconds(amqpMeta = {}) {
  const heartbeatFromMetadata = amqpMeta.heartbeatSeconds ?? amqpMeta.heartbeat_seconds ?? amqpMeta.heartbeat;
  if (heartbeatFromMetadata != null) {
    return toPositiveNumber(heartbeatFromMetadata, 30);
  }

  const heartbeatIntervalMs = amqpMeta['heartbeat.interval.ms'] ?? amqpMeta.heartbeat_interval_ms;
  if (heartbeatIntervalMs != null) {
    return toPositiveNumber(Number(heartbeatIntervalMs) / 1000, 30);
  }

  return 30;
}

/**
 * Generate AMQP consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @param {string} options.templateDir - Optional template directory override
 * @param {Record<string, string>} options.templateOverrides - Optional per-template overrides
 * @returns {string} - Generated TypeScript consumer code
 */
function generateAMQPConsumer(manifest, options = {}) {
  const {
    typescript = true,
    templateDir,
    templateOverrides
  } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract || {};
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];

  // Extract AMQP-specific metadata
  const amqpMeta = delivery.metadata || {};
  const parsedTopicTopology = parseTopicTopology(delivery.topic);
  const exchange = amqpMeta.exchange || amqpMeta.exchange_name || parsedTopicTopology.exchange || 'default';
  const queue = amqpMeta.queue || amqpMeta.queue_name || parsedTopicTopology.queue || eventName;
  const routingKey = amqpMeta.routingKey || amqpMeta.routing_key || amqpMeta['routing-key'] || eventName;
  const durable = amqpMeta.durable !== false; // Default true
  const prefetch = toPositiveNumber(
    amqpMeta.prefetch ?? amqpMeta.prefetch_count ?? amqpMeta.prefetchCount,
    1
  );
  const heartbeatSeconds = resolveHeartbeatSeconds(amqpMeta);
  const channelPoolSize = toPositiveNumber(
    amqpMeta.channelPoolSize ?? amqpMeta.channel_pool_size,
    1
  );
  const hasDLQ = !!delivery.dlq;
  const authFlags = resolveAuthModeFlags(amqpMeta);
  const authLabels = [];
  if (authFlags.includeUsernamePassword) authLabels.push('Username/Password');
  if (authFlags.includeMtls) authLabels.push('mTLS (Client Certificates)');

  const retryPolicy = normalizeRetryPolicy(delivery.retry_policy || amqpMeta.retry_policy);
  const retryBackoffMs = toPositiveNumber(
    amqpMeta['retry.backoff.ms'] ??
      amqpMeta.retry_backoff_ms ??
      amqpMeta.retryBackoffMs ??
      amqpMeta['x-message-ttl'],
    1000
  );
  const retryMaxRetries = toPositiveNumber(
    amqpMeta['x-max-retries'] ??
      amqpMeta.retries ??
      amqpMeta.max_retries ??
      amqpMeta.maxRetries,
    retryPolicy === 'none' ? 0 : 3,
    { allowZero: true }
  );
  const retryBackoffMultiplier = toPositiveNumber(
    amqpMeta.retry_backoff_multiplier ?? amqpMeta.retryBackoffMultiplier,
    retryPolicy === 'exponential' ? 2 : 1
  );

  // Analyze patterns
  const patterns = manifest.patterns?.detected || [];
  const missingDLQ = patterns.find(p => p.pattern === 'missing_dlq');
  const retryPattern = patterns.find((p) =>
    p.pattern === 'retry_without_max_attempts' ||
    p.pattern === 'exponential_without_backoff' ||
    p.pattern === 'unreasonable_backoff'
  );

  // Build imports
  const imports = [`import * as amqp from 'amqplib';`];
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    connection: ': amqp.Connection | null',
    channel: ': amqp.Channel | null',
    channelPool: ': amqp.Channel[]',
    connectionUrl: ': string',
    auth: ': any',
    consumerOptions: ': { prefetch: number; heartbeatSeconds: number; channelPoolSize: number }',
    resilienceConfig: ': { retryPolicy: string; maxRetries: number; backoffMs: number; backoffMultiplier: number; maxBackoffMs: number }',
    monitoring: ': any',
    config: ': string | { connectionUrl: string; monitoring?: any; auth?: any; prefetch?: number; heartbeatSeconds?: number; heartbeat?: number; channelPoolSize?: number; retry?: { policy?: string; maxRetries?: number; backoffMs?: number; backoffMultiplier?: number; maxBackoffMs?: number } }',
    msg: ': amqp.Message',
    error: ': Error',
    string: ': string',
    number: ': number',
    object: ': Record<string, any>',
    any: ': any',
    boolReturn: ': boolean',
    voidReturn: ': void',
    numberReturn: ': number',
    connectOptions: ': Record<string, any>',
    channelParam: ': amqp.Channel | null',
    channelRequired: ': amqp.Channel',
    connectionReturn: ': Promise<amqp.Connection>',
    method: 'async ',
    private: 'private ',
    return: ': Promise<void>'
  } : {
    connection: '',
    channel: '',
    channelPool: '',
    connectionUrl: '',
    auth: '',
    consumerOptions: '',
    resilienceConfig: '',
    monitoring: '',
    config: '',
    msg: '',
    error: '',
    string: '',
    number: '',
    object: '',
    any: '',
    boolReturn: '',
    voidReturn: '',
    numberReturn: '',
    connectOptions: '',
    channelParam: '',
    channelRequired: '',
    connectionReturn: '',
    method: 'async ',
    private: '',
    return: ''
  };

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - Exchange: ${exchange}`);
  governanceComments.push(` * - Queue: ${queue}`);
  governanceComments.push(` * - Routing Key: ${routingKey}`);
  governanceComments.push(` * - Durable: ${durable ? 'Yes' : 'No'}`);
  governanceComments.push(` * - Prefetch (default): ${prefetch}`);
  governanceComments.push(` * - Heartbeat seconds (default): ${heartbeatSeconds}`);
  governanceComments.push(` * - Channel pool size (default): ${channelPoolSize}`);
  governanceComments.push(` * - Connection retry: ${retryPolicy} (maxRetries=${retryMaxRetries}, backoffMs=${retryBackoffMs}, multiplier=${retryBackoffMultiplier})`);
  governanceComments.push(` * - Auth support: ${authLabels.join(', ') || 'None'}`);
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);
  governanceComments.push(` * - DLQ configured: ${hasDLQ ? '✅ Yes' : '⚠️ No'}`);

  if (missingDLQ) {
    governanceComments.push(` * - ⚠️ WARNING: ${missingDLQ.message}`);
  }
  if (retryPattern) {
    governanceComments.push(` * - ℹ️ Retry: ${retryPattern.message}`);
  }

  const exchangeBindingBlock = exchange !== 'default'
    ? `    const exchange = '${exchange}';\n    await channel.assertExchange(exchange, 'topic', { durable: ${durable} });\n    await channel.bindQueue(queue, exchange, '${routingKey}');\n`
    : '';

  const maskingBlock = piiFields.length > 0
    ? `    // Mask PII for logging\n    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);\n    await this.log('info', 'message_processed', { message: 'Processing event', payload: safeEvent });\n`
    : `    await this.log('info', 'message_processed', { message: 'Processing event', payload: event });\n`;

  const dlqBranch = hasDLQ
    ? `    // Route to DLQ: ${delivery.dlq}\n    await this.sendToDLQ(channel, msg, error);\n    channel?.ack(msg); // Acknowledge original message after DLQ routing\n`
    : `    // ⚠️ No DLQ configured - rejecting and not requeuing\n    // Message will be lost unless a DLQ is configured at the queue level\n    channel?.nack(msg, false, false);\n`;

  const dlqMethod = hasDLQ
    ? `  ${typeAnnotations.private}${typeAnnotations.method}sendToDLQ(channel${typeAnnotations.channelParam}, msg${typeAnnotations.msg}, error${typeAnnotations.error})${typeAnnotations.return} {\n    const activeChannel = channel || this.channel || this.channelPool[0];\n    if (!activeChannel) return;\n\n    const dlqQueue = '${delivery.dlq}';\n    await activeChannel.assertQueue(dlqQueue, { durable: ${durable} });\n\n    await activeChannel.sendToQueue(dlqQueue, msg.content, {\n      headers: {\n        ...msg.properties.headers,\n        'x-error': error.message,\n        'x-original-queue': '${queue}',\n        'x-failed-at': new Date().toISOString()\n      }\n    });\n  }\n\n`
    : '';

  return renderConsumerTemplate(
    'amqp',
    {
      imports: imports.join('\n'),
      eventName,
      purpose: manifest.semantics?.purpose || 'Process event',
      governanceComments: governanceComments.join('\n'),
      className,
      queue,
      durable,
      prefetchDefault: prefetch,
      heartbeatSecondsDefault: heartbeatSeconds,
      channelPoolSizeDefault: channelPoolSize,
      retryPolicy,
      retryMaxRetriesDefault: retryMaxRetries,
      retryBackoffMsDefault: retryBackoffMs,
      retryBackoffMultiplierDefault: retryBackoffMultiplier,
      includeUsernamePassword: authFlags.includeUsernamePassword,
      includeMtls: authFlags.includeMtls,
      type: typeAnnotations,
      errorCast: typescript ? ' as Error' : '',
      exchangeBindingBlock,
      maskingBlock,
      dlqBranch,
      dlqMethod
    },
    {
      templateDir,
      templateOverrides
    }
  );
}

export { generateAMQPConsumer };
