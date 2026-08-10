// ─── M12 Phase O: TestCaseNormalizer Tests ────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { normalizeTestCase, normalizeTestCaseBatch, normalizeCategory } from '@/services/testCaseNormalizer';

describe('normalizeCategory', () => {
  it('returns valid categories as-is', () => {
    expect(normalizeCategory('smoke')).toBe('smoke');
    expect(normalizeCategory('happy_path')).toBe('happy_path');
    expect(normalizeCategory('integration')).toBe('integration');
    expect(normalizeCategory('performance')).toBe('performance');
    expect(normalizeCategory('api')).toBe('api');
    expect(normalizeCategory('data_validation')).toBe('data_validation');
    expect(normalizeCategory('compatibility')).toBe('compatibility');
  });

  it('resolves aliases', () => {
    expect(normalizeCategory('functional')).toBe('happy_path');
    expect(normalizeCategory('e2e')).toBe('integration');
    expect(normalizeCategory('end-to-end')).toBe('integration');
    expect(normalizeCategory('auth')).toBe('permission');
    expect(normalizeCategory('authorization')).toBe('permission');
    expect(normalizeCategory('ui')).toBe('smoke');  // 'ui' maps to smoke per CATEGORY_ALIASES
    expect(normalizeCategory('perf')).toBe('performance');
    expect(normalizeCategory('data')).toBe('data_validation');
  });

  it('handles case-insensitive input', () => {
    expect(normalizeCategory('SMOKE')).toBe('smoke');
    expect(normalizeCategory('Happy_Path')).toBe('happy_path');
  });

  it('defaults unknown values to smoke', () => {
    expect(normalizeCategory('unknown_thing')).toBe('smoke');
    expect(normalizeCategory(null)).toBe('smoke');
    expect(normalizeCategory('')).toBe('smoke');
  });
});

describe('normalizeTestCase', () => {
  const base = {
    title: 'Login with valid credentials',
    steps: [
      { step_number: 1, description: 'Open login page', expected_result: 'Page loads' },
    ],
  };

  it('accepts a minimal valid case', () => {
    const result = normalizeTestCase(base);
    expect(result.ok).toBe(true);
    expect(result.draft?.title).toBe('Login with valid credentials');
    expect(result.draft?.steps).toHaveLength(1);
  });

  it('normalizes camelCase field names', () => {
    const result = normalizeTestCase({
      title: 'Test',
      isAutomationReady: true,
      estimatedMinutes: 10,
      steps: [],
    });
    expect(result.ok).toBe(true);
    expect(result.draft?.is_automation_ready).toBe(true);
    expect(result.draft?.estimated_minutes).toBe(10);
  });

  it('accepts camelCase automation_ready field', () => {
    // The normalizer checks isAutomationReady (camelCase), not space-separated
    const result = normalizeTestCase({
      title: 'Test',
      isAutomationReady: true,
      estimatedMinutes: 15,
      steps: [],
    });
    expect(result.ok).toBe(true);
    expect(result.draft?.is_automation_ready).toBe(true);
    expect(result.draft?.estimated_minutes).toBe(15);
  });

  it('normalizes priority aliases', () => {
    const p1 = normalizeTestCase({ title: 'T', priority: 'p1', steps: [] });
    expect(p1.draft?.priority).toBe('critical');

    const high = normalizeTestCase({ title: 'T', priority: 'HIGH', steps: [] });
    expect(high.draft?.priority).toBe('high');

    const blocker = normalizeTestCase({ title: 'T', priority: 'blocker', steps: [] });
    expect(blocker.draft?.priority).toBe('critical');
  });

  it('normalizes tags from comma-separated string', () => {
    const result = normalizeTestCase({ title: 'T', tags: 'smoke, login, critical-path', steps: [] });
    expect(result.draft?.tags).toEqual(['smoke', 'login', 'critical-path']);
  });

  it('normalizes tags from array', () => {
    const result = normalizeTestCase({ title: 'T', tags: ['smoke', 'login'], steps: [] });
    expect(result.draft?.tags).toEqual(['smoke', 'login']);
  });

  it('normalizes steps with alternative field names', () => {
    const result = normalizeTestCase({
      title: 'T',
      steps: [
        { stepNumber: 1, action: 'Click submit', expected: 'Form submits' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.draft?.steps[0].description).toBe('Click submit');
    expect(result.draft?.steps[0].expected_result).toBe('Form submits');
  });

  it('returns invalid for missing title', () => {
    const result = normalizeTestCase({ steps: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.field === 'title')).toBe(true);
  });

  it('returns invalid for empty title', () => {
    const result = normalizeTestCase({ title: '   ', steps: [] });
    expect(result.ok).toBe(false);
  });

  it('returns invalid for non-array input', () => {
    const result = normalizeTestCase('not an object' as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });
});

describe('normalizeTestCaseBatch', () => {
  it('counts valid and invalid correctly', () => {
    const raws = [
      { title: 'Valid', steps: [] },
      { steps: [] },       // missing title → invalid
      { title: 'Also valid', steps: [] },
    ];
    const { results, validCount, invalidCount } = normalizeTestCaseBatch(raws);
    expect(results).toHaveLength(3);
    expect(validCount).toBe(2);
    expect(invalidCount).toBe(1);
  });

  it('handles empty input', () => {
    const { results, validCount, invalidCount } = normalizeTestCaseBatch([]);
    expect(results).toHaveLength(0);
    expect(validCount).toBe(0);
    expect(invalidCount).toBe(0);
  });

  it('normalizes all items independently', () => {
    const raws = [
      { title: 'A', priority: 'p1', steps: [] },
      { title: 'B', priority: 'low', steps: [] },
    ];
    const { results } = normalizeTestCaseBatch(raws);
    expect(results[0].draft?.priority).toBe('critical');
    expect(results[1].draft?.priority).toBe('low');
  });
});
