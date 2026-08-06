// ─── MockDriver ───────────────────────────────────────────────────────────────
// Deterministic IDriver implementation for unit and integration tests.
// All lifecycle hooks are tracked; execute() behaviour is fully configurable.

import { BaseDriver }                        from '../BaseDriver.js';
import type { ActionRequest, ActionResult }  from '../IDriver.js';
import type { DriverManifest, Capability }   from '../CapabilityManifest.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface MockDriverOptions {
  /** Driver id. Default: 'mock_driver'. */
  id?: string;
  /** Capabilities advertised in the manifest. Default: all common actions. */
  capabilities?: Capability[];
  /**
   * Result to return (or Error to throw) from execute().
   * Default: { success: true, duration_ms: 0 }.
   */
  executeResult?: ActionResult | Error;
  /** Artificial delay added by execute() in milliseconds. Default: 0. */
  executeDelay_ms?: number;
  /** Whether the driver starts in connected state. Default: false. */
  startConnected?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CAPABILITIES: Capability[] = [
  'tap', 'swipe', 'type_text', 'press_key', 'press_back', 'screenshot',
  'navigate', 'click', 'fill', 'evaluate', 'wait', 'get_dom',
  'launch_app', 'install_apk', 'uninstall_apk',
];

const DEFAULT_RESULT: ActionResult = { success: true, duration_ms: 0 };

// ─── Manifest factory ─────────────────────────────────────────────────────────

function buildManifest(id: string, caps: Capability[]): DriverManifest {
  return {
    driver_id:          id,
    driver_name:        'Mock Driver',
    version:            '1.0.0',
    capabilities:       new Set<Capability>(caps),
    config_schema:      {},
    platforms:          ['all'],
    agent_compatibility: ['>=1.0.0'],
    description:        'Deterministic mock driver for unit and integration tests.',
  };
}

// ─── MockDriver ───────────────────────────────────────────────────────────────

export class MockDriver extends BaseDriver {
  readonly id: string;
  readonly manifest: DriverManifest;

  private readonly _executeResult: ActionResult | Error;
  private readonly _executeDelay:  number;

  // ── Test-observable call tracking ──────────────────────────────────────────

  initializeCallCount   = 0;
  connectCallCount      = 0;
  disconnectCallCount   = 0;
  executeCallCount      = 0;
  disposeCallCount      = 0;

  lastConnectConfig: Record<string, unknown> | null = null;
  lastRequest:       ActionRequest            | null = null;

  readonly executeHistory: ActionRequest[] = [];

  constructor(options: MockDriverOptions = {}) {
    super();
    this.id             = options.id ?? 'mock_driver';
    this.manifest       = buildManifest(this.id, options.capabilities ?? DEFAULT_CAPABILITIES);
    this._executeResult = options.executeResult ?? DEFAULT_RESULT;
    this._executeDelay  = options.executeDelay_ms ?? 0;

    if (options.startConnected) {
      this._connected = true;
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  override async initialize(): Promise<void> {
    this.initializeCallCount++;
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    this.connectCallCount++;
    this.lastConnectConfig = config;
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCallCount++;
    this._connected = false;
  }

  override async dispose(): Promise<void> {
    this.disposeCallCount++;
    await super.dispose();
  }

  // ─── Execute ───────────────────────────────────────────────────────────────

  async execute(request: ActionRequest): Promise<ActionResult> {
    this.executeCallCount++;
    this.lastRequest = request;
    this.executeHistory.push(request);

    if (this._executeDelay > 0) {
      await new Promise<void>(res => setTimeout(res, this._executeDelay));
    }

    if (this._executeResult instanceof Error) {
      throw this._executeResult;
    }

    return { ...this._executeResult, action: request.action } as ActionResult;
  }

  // ─── Test helpers ──────────────────────────────────────────────────────────

  /** Reset all call counters and history (useful between test cases). */
  reset(): void {
    this.initializeCallCount   = 0;
    this.connectCallCount      = 0;
    this.disconnectCallCount   = 0;
    this.executeCallCount      = 0;
    this.disposeCallCount      = 0;
    this.lastConnectConfig     = null;
    this.lastRequest           = null;
    this.executeHistory.length = 0;
  }
}
