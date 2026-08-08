/**
 * aiConnectorStore — persists non-secret connector metadata to localStorage.
 *
 * Secrets (API keys) are NEVER stored here.  Use SecureCredentialStore.
 *
 * Schema version is embedded so future migrations can be handled cleanly.
 */

const STORAGE_KEY = 'testhub:ai_connectors:v1';
const DEFAULT_KEY = 'testhub:ai_connectors:default:v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectorKind = 'gemini' | 'ollama' | 'openai_compatible' | 'mcp';

export interface PersistedConnector {
  /** Unique stable ID for this record, e.g. "gemini", "ollama", "oai_compat_1234". */
  readonly id: string;
  readonly kind: ConnectorKind;
  displayName: string;
  enabled: boolean;
  priority: number;
  // ── Gemini ─────────────────────────────────────────────────────────────────
  model?: string;
  // ── Ollama ─────────────────────────────────────────────────────────────────
  endpoint?: string;
  // ── OpenAI-compatible ──────────────────────────────────────────────────────
  baseUrl?: string;
  // ── MCP ────────────────────────────────────────────────────────────────────
  mcpTransport?: 'stdio' | 'sse' | 'websocket';
  mcpEndpoint?: string;
  mcpCommand?: string;
  // ── Book-keeping ───────────────────────────────────────────────────────────
  readonly createdAt: string;
  updatedAt: string;
}

// ─── Store implementation ─────────────────────────────────────────────────────

function readAll(): PersistedConnector[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PersistedConnector[];
  } catch {
    return [];
  }
}

function writeAll(connectors: PersistedConnector[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connectors));
  } catch { /* localStorage blocked or full */ }
}

export const aiConnectorStore = {
  list(): PersistedConnector[] {
    return readAll();
  },

  get(id: string): PersistedConnector | undefined {
    return readAll().find(c => c.id === id);
  },

  /** Add a new connector record. Throws if id already exists. */
  add(connector: PersistedConnector): void {
    const all = readAll();
    if (all.find(c => c.id === connector.id)) {
      throw new Error(`Connector '${connector.id}' already exists.`);
    }
    writeAll([...all, connector]);
  },

  /** Update an existing connector. Returns false if not found. */
  update(id: string, changes: Partial<Omit<PersistedConnector, 'id' | 'kind' | 'createdAt'>>): boolean {
    const all = readAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return false;
    // Strip id/kind/createdAt at runtime — they are immutable even when callers bypass TS
    const { id: _id, kind: _kind, createdAt: _ca, ...safeChanges } =
      changes as Record<string, unknown>;
    all[idx] = { ...all[idx], ...safeChanges, updatedAt: new Date().toISOString() };
    writeAll(all);
    return true;
  },

  /** Remove a connector record. Returns false if not found. */
  remove(id: string): boolean {
    const all = readAll();
    const next = all.filter(c => c.id !== id);
    if (next.length === all.length) return false;
    writeAll(next);
    // Clear default if deleted connector was the default
    if (this.getDefault() === id) this.clearDefault();
    return true;
  },

  getDefault(): string | undefined {
    try {
      return localStorage.getItem(DEFAULT_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },

  setDefault(id: string | undefined): void {
    try {
      if (id) localStorage.setItem(DEFAULT_KEY, id);
      else localStorage.removeItem(DEFAULT_KEY);
    } catch { /* ignore */ }
  },

  clearDefault(): void {
    this.setDefault(undefined);
  },

  /** Clear everything — used in tests. */
  _reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DEFAULT_KEY);
    } catch { /* ignore */ }
  },
};
