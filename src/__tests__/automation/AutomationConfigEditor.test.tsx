// ─── M1: AutomationConfigEditor unit tests ───────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutomationConfigEditor } from '../../features/automation/AutomationConfigEditor';
import type { TestCaseStep } from '../../types';

// Suppress MUI warnings in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function makeStep(overrides: Partial<TestCaseStep> = {}): TestCaseStep {
  return {
    id:               'step-001',
    test_case_id:     'tc-001',
    step_number:      1,
    description:      'Tap the Login button',
    expected_result:  'Login screen appears',
    notes:            null,
    automation_config: null,
    created_at:       '2026-08-07T00:00:00Z',
    updated_at:       '2026-08-07T00:00:00Z',
    ...overrides,
  };
}

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AutomationConfigEditor — renders', () => {
  it('renders drawer with step description in header', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.getByText('Automation Config')).toBeInTheDocument();
    expect(screen.getByText(/Tap the Login button/)).toBeInTheDocument();
  });

  it('shows Not configured chip when step has no automation_config', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows Configured chip when step has automation_config', () => {
    const step = makeStep({
      automation_config: { driver_id: 'android', action: 'tap', params: { x: 540, y: 1200 } },
    });
    wrapper(
      <AutomationConfigEditor open step={step} onClose={() => {}} testCaseId="tc-001" />,
    );
    // MUI Chip label is in a span — use container text content
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Configured:.*Tap/);
    expect(body).toContain('android');
  });

  it('renders driver toggle buttons', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.getByText('Android')).toBeInTheDocument();
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('renders all 9 action buttons for android driver', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    // Android supports: tap, swipe, type_text, wait, launch_app, assertion, screenshot, press_back, press_key
    expect(screen.getByText('Tap')).toBeInTheDocument();
    expect(screen.getByText('Swipe')).toBeInTheDocument();
    expect(screen.getByText('Type Text')).toBeInTheDocument();
    expect(screen.getByText('Wait')).toBeInTheDocument();
    expect(screen.getByText('Launch App')).toBeInTheDocument();
    expect(screen.getByText('Assertion')).toBeInTheDocument();
    expect(screen.getByText('Screenshot')).toBeInTheDocument();
    expect(screen.getByText('Press Back')).toBeInTheDocument();
    expect(screen.getByText('Press Key')).toBeInTheDocument();
  });

  it('renders Save Config and Cancel buttons', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.getByText('Save Config')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows Remove button only when config exists', () => {
    const { rerender, unmount } = wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    unmount();

    const step = makeStep({ automation_config: { driver_id: 'android', action: 'tap', params: {} } });
    wrapper(
      <AutomationConfigEditor open step={step} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });
});

describe('AutomationConfigEditor — action-specific param fields', () => {
  it('shows X and Y fields for tap action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    // Tap is default action
    expect(screen.getByLabelText(/X \(px\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Y \(px\)/)).toBeInTheDocument();
  });

  it('shows text field for type_text action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Type Text'));
    expect(screen.getByLabelText('Text to type')).toBeInTheDocument();
  });

  it('shows duration field for wait action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Wait'));
    expect(screen.getByLabelText('Wait duration (ms)')).toBeInTheDocument();
  });

  it('shows package field for launch_app action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Launch App'));
    expect(screen.getByLabelText('Package name')).toBeInTheDocument();
  });

  it('shows assertion type dropdown for assertion action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Assertion'));
    // MUI Select renders a combobox; confirm its presence
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThan(0);
  });

  it('shows no parameters message for screenshot action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Screenshot'));
    expect(screen.getByText('No parameters required for this action.')).toBeInTheDocument();
  });

  it('shows no parameters message for press_back action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Press Back'));
    expect(screen.getByText('No parameters required for this action.')).toBeInTheDocument();
  });

  it('shows key code field for press_key action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Press Key'));
    expect(screen.getByLabelText('Key code')).toBeInTheDocument();
  });
});

describe('AutomationConfigEditor — driver switch', () => {
  it('browser driver hides android-only actions', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Browser'));
    // Swipe, launch_app, press_back, press_key are android-only
    expect(screen.queryByText('Swipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Launch App')).not.toBeInTheDocument();
    expect(screen.queryByText('Press Back')).not.toBeInTheDocument();
    expect(screen.queryByText('Press Key')).not.toBeInTheDocument();
    // Tap, type_text, wait, assertion, screenshot are available on browser
    expect(screen.getByText('Tap')).toBeInTheDocument();
    expect(screen.getByText('Type Text')).toBeInTheDocument();
  });
});

describe('AutomationConfigEditor — JSON preview', () => {
  it('renders JSON preview block with correct action', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    const pre = document.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('"action": "tap"');
    expect(pre?.textContent).toContain('"driver_id": "android"');
  });

  it('JSON preview updates when action changes', () => {
    wrapper(
      <AutomationConfigEditor open step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    fireEvent.click(screen.getByText('Wait'));
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('"action": "wait"');
  });
});

describe('AutomationConfigEditor — closed state', () => {
  it('renders nothing visible when open=false', () => {
    wrapper(
      <AutomationConfigEditor open={false} step={makeStep()} onClose={() => {}} testCaseId="tc-001" />,
    );
    expect(screen.queryByText('Automation Config')).not.toBeInTheDocument();
  });
});
