/**
 * Tests for AMQP Consumer Generator
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateAMQPConsumer } from '../../packages/runtime/generators/consumers/amqp-consumer-generator.js';

describe('AMQP Consumer Generator', () => {
  describe('generateAMQPConsumer', () => {
    it('should generate basic AMQP consumer', () => {
      const manifest = {
        event: { name: 'order.shipped' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              exchange: 'orders',
              queue: 'order.shipped',
              routingKey: 'order.shipped'
            }
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Notify when order is shipped' }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('export class OrderShippedConsumer');
      expect(code).toContain("import * as amqp from 'amqplib'");
      expect(code).toContain("const queue = 'order.shipped'");
      expect(code).toContain("const exchange = 'orders'");
      expect(code).toContain('Notify when order is shipped');
    });

    it('should include PII masking when PII fields exist', () => {
      const manifest = {
        event: { name: 'customer.registered' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'customer.registered'
            }
          }
        },
        schema: {
          fields: [
            { name: 'email', pii: true },
            { name: 'phone', pii: true }
          ]
        }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['email', 'phone'])");
    });

    it('should generate DLQ routing when configured', () => {
      const manifest = {
        event: { name: 'payment.failed' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'payment.failed'
            },
            dlq: 'payment.dlq'
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('sendToDLQ');
      expect(code).toContain("const dlqQueue = 'payment.dlq'");
      expect(code).toContain('await this.sendToDLQ(channel, msg, error)');
    });

    it('should use default values when metadata missing', () => {
      const manifest = {
        event: { name: 'simple.event' },
        delivery: {
          contract: {
            transport: 'amqp'
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("const queue = 'simple.event'"); // Defaults to event name
      expect(code).toContain('durable: true'); // Default durable
      expect(code).toContain('prefetch: this.toNumber(normalizedConfig.prefetch, process.env.AMQP_PREFETCH, 1)');
      expect(code).toContain('AMQP_HEARTBEAT_SECONDS ?? process.env.AMQP_HEARTBEAT');
      expect(code).toContain('channelPoolSize: this.toNumber(normalizedConfig.channelPoolSize, process.env.AMQP_CHANNEL_POOL_SIZE, 1)');
    });

    it('should respect durable and prefetch settings', () => {
      const manifest = {
        event: { name: 'temp.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'temp.queue',
              durable: false,
              prefetch: 10
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('durable: false');
      expect(code).toContain('prefetch: this.toNumber(normalizedConfig.prefetch, process.env.AMQP_PREFETCH, 10)');
      expect(code).toContain('await channel.prefetch(this.consumerOptions.prefetch)');
    });

    it('should handle exchange binding correctly', () => {
      const manifest = {
        event: { name: 'notification.sent' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              exchange: 'notifications',
              queue: 'notification.sent',
              routingKey: 'notification.*'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("const exchange = 'notifications'");
      expect(code).toContain('assertExchange');
      expect(code).toContain('bindQueue');
      expect(code).toContain("'notification.*'");
    });

    it('should include opt-in monitoring hooks', () => {
      const manifest = {
        event: { name: 'metrics.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'metrics.queue'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('this.monitoring = normalizedConfig.monitoring || { enabled: false };');
      expect(code).toContain('recordSuccessMetrics');
      expect(code).toContain('recordErrorMetrics');
      expect(code).toContain('incrementMessagesProcessed');
      expect(code).toContain('incrementErrors');
      expect(code).toContain('observeLatency');
      expect(code).toContain("startSpan('consumer.process_message'");
    });

    it('should include AMQP auth mode support by default', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'secure.queue'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('resolveAuthMode');
      expect(code).toContain('buildAuthConfig');
      expect(code).toContain('process.env.AMQP_AUTH_MODE');
      expect(code).toContain('process.env.AMQP_USERNAME');
      expect(code).toContain('process.env.AMQP_PASSWORD');
      expect(code).toContain('process.env.AMQP_TLS_CERT');
      expect(code).toContain('process.env.AMQP_TLS_KEY');
      expect(code).toContain('process.env.AMQP_TLS_CA');
    });

    it('should render auth blocks conditionally from metadata', () => {
      const manifest = {
        event: { name: 'secure.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'secure.queue',
              authModes: ['username_password']
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("if (authMode === 'username_password')");
      expect(code).toContain('process.env.AMQP_USERNAME');
      expect(code).not.toContain("if (authMode === 'mtls')");
      expect(code).not.toContain('process.env.AMQP_TLS_CERT');
    });

    it('should include retry, heartbeat, and channel pooling defaults from metadata', () => {
      const manifest = {
        event: { name: 'resilient.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            retry_policy: 'exponential',
            metadata: {
              queue: 'resilient.queue',
              prefetch: 25,
              heartbeat_seconds: 45,
              channel_pool_size: 3,
              'x-max-retries': 7,
              'retry.backoff.ms': 1500,
              retry_backoff_multiplier: 3
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain('prefetch: this.toNumber(normalizedConfig.prefetch, process.env.AMQP_PREFETCH, 25)');
      expect(code).toContain('AMQP_CHANNEL_POOL_SIZE, 3');
      expect(code).toContain('AMQP_RETRY_MAX_RETRIES');
      expect(code).toContain('AMQP_RETRY_BACKOFF_MS');
      expect(code).toContain('AMQP_RETRY_BACKOFF_MULTIPLIER');
      expect(code).toContain('connection_retry_scheduled');
      expect(code).toContain('const channelPoolSize = Math.max(1, this.consumerOptions.channelPoolSize);');
    });

    it('should resolve queue/exchange/routing from normalized metadata aliases and topic fallback', () => {
      const manifest = {
        event: { name: 'alias.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            topic: 'fallback.exchange:fallback.queue',
            metadata: {
              exchange_name: 'billing.exchange',
              queue_name: 'billing.queue',
              routing_key: 'billing.*',
              'heartbeat.interval.ms': 9000
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest);

      expect(code).toContain("const queue = 'billing.queue'");
      expect(code).toContain("const exchange = 'billing.exchange'");
      expect(code).toContain("'billing.*'");
      expect(code).toContain('Heartbeat seconds (default): 9');
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'amqp',
            metadata: {
              queue: 'test.queue'
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateAMQPConsumer(manifest, { typescript: false });

      expect(code).not.toContain(': amqp.Connection');
      expect(code).not.toContain(': amqp.Channel');
      expect(code).not.toContain('private ');
    });

    it('should support template overrides by template key', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amqp-template-'));
      const customTemplatePath = path.join(tempDir, 'custom-amqp.hbs');

      try {
        fs.writeFileSync(customTemplatePath, '// custom amqp template for {{queue}}');

        const manifest = {
          event: { name: 'order.shipped' },
          delivery: {
            contract: {
              transport: 'amqp',
              metadata: {
                queue: 'order.shipped'
              }
            }
          },
          schema: { fields: [] }
        };

        const code = generateAMQPConsumer(manifest, {
          templateOverrides: {
            amqp: customTemplatePath
          }
        });

        expect(code.trim()).toBe('// custom amqp template for order.shipped');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
