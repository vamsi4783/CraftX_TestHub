import type { IAIConnector }            from '../core/IAIConnector';
import type { AIConnectorCapabilities, ConnectorHealth } from '../types/AITypes';

export interface RegistryEntry {
  readonly connector:    IAIConnector;
  readonly priority:     number;
  readonly enabled:      boolean;
  readonly registeredAt: string;
  readonly lastHealth?:  ConnectorHealth;
}

export class AIConnectorRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  // ── Registration ────────────────────────────────────────────────────────────

  register(
    connector: IAIConnector,
    options?: { priority?: number; enabled?: boolean },
  ): void {
    if (this.entries.has(connector.id)) {
      throw new Error(
        `Connector '${connector.id}' is already registered. Call unregister() first.`,
      );
    }
    this.entries.set(connector.id, {
      connector,
      priority:     options?.priority ?? 100,
      enabled:      options?.enabled  ?? true,
      registeredAt: new Date().toISOString(),
    });
  }

  unregister(id: string): boolean {
    return this.entries.delete(id);
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────

  get(id: string): IAIConnector | undefined {
    return this.entries.get(id)?.connector;
  }

  getEntry(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  // ── Listing ─────────────────────────────────────────────────────────────────

  list(): RegistryEntry[] {
    return [...this.entries.values()];
  }

  /** Returns only enabled connectors, sorted ascending by priority (lower = higher priority). */
  listEnabled(): RegistryEntry[] {
    return this.list()
      .filter(e => e.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /** Returns enabled connectors matching the capability predicate, priority-sorted. */
  findByCapability(
    predicate: (caps: AIConnectorCapabilities) => boolean,
  ): RegistryEntry[] {
    return this.listEnabled().filter(e => predicate(e.connector.capabilities()));
  }

  // ── Enable / Disable ────────────────────────────────────────────────────────

  setEnabled(id: string, enabled: boolean): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.set(id, { ...entry, enabled });
    return true;
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async checkHealth(id: string): Promise<ConnectorHealth | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    const health = await entry.connector.health();
    this.entries.set(id, { ...entry, lastHealth: health });
    return health;
  }

  async checkAllHealth(): Promise<Map<string, ConnectorHealth>> {
    const results = new Map<string, ConnectorHealth>();
    await Promise.allSettled(
      [...this.entries.keys()].map(async (id) => {
        const health = await this.checkHealth(id);
        if (health) results.set(id, health);
      }),
    );
    return results;
  }

  // ── Housekeeping ─────────────────────────────────────────────────────────────

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
