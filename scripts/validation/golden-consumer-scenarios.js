export const GOLDEN_CONSUMER_SCENARIOS = [
  {
    id: 'kafka-security',
    transport: 'kafka',
    specPath: 'tests/fixtures/asyncapi/public/streetlights-operation-security.yml',
    eventName: 'smartylighting.streetlights.1.0.event.{streetlightId}.lighting.measured',
    description: 'Kafka security/auth metadata with streetlights contract'
  },
  {
    id: 'kafka-schema-avro',
    transport: 'kafka',
    specPath: 'tests/fixtures/asyncapi/kafka-schema-registry.yaml',
    eventName: 'payments.avro',
    description: 'Kafka schema-registry Avro payload handling'
  },
  {
    id: 'kafka-schema-protobuf',
    transport: 'kafka',
    specPath: 'tests/fixtures/asyncapi/kafka-schema-registry.yaml',
    eventName: 'payments.protobuf',
    description: 'Kafka schema-registry Protobuf payload handling'
  },
  {
    id: 'amqp-routing-dlq',
    transport: 'amqp',
    specPath: 'tests/fixtures/asyncapi/validation/amqp-patterns-v2.yaml',
    eventName: 'user.events.registered',
    description: 'AMQP routing and DLQ-oriented queue semantics'
  },
  {
    id: 'mqtt-qos-retain',
    transport: 'mqtt',
    specPath: 'tests/fixtures/asyncapi/validation/mqtt-patterns-v2.yaml',
    eventName: 'device/commands/reboot',
    description: 'MQTT QoS/retain and command-consumer behavior'
  }
];

export function findScenarioManifest(imported, scenario) {
  return (imported.manifests || []).find(
    (manifest) =>
      manifest?.delivery?.contract?.transport === scenario.transport &&
      manifest?.event?.name === scenario.eventName
  );
}
