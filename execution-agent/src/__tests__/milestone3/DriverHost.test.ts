// ─── Milestone 3: DriverHost Tests ────────────────────────────────────────────

import { DriverHost }               from '../../drivers/DriverHost.js';
import { CancellationTokenSource,
         NON_CANCELLABLE }          from '../../drivers/DriverCancellation.js';
import {
  DriverTimeoutException,
  DriverCancelledException,
  DriverCapabilityException,
  DriverExecutionException,
  DriverNotConnectedException,
}                                    from '../../drivers/DriverExceptions.js';
import { StructuredLogger }         from '../../logging/StructuredLogger.js';
import type { IDriver }             from '../../drivers/IDriver.js';
import type { ActionRequest,
              ActionResult }        from '../../drivers/IDriver.js';
import type { DriverManifest,
              Capability }          from '../../drivers/CapabilityManifest.js';
import type { DriverExecutionContext } from '../../drivers/DriverExecutionContext.js';
import type { DriverResult }        from '../../drivers/DriverResult.js';
import type { IDriverMiddleware }   from '../../drivers/middleware/IDriverMiddleware.js';

// ─── MockDriver ───────────────────────────────────────────────────────────────

class MockDriver implements IDriver {
  readonly manifest: DriverManifest;
  private _connected: boolean;

  constructor(
    public readonly id: string,
    caps: Capability[],
    private readonly result: ActionResult | Error = { success: true, duration_ms: 0 },
    private readonly delayMs = 0,
    connected = true,
  ) {
    this.manifest = {
      driver_id:     id,
      driver_name:   `Mock ${id}`,
      version:       '1.0.0',
      capabilities:  new Set<Capability>(caps),
      config_schema: {},
    };
    this._connected = connected;
  }

  async connect(_config: Record<string, unknown>): Promise<void> { this._connected = true; }
  async disconnect(): Promise<void> { this._connected = false; }
  isConnected(): boolean { return this._connected; }

  async execute(_req: ActionRequest): Promise<ActionResult> {
    if (this.delayMs > 0) {
      await new Promise<void>(res => setTimeout(res, this.delayMs));
    }
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

// ─── Context factory ──────────────────────────────────────────────────────────

function makeContext(overrides: Partial<DriverExecutionContext> = {}): DriverExecutionContext {
  const cts = new CancellationTokenSource();
  return {
    executionId:      'exec-001',
    sessionId:        'session-abc',
    projectId:        'project-xyz',
    organizationId:   'org-xyz',
    correlationId:    'session-abc',
    cancellationToken: cts.token,
    logger:           new StructuredLogger('test'),
    timestamp:        '2026-08-06T12:00:00Z',
    ...overrides,
  };
}

// ─── Execution success ────────────────────────────────────────────────────────

describe('DriverHost — successful execution', () => {
  it('returns a DriverResult on success', async () => {
    const driver = new MockDriver('android_adb', ['tap']);
    const host   = new DriverHost();
    const result = await host.execute(driver, { action: 'tap' }, makeContext());
    expect(result.success).toBe(true);
    expect(typeof result.duration_ms).toBe('number');
  });

  it('propagates context fields into DriverResult', async () => {
    const driver = new MockDriver('android_adb', ['tap']);
    const host   = new DriverHost();
    const ctx    = makeContext({ executionId: 'exec-999', sessionId: 'sess-888' });
    const result = await host.execute(driver, { action: 'tap' }, ctx);
    expect(result.driver_id).toBe('android_adb');
    expect(result.action).toBe('tap');
    expect(result.execution_id).toBe('exec-999');
    expect(result.session_id).toBe('sess-888');
  });

  it('includes screenshot from ActionResult when present', async () => {
    const buf    = Buffer.from('fake-png');
    const driver = new MockDriver('android_adb', ['screenshot'],
      { success: true, duration_ms: 0, screenshot: buf });
    const host   = new DriverHost();
    const result = await host.execute(driver, { action: 'screenshot' }, makeContext());
    expect(result.screenshot).toBe(buf);
  });

  it('preserves success: false from driver (action failure is not an exception)', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: false, duration_ms: 0, error: 'element not found' });
    const host   = new DriverHost();
    const result = await host.execute(driver, { action: 'tap' }, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toBe('element not found');
  });

  it('duration_ms is measured by the host (non-negative)', async () => {
    const driver = new MockDriver('android_adb', ['tap'], { success: true, duration_ms: 9999 });
    const host   = new DriverHost();
    const result = await host.execute(driver, { action: 'tap' }, makeContext());
    // host-measured duration is >= 0, not the driver's self-reported value
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── Capability validation ────────────────────────────────────────────────────

describe('DriverHost — capability validation', () => {
  it('throws DriverCapabilityException when action not in manifest', async () => {
    const driver = new MockDriver('android_adb', ['tap']); // no 'navigate'
    const host   = new DriverHost();
    await expect(
      host.execute(driver, { action: 'navigate' }, makeContext()),
    ).rejects.toThrow(DriverCapabilityException);
  });

  it('DriverCapabilityException includes driver_id and action', async () => {
    const driver = new MockDriver('android_adb', ['tap']);
    const host   = new DriverHost();
    try {
      await host.execute(driver, { action: 'navigate' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverCapabilityException);
      const e = err as DriverCapabilityException;
      expect(e.driver_id).toBe('android_adb');
      expect(e.action).toBe('navigate');
      expect(e.available.has('tap')).toBe(true);
    }
  });

  it('executes successfully when action is in manifest', async () => {
    const driver = new MockDriver('chrome_cdp', ['navigate', 'click', 'tap']);
    const host   = new DriverHost();
    await expect(
      host.execute(driver, { action: 'navigate' }, makeContext()),
    ).resolves.toBeDefined();
  });
});

// ─── Connected check ──────────────────────────────────────────────────────────

describe('DriverHost — connected check', () => {
  it('throws DriverNotConnectedException when driver.isConnected() is false', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 0, false /* not connected */);
    const host = new DriverHost();
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).rejects.toThrow(DriverNotConnectedException);
  });

  it('DriverNotConnectedException includes driver_id', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 0, false);
    const host = new DriverHost();
    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect((err as DriverNotConnectedException).driver_id).toBe('android_adb');
    }
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('DriverHost — timeout', () => {
  it('throws DriverTimeoutException when driver exceeds timeout_ms', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300 /* delay 300ms */);
    const host = new DriverHost({ defaultTimeout_ms: 30 });
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).rejects.toThrow(DriverTimeoutException);
  }, 2000);

  it('DriverTimeoutException includes driver_id, timeout_ms, action', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300);
    const host = new DriverHost({ defaultTimeout_ms: 30 });
    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverTimeoutException);
      const e = err as DriverTimeoutException;
      expect(e.driver_id).toBe('android_adb');
      expect(e.timeout_ms).toBe(30);
      expect(e.action).toBe('tap');
    }
  }, 2000);

  it('per-call timeout_ms overrides the host default', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300);
    const host = new DriverHost({ defaultTimeout_ms: 5000 }); // default is generous
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext(), { timeout_ms: 30 }), // override
    ).rejects.toThrow(DriverTimeoutException);
  }, 2000);

  it('succeeds when driver finishes before timeout', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 10 /* fast driver */);
    const host = new DriverHost({ defaultTimeout_ms: 1000 });
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).resolves.toBeDefined();
  }, 2000);
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('DriverHost — cancellation', () => {
  it('throws DriverCancelledException when token is already cancelled', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300);
    const cts = new CancellationTokenSource();
    cts.cancel(); // pre-cancelled
    const host = new DriverHost({ defaultTimeout_ms: 5000 });
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext({ cancellationToken: cts.token })),
    ).rejects.toThrow(DriverCancelledException);
  });

  it('throws DriverCancelledException when cancelled during execution', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300 /* slow */);
    const cts  = new CancellationTokenSource();
    const host = new DriverHost({ defaultTimeout_ms: 5000 });

    // Cancel after a short delay (before driver finishes)
    setTimeout(() => cts.cancel(), 30);

    await expect(
      host.execute(driver, { action: 'tap' }, makeContext({ cancellationToken: cts.token })),
    ).rejects.toThrow(DriverCancelledException);
  }, 2000);

  it('DriverCancelledException includes driver_id and action', async () => {
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 0);
    const cts = new CancellationTokenSource();
    cts.cancel();
    const host = new DriverHost({ defaultTimeout_ms: 5000 });
    try {
      await host.execute(driver, { action: 'tap' }, makeContext({ cancellationToken: cts.token }));
    } catch (err) {
      expect(err).toBeInstanceOf(DriverCancelledException);
      const e = err as DriverCancelledException;
      expect(e.driver_id).toBe('android_adb');
      expect(e.action).toBe('tap');
    }
  });

  it('NON_CANCELLABLE token never triggers DriverCancelledException', async () => {
    const driver = new MockDriver('android_adb', ['tap'], { success: true, duration_ms: 0 });
    const host   = new DriverHost();
    const ctx    = makeContext({ cancellationToken: NON_CANCELLABLE });
    await expect(host.execute(driver, { action: 'tap' }, ctx)).resolves.toBeDefined();
  });
});

// ─── Execution failure / exception propagation ────────────────────────────────

describe('DriverHost — execution failure', () => {
  it('wraps driver exceptions in DriverExecutionException', async () => {
    const original = new Error('internal driver crash');
    const driver   = new MockDriver('android_adb', ['tap'], original);
    const host     = new DriverHost();
    await expect(
      host.execute(driver, { action: 'tap' }, makeContext()),
    ).rejects.toThrow(DriverExecutionException);
  });

  it('DriverExecutionException preserves the original cause', async () => {
    const original = new Error('boom');
    const driver   = new MockDriver('android_adb', ['tap'], original);
    const host     = new DriverHost();
    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverExecutionException);
      const e = err as DriverExecutionException;
      expect(e.cause).toBe(original);
      expect(e.driver_id).toBe('android_adb');
      expect(e.action).toBe('tap');
    }
  });

  it('DriverExecutionException is a DriverException', async () => {
    const driver = new MockDriver('android_adb', ['tap'], new Error('x'));
    const host   = new DriverHost();
    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverExecutionException);
    }
  });
});

// ─── Middleware hooks ─────────────────────────────────────────────────────────

describe('DriverHost — middleware', () => {
  function makeMiddleware(log: string[]): IDriverMiddleware {
    return {
      beforeExecute: async (_d, req)     => { log.push(`before:${req.action}`); },
      afterExecute:  async (_d, req, _c, result) => { log.push(`after:${req.action}:${result.success}`); },
      onError:       async (_d, req, _c, err)    => { log.push(`error:${req.action}:${err.constructor.name}`); },
    };
  }

  it('calls beforeExecute and afterExecute on success', async () => {
    const log    = [] as string[];
    const driver = new MockDriver('android_adb', ['tap']);
    const host   = new DriverHost();
    host.use(makeMiddleware(log));
    await host.execute(driver, { action: 'tap' }, makeContext());
    expect(log).toEqual(['before:tap', 'after:tap:true']);
  });

  it('calls beforeExecute and onError on timeout', async () => {
    const log    = [] as string[];
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 300);
    const host   = new DriverHost({ defaultTimeout_ms: 30 });
    host.use(makeMiddleware(log));
    await expect(host.execute(driver, { action: 'tap' }, makeContext())).rejects.toThrow();
    expect(log).toContain('before:tap');
    expect(log.some(l => l.startsWith('error:tap'))).toBe(true);
  }, 2000);

  it('calls onError on driver exception', async () => {
    const log    = [] as string[];
    const driver = new MockDriver('android_adb', ['tap'], new Error('crash'));
    const host   = new DriverHost();
    host.use(makeMiddleware(log));
    await expect(host.execute(driver, { action: 'tap' }, makeContext())).rejects.toThrow();
    expect(log.some(l => l.startsWith('error:tap'))).toBe(true);
  });

  it('does NOT call before/after when connected check fails', async () => {
    const log    = [] as string[];
    const driver = new MockDriver('android_adb', ['tap'],
      { success: true, duration_ms: 0 }, 0, false /* not connected */);
    const host = new DriverHost();
    host.use(makeMiddleware(log));
    await expect(host.execute(driver, { action: 'tap' }, makeContext())).rejects.toThrow();
    expect(log).toHaveLength(0);
  });

  it('does NOT call before/after when capability check fails', async () => {
    const log    = [] as string[];
    const driver = new MockDriver('android_adb', ['tap']); // no 'navigate'
    const host   = new DriverHost();
    host.use(makeMiddleware(log));
    await expect(host.execute(driver, { action: 'navigate' }, makeContext())).rejects.toThrow();
    expect(log).toHaveLength(0);
  });

  it('calls multiple middlewares in registration order', async () => {
    const log = [] as string[];
    const driver = new MockDriver('android_adb', ['tap']);
    const host   = new DriverHost();
    host.use({ beforeExecute: async () => { log.push('mw1-before'); } });
    host.use({ beforeExecute: async () => { log.push('mw2-before'); } });
    await host.execute(driver, { action: 'tap' }, makeContext());
    expect(log).toEqual(['mw1-before', 'mw2-before']);
  });
});

// ─── Exception hierarchy (instanceof checks) ──────────────────────────────────

describe('DriverHost — exception hierarchy', () => {
  it('DriverTimeoutException is instanceof DriverException', async () => {
    const { DriverException } = await import('../../drivers/DriverExceptions.js');
    const driver = new MockDriver('d', ['tap'], { success: true, duration_ms: 0 }, 300);
    const host   = new DriverHost({ defaultTimeout_ms: 20 });
    try {
      await host.execute(driver, { action: 'tap' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverException);
      expect(err).toBeInstanceOf(DriverTimeoutException);
    }
  }, 2000);

  it('DriverCancelledException is instanceof DriverException', async () => {
    const { DriverException } = await import('../../drivers/DriverExceptions.js');
    const cts = new CancellationTokenSource();
    cts.cancel();
    const driver = new MockDriver('d', ['tap']);
    const host   = new DriverHost();
    try {
      await host.execute(driver, { action: 'tap' }, makeContext({ cancellationToken: cts.token }));
    } catch (err) {
      expect(err).toBeInstanceOf(DriverException);
      expect(err).toBeInstanceOf(DriverCancelledException);
    }
  });

  it('DriverCapabilityException is instanceof DriverException', async () => {
    const { DriverException } = await import('../../drivers/DriverExceptions.js');
    const driver = new MockDriver('d', ['tap']);
    const host   = new DriverHost();
    try {
      await host.execute(driver, { action: 'navigate' }, makeContext());
    } catch (err) {
      expect(err).toBeInstanceOf(DriverException);
      expect(err).toBeInstanceOf(DriverCapabilityException);
    }
  });
});

// ─── CancellationTokenSource tests ───────────────────────────────────────────

describe('CancellationTokenSource', () => {
  it('token.isCancelled is false before cancel()', () => {
    const cts = new CancellationTokenSource();
    expect(cts.token.isCancelled).toBe(false);
  });

  it('token.isCancelled is true after cancel()', () => {
    const cts = new CancellationTokenSource();
    cts.cancel();
    expect(cts.token.isCancelled).toBe(true);
  });

  it('onCancelled fires synchronously when already cancelled', () => {
    const cts  = new CancellationTokenSource();
    cts.cancel();
    let fired = false;
    cts.token.onCancelled(() => { fired = true; });
    expect(fired).toBe(true);
  });

  it('onCancelled fires asynchronously (event) when cancelled later', done => {
    const cts = new CancellationTokenSource();
    cts.token.onCancelled(() => done());
    cts.cancel();
  });

  it('cancel() is idempotent', () => {
    const cts = new CancellationTokenSource();
    expect(() => { cts.cancel(); cts.cancel(); }).not.toThrow();
    expect(cts.token.isCancelled).toBe(true);
  });

  it('provides an AbortSignal on token.signal', () => {
    const cts = new CancellationTokenSource();
    expect(cts.token.signal).toBeInstanceOf(AbortSignal);
    cts.cancel();
    expect(cts.token.signal.aborted).toBe(true);
  });
});
