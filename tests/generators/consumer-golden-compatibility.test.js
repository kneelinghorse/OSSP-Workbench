import fs from 'fs/promises';
import path from 'path';
import { importAsyncAPI } from '../../packages/runtime/importers/asyncapi/importer.js';
import { generateEventConsumer } from '../../packages/runtime/generators/consumers/index.js';
import {
  GOLDEN_CONSUMER_SCENARIOS,
  findScenarioManifest
} from '../../scripts/validation/golden-consumer-scenarios.js';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GOLDEN_ROOT = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'golden', 'consumers');

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n').trimEnd();
}

async function readFileOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

describe('Consumer Golden Compatibility', () => {
  for (const scenario of GOLDEN_CONSUMER_SCENARIOS) {
    test(`matches golden output for ${scenario.id}`, async () => {
      const specPath = path.resolve(PROJECT_ROOT, scenario.specPath);
      const imported = await importAsyncAPI(specPath, { timeout: 60000 });
      const manifest = findScenarioManifest(imported, scenario);

      expect(manifest).toBeDefined();

      const generated = generateEventConsumer(manifest, {
        typescript: false,
        includeTests: true,
        includePIIUtil: true
      });

      const scenarioDir = path.join(GOLDEN_ROOT, scenario.id);
      const expectedConsumer = await readFileOrEmpty(path.join(scenarioDir, 'consumer.js'));
      const expectedTest = await readFileOrEmpty(path.join(scenarioDir, 'consumer.test.js'));
      const expectedPII = await readFileOrEmpty(path.join(scenarioDir, 'pii-masking.js'));

      expect(normalize(expectedConsumer)).toBe(normalize(generated.consumer));
      expect(normalize(expectedTest)).toBe(normalize(generated.test || ''));
      expect(normalize(expectedPII)).toBe(normalize(generated.piiUtil || ''));
    });
  }
});
