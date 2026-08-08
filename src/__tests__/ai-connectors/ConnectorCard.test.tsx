import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorCard } from '../../features/ai-connectors/ConnectorCard';
import type { PersistedConnector } from '../../features/ai-connectors/aiConnectorStore';
import type { ConnectorTestResult } from '../../features/ai-connectors/aiConnectorService';

const now = new Date().toISOString();

const GEMINI: PersistedConnector = {
  id: 'gemini', kind: 'gemini', displayName: 'My Gemini',
  enabled: true, priority: 10, model: 'gemini-2.0-flash',
  createdAt: now, updatedAt: now,
};

const OLLAMA: PersistedConnector = {
  id: 'ollama', kind: 'ollama', displayName: 'Local Ollama',
  enabled: true, priority: 20, endpoint: 'http://localhost:11434', model: 'llama3.2',
  createdAt: now, updatedAt: now,
};

function renderCard(
  connector: PersistedConnector,
  overrides: {
    isDefault?: boolean;
    hasApiKey?: boolean;
    testResult?: ConnectorTestResult;
  } = {},
) {
  const onToggle      = vi.fn();
  const onDelete      = vi.fn();
  const onSetDefault  = vi.fn();
  const onViewDiag    = vi.fn();
  const onTest        = vi.fn().mockResolvedValue(
    overrides.testResult ?? { success: true, health: { status: 'connected', latencyMs: 30, checkedAt: '' } },
  );

  render(
    <ConnectorCard
      connector={connector}
      isDefault={overrides.isDefault ?? false}
      hasApiKey={overrides.hasApiKey ?? false}
      onToggleEnabled={onToggle}
      onDelete={onDelete}
      onSetDefault={onSetDefault}
      onTestConnection={onTest}
      onViewDiagnostics={onViewDiag}
    />,
  );

  return { onToggle, onDelete, onSetDefault, onViewDiag, onTest };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('ConnectorCard — rendering', () => {
  it('renders display name', () => {
    renderCard(GEMINI);
    expect(screen.getByText('My Gemini')).toBeInTheDocument();
  });

  it('renders connector kind chip', () => {
    renderCard(GEMINI);
    expect(screen.getByText('Gemini Flash')).toBeInTheDocument();
  });

  it('renders model', () => {
    renderCard(GEMINI);
    expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
  });

  it('renders endpoint for Ollama', () => {
    renderCard(OLLAMA);
    expect(screen.getByText('http://localhost:11434')).toBeInTheDocument();
  });

  it('shows Enabled chip when enabled', () => {
    renderCard(GEMINI);
    expect(screen.getByTestId(`status-chip-${GEMINI.id}`)).toHaveTextContent('Enabled');
  });

  it('shows Disabled chip when disabled', () => {
    renderCard({ ...GEMINI, enabled: false });
    expect(screen.getByTestId(`status-chip-${GEMINI.id}`)).toHaveTextContent('Disabled');
  });

  it('shows Default badge when isDefault', () => {
    renderCard(GEMINI, { isDefault: true });
    expect(screen.getByTestId(`default-badge-${GEMINI.id}`)).toBeInTheDocument();
  });

  it('does not show Default badge when not default', () => {
    renderCard(GEMINI, { isDefault: false });
    expect(screen.queryByTestId(`default-badge-${GEMINI.id}`)).not.toBeInTheDocument();
  });

  it('shows masked API key indicator when hasApiKey=true', () => {
    renderCard(GEMINI, { hasApiKey: true });
    expect(screen.getByText('••••••••')).toBeInTheDocument();
  });

  it('does NOT show API key indicator when hasApiKey=false', () => {
    renderCard(GEMINI, { hasApiKey: false });
    expect(screen.queryByText('••••••••')).not.toBeInTheDocument();
  });
});

// ─── Actions ──────────────────────────────────────────────────────────────────

describe('ConnectorCard — actions', () => {
  it('toggle switch calls onToggleEnabled', () => {
    const { onToggle } = renderCard(GEMINI);
    fireEvent.click(screen.getByTestId(`toggle-${GEMINI.id}`));
    expect(onToggle).toHaveBeenCalledWith(GEMINI.id, false); // currently enabled → toggle to false
  });

  it('test button calls onTestConnection', async () => {
    const { onTest } = renderCard(GEMINI);
    fireEvent.click(screen.getByTestId(`test-btn-${GEMINI.id}`));
    await waitFor(() => expect(onTest).toHaveBeenCalledWith(GEMINI.id));
  });

  it('test success shows connected result', async () => {
    renderCard(GEMINI);
    fireEvent.click(screen.getByTestId(`test-btn-${GEMINI.id}`));
    await waitFor(() => expect(screen.getByTestId('test-result-success')).toBeInTheDocument());
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('test failure shows error result', async () => {
    renderCard(GEMINI, {
      testResult: { success: false, errorMessage: 'Auth failed', suggestedFix: 'Check your key' },
    });
    fireEvent.click(screen.getByTestId(`test-btn-${GEMINI.id}`));
    await waitFor(() => expect(screen.getByTestId('test-result-failure')).toBeInTheDocument());
    expect(screen.getByTestId('test-error-message')).toHaveTextContent('Auth failed');
  });

  it('test result never shows API key placeholder or real key', async () => {
    renderCard(GEMINI, { hasApiKey: true });
    fireEvent.click(screen.getByTestId(`test-btn-${GEMINI.id}`));
    await waitFor(() => expect(screen.getByTestId('test-result-success')).toBeInTheDocument());
    // The ••••••• badge is for the key indicator, not the test result
    // The test result area should not contain anything like a real key
    const resultEl = screen.getByTestId('test-result-success');
    expect(resultEl.textContent).not.toMatch(/AIza/i);
    expect(resultEl.textContent).not.toMatch(/sk-/i);
  });

  it('delete button calls onDelete', () => {
    const { onDelete } = renderCard(GEMINI);
    fireEvent.click(screen.getByTestId(`menu-btn-${GEMINI.id}`));
    fireEvent.click(screen.getByTestId(`delete-btn-${GEMINI.id}`));
    expect(onDelete).toHaveBeenCalledWith(GEMINI.id);
  });

  it('set default calls onSetDefault', () => {
    const { onSetDefault } = renderCard(GEMINI, { isDefault: false });
    fireEvent.click(screen.getByTestId(`menu-btn-${GEMINI.id}`));
    fireEvent.click(screen.getByTestId(`set-default-${GEMINI.id}`));
    expect(onSetDefault).toHaveBeenCalledWith(GEMINI.id);
  });

  it('diagnostics calls onViewDiagnostics', () => {
    const { onViewDiag } = renderCard(GEMINI);
    fireEvent.click(screen.getByTestId(`menu-btn-${GEMINI.id}`));
    fireEvent.click(screen.getByTestId(`diagnostics-btn-${GEMINI.id}`));
    expect(onViewDiag).toHaveBeenCalledWith(GEMINI);
  });
});

// ─── Security: API key never in rendered DOM ──────────────────────────────────

describe('ConnectorCard — secret redaction', () => {
  it('rendered DOM never contains a raw API key value', () => {
    // Even if something went wrong upstream and a key got into props,
    // the card should not render it. In practice, `hasApiKey` is just a boolean.
    renderCard({ ...GEMINI }, { hasApiKey: true });
    const domText = document.body.textContent ?? '';
    // No pattern that looks like a real API key
    expect(domText).not.toMatch(/AIza[A-Za-z0-9_-]{35}/);
    expect(domText).not.toMatch(/sk-[A-Za-z0-9]{20}/);
  });
});
