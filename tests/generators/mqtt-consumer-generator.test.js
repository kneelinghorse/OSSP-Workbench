/**
 * Tests for MQTT Consumer Generator
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateMQTTConsumer } from '../../packages/runtime/generators/consumers/mqtt-consumer-generator.js';

describe('MQTT Consumer Generator', () => {
  describe('generateMQTTConsumer', () => {
    it('should generate basic MQTT consumer', () => {
      const manifest = {
        event: { name: 'sensor.reading' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'sensors/temperature'
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Process sensor temperature readings' }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('export class SensorReadingConsumer');
      expect(code).toContain("import mqtt from 'mqtt'");
      expect(code).toContain("this.client?.subscribe('sensors/temperature'");
      expect(code).toContain('Process sensor temperature readings');
    });

    it('should include PII masking when PII fields exist', () => {
      const manifest = {
        event: { name: 'device.registered' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'devices/registered'
          }
        },
        schema: {
          fields: [
            { name: 'deviceId', pii: true },
            { name: 'location', pii: true }
          ]
        }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['deviceId', 'location'])");
    });

    it('should handle different QoS levels', () => {
      const manifestQoS0 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 0 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS0 = generateMQTTConsumer(manifestQoS0);
      expect(codeQoS0).toContain('QoS: 0 (At most once)');
      expect(codeQoS0).toContain('process.env.MQTT_QOS ?? 0');

      const manifestQoS1 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 1 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS1 = generateMQTTConsumer(manifestQoS1);
      expect(codeQoS1).toContain('QoS: 1 (At least once)');
      expect(codeQoS1).toContain('process.env.MQTT_QOS ?? 1');

      const manifestQoS2 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 2 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS2 = generateMQTTConsumer(manifestQoS2);
      expect(codeQoS2).toContain('QoS: 2 (Exactly once)');
      expect(codeQoS2).toContain('process.env.MQTT_QOS ?? 2');
    });

    it('should use default QoS 0 when not specified', () => {
      const manifest = {
        event: { name: 'default.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'default/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('QoS: 0');
      expect(code).toContain('process.env.MQTT_QOS ?? 0');
    });

    it('should include retained and clean session metadata', () => {
      const manifest = {
        event: { name: 'persistent.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'persistent/topic',
            metadata: {
              retained: true,
              cleanSession: false
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('Retained publish flag (default): Yes');
      expect(code).toContain('Clean Session: No');
    });

    it('should include ordering pattern comments when present', () => {
      const manifest = {
        event: { name: 'vehicle.position' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'vehicles/+/position'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'entity_keyed_ordering',
              message: 'Messages ordered by vehicle ID'
            }
          ]
        }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('ℹ️ Ordering: Messages ordered by vehicle ID');
    });

    it('should include opt-in monitoring hooks', () => {
      const manifest = {
        event: { name: 'metrics.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'metrics/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('this.monitoring = normalizedConfig.monitoring || { enabled: false };');
      expect(code).toContain('recordSuccessMetrics');
      expect(code).toContain('recordErrorMetrics');
      expect(code).toContain('incrementMessagesProcessed');
      expect(code).toContain('incrementErrors');
      expect(code).toContain('observeLatency');
      expect(code).toContain("startSpan('consumer.process_message'");
    });

    it('should include MQTT auth mode support by default', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'secure/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('resolveAuthMode');
      expect(code).toContain('buildAuthOptions');
      expect(code).toContain('process.env.MQTT_AUTH_MODE');
      expect(code).toContain('process.env.MQTT_USERNAME');
      expect(code).toContain('process.env.MQTT_PASSWORD');
      expect(code).toContain('process.env.MQTT_TLS_CERT');
      expect(code).toContain('process.env.MQTT_TLS_KEY');
    });

    it('should render auth blocks conditionally from metadata', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'secure/topic',
            metadata: {
              authModes: ['mtls']
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain("if (authMode === 'mtls')");
      expect(code).toContain('process.env.MQTT_TLS_CERT');
      expect(code).not.toContain("if (authMode === 'username_password')");
      expect(code).not.toContain('process.env.MQTT_USERNAME');
    });

    it('should include auto reconnect with backoff defaults from metadata', () => {
      const manifest = {
        event: { name: 'resilient.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'resilient/topic',
            retry_policy: 'exponential',
            metadata: {
              reconnect_period_ms: 2000,
              retries: 6,
              retry_backoff_multiplier: 3,
              max_reconnect_backoff_ms: 45000,
              connect_timeout_ms: 40000
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('MQTT_RECONNECT_POLICY');
      expect(code).toContain('MQTT_MAX_RECONNECT_ATTEMPTS');
      expect(code).toContain('MQTT_RECONNECT_BASE_DELAY_MS');
      expect(code).toContain('MQTT_RECONNECT_BACKOFF_MULTIPLIER');
      expect(code).toContain('MQTT_RECONNECT_MAX_BACKOFF_MS');
      expect(code).toContain('MQTT_CONNECT_TIMEOUT_MS');
      expect(code).toContain('calculateReconnectDelay');
      expect(code).toContain('consumer_reconnecting');
      expect(code).toContain('consumer_reconnect_exhausted');
    });

    it('should include Last Will and Testament support', () => {
      const manifest = {
        event: { name: 'device.status' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'devices/status',
            metadata: {
              will_topic: 'devices/status/last-will',
              will_payload: 'offline',
              will_qos: 1,
              will_retain: true
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('Last Will enabled: Yes');
      expect(code).toContain('this.willConfig = this.buildWillOptions(normalizedConfig.will);');
      expect(code).toContain('clientOptions.will = this.willConfig;');
      expect(code).toContain('topic: "devices/status/last-will"');
      expect(code).toContain('payload: "offline"');
    });

    it('should include retained-message handling and app-level error topic pattern', () => {
      const manifest = {
        event: { name: 'alerts.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'alerts/topic',
            metadata: {
              retained_handling: 'ignore',
              error_topic: 'alerts/errors',
              error_topic_include_payload: false
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('Retained message handling: ignore');
      expect(code).toContain('Error topic: alerts/errors');
      expect(code).toContain('retained_message_skipped');
      expect(code).toContain('publishToErrorTopic');
      expect(code).toContain('message_routed_to_error_topic');
      expect(code).toContain("errorTopic: normalizedConfig.errorTopic || process.env.MQTT_ERROR_TOPIC || 'alerts/errors'");
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'test/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest, { typescript: false });

      expect(code).not.toContain(': mqtt.MqttClient');
      expect(code).not.toContain(': string');
      expect(code).not.toContain('private ');
      expect(code).not.toContain('as mqtt.QoS');
    });

    it('should support template directory overrides', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-template-'));

      try {
        fs.writeFileSync(path.join(tempDir, 'mqtt.hbs'), '// custom mqtt template for {{topic}}');

        const manifest = {
          event: { name: 'sensor.reading' },
          delivery: {
            contract: {
              transport: 'mqtt',
              topic: 'sensors/temperature'
            }
          },
          schema: { fields: [] }
        };

        const code = generateMQTTConsumer(manifest, { templateDir: tempDir });
        expect(code.trim()).toBe('// custom mqtt template for sensors/temperature');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
