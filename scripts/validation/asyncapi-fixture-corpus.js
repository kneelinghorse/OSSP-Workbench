export const REQUIRED_EDGE_TAGS = [
  'schema-registry',
  'security-auth',
  'routing-complexity'
];

export const FIXTURE_CORPUS = [
  {
    id: 'streetlights-kafka',
    profile: 'public-pinned',
    source: 'AsyncAPI community examples (pinned mirror)',
    inputPath: 'tests/fixtures/asyncapi/public/streetlights-kafka.yml',
    upstreamUrl: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-kafka.yml',
    transportHints: ['kafka'],
    tags: ['public', 'security-auth', 'routing-complexity']
  },
  {
    id: 'streetlights-mqtt',
    profile: 'public-pinned',
    source: 'AsyncAPI community examples (pinned mirror)',
    inputPath: 'tests/fixtures/asyncapi/public/streetlights-mqtt.yml',
    upstreamUrl: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-mqtt.yml',
    transportHints: ['mqtt'],
    tags: ['public', 'security-auth']
  },
  {
    id: 'streetlights-operation-security',
    profile: 'public-pinned',
    source: 'AsyncAPI community examples (pinned mirror)',
    inputPath: 'tests/fixtures/asyncapi/public/streetlights-operation-security.yml',
    upstreamUrl: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/streetlights-operation-security.yml',
    transportHints: ['kafka'],
    tags: ['public', 'security-auth']
  },
  {
    id: 'rpc-client-amqp',
    profile: 'public-pinned',
    source: 'AsyncAPI community examples (pinned mirror)',
    inputPath: 'tests/fixtures/asyncapi/public/rpc-client-amqp.yml',
    upstreamUrl: 'https://raw.githubusercontent.com/asyncapi/spec/v2.6.0/examples/rpc-client.yml',
    transportHints: ['amqp'],
    tags: ['public', 'routing-complexity']
  },
  {
    id: 'kafka-events-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/kafka-events.yaml',
    transportHints: ['kafka'],
    tags: ['edge-case', 'retry-dlq', 'consumer-config']
  },
  {
    id: 'kafka-patterns-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/validation/kafka-patterns-v2.yaml',
    transportHints: ['kafka'],
    tags: ['edge-case', 'retry-dlq', 'routing-complexity']
  },
  {
    id: 'kafka-schema-registry-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/kafka-schema-registry.yaml',
    transportHints: ['kafka'],
    tags: ['edge-case', 'schema-registry']
  },
  {
    id: 'amqp-notifications-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/amqp-notifications.yaml',
    transportHints: ['amqp'],
    tags: ['edge-case', 'routing-complexity', 'retry-dlq']
  },
  {
    id: 'amqp-patterns-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/validation/amqp-patterns-v2.yaml',
    transportHints: ['amqp'],
    tags: ['edge-case', 'routing-complexity', 'retry-dlq']
  },
  {
    id: 'mqtt-patterns-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/validation/mqtt-patterns-v2.yaml',
    transportHints: ['mqtt'],
    tags: ['edge-case', 'routing-complexity', 'qos-retain']
  },
  {
    id: 'mqtt-telemetry-fixture',
    profile: 'edge-case',
    source: 'OSSP fixture corpus',
    inputPath: 'tests/fixtures/asyncapi/mqtt-telemetry.yaml',
    transportHints: ['mqtt'],
    tags: ['edge-case', 'qos-retain']
  }
];
