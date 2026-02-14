#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const DEFAULT_REPORT_PATH = 'reports/consumer-soak-performance.json';
const DEFAULT_BUDGET_PATH = 'config/soak-performance-budgets.json';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    reportPath: DEFAULT_REPORT_PATH,
    budgetPath: DEFAULT_BUDGET_PATH
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if ((arg === '--report' || arg === '-r') && args[i + 1]) {
      options.reportPath = args[i + 1];
      i += 1;
    } else if ((arg === '--budget' || arg === '-b') && args[i + 1]) {
      options.budgetPath = args[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/ci/consumer-soak-budget.js [options]

Options:
  --report, -r <path>   Soak performance report (default: ${DEFAULT_REPORT_PATH})
  --budget, -b <path>   Budget definition JSON (default: ${DEFAULT_BUDGET_PATH})
  --help, -h            Show help
`);
      process.exit(0);
    }
  }

  return options;
}

async function readJson(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function toNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing numeric field: ${fieldName}`);
  }
  return value;
}

export function evaluateBudgets(report, budgets) {
  const checks = [];

  const iterations = toNumber(report?.soak?.iterations, 'report.soak.iterations');
  const failureRate = toNumber(report?.metrics?.failures?.rate, 'report.metrics.failures.rate');
  const importP95 = toNumber(report?.metrics?.importMs?.p95, 'report.metrics.importMs.p95');
  const generationP95 = toNumber(
    report?.metrics?.generationMs?.p95,
    'report.metrics.generationMs.p95'
  );
  const maxHeapMB = toNumber(report?.metrics?.memoryMb?.max, 'report.metrics.memoryMb.max');

  checks.push({
    name: 'iterationsMin',
    actual: iterations,
    expected: budgets.iterationsMin,
    passed: iterations >= budgets.iterationsMin,
    detail: `iterations ${iterations} >= ${budgets.iterationsMin}`
  });

  checks.push({
    name: 'maxFailureRate',
    actual: failureRate,
    expected: budgets.maxFailureRate,
    passed: failureRate <= budgets.maxFailureRate,
    detail: `failure rate ${failureRate.toFixed(4)} <= ${budgets.maxFailureRate}`
  });

  checks.push({
    name: 'importP95Ms',
    actual: importP95,
    expected: budgets.importP95Ms,
    passed: importP95 <= budgets.importP95Ms,
    detail: `import p95 ${importP95.toFixed(2)}ms <= ${budgets.importP95Ms}ms`
  });

  checks.push({
    name: 'generationP95Ms',
    actual: generationP95,
    expected: budgets.generationP95Ms,
    passed: generationP95 <= budgets.generationP95Ms,
    detail: `generation p95 ${generationP95.toFixed(2)}ms <= ${budgets.generationP95Ms}ms`
  });

  checks.push({
    name: 'maxHeapMB',
    actual: maxHeapMB,
    expected: budgets.maxHeapMB,
    passed: maxHeapMB <= budgets.maxHeapMB,
    detail: `max heap ${maxHeapMB.toFixed(2)}MB <= ${budgets.maxHeapMB}MB`
  });

  const violations = checks.filter((check) => !check.passed);

  return {
    passed: violations.length === 0,
    checks,
    violations
  };
}

async function main() {
  const options = parseArgs();
  const report = await readJson(options.reportPath);
  const budgets = await readJson(options.budgetPath);

  const evaluation = evaluateBudgets(report, budgets);

  if (!evaluation.passed) {
    console.error('Soak/performance budgets failed:');
    for (const check of evaluation.violations) {
      console.error(`- ${check.name}: ${check.detail}`);
    }
    process.exit(1);
  }

  console.log('Soak/performance budgets satisfied:');
  for (const check of evaluation.checks) {
    console.log(`- ${check.detail}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Budget evaluation failed: ${error.message}`);
    process.exit(1);
  });
}
