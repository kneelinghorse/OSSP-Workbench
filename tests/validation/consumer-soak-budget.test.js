import { evaluateBudgets } from '../../scripts/ci/consumer-soak-budget.js';

describe('consumer soak budget evaluator', () => {
  const baseReport = {
    soak: { iterations: 5 },
    metrics: {
      failures: { rate: 0 },
      importMs: { p95: 200 },
      generationMs: { p95: 25 },
      memoryMb: { max: 120 }
    }
  };

  const baseBudgets = {
    iterationsMin: 3,
    maxFailureRate: 0,
    importP95Ms: 1000,
    generationP95Ms: 100,
    maxHeapMB: 250
  };

  test('passes when all checks are within budgets', () => {
    const result = evaluateBudgets(baseReport, baseBudgets);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checks).toHaveLength(5);
  });

  test('fails when import p95 exceeds budget', () => {
    const report = {
      ...baseReport,
      metrics: {
        ...baseReport.metrics,
        importMs: { p95: 1201 }
      }
    };

    const result = evaluateBudgets(report, baseBudgets);
    expect(result.passed).toBe(false);
    expect(result.violations.some((item) => item.name === 'importP95Ms')).toBe(true);
  });
});
