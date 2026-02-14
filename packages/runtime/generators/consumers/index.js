/**
 * Consumer Generator - Main Interface
 * Generates production-ready event consumer code from Event Protocol manifests
 */

import { generateKafkaConsumer } from './kafka-consumer-generator.js';
import { generateAMQPConsumer } from './amqp-consumer-generator.js';
import { generateMQTTConsumer } from './mqtt-consumer-generator.js';
import { generatePIIMaskingUtil } from './utils/pii-masking-generator.js';
import { generateConsumerTest } from './test-generator.js';

/**
 * Generate event consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @param {boolean} options.includeTests - Generate test scaffold (default: true)
 * @param {boolean} options.includePIIUtil - Generate PII masking utility (default: true)
 * @param {string} options.templateDir - Optional consumer template directory override
 * @param {Record<string, string>} options.templateOverrides - Optional per-template file overrides
 * @returns {object} - Generated code files
 */
function generateEventConsumer(manifest, options = {}) {
  const {
    typescript = true,
    includeTests = true,
    includePIIUtil = true,
    templateDir,
    templateOverrides
  } = options;

  if (!manifest || !manifest.event) {
    throw new Error('Invalid manifest: missing event field');
  }

  const transport = manifest.delivery?.contract?.transport;

  if (!transport) {
    throw new Error('Invalid manifest: missing delivery.contract.transport');
  }

  // Generate consumer code based on transport
  let consumerCode;
  let generatorUsed;

  if (transport === 'kafka') {
    consumerCode = generateKafkaConsumer(manifest, { typescript, templateDir, templateOverrides });
    generatorUsed = 'kafka';
  } else if (transport === 'amqp') {
    consumerCode = generateAMQPConsumer(manifest, { typescript, templateDir, templateOverrides });
    generatorUsed = 'amqp';
  } else if (transport === 'mqtt') {
    consumerCode = generateMQTTConsumer(manifest, { typescript, templateDir, templateOverrides });
    generatorUsed = 'mqtt';
  } else {
    throw new Error(`Unsupported transport: ${transport}. Supported: kafka, amqp, mqtt`);
  }

  const result = {
    consumer: consumerCode,
    generator: generatorUsed,
    transport
  };

  // Generate test scaffold if requested
  if (includeTests) {
    result.test = generateConsumerTest(manifest, { typescript });
  }

  // Generate PII masking utility if requested and PII fields exist
  const hasPII = manifest.schema?.fields?.some(f => f.pii);
  if (includePIIUtil && hasPII) {
    result.piiUtil = generatePIIMaskingUtil({ typescript });
  }

  return result;
}

/**
 * Generate consumers for multiple manifests (batch generation)
 * @param {object[]} manifests - Array of Event Protocol manifests
 * @param {object} options - Generation options
 * @returns {object[]} - Array of generated code results
 */
function generateEventConsumers(manifests, options = {}) {
  if (!Array.isArray(manifests)) {
    throw new Error('manifests must be an array');
  }

  const results = [];
  const errors = [];

  for (const manifest of manifests) {
    try {
      const result = generateEventConsumer(manifest, options);
      results.push({
        eventName: manifest.event.name,
        success: true,
        ...result
      });
    } catch (error) {
      errors.push({
        eventName: manifest.event?.name || 'Unknown',
        success: false,
        error: error.message
      });
    }
  }

  return {
    results,
    errors,
    summary: {
      total: manifests.length,
      successful: results.length,
      failed: errors.length
    }
  };
}

export {
  generateEventConsumer,
  generateEventConsumers,
  // Export individual generators for advanced usage
  generateKafkaConsumer,
  generateAMQPConsumer,
  generateMQTTConsumer,
  generatePIIMaskingUtil,
  generateConsumerTest
};
