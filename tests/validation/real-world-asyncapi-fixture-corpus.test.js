import fs from 'fs/promises';
import path from 'path';
import { FIXTURE_CORPUS, REQUIRED_EDGE_TAGS } from '../../scripts/validation/asyncapi-fixture-corpus.js';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('real-world asyncapi fixture corpus', () => {
  test('tracks at least 10 fixtures', () => {
    expect(FIXTURE_CORPUS.length).toBeGreaterThanOrEqual(10);
  });

  test('uses unique fixture IDs', () => {
    const ids = FIXTURE_CORPUS.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers required edge-case tags', () => {
    const tags = new Set(
      FIXTURE_CORPUS.flatMap((fixture) => fixture.tags || [])
    );

    for (const requiredTag of REQUIRED_EDGE_TAGS) {
      expect(tags.has(requiredTag)).toBe(true);
    }
  });

  test('all local fixture input paths exist', async () => {
    for (const fixture of FIXTURE_CORPUS) {
      if (!fixture.inputPath) {
        continue;
      }

      const absolutePath = path.resolve(PROJECT_ROOT, fixture.inputPath);
      await expect(fs.access(absolutePath)).resolves.toBeUndefined();
    }
  });
});
