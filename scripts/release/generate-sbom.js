#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const DEFAULT_OUTPUT = path.resolve('reports', 'sbom.cdx.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    output: DEFAULT_OUTPUT
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.output = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/release/generate-sbom.js [options]

Options:
  --output, -o <path>   SBOM output path (default: ${DEFAULT_OUTPUT})
  --help, -h            Show help
`);
      process.exit(0);
    }
  }

  return options;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function ensureValidSbom(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (parsed.bomFormat !== 'CycloneDX') {
    throw new Error(`Unexpected SBOM format in ${filePath}`);
  }

  if (!Array.isArray(parsed.components)) {
    throw new Error(`SBOM missing components array in ${filePath}`);
  }
}

async function main() {
  const options = parseArgs();

  await fs.mkdir(path.dirname(options.output), { recursive: true });

  await run('npx', [
    '--yes',
    '@cyclonedx/cyclonedx-npm',
    '--output-file',
    options.output,
    '--output-format',
    'JSON'
  ]);

  await ensureValidSbom(options.output);
  console.log(`SBOM generated: ${options.output}`);
}

main().catch((error) => {
  console.error(`SBOM generation failed: ${error.message}`);
  process.exit(1);
});
