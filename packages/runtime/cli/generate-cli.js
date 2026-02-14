#!/usr/bin/env node

/**
 * Protocol Generate CLI (ESM)
 *
 * Lightweight wrapper to generate event consumers from manifests.
 * Usage:
 *   ossp-consumer-gen consumer <input> [--output <dir>] [--js] [--no-tests] [--no-pii-util] [--batch]
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('ossp-consumer-gen')
  .description('Generate event consumer code from manifests')
  .version('1.0.0');

program
  .command('consumer <input>')
  .description('Generate consumer(s) from manifest file or directory')
  .option('--output <dir>', 'Output directory', 'generated-consumers')
  .option('--js', 'Generate JavaScript instead of TypeScript')
  .option('--no-tests', 'Skip test scaffolds')
  .option('--no-pii-util', 'Skip PII masking utility')
  .option('--batch', 'Treat input as directory and generate for all manifests')
  .action(async (input, options) => {
    const { executeGenerateCommand } = await import('./commands/generate.js');
    return executeGenerateCommand({
      input,
      output: options.output,
      typescript: !options.js,
      tests: options.tests !== false,
      piiUtil: options.piiUtil !== false,
      batch: !!options.batch
    });
  });

program.showHelpAfterError(true);
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
