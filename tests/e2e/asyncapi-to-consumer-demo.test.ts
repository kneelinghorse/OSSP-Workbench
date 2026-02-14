import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { runAsyncApiToConsumerDemo } from '../../examples/demos/asyncapi-to-consumer/run-demo.js';

describe('AsyncAPI to consumer demo', () => {
  test('generates Kafka consumer with DLQ, PII redaction, and governance annotations', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'asyncapi-consumer-demo-'));

    try {
      const outputDir = path.join(tmpRoot, 'output');
      const specPath = path.join(process.cwd(), 'examples', 'demos', 'asyncapi-to-consumer', 'sample-spec.yaml');

      const result = await runAsyncApiToConsumerDemo({
        specPath,
        outputDir,
        quiet: true
      });

      expect(result.durationMs).toBeLessThan(5000);
      expect(await fs.pathExists(result.manifestPath)).toBe(true);
      expect(await fs.pathExists(result.graphPath)).toBe(true);
      expect(await fs.pathExists(result.consumerTsPath)).toBe(true);
      expect(result.syntaxChecks.every((check: any) => check.ok === true)).toBe(true);

      expect(result.detectedPatterns).toEqual(
        expect.arrayContaining(['user_keyed_ordering', 'high_fanout', 'backward_compatible_schema'])
      );

      const consumerCode = await fs.readFile(result.consumerTsPath, 'utf8');
      expect(consumerCode).toContain('await this.sendToDLQ(payload, error);');
      expect(consumerCode).toContain('maskPII(event');
      expect(consumerCode).toContain('Ordering:');
      expect(consumerCode).toContain('Fanout:');
      expect(consumerCode).toContain('Evolution:');

      if (result.piiUtilTsPath) {
        expect(await fs.pathExists(result.piiUtilTsPath)).toBe(true);
      }
    } finally {
      await fs.remove(tmpRoot);
    }
  });
});
