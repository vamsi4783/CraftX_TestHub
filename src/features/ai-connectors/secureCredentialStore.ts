/**
 * SecureCredentialStore — session-scoped secret storage for AI connector keys.
 *
 * Secrets are held in memory AND written to sessionStorage so they survive
 * a React hot-reload, but are cleared when the browser tab is closed.
 * Raw values are never written to localStorage and never logged.
 *
 * The storage value is base64-encoded (obfuscation only — not encryption).
 * This is appropriate for a local dev-tool context.  If a backend secret
 * vault is added in future, swap the readThrough / writeThrough methods.
 */

import { SecureString } from '@/ai/security/SecureString';

const SESSION_PREFIX = 'testhub:ai_cred:';

class SecureCredentialStoreImpl {
  /** In-memory map — connectorId → raw secret. */
  private readonly _mem = new Map<string, string>();

  constructor() {
    // Restore from sessionStorage on construction (e.g. hot-reload)
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(SESSION_PREFIX)) {
          const connId = k.slice(SESSION_PREFIX.length);
          const encoded = sessionStorage.getItem(k);
          if (encoded) this._mem.set(connId, atob(encoded));
        }
      }
    } catch {
      // sessionStorage not available (e.g. privacy mode blocking it)
    }
  }

  /** Store a secret for a connector.  The raw value never appears in logs. */
  store(connectorId: string, secret: string): void {
    if (!secret) return;
    this._mem.set(connectorId, secret);
    try {
      sessionStorage.setItem(`${SESSION_PREFIX}${connectorId}`, btoa(secret));
    } catch { /* sessionStorage blocked */ }
  }

  /** Retrieve the secret as a SecureString (raw value hidden behind reveal()). */
  retrieve(connectorId: string): SecureString | undefined {
    const raw = this._mem.get(connectorId);
    return raw ? SecureString.from(raw) : undefined;
  }

  /** Return true if a secret exists for this connector. */
  hasSecret(connectorId: string): boolean {
    return this._mem.has(connectorId);
  }

  /** Remove the secret for a connector. */
  clear(connectorId: string): void {
    this._mem.delete(connectorId);
    try {
      sessionStorage.removeItem(`${SESSION_PREFIX}${connectorId}`);
    } catch { /* ignore */ }
  }

  /** Remove ALL stored secrets. */
  clearAll(): void {
    const ids = [...this._mem.keys()];
    ids.forEach(id => this.clear(id));
  }
}

export const secureCredentialStore = new SecureCredentialStoreImpl();
export { SecureCredentialStoreImpl };
