import { Kafka } from 'kafkajs';
import { maskPII } from './utils/pii-masking.js';

/**
 * Consumer for customer.events.profile-updated
 *
 * Governance:
 * - PII fields: [user_id, email, phone, given_name, family_name, address_line_1, city, state, postal_code, marketing_opt_in]
 * - DLQ configured: Yes
 * - Ordering: Events are likely ordered per user (partition heuristic)
 * - Fanout: 4 subscribers detected
 * - Evolution: 85% optional fields suggests backward compatibility
 */
export class CustomerEventsProfileUpdatedConsumer {
  constructor(config) {
    this.kafka = new Kafka({
      clientId: 'customer.events.profile-updated-consumer',
      brokers: config.brokers
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId
    });
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'customer.events.profile-updated',
      fromBeginning: false
    });

    await this.consumer.run({
      eachMessage: async (payload) => {
        try {
          await this.handleMessage(payload);
        } catch (error) {
          await this.handleError(error, payload);
        }
      }
    });
  }

  async handleMessage(payload) {
    const { message } = payload;
    const event = JSON.parse(message.value?.toString() || '{}');

    const safeEvent = maskPII(event, ['user_id', 'email', 'phone', 'given_name', 'family_name', 'address_line_1', 'city', 'state', 'postal_code', 'marketing_opt_in']);
    console.log('Processing event:', safeEvent);

    // TODO: Insert business logic for processing customer.events.profile-updated.
  }

  async handleError(error, payload) {
    console.error('Error processing message:', error);

    await this.sendToDLQ(payload, error);
  }

  async sendToDLQ(payload, error) {
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: 'customer.events.profile-updated.dlq',
      messages: [{
        key: payload.message.key,
        value: payload.message.value,
        headers: {
          ...payload.message.headers,
          'x-error': error.message,
          'x-original-topic': 'customer.events.profile-updated'
        }
      }]
    });

    await producer.disconnect();
  }

  async stop() {
    await this.consumer.disconnect();
  }
}
