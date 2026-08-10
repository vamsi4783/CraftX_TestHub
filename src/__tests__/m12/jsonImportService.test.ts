// ─── M12 Phase O: JSON Import Service Tests ───────────────────────────────────

import { describe, it, expect } from 'vitest';
import { parseJsonInput, dryRunJsonImport } from '@/services/jsonImportService';

describe('parseJsonInput', () => {
  it('parses a direct array', () => {
    const input = JSON.stringify([{ title: 'TC1', steps: [] }]);
    const result = parseJsonInput(input);
    expect(result).toHaveLength(1);
  });

  it('parses { test_cases: [...] }', () => {
    const input = JSON.stringify({ test_cases: [{ title: 'TC1', steps: [] }, { title: 'TC2', steps: [] }] });
    const result = parseJsonInput(input);
    expect(result).toHaveLength(2);
  });

  it('parses { cases: [...] }', () => {
    const input = JSON.stringify({ cases: [{ title: 'TC1', steps: [] }] });
    expect(parseJsonInput(input)).toHaveLength(1);
  });

  it('parses { tests: [...] }', () => {
    const input = JSON.stringify({ tests: [{ title: 'TC1', steps: [] }] });
    expect(parseJsonInput(input)).toHaveLength(1);
  });

  it('wraps a single test-case object in an array', () => {
    const input = JSON.stringify({ title: 'Single TC', steps: [] });
    const result = parseJsonInput(input);
    expect(result).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonInput('not json')).toBeNull();
  });

  it('returns null for a plain number', () => {
    expect(parseJsonInput('42')).toBeNull();
  });

  it('returns null for an unrecognized object with no title', () => {
    const input = JSON.stringify({ foo: 'bar' });
    expect(parseJsonInput(input)).toBeNull();
  });
});

describe('dryRunJsonImport', () => {
  it('counts valid and invalid items', () => {
    const raws = [
      { title: 'Valid TC', steps: [] },
      { steps: [] },       // missing title
    ];
    const result = dryRunJsonImport(raws);
    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.previews).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it('includes title and priority in previews', () => {
    const raws = [{ title: 'Login test', priority: 'critical', steps: [] }];
    const { previews } = dryRunJsonImport(raws);
    expect(previews[0].title).toBe('Login test');
    expect(previews[0].priority).toBe('critical');
  });

  it('normalizes priority in previews', () => {
    const raws = [{ title: 'T', priority: 'p2', steps: [] }];
    const { previews } = dryRunJsonImport(raws);
    expect(previews[0].priority).toBe('high');
  });

  it('handles empty input', () => {
    const result = dryRunJsonImport([]);
    expect(result.total).toBe(0);
    expect(result.valid).toBe(0);
    expect(result.invalid).toBe(0);
  });

  it('includes error index for invalid items', () => {
    const raws = [
      { title: 'OK', steps: [] },
      { steps: [] },
      { title: 'Also OK', steps: [] },
    ];
    const { errors } = dryRunJsonImport(raws);
    expect(errors[0].index).toBe(1);
  });
});
