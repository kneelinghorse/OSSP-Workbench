/**
 * Kafka Consumer Generator
 * Generates TypeScript consumer code from Event Protocol manifests
 */

import { renderConsumerTemplate } from './template-engine.js';

/**
 * Convert event name to ClassName format
 * @param {string} eventName - Event name (e.g., "user.created")
 * @returns {string} - Class name (e.g., "UserCreated")
 */
function toClassName(eventName) {
  const baseName = String(eventName || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  if (!baseName) {
    return 'GeneratedEvent';
  }

  if (/^\d/.test(baseName)) {
    return `Event${baseName}`;
  }

  return baseName;
}

function normalizeAuthMode(mode) {
  const normalized = String(mode || '').toLowerCase().trim();

  if (!normalized) {
    return null;
  }

  if (['scram256', 'scram-sha-256', 'sasl/scram-256', 'sasl_scram_256'].includes(normalized)) {
    return 'scram256';
  }

  if (['scram512', 'scram-sha-512', 'sasl/scram-512', 'sasl_scram_512'].includes(normalized)) {
    return 'scram512';
  }

  if (['plain', 'sasl/plain', 'sasl_plain'].includes(normalized)) {
    return 'plain';
  }

  if (['mtls', 'ssl', 'tls'].includes(normalized)) {
    return 'mtls';
  }

  if (['oauth', 'oauthbearer', 'sasl/oauthbearer'].includes(normalized)) {
    return 'oauth';
  }

  return null;
}

function resolveAuthModeFlags(kafkaMeta = {}) {
  const configuredModes = kafkaMeta.authModes || kafkaMeta.auth?.modes || kafkaMeta.auth?.mode;
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
    includeScram256: includeAll || normalizedModes.has('scram256'),
    includeScram512: includeAll || normalizedModes.has('scram512'),
    includePlain: includeAll || normalizedModes.has('plain'),
    includeMtls: includeAll || normalizedModes.has('mtls'),
    includeOAuth: includeAll || normalizedModes.has('oauth')
  };
}

const SUPPORTED_SCHEMA_COMPATIBILITY = new Set([
  'NONE',
  'BACKWARD',
  'FORWARD',
  'FULL',
  'BACKWARD_TRANSITIVE',
  'FORWARD_TRANSITIVE',
  'FULL_TRANSITIVE'
]);

function normalizeSchemaCompatibility(level) {
  const normalized = String(level || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return SUPPORTED_SCHEMA_COMPATIBILITY.has(normalized) ? normalized : 'BACKWARD';
}

function inferSchemaEncoding(contentType, schemaFormat, serializationFormat) {
  const probe = `${contentType || ''} ${schemaFormat || ''} ${serializationFormat || ''}`.toLowerCase();
  if (probe.includes('avro')) {
    return 'avro';
  }
  if (probe.includes('protobuf') || probe.includes('proto')) {
    return 'protobuf';
  }
  return 'json';
}

function resolveSchemaMetadata(manifest) {
  const deliveryMetadata = manifest.delivery?.contract?.metadata || {};
  const payloadSchema = manifest.schema?.payload || {};

  const contentType =
    deliveryMetadata.contentType ||
    deliveryMetadata.content_type ||
    payloadSchema.contentType ||
    payloadSchema.contentMediaType ||
    null;
  const schemaFormat =
    deliveryMetadata.schemaFormat ||
    deliveryMetadata.schema_format ||
    payloadSchema.schemaFormat ||
    payloadSchema.schema_format ||
    null;
  const serializationFormat =
    deliveryMetadata.serializationFormat ||
    deliveryMetadata.serialization_format ||
    null;
  const encoding = inferSchemaEncoding(contentType, schemaFormat, serializationFormat);

  return {
    contentType,
    schemaFormat,
    serializationFormat,
    encoding,
    usesSchemaRegistry: encoding === 'avro' || encoding === 'protobuf',
    compatibility: normalizeSchemaCompatibility(
      deliveryMetadata.schemaCompatibility ||
      deliveryMetadata.schema_compatibility ||
      manifest.schema?.compatibility?.policy ||
      'BACKWARD'
    )
  };
}

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

function resolveResilienceMetadata(manifest) {
  const delivery = manifest.delivery?.contract || {};
  const metadata = delivery.metadata || {};
  const patterns = manifest.patterns?.detected || [];

  const retryPolicy = String(delivery.retry_policy || 'none').toLowerCase();
  const hasRetryPattern = patterns.some((pattern) => (
    pattern?.pattern === 'exponential_without_backoff' ||
    pattern?.pattern === 'unreasonable_backoff' ||
    pattern?.pattern === 'retry_without_max_attempts'
  ));

  const retryBackoffMs = toPositiveNumber(
    metadata['retry.backoff.ms'] ??
      metadata.retry_backoff_ms ??
      metadata.retryBackoffMs,
    retryPolicy === 'exponential' ? 2000 : 1000
  );
  const retryMaxRetries = toPositiveNumber(
    metadata.retries ??
      metadata['max.retries'] ??
      metadata.max_retries ??
      metadata.maxRetries,
    retryPolicy === 'none' ? 0 : 3,
    { allowZero: true }
  );
  const retryBackoffMultiplier = toPositiveNumber(
    metadata.retry_backoff_multiplier ??
      metadata.retryBackoffMultiplier,
    retryPolicy === 'exponential' ? 2 : 1
  );

  const enableResiliencePatterns = retryPolicy !== 'none' || hasRetryPattern;

  return {
    retryPolicy,
    enableResiliencePatterns,
    retry: {
      maxRetries: retryMaxRetries,
      backoffMs: retryBackoffMs,
      backoffMultiplier: retryBackoffMultiplier
    },
    poisonPillMaxRetries: Math.max(1, retryMaxRetries || 3),
    circuitBreaker: {
      failureThreshold: Math.max(2, Math.min(10, (retryMaxRetries || 2) + 1)),
      resetTimeoutMs: Math.max(5000, retryBackoffMs * 2)
    }
  };
}

function normalizeOffsetReset(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'earliest' || normalized === 'latest' || normalized === 'none') {
    return normalized;
  }
  return 'latest';
}

function normalizeBatchMode(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'batch' ? 'batch' : 'message';
}

function normalizePartitionAssignmentStrategies(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  const normalized = [];
  for (const item of rawItems) {
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

function resolveConsumerGroupDefaults(kafkaMeta = {}) {
  const autoOffsetReset = normalizeOffsetReset(
    kafkaMeta['auto.offset.reset'] ??
      kafkaMeta.auto_offset_reset
  );
  const maxPollRecords = toPositiveNumber(
    kafkaMeta['max.poll.records'] ??
      kafkaMeta.max_poll_records,
    500
  );
  const sessionTimeout = toPositiveNumber(
    kafkaMeta['session.timeout.ms'] ??
      kafkaMeta.session_timeout_ms,
    30000
  );
  const heartbeatInterval = toPositiveNumber(
    kafkaMeta['heartbeat.interval.ms'] ??
      kafkaMeta.heartbeat_interval_ms,
    3000
  );
  const rebalanceTimeout = toPositiveNumber(
    kafkaMeta['rebalance.timeout.ms'] ??
      kafkaMeta.rebalance_timeout_ms,
    60000
  );
  const batchMode = normalizeBatchMode(
    kafkaMeta['batch.mode'] ??
      kafkaMeta.batch_mode ??
      kafkaMeta['processing.mode'] ??
      kafkaMeta.processing_mode
  );
  const batchMaxMessages = toPositiveNumber(
    kafkaMeta['batch.max.messages'] ??
      kafkaMeta.batch_max_messages,
    maxPollRecords
  );
  const partitionAssignmentStrategies = normalizePartitionAssignmentStrategies(
    kafkaMeta['partition.assignment.strategy'] ??
      kafkaMeta.partition_assignment_strategy
  );

  return {
    autoOffsetReset,
    maxPollRecords,
    sessionTimeout,
    heartbeatInterval,
    rebalanceTimeout,
    batchMode,
    batchMaxMessages,
    partitionAssignmentStrategies
  };
}

/**
 * Generate Kafka consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.includeTests - Include test imports
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @param {string} options.templateDir - Optional template directory override
 * @param {Record<string, string>} options.templateOverrides - Optional per-template overrides
 * @returns {string} - Generated TypeScript consumer code
 */
function generateKafkaConsumer(manifest, options = {}) {
  const {
    typescript = true,
    templateDir,
    templateOverrides
  } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract;
  const kafkaMeta = delivery?.metadata || {};
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];
  const hasDLQ = !!delivery?.dlq;

  const authFlags = resolveAuthModeFlags(kafkaMeta);
  const authLabels = [];
  if (authFlags.includeScram256) authLabels.push('SASL/SCRAM-256');
  if (authFlags.includeScram512) authLabels.push('SASL/SCRAM-512');
  if (authFlags.includePlain) authLabels.push('SASL/PLAIN');
  if (authFlags.includeMtls) authLabels.push('mTLS (SSL)');
  if (authFlags.includeOAuth) authLabels.push('OAuth');
  const schemaMeta = resolveSchemaMetadata(manifest);
  const resilienceMeta = resolveResilienceMetadata(manifest);
  const consumerGroupDefaults = resolveConsumerGroupDefaults(kafkaMeta);

  // Analyze patterns for generation hints
  const patterns = manifest.patterns?.detected || [];
  const missingDLQ = patterns.find(p => p.pattern === 'missing_dlq');
  const orderingPattern = patterns.find(p =>
    p.pattern === 'user_keyed_ordering' || p.pattern === 'entity_keyed_ordering'
  );
  const retryPattern = patterns.find((p) =>
    p.pattern === 'exponential_backoff' ||
    p.pattern === 'exponential_without_backoff' ||
    p.pattern === 'unreasonable_backoff'
  );
  const fanoutPattern = patterns.find((p) =>
    p.pattern === 'high_fanout' || p.pattern === 'moderate_fanout'
  );
  const evolutionPattern = patterns.find((p) =>
    p.pattern === 'backward_compatible_schema' ||
    p.pattern === 'balanced_schema' ||
    p.pattern === 'rigid_schema'
  );

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);
  governanceComments.push(` * - DLQ configured: ${hasDLQ ? '✅ Yes' : '⚠️ No'}`);
  governanceComments.push(` * - Auth support: ${authLabels.join(', ')}`);
  governanceComments.push(' * - Consumer config: sessionTimeout, heartbeatInterval, rebalanceTimeout, autoOffsetReset, maxPollRecords');
  governanceComments.push(
    ` * - Consumer defaults (from bindings when present): autoOffsetReset=${consumerGroupDefaults.autoOffsetReset}, maxPollRecords=${consumerGroupDefaults.maxPollRecords}, batchMode=${consumerGroupDefaults.batchMode}, partitionStrategy=${consumerGroupDefaults.partitionAssignmentStrategies.join(',')}`
  );
  governanceComments.push(
    ` * - Serialization: ${schemaMeta.usesSchemaRegistry ? `${schemaMeta.encoding.toUpperCase()} via Confluent Schema Registry` : 'JSON'}${schemaMeta.contentType ? ` (${schemaMeta.contentType})` : ''}`
  );
  if (schemaMeta.usesSchemaRegistry) {
    governanceComments.push(
      ` * - Schema evolution: ${schemaMeta.compatibility} compatibility with optional AVRO reader schema override`
    );
  }

  if (missingDLQ) {
    governanceComments.push(` * - ⚠️ WARNING: ${missingDLQ.message}`);
  }
  if (orderingPattern) {
    governanceComments.push(` * - ℹ️ Ordering: ${orderingPattern.message}`);
  }
  if (retryPattern) {
    governanceComments.push(` * - ℹ️ Retry: ${retryPattern.message}`);
  }
  if (resilienceMeta.enableResiliencePatterns) {
    governanceComments.push(
      ` * - Error resilience: retry policy ${resilienceMeta.retryPolicy} (maxRetries=${resilienceMeta.retry.maxRetries}, backoffMs=${resilienceMeta.retry.backoffMs}, multiplier=${resilienceMeta.retry.backoffMultiplier})`
    );
    governanceComments.push(
      ` * - Poison pill handling: skip undecodable payloads after ${resilienceMeta.poisonPillMaxRetries} retries`
    );
    governanceComments.push(
      ` * - Circuit breaker: threshold=${resilienceMeta.circuitBreaker.failureThreshold}, resetTimeoutMs=${resilienceMeta.circuitBreaker.resetTimeoutMs}`
    );
  }
  if (hasDLQ) {
    governanceComments.push(' * - DLQ producer lifecycle: shared producer connection reused across failures');
  }
  if (fanoutPattern) {
    governanceComments.push(` * - ℹ️ Fanout: ${fanoutPattern.message}`);
  }
  if (evolutionPattern) {
    governanceComments.push(` * - ℹ️ Evolution: ${evolutionPattern.message}`);
  }

  // Determine topic
  const topic = delivery?.topic || eventName;

  // Build imports
  const imports = [`import { Kafka, Consumer, EachMessagePayload, PartitionAssigners } from 'kafkajs';`];
  if (schemaMeta.encoding === 'avro') {
    imports.push(`import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';`);
  } else if (schemaMeta.encoding === 'protobuf') {
    imports.push(`import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';`);
  }
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    kafka: ': Kafka',
    consumer: ': Consumer',
    schemaRegistry: ': SchemaRegistry | null',
    schemaRegistryConfig: ': { enabled: boolean; host: string; username: string; password: string; compatibility: string; readerSchema: Record<string, any> | null }',
    monitoring: ': any',
    auth: ': any',
    dlqProducer: ': any',
    poisonPillFailures: ': Map<string, number>',
    circuitState: ': { state: string; consecutiveFailures: number; openedAt: number | null }',
    resilienceConfig: ': { enabled: boolean; retry: { maxRetries: number; backoffMs: number; backoffMultiplier: number; maxBackoffMs: number; poisonPillMaxRetries: number }; circuitBreaker: { enabled: boolean; failureThreshold: number; resetTimeoutMs: number } }',
    consumerOptions: ': { sessionTimeout: number; heartbeatInterval: number; rebalanceTimeout: number; autoOffsetReset: string; maxPollRecords: number; batchMode: string; batchMaxMessages: number; partitionAssignmentStrategy: string[] }',
    config: ': { brokers: string[]; groupId: string; monitoring?: any; auth?: any; sessionTimeout?: number; heartbeatInterval?: number; rebalanceTimeout?: number; autoOffsetReset?: string; maxPollRecords?: number; batchMode?: string; batchMaxMessages?: number; partitionAssignmentStrategy?: string | string[]; retry?: { enabled?: boolean; maxRetries?: number; backoffMs?: number; backoffMultiplier?: number; maxBackoffMs?: number; poisonPillMaxRetries?: number }; circuitBreaker?: { enabled?: boolean; failureThreshold?: number; resetTimeoutMs?: number }; schemaRegistry?: { enabled?: boolean; host?: string; username?: string; password?: string; compatibility?: string; readerSchema?: Record<string, any> | string } }',
    payload: ': EachMessagePayload',
    error: ': Error',
    string: ': string',
    number: ': number',
    object: ': Record<string, any>',
    any: ': any',
    buffer: ': Buffer',
    boolReturn: ': boolean',
    voidReturn: ': void',
    numberReturn: ': number',
    anyReturn: ': Promise<any>',
    brokersParam: ': string[]',
    kafkaConfigReturn: ': Record<string, any>',
    value: ': any',
    method: 'async ',
    private: 'private ',
    return: ': Promise<void>'
  } : {
    kafka: '',
    consumer: '',
    schemaRegistry: '',
    schemaRegistryConfig: '',
    monitoring: '',
    auth: '',
    dlqProducer: '',
    poisonPillFailures: '',
    circuitState: '',
    resilienceConfig: '',
      consumerOptions: '',
    config: '',
    payload: '',
    error: '',
    string: '',
    number: '',
    object: '',
    any: '',
    buffer: '',
    boolReturn: '',
    voidReturn: '',
    numberReturn: '',
    anyReturn: '',
    brokersParam: '',
    kafkaConfigReturn: '',
    value: '',
    method: 'async ',
    private: '',
    return: ''
  };

  const maskingBlock = piiFields.length > 0
    ? `    // Mask PII for logging\n    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);\n    await this.log('info', 'message_processed', { message: 'Processing event', payload: safeEvent });\n`
    : `    await this.log('info', 'message_processed', { message: 'Processing event', payload: event });\n`;

  const dlqBranch = hasDLQ
    ? `    // Route to DLQ: ${delivery.dlq}\n    await this.sendToDLQ(payload, error);\n`
    : `    // ⚠️ No DLQ configured - message will be retried or lost\n    // TODO: Implement error handling strategy\n`;

  const dlqMethod = hasDLQ
    ? `  ${typeAnnotations.private}${typeAnnotations.method}ensureDLQProducerConnected()${typeAnnotations.return} {\n    if (this.dlqProducer) {\n      return;\n    }\n\n    this.dlqProducer = this.kafka.producer();\n    await this.dlqProducer.connect();\n  }\n\n  ${typeAnnotations.private}${typeAnnotations.method}sendToDLQ(payload${typeAnnotations.payload}, error${typeAnnotations.error})${typeAnnotations.return} {\n    await this.ensureDLQProducerConnected();\n\n    await this.dlqProducer.send({\n      topic: '${delivery.dlq}',\n      messages: [{\n        key: payload.message.key,\n        value: payload.message.value,\n        headers: {\n          ...payload.message.headers,\n          'x-error': error.message,\n          'x-original-topic': '${topic}'\n        }\n      }]\n    });\n  }\n\n`
    : '';

  return renderConsumerTemplate(
    'kafka',
    {
      imports: imports.join('\n'),
      eventName,
      purpose: manifest.semantics?.purpose || 'Process event',
      governanceComments: governanceComments.join('\n'),
      className,
      topic,
      type: typeAnnotations,
      errorCast: typescript ? ' as Error' : '',
      maskingBlock,
      dlqBranch,
      dlqMethod,
      useSchemaRegistry: schemaMeta.usesSchemaRegistry,
      isAvroDeserializer: schemaMeta.encoding === 'avro',
      schemaEncodingLabel: schemaMeta.encoding.toUpperCase(),
      schemaCompatibility: schemaMeta.compatibility,
      includeScram256: authFlags.includeScram256,
      includeScram512: authFlags.includeScram512,
      includePlain: authFlags.includePlain,
      includeMtls: authFlags.includeMtls,
      includeOAuth: authFlags.includeOAuth,
      hasDLQ,
      dlqTopic: delivery?.dlq || '',
      enableResiliencePatterns: resilienceMeta.enableResiliencePatterns,
      retryPolicy: resilienceMeta.retryPolicy,
      retryMaxRetriesDefault: resilienceMeta.retry.maxRetries,
      retryBackoffMsDefault: resilienceMeta.retry.backoffMs,
      retryBackoffMultiplierDefault: resilienceMeta.retry.backoffMultiplier,
      poisonPillMaxRetriesDefault: resilienceMeta.poisonPillMaxRetries,
      circuitBreakerFailureThresholdDefault: resilienceMeta.circuitBreaker.failureThreshold,
      circuitBreakerResetTimeoutMsDefault: resilienceMeta.circuitBreaker.resetTimeoutMs,
      consumerDefaultSessionTimeoutMs: consumerGroupDefaults.sessionTimeout,
      consumerDefaultHeartbeatIntervalMs: consumerGroupDefaults.heartbeatInterval,
      consumerDefaultRebalanceTimeoutMs: consumerGroupDefaults.rebalanceTimeout,
      consumerDefaultAutoOffsetReset: consumerGroupDefaults.autoOffsetReset,
      consumerDefaultMaxPollRecords: consumerGroupDefaults.maxPollRecords,
      consumerDefaultBatchMode: consumerGroupDefaults.batchMode,
      consumerDefaultBatchMaxMessages: consumerGroupDefaults.batchMaxMessages,
      consumerDefaultPartitionAssignmentStrategies: consumerGroupDefaults.partitionAssignmentStrategies.join(',')
    },
    {
      templateDir,
      templateOverrides
    }
  );
}

export { generateKafkaConsumer, toClassName };
