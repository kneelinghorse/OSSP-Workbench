/**
 * MQTT Consumer Generator
 * Generates TypeScript consumer code for MQTT from Event Protocol manifests
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

function normalizeReconnectPolicy(policy) {
  const normalized = String(policy || '').toLowerCase().trim();
  if (normalized === 'none') {
    return 'none';
  }
  if (normalized === 'fixed') {
    return 'fixed';
  }
  return 'exponential';
}

function normalizeRetainedHandling(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'ignore') {
    return 'ignore';
  }
  if (normalized === 'log') {
    return 'log';
  }
  return 'process';
}

function normalizeQoS(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(2, parsed));
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
      'plain'
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

function resolveAuthModeFlags(mqttMeta = {}) {
  const configuredModes = mqttMeta.authModes || mqttMeta.auth_modes || mqttMeta.auth?.modes || mqttMeta.auth?.mode;
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

function resolveWillConfig(mqttMeta = {}, topic) {
  const rawWill = mqttMeta.will || {};
  const willTopic = rawWill.topic || mqttMeta.will_topic || null;

  if (!willTopic) {
    return {
      enabled: false,
      topic: '',
      payload: '',
      qos: 1,
      retain: false
    };
  }

  const payload = rawWill.payload ?? mqttMeta.will_payload ?? `${topic} consumer disconnected`;

  return {
    enabled: true,
    topic: willTopic,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    qos: normalizeQoS(rawWill.qos ?? mqttMeta.will_qos, 1),
    retain: rawWill.retain === true || mqttMeta.will_retain === true
  };
}

/**
 * Generate MQTT consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @param {string} options.templateDir - Optional template directory override
 * @param {Record<string, string>} options.templateOverrides - Optional per-template overrides
 * @returns {string} - Generated TypeScript consumer code
 */
function generateMQTTConsumer(manifest, options = {}) {
  const {
    typescript = true,
    templateDir,
    templateOverrides
  } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract || {};
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];

  // Extract MQTT-specific metadata
  const mqttMeta = delivery.metadata || {};
  const topic = delivery.topic || eventName;
  const qos = normalizeQoS(mqttMeta.qos, 0);
  const retained = mqttMeta.retained === true || mqttMeta.retain === true;
  const cleanSession = mqttMeta.cleanSession !== false && mqttMeta.clean_session !== false; // Default true
  const keepAliveSeconds = toPositiveNumber(mqttMeta.keepAlive ?? mqttMeta.keep_alive, 60);

  const reconnectPolicy = normalizeReconnectPolicy(delivery.retry_policy || mqttMeta.retry_policy);
  const reconnectBaseDelayMs = toPositiveNumber(
    mqttMeta.reconnectPeriodMs ??
      mqttMeta.reconnect_period_ms ??
      mqttMeta['retry.backoff.ms'] ??
      mqttMeta.retry_backoff_ms,
    1000
  );
  const reconnectMaxAttempts = toPositiveNumber(
    mqttMeta.maxReconnectAttempts ??
      mqttMeta.max_reconnect_attempts ??
      mqttMeta.retries,
    reconnectPolicy === 'none' ? 0 : 5,
    { allowZero: true }
  );
  const reconnectBackoffMultiplier = toPositiveNumber(
    mqttMeta.retry_backoff_multiplier ?? mqttMeta.retryBackoffMultiplier,
    reconnectPolicy === 'exponential' ? 2 : 1
  );
  const reconnectMaxBackoffMs = toPositiveNumber(
    mqttMeta.maxReconnectBackoffMs ?? mqttMeta.max_reconnect_backoff_ms,
    60000
  );
  const connectTimeoutMs = toPositiveNumber(
    mqttMeta.connectTimeoutMs ?? mqttMeta.connect_timeout_ms,
    30000
  );

  const retainedHandling = normalizeRetainedHandling(
    mqttMeta.retainedHandling ?? mqttMeta.retained_handling
  );
  const errorTopic = mqttMeta.errorTopic || mqttMeta.error_topic || `${topic}/errors`;
  const errorTopicEnabled = mqttMeta.errorTopicEnabled !== false && mqttMeta.error_topic_enabled !== false;
  const errorTopicIncludePayload = mqttMeta.errorTopicIncludePayload !== false && mqttMeta.error_topic_include_payload !== false;
  const willConfig = resolveWillConfig(mqttMeta, topic);

  const authFlags = resolveAuthModeFlags(mqttMeta);
  const authLabels = [];
  if (authFlags.includeUsernamePassword) authLabels.push('Username/Password');
  if (authFlags.includeMtls) authLabels.push('mTLS (Client Certificates)');

  // Analyze patterns
  const patterns = manifest.patterns?.detected || [];
  const orderingPattern = patterns.find(p =>
    p.pattern === 'user_keyed_ordering' || p.pattern === 'entity_keyed_ordering'
  );

  // Build imports
  const imports = [`import mqtt from 'mqtt';`];
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    client: ': mqtt.MqttClient | null',
    brokerUrl: ': string',
    clientId: ': string',
    monitoring: ': any',
    auth: ': any',
    consumerOptions: ': { qos: number; cleanSession: boolean; keepAliveSeconds: number; retained: boolean }',
    reconnectConfig: ': { policy: string; maxReconnectAttempts: number; baseDelayMs: number; backoffMultiplier: number; maxBackoffMs: number; connectTimeoutMs: number }',
    reconnectState: ': { attempt: number }',
    retainedHandling: ': string',
    errorHandling: ': { enabled: boolean; errorTopic: string; includePayload: boolean }',
    willConfig: ': any',
    config: ': string | { brokerUrl: string; clientId?: string; monitoring?: any; auth?: any; qos?: number; cleanSession?: boolean; retained?: boolean; keepAliveSeconds?: number; reconnect?: { policy?: string; maxReconnectAttempts?: number; baseDelayMs?: number; backoffMultiplier?: number; maxBackoffMs?: number; connectTimeoutMs?: number }; retainedHandling?: string; errorTopic?: string; errorTopicEnabled?: boolean; errorTopicIncludePayload?: boolean; will?: { topic: string; payload?: any; qos?: number; retain?: boolean } }',
    topic: ': string',
    message: ': Buffer',
    packet: ': any',
    error: ': Error',
    string: ': string',
    number: ': number',
    object: ': Record<string, any>',
    any: ': any',
    boolReturn: ': boolean',
    voidReturn: ': void',
    numberReturn: ': number',
    method: 'async ',
    private: 'private ',
    returnVoid: ': Promise<void>'
  } : {
    client: '',
    brokerUrl: '',
    clientId: '',
    monitoring: '',
    auth: '',
    consumerOptions: '',
    reconnectConfig: '',
    reconnectState: '',
    retainedHandling: '',
    errorHandling: '',
    willConfig: '',
    config: '',
    topic: '',
    message: '',
    packet: '',
    error: '',
    string: '',
    number: '',
    object: '',
    any: '',
    boolReturn: '',
    voidReturn: '',
    numberReturn: '',
    method: 'async ',
    private: '',
    returnVoid: ''
  };

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - Topic: ${topic}`);
  governanceComments.push(` * - QoS: ${qos} (${qos === 0 ? 'At most once' : qos === 1 ? 'At least once' : 'Exactly once'})`);
  governanceComments.push(` * - Retained publish flag (default): ${retained ? 'Yes' : 'No'}`);
  governanceComments.push(` * - Clean Session: ${cleanSession ? 'Yes' : 'No'}`);
  governanceComments.push(` * - Keep Alive seconds (default): ${keepAliveSeconds}`);
  governanceComments.push(` * - Auto reconnect: ${reconnectPolicy} (maxAttempts=${reconnectMaxAttempts}, baseDelayMs=${reconnectBaseDelayMs}, multiplier=${reconnectBackoffMultiplier})`);
  governanceComments.push(` * - Auth support: ${authLabels.join(', ') || 'None'}`);
  governanceComments.push(` * - Retained message handling: ${retainedHandling}`);
  governanceComments.push(` * - Error topic: ${errorTopicEnabled ? errorTopic : 'disabled'}`);
  governanceComments.push(` * - Last Will enabled: ${willConfig.enabled ? 'Yes' : 'No'}`);
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);

  if (orderingPattern) {
    governanceComments.push(` * - ℹ️ Ordering: ${orderingPattern.message}`);
  }

  const maskingBlock = piiFields.length > 0
    ? `    // Mask PII for logging\n    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);\n    await this.log('info', 'message_processed', { message: 'Processing event', payload: safeEvent, retained: context.retained === true });\n`
    : `    await this.log('info', 'message_processed', { message: 'Processing event', payload: event, retained: context.retained === true });\n`;

  return renderConsumerTemplate(
    'mqtt',
    {
      imports: imports.join('\n'),
      eventName,
      purpose: manifest.semantics?.purpose || 'Process event',
      governanceComments: governanceComments.join('\n'),
      className,
      topic,
      qos,
      cleanSession,
      keepAliveSecondsDefault: keepAliveSeconds,
      reconnectPolicy,
      reconnectBaseDelayMsDefault: reconnectBaseDelayMs,
      reconnectMaxAttemptsDefault: reconnectMaxAttempts,
      reconnectBackoffMultiplierDefault: reconnectBackoffMultiplier,
      reconnectMaxBackoffMsDefault: reconnectMaxBackoffMs,
      connectTimeoutMsDefault: connectTimeoutMs,
      retainedDefault: retained,
      retainedHandlingDefault: retainedHandling,
      errorTopicDefault: errorTopic,
      errorTopicEnabledDefault: errorTopicEnabled,
      errorTopicIncludePayloadDefault: errorTopicIncludePayload,
      includeUsernamePassword: authFlags.includeUsernamePassword,
      includeMtls: authFlags.includeMtls,
      hasWill: willConfig.enabled,
      willTopicLiteral: JSON.stringify(willConfig.topic),
      willPayloadLiteral: JSON.stringify(willConfig.payload),
      willQosDefault: willConfig.qos,
      willRetainDefault: willConfig.retain,
      type: typeAnnotations,
      promiseType: typescript ? '<void>' : '',
      qosCast: typescript ? ' as mqtt.QoS' : '',
      errorCast: typescript ? ' as Error' : '',
      maskingBlock
    },
    {
      templateDir,
      templateOverrides
    }
  );
}

export { generateMQTTConsumer };
