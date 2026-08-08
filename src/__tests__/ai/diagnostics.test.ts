import { describe, it, expect } from 'vitest';
import {
  getDiagnostics,
  getAllDiagnostics,
  formatDiagnosticsSummary,
} from '../../ai/diagnostics/ConnectorDiagnostics';
import { ConnectorHealthMonitor }    from '../../ai/health/ConnectorHealthMonitor';
import { GeminiFlashConnector }      from '../../ai/providers/GeminiFlashConnector';
import { OllamaConnector }           from '../../ai/providers/OllamaConnector';
import { OpenAICompatibleConnector } from '../../ai/providers/OpenAICompatibleConnector';
import { SecureString }              from '../../ai/security/SecureString';
import {
  mockJsonFetch,
  mockNetworkErrorFetch,
  geminiSuccessResponse,
  ollamaSuccessResponse,
  oaiSuccessResponse,
} from './helpers/testHelpers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGemini() {
  return new GeminiFlashConnector({
    apiKey:  SecureString.from('test-key'),
    fetcher: mockJsonFetch(200, { models: [] }),
  });
}

function makeOllama() {
  return new OllamaConnector({
    model:   'llama3.2',
    fetcher: mockJsonFetch(200, { models: [] }),
  });
}

function makeOAI() {
  return new OpenAICompatibleConnector({
    id:      'test-oai',
    name:    'TestOAI',
    baseUrl: 'http://localhost:1234/v1',
    model:   'my-model',
    fetcher: mockJsonFetch(200, { data: [] }),
  });
}

// ─── getDiagnostics ───────────────────────────────────────────────────────────

describe('getDiagnostics — report shape', () => {
  it('returns a report with the connectorId', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(report.connectorId).toBe('gemini_flash');
  });

  it('returns the connector name', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(report.connectorName).toBe('Gemini Flash');
  });

  it('returns a version string', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(typeof report.version).toBe('string');
    expect(report.version.length).toBeGreaterThan(0);
  });

  it('returns the connector type', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(report.type).toBe('api_provider');
  });

  it('returns the model for Gemini', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(typeof report.model).toBe('string');
    expect(report.model!.length).toBeGreaterThan(0);
  });

  it('returns the model for Ollama', async () => {
    const report = await getDiagnostics(makeOllama());
    expect(report.model).toContain('llama');
  });

  it('endpoint field is optional (may be undefined for connectors without public endpoint)', async () => {
    const report = await getDiagnostics(makeOllama());
    // endpoint is populated only when the connector exposes it; undefined is valid
    expect(report.endpoint === undefined || typeof report.endpoint === 'string').toBe(true);
  });

  it('includes a snapshotAt timestamp', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(report.snapshotAt).toBeTruthy();
    expect(() => new Date(report.snapshotAt)).not.toThrow();
  });

  it('includes capabilities object', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(typeof report.capabilities).toBe('object');
    expect(typeof report.capabilities.supportsStreaming).toBe('boolean');
  });

  it('health status is present', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(['connected', 'disconnected', 'error', 'degraded']).toContain(report.health.status);
  });

  it('includes latencyMs in the report', async () => {
    const report = await getDiagnostics(makeGemini());
    expect(typeof report.latencyMs).toBe('number');
  });
});

// ─── getDiagnostics with health monitor ──────────────────────────────────────

describe('getDiagnostics — with ConnectorHealthMonitor', () => {
  it('includes stats when monitor has data for this connector', async () => {
    const monitor = new ConnectorHealthMonitor();
    monitor.recordHealth('gemini_flash', {
      status: 'connected', latencyMs: 42, checkedAt: new Date().toISOString(),
    });
    const report = await getDiagnostics(makeGemini(), monitor);
    expect(report.stats).toBeDefined();
    expect(report.stats?.latencyMsLast).toBe(42);
  });

  it('stats is undefined when monitor has no data for connector', async () => {
    const report = await getDiagnostics(makeGemini(), new ConnectorHealthMonitor());
    expect(report.stats).toBeUndefined();
  });
});

// ─── getDiagnostics — error connector ────────────────────────────────────────

describe('getDiagnostics — unhealthy connector', () => {
  it('health status is error when endpoint unreachable', async () => {
    const c = new OllamaConnector({ model: 'llama3.2', fetcher: mockNetworkErrorFetch() });
    const report = await getDiagnostics(c);
    expect(report.health.status).toBe('error');
  });

  it('does not throw — always returns a report', async () => {
    const c = new OllamaConnector({ model: 'llama3.2', fetcher: mockNetworkErrorFetch() });
    await expect(getDiagnostics(c)).resolves.toBeTruthy();
  });
});

// ─── getAllDiagnostics ────────────────────────────────────────────────────────

describe('getAllDiagnostics', () => {
  it('returns one report per connector', async () => {
    const connectors = [makeGemini(), makeOllama(), makeOAI()];
    const reports    = await getAllDiagnostics(connectors);
    expect(reports).toHaveLength(3);
  });

  it('each report has a distinct connectorId', async () => {
    const connectors = [makeGemini(), makeOllama(), makeOAI()];
    const reports    = await getAllDiagnostics(connectors);
    const ids        = reports.map(r => r.connectorId);
    expect(new Set(ids).size).toBe(3);
  });

  it('returns empty array for no connectors', async () => {
    const reports = await getAllDiagnostics([]);
    expect(reports).toHaveLength(0);
  });

  it('merges monitor stats into each report', async () => {
    const monitor = new ConnectorHealthMonitor();
    monitor.recordHealth('gemini_flash', {
      status: 'connected', latencyMs: 77, checkedAt: new Date().toISOString(),
    });
    const reports = await getAllDiagnostics([makeGemini()], monitor);
    expect(reports[0].stats?.latencyMsLast).toBe(77);
  });

  it('continues past a failing connector and still returns reports for the rest', async () => {
    const broken = new OllamaConnector({ model: 'bad', fetcher: mockNetworkErrorFetch() });
    const good   = makeOAI();
    const reports = await getAllDiagnostics([broken, good]);
    expect(reports).toHaveLength(2);
    expect(reports.some(r => r.connectorId === 'test-oai')).toBe(true);
  });
});

// ─── formatDiagnosticsSummary ─────────────────────────────────────────────────

describe('formatDiagnosticsSummary', () => {
  it('returns a non-empty string', async () => {
    const report  = await getDiagnostics(makeGemini());
    const summary = formatDiagnosticsSummary(report);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('contains the connector name', async () => {
    const report  = await getDiagnostics(makeGemini());
    const summary = formatDiagnosticsSummary(report);
    expect(summary).toContain('Gemini Flash');
  });

  it('contains the health status', async () => {
    const report  = await getDiagnostics(makeOllama());
    const summary = formatDiagnosticsSummary(report);
    const validStatuses = ['connected', 'disconnected', 'error', 'degraded'];
    expect(validStatuses.some(s => summary.includes(s))).toBe(true);
  });

  it('contains the connector ID', async () => {
    const report  = await getDiagnostics(makeGemini());
    const summary = formatDiagnosticsSummary(report);
    expect(summary).toContain('gemini_flash');
  });

  it('contains the version', async () => {
    const report  = await getDiagnostics(makeGemini());
    const summary = formatDiagnosticsSummary(report);
    expect(summary).toContain(report.version);
  });
});
