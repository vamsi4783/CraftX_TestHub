import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AIConnectorsPage } from '../../features/ai-connectors/AIConnectorsPage';
import { aiConnectorStore }  from '../../features/ai-connectors/aiConnectorStore';
import { secureCredentialStore } from '../../features/ai-connectors/secureCredentialStore';

// Mock the service layer so the page doesn't need a real Supabase / AI connector
vi.mock('../../features/ai-connectors/aiConnectorService', () => ({
  aiConnectorService: {
    list:             vi.fn(() => []),
    get:              vi.fn(),
    getDefault:       vi.fn(() => undefined),
    hasApiKey:        vi.fn(() => false),
    setEnabled:       vi.fn(),
    setPriority:      vi.fn(),
    setDefault:       vi.fn(),
    remove:           vi.fn(),
    testConnection:   vi.fn().mockResolvedValue({ success: true, health: { status: 'connected', latencyMs: 30, checkedAt: '' } }),
    getDiagnostics:   vi.fn().mockResolvedValue(null),
    discoverModels:   vi.fn().mockResolvedValue([]),
    addGemini:        vi.fn(),
    addOllama:        vi.fn(),
    addOpenAICompat:  vi.fn(),
    addMCP:           vi.fn(),
  },
}));

import { aiConnectorService } from '../../features/ai-connectors/aiConnectorService';
const svc = aiConnectorService as ReturnType<typeof vi.fn> & typeof aiConnectorService;

function renderPage() {
  return render(
    <MemoryRouter>
      <AIConnectorsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (svc.list as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (svc.getDefault as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
});

// ─── Page rendering ───────────────────────────────────────────────────────────

describe('AIConnectorsPage — rendering', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('AI Connectors')).toBeInTheDocument();
  });

  it('shows Add Connector button', () => {
    renderPage();
    expect(screen.getByTestId('add-connector-btn')).toBeInTheDocument();
  });

  it('shows empty state when no connectors', () => {
    renderPage();
    expect(screen.getByText(/No AI connectors configured/i)).toBeInTheDocument();
  });

  it('shows connector cards when connectors exist', () => {
    const now = new Date().toISOString();
    (svc.list as ReturnType<typeof vi.fn>).mockReturnValue([{
      id: 'gemini', kind: 'gemini', displayName: 'My Gemini',
      enabled: true, priority: 10, model: 'gemini-2.0-flash',
      createdAt: now, updatedAt: now,
    }]);
    renderPage();
    expect(screen.getByText('My Gemini')).toBeInTheDocument();
  });

  it('shows feature readiness panel', () => {
    renderPage();
    expect(screen.getByText('AI Feature Readiness')).toBeInTheDocument();
  });

  it('feature readiness shows all four features', () => {
    renderPage();
    expect(screen.getByText('AI Test Generation')).toBeInTheDocument();
    expect(screen.getByText('Failure Analysis')).toBeInTheDocument();
    expect(screen.getByText('Regression Analysis')).toBeInTheDocument();
    expect(screen.getByText('Self Healing')).toBeInTheDocument();
  });

  it('each feature readiness chip says migration pending', () => {
    renderPage();
    const chips = screen.getAllByText(/Connector platform ready — feature migration pending/i);
    expect(chips).toHaveLength(4);
  });
});

// ─── Add Connector dialog ─────────────────────────────────────────────────────

describe('AIConnectorsPage — Add Connector dialog', () => {
  it('opens dialog on Add Connector click', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    expect(screen.getByText('Add AI Connector')).toBeInTheDocument();
  });

  it('shows four connector type options', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    expect(screen.getByTestId('connector-type-gemini')).toBeInTheDocument();
    expect(screen.getByTestId('connector-type-ollama')).toBeInTheDocument();
    expect(screen.getByTestId('connector-type-openai_compatible')).toBeInTheDocument();
    expect(screen.getByTestId('connector-type-mcp')).toBeInTheDocument();
  });

  it('proceeds to Gemini config form on Gemini selection', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByTestId('connector-type-gemini'));
    expect(screen.getByTestId('gemini-api-key')).toBeInTheDocument();
  });

  it('proceeds to Ollama config form on Ollama selection', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByTestId('connector-type-ollama'));
    expect(screen.getByTestId('ollama-endpoint')).toBeInTheDocument();
  });

  it('proceeds to OpenAI-compatible form', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByTestId('connector-type-openai_compatible'));
    expect(screen.getByTestId('oai-base-url')).toBeInTheDocument();
  });

  it('proceeds to MCP form', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByTestId('connector-type-mcp'));
    expect(screen.getByTestId('mcp-display-name')).toBeInTheDocument();
  });

  it('back button returns to type selector', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByTestId('connector-type-gemini'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('connector-type-gemini')).toBeInTheDocument();
  });

  it('cancel closes the dialog', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    fireEvent.click(screen.getByText('Cancel'));
    // MUI Dialog defers DOM removal until exit transition; waitFor handles the timer
    await waitFor(() => {
      expect(screen.queryByText('Add AI Connector')).not.toBeInTheDocument();
    });
  });
});

// ─── Default connector selector ───────────────────────────────────────────────

describe('AIConnectorsPage — default connector', () => {
  it('shows selector when connectors exist', () => {
    const now = new Date().toISOString();
    (svc.list as ReturnType<typeof vi.fn>).mockReturnValue([{
      id: 'gemini', kind: 'gemini', displayName: 'My Gemini',
      enabled: true, priority: 10, createdAt: now, updatedAt: now,
    }]);
    renderPage();
    expect(screen.getByTestId('default-connector-select')).toBeInTheDocument();
  });

  it('does not show selector when no connectors', () => {
    renderPage();
    expect(screen.queryByTestId('default-connector-select')).not.toBeInTheDocument();
  });
});
