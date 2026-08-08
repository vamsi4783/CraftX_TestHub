/**
 * aiRuntimePolicy — controls whether the Supabase edge-function fallback is allowed.
 *
 * Default: edge-function fallback is DISABLED.
 * The edge functions call a TestHub-owned Anthropic API key; they must never fire
 * unless the user explicitly opts in.
 *
 * Stored in localStorage (non-sensitive boolean flag; no credentials here).
 */

const STORAGE_KEY = 'testhub:ai_runtime_policy';

interface PolicyState {
  edgeFunctionEnabled: boolean;
}

function read(): PolicyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PolicyState;
  } catch { /* ignore parse errors */ }
  return { edgeFunctionEnabled: false };
}

function write(state: PolicyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore storage errors */ }
}

export const aiRuntimePolicy = {
  /**
   * Whether the Supabase edge-function AI fallback is allowed to run.
   * Returns false (disabled) by default — the developer never pays unless the user opts in.
   */
  isEdgeFunctionEnabled(): boolean {
    return read().edgeFunctionEnabled;
  },

  setEdgeFunctionEnabled(enabled: boolean): void {
    write({ ...read(), edgeFunctionEnabled: enabled });
  },
};
