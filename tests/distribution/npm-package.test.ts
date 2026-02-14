import fs from 'fs/promises';
import path from 'path';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

async function readPackageJson() {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(content);
}

function normalizePackPath(filePath) {
  return filePath.replace(/^package\//, '');
}

describe('npm package distribution', () => {
  test('publish metadata is configured for stable npm release', async () => {
    const pkg = await readPackageJson();

    expect(pkg.name).toBe('ossp-consumer-gen');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.private).toBeUndefined();

    expect(pkg.files).toEqual(
      expect.arrayContaining([
        'packages/',
        'templates/',
        'cli/',
        'src/',
        'utils/',
        'config/',
        'viewers/',
        'README.md',
        'CHANGELOG.md'
      ])
    );

    expect(pkg.bin).toEqual(
      expect.objectContaining({
        'ossp-consumer-gen': './packages/runtime/cli/generate-cli.js',
        ossp: './packages/runtime/cli/index.js',
        'ossp-mcp-server': './packages/runtime/bin/protocol-mcp-server.js'
      })
    );

    const consumerBinPath = path.join(REPO_ROOT, pkg.bin['ossp-consumer-gen']);
    const consumerBinContents = await fs.readFile(consumerBinPath, 'utf8');
    expect(consumerBinContents.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('npm pack dry-run contains required artifacts and excludes tests', async () => {
    const pkg = await readPackageJson();
    const { stdout } = await execFile('npm', ['pack', '--dry-run', '--json'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: '0'
      }
    });

    const output = stdout.trim();
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);

    const manifest = parsed[0];
    expect(manifest.filename).toBe(`${pkg.name}-${pkg.version}.tgz`);

    const includedPaths = (manifest.files || []).map((file) => normalizePackPath(file.path));

    expect(includedPaths).toEqual(
      expect.arrayContaining([
        'package.json',
        'README.md',
        'CHANGELOG.md',
        'packages/runtime/cli/generate-cli.js',
        'packages/runtime/cli/commands/generate.js',
        'packages/runtime/generators/consumers/index.js'
      ])
    );

    expect(includedPaths.some((filePath) => filePath.startsWith('tests/'))).toBe(false);
    expect(includedPaths.some((filePath) => filePath.startsWith('node_modules/'))).toBe(false);
  });

  test('consumer binary help renders with clean node invocation', async () => {
    const consumerBinPath = path.join(REPO_ROOT, 'packages/runtime/cli/generate-cli.js');

    const { stdout } = await execFile('node', [consumerBinPath, '--help'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: '0'
      }
    });

    expect(stdout).toContain('ossp-consumer-gen');
    expect(stdout).toContain('Generate event consumer code from manifests');
  });
});
