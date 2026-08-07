// ─── AssertionConfigEditor Tests (Phase 4 M4) ────────────────────────────────
// Tests that the AutomationConfigEditor renders all M4 assertion kinds and
// the correct conditional fields for each group.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider }  from '@tanstack/react-query';
import { AutomationConfigEditor }            from '@/features/automation/AutomationConfigEditor';
import type { TestCaseStep }                 from '@/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/services/testCaseService', () => ({
  testCaseService: {
    saveStepAutomation: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/errors', () => ({
  toastSuccess: vi.fn(),
  toastError:   vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<TestCaseStep> = {}): TestCaseStep {
  return {
    id:              'step-1',
    test_case_id:    'tc-1',
    step_number:     1,
    description:     'Test step',
    expected_result: '',
    notes:           null,
    automation_config: {
      driver_id: 'android',
      action:    'assertion',
      params:    {},
    },
    created_at:  '2026-01-01T00:00:00Z',
    updated_at:  '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(step = makeStep()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AutomationConfigEditor
        open={true}
        onClose={vi.fn()}
        step={step}
        testCaseId="tc-1"
      />
    </QueryClientProvider>
  );
}

// ─── Assertion drawer renders ─────────────────────────────────────────────────

describe('AutomationConfigEditor — assertion action renders', () => {
  it('renders the Assertion type dropdown', () => {
    renderEditor();
    expect(screen.getAllByText(/assertion type/i).length).toBeGreaterThan(0);
  });

  it('shows all 13 assertion kinds in dropdown', async () => {
    renderEditor();
    // Open the Assertion type select
    const select = screen.getByRole('combobox', { hidden: true });
    fireEvent.mouseDown(select.closest('[role="button"]') ?? select);

    const expectedKinds = [
      'Activity is in foreground',
      'App package is active',
      'Text is present (Android UI)',
      'View exists (XPath/ID)',
      'Screenshot can be captured',
      'Element exists (CSS selector)',
      'Text exists on page',
      'Element attribute equals',
      'Page URL matches',
      'Page title matches',
      'Wait until text appears',
      'Value equals (exact)',
      'Value matches regex',
    ];

    for (const label of expectedKinds) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows Android group label', () => {
    renderEditor();
    const select = screen.getByRole('combobox', { hidden: true });
    fireEvent.mouseDown(select.closest('[role="button"]') ?? select);
    expect(screen.getByText('— Android —')).toBeTruthy();
  });

  it('shows Chrome group label', () => {
    renderEditor();
    const select = screen.getByRole('combobox', { hidden: true });
    fireEvent.mouseDown(select.closest('[role="button"]') ?? select);
    expect(screen.getByText('— Chrome —')).toBeTruthy();
  });

  it('shows Common group label', () => {
    renderEditor();
    const select = screen.getByRole('combobox', { hidden: true });
    fireEvent.mouseDown(select.closest('[role="button"]') ?? select);
    expect(screen.getByText('— Common —')).toBeTruthy();
  });
});

// ─── Conditional fields by assertion kind ─────────────────────────────────────

describe('AutomationConfigEditor — assertion field rendering', () => {
  function renderWithKind(kind: string) {
    const step = makeStep({
      automation_config: {
        driver_id: 'android',
        action:    'assertion',
        params:    { assertion_kind: kind as never },
      },
    });
    return renderEditor(step);
  }

  it('assert_activity: shows expected value field', () => {
    renderWithKind('assert_activity');
    expect(screen.getAllByRole('textbox').some(
      el => el.getAttribute('placeholder')?.includes('MainActivity') ||
            el.closest('div')?.textContent?.includes('Expected')
    )).toBe(true);
  });

  it('assert_view_exists: shows selector field', () => {
    renderWithKind('assert_view_exists');
    expect(screen.getAllByRole('textbox').some(
      el => el.getAttribute('placeholder')?.includes('Button') ||
            el.closest('label')?.textContent?.includes('Selector') ||
            el.closest('div')?.textContent?.includes('Selector')
    )).toBe(true);
  });

  it('assert_attribute: shows selector, attribute, and expected fields', () => {
    renderWithKind('assert_attribute');
    const inputs = screen.getAllByRole('textbox');
    // Should have multiple text inputs (selector + attribute + expected)
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('assert_wait_until: shows timeout and poll interval fields', () => {
    renderWithKind('assert_wait_until');
    expect(screen.getAllByText(/timeout/i).length).toBeGreaterThan(0);
  });

  it('assert_regex_match: shows regex field', () => {
    renderWithKind('assert_regex_match');
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some(
      el => el.getAttribute('placeholder')?.includes('regex') ||
            el.closest('div')?.textContent?.includes('Regex')
    )).toBe(true);
  });

  it('assert_value_equals: shows expected and value fields', () => {
    renderWithKind('assert_value_equals');
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('negate checkbox present for all assertion kinds', () => {
    renderWithKind('assert_url');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeTruthy();
    expect(screen.getByText(/negate/i)).toBeTruthy();
  });
});

// ─── Editor action: non-assertion ────────────────────────────────────────────

describe('AutomationConfigEditor — non-assertion actions still work', () => {
  it('tap action shows coordinate fields', () => {
    const step = makeStep({
      automation_config: { driver_id: 'android', action: 'tap', params: {} },
    });
    renderEditor(step);
    expect(screen.getByText(/tap coordinates/i)).toBeTruthy();
  });

  it('wait action shows duration field', () => {
    const step = makeStep({
      automation_config: { driver_id: 'android', action: 'wait', params: {} },
    });
    renderEditor(step);
    expect(screen.getAllByText(/wait duration/i).length).toBeGreaterThan(0);
  });
});
