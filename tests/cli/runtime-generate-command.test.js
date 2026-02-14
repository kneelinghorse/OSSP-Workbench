import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirnameLocal, '..', '..');
const RUNTIME_CLI_PATH = path.join(REPO_ROOT, 'packages', 'runtime', 'cli', 'index.js');

async function runRuntimeCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [RUNTIME_CLI_PATH, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('runtime ossp generate consumer command', () => {
  test('generates TypeScript consumers from AsyncAPI spec with default transport', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-generate-ts-'));

    try {
      const specPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'asyncapi', 'kafka-events.yaml');
      const result = await runRuntimeCli([
        'generate',
        'consumer',
        '--spec',
        specPath,
        '--output',
        tmpDir
      ]);

      expect(result.code).toBe(0);
      await expect(fs.access(path.join(tmpDir, 'orders.created-consumer.ts'))).resolves.toBeUndefined();
      const generated = await fs.readFile(path.join(tmpDir, 'orders.created-consumer.ts'), 'utf8');
      expect(generated).toContain("import { Kafka, Consumer, EachMessagePayload, PartitionAssigners } from 'kafkajs'");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('supports transport and language flags', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-generate-js-'));

    try {
      const specPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'asyncapi', 'kafka-events.yaml');
      const result = await runRuntimeCli([
        'generate',
        'consumer',
        '--spec',
        specPath,
        '--transport',
        'amqp',
        '--lang',
        'js',
        '--no-tests',
        '--no-pii-util',
        '--output',
        tmpDir
      ]);

      expect(result.code).toBe(0);
      await expect(fs.access(path.join(tmpDir, 'orders.created-consumer.js'))).resolves.toBeUndefined();
      const generated = await fs.readFile(path.join(tmpDir, 'orders.created-consumer.js'), 'utf8');
      expect(generated).toContain("import * as amqp from 'amqplib'");
      expect(generated).not.toContain(': amqp.Connection');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('auto-detects schema-registry deserialization from AsyncAPI message contentType', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-generate-schema-registry-'));

    try {
      const specPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'asyncapi', 'kafka-schema-registry.yaml');
      const result = await runRuntimeCli([
        'generate',
        'consumer',
        '--spec',
        specPath,
        '--output',
        tmpDir
      ]);

      expect(result.code).toBe(0);
      const generated = await fs.readFile(path.join(tmpDir, 'payments.avro-consumer.ts'), 'utf8');
      expect(generated).toContain("@kafkajs/confluent-schema-registry");
      expect(generated).toContain('SCHEMA_REGISTRY_URL');
      expect(generated).toContain('await this.schemaRegistry.decode(messageBuffer, decodeOptions)');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
