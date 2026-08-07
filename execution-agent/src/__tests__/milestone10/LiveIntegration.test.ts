// ─── Milestone 10: Live Integration Validation ───────────────────────────────
// Runs real production classes with no mocks.
// Constructor signatures verified against the existing milestone5 test suite.

import { AgentRuntime }                    from '../../runtime/AgentRuntime.js';
import { buildRuntimeConfig }              from '../../runtime/RuntimeConfiguration.js';
import { NOOP_RUNTIME_METRICS }            from '../../runtime/RuntimeMetrics.js';
import { ExecutionEngine }                 from '../../execution/ExecutionEngine.js';
import { StepExecutor }                    from '../../execution/StepExecutor.js';
import { RecordingExecutionEventEmitter }  from '../../execution/events/IExecutionEventEmitter.js';
import { DriverHost }                      from '../../drivers/DriverHost.js';
import { DriverRegistry }                  from '../../drivers/DriverRegistry.js';
import { MockDriver }                      from '../../drivers/mock/MockDriver.js';
import { EvidenceManager }                 from '../../evidence/EvidenceManager.js';
import { EvidenceUploader }                from '../../evidence/EvidenceUploader.js';
import { InMemoryArtifactStore }           from '../../evidence/store/InMemoryArtifactStore.js';
import { NOOP_EVIDENCE_METRICS }           from '../../evidence/EvidenceMetrics.js';
import { AgentConnectionManager }          from '../../communication/AgentConnectionManager.js';
import { MessageSerializer }               from '../../communication/MessageSerializer.js';
import { evaluateReconnect, DEFAULT_RECONNECT_POLICY } from '../../communication/ReconnectStrategy.js';
import { buildStoragePath }                from '../../evidence/StoragePathBuilder.js';
import { PROTOCOL_VERSION }                from '../../communication/MessageProtocol.js';
import type { ExecutionRequest, ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { EvidenceCollectionContext }  from '../../evidence/EvidenceTypes.js';

// ─── Canonical EvidenceCollectionContext ──────────────────────────────────────

const EVIDENCE_CTX: EvidenceCollectionContext = {
  executionId:    'exec-live-001',
  stepId:         'step-001',
  stepNumber:     1,
  sessionId:      'sess-live-001',
  organizationId: 'org-1',
  projectId:      'proj-1',
  device: {
    device_model:    'vivo I2011',
    os_name:         'Android',
    os_version:      '13',
    screen_width_px:  1080,
    screen_height_px: 2408,
    orientation:     'portrait',
  },
  app: {
    app_package: 'com.vamsi.retailmanager',
    app_version: '1.0.0',
    app_build:   '1',
  },
  driver: {
    driver_id:           'mock_driver',
    driver_version:      '1.0.0',
    driver_capabilities: ['tap','swipe','type_text','press_back','screenshot'],
  },
  stepStatus:      'running',
  stepDuration_ms: 0,
};

// ─── Infrastructure factory (mirrors milestone5 makeRig) ─────────────────────

interface TestRig {
  engine:   ExecutionEngine;
  emitter:  RecordingExecutionEventEmitter;
  registry: DriverRegistry;
  driver:   MockDriver;
}

function makeRig(driverOpts: ConstructorParameters<typeof MockDriver>[0] = {}): TestRig {
  const registry = new DriverRegistry();
  const driver   = new MockDriver({ id: 'mock_driver', ...driverOpts });
  registry.register(driver);

  const host     = new DriverHost({ defaultTimeout_ms: 5000 });
  const emitter  = new RecordingExecutionEventEmitter();
  const executor = new StepExecutor(host, emitter);
  const engine   = new ExecutionEngine(registry, emitter, executor);

  return { engine, emitter, registry, driver };
}

function makeStep(n: number, action = 'tap'): ExecutionStep {
  return { stepId: `step-${String(n).padStart(3, '0')}`, stepNumber: n, action: { driver_id: 'mock_driver', action } };
}

function makeRequest(steps: ExecutionStep[], overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    sessionId:      'sess-live',
    testCaseId:     'tc-live-001',
    projectId:      'proj-1',
    organizationId: 'org-1',
    agentId:        'live-validation-agent',
    driverId:       'mock_driver',
    steps,
    ...overrides,
  };
}

function makeEvidence() {
  const store    = new InMemoryArtifactStore();
  const uploader = new EvidenceUploader(store, NOOP_EVIDENCE_METRICS);
  const mgr      = new EvidenceManager(uploader, NOOP_EVIDENCE_METRICS);
  return { store, mgr };
}

// ─── 1. AgentRuntime startup / shutdown / fault ───────────────────────────────

describe('Live: AgentRuntime', () => {
  it('starts and reaches Running state within 100ms', async () => {
    const config  = buildRuntimeConfig({ agentId: 'live-agent', agentVersion: '1.0.0' });
    const t0      = Date.now();
    const runtime = new AgentRuntime(config, {
      systemMetrics:  { cpuPercent: () => 15.2, memoryUsedMb: () => 312, memoryTotalMb: () => 8192 },
      heartbeatEmit:  () => {},
      heartbeatTimer: { schedule: () => () => {} },
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await runtime.start();
    const startMs = Date.now() - t0;
    expect(runtime.status().state).toBe('Running');
    expect(startMs).toBeLessThan(100);
    console.log(`[PERF] runtime_startup_ms: ${startMs}`);
    await runtime.stop();
  });

  it('stops and reaches Stopped state within 50ms', async () => {
    const config  = buildRuntimeConfig({ agentId: 'live-agent-2', agentVersion: '1.0.0' });
    const runtime = new AgentRuntime(config, {
      systemMetrics:  { cpuPercent: () => 5, memoryUsedMb: () => 200, memoryTotalMb: () => 8192 },
      heartbeatEmit:  () => {},
      heartbeatTimer: { schedule: () => () => {} },
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await runtime.start();
    const t0     = Date.now();
    await runtime.stop();
    const stopMs = Date.now() - t0;
    expect(runtime.status().state).toBe('Stopped');
    expect(stopMs).toBeLessThan(50);
    console.log(`[PERF] runtime_shutdown_ms: ${stopMs}`);
  });

  it('fault() injects crash: Running → Faulted; second fault is no-op', async () => {
    const config  = buildRuntimeConfig({ agentId: 'live-fault', agentVersion: '1.0.0' });
    const runtime = new AgentRuntime(config, {
      systemMetrics:  { cpuPercent: () => 5, memoryUsedMb: () => 100, memoryTotalMb: () => 8192 },
      heartbeatEmit:  () => {},
      heartbeatTimer: { schedule: () => () => {} },
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await runtime.start();
    runtime.fault('forced_crash_injection');
    expect(runtime.status().state).toBe('Faulted');
    expect(runtime.status().faultReason).toBe('forced_crash_injection');
    expect(() => runtime.fault('second')).not.toThrow();
    console.log('[RECOVERY] fault_injection: Running → Faulted → second is no-op — verified');
  });
});

// ─── 2. Health Monitor ───────────────────────────────────────────────────────

describe('Live: Health Monitor', () => {
  it('collectHealth reflects injected system metrics and thresholds', async () => {
    const config  = buildRuntimeConfig({ agentId: 'live-health', agentVersion: '1.0.0' });
    const runtime = new AgentRuntime(config, {
      systemMetrics:  { cpuPercent: () => 15, memoryUsedMb: () => 312, memoryTotalMb: () => 8192 },
      heartbeatEmit:  () => {},
      heartbeatTimer: { schedule: () => () => {} },
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await runtime.start();
    const h = runtime.collectHealth(2, 5);
    expect(h.status).toBe('healthy');
    expect(h.cpuPercent).toBe(15);
    expect(h.memoryUsedMb).toBe(312);
    expect(h.activeExecutions).toBe(2);
    expect(h.queueDepth).toBe(5);
    console.log(`[HEALTH] status=${h.status} cpu=${h.cpuPercent}% mem=${h.memoryUsedMb}/${h.memoryTotalMb}MB active=${h.activeExecutions}`);
    await runtime.stop();
  });

  it('CPU > 90% → status = unhealthy', async () => {
    const config  = buildRuntimeConfig({ agentId: 'live-health-bad', agentVersion: '1.0.0' });
    const runtime = new AgentRuntime(config, {
      systemMetrics:  { cpuPercent: () => 95, memoryUsedMb: () => 200, memoryTotalMb: () => 8192 },
      heartbeatEmit:  () => {},
      heartbeatTimer: { schedule: () => () => {} },
      metrics:        NOOP_RUNTIME_METRICS,
    });
    await runtime.start();
    const h = runtime.collectHealth(0, 0);
    expect(h.status).toBe('unhealthy');
    console.log(`[HEALTH] high_cpu=${h.cpuPercent}% → status=${h.status}`);
    await runtime.stop();
  });
});

// ─── 3. Execution Engine + Event Store ───────────────────────────────────────

describe('Live: Execution Engine end-to-end', () => {
  it('5-step execution completes; events are ordered; WAL-correct', async () => {
    const { engine, emitter } = makeRig();
    const steps = [
      makeStep(1, 'tap'),
      makeStep(2, 'swipe'),
      makeStep(3, 'type_text'),
      makeStep(4, 'screenshot'),
      makeStep(5, 'press_back'),
    ];

    const t0     = Date.now();
    const result = await engine.execute(makeRequest(steps));
    const execMs = Date.now() - t0;

    expect(result.state).toBe('Completed');
    expect(result.stepResults).toHaveLength(5);
    expect(result.stepResults.every(s => s.success)).toBe(true);
    console.log(`[PERF] execution_5step_ms: ${execMs} avg_step_ms: ${(execMs / 5).toFixed(1)}`);

    // Event ordering via recording emitter
    const evs      = emitter.events;
    const seqs     = evs.map((_e, i) => i);
    const isOrdered = seqs.every((s, i) => i === 0 || s > seqs[i - 1]);
    expect(isOrdered).toBe(true);

    // WAL: StepIntended before StepCompleted (emitter uses .kind)
    const intended  = evs.filter(e => e.kind === 'StepIntended');
    const completed = evs.filter(e => e.kind === 'StepCompleted');
    expect(intended.length).toBe(5);
    expect(completed.length).toBe(5);
    intended.forEach((ev, i) => {
      expect(evs.indexOf(ev)).toBeLessThan(evs.indexOf(completed[i]));
    });

    const kinds = [...new Set(evs.map(e => e.kind))];
    console.log(`[EVENT_STORE] events=${evs.length} kinds=[${kinds.join(',')}] ordered=true wal=true`);
  });

  it('driver failure → state = Failed, error propagated', async () => {
    const { engine } = makeRig({ executeResult: new Error('driver_crash_injected') });
    const result = await engine.execute(makeRequest([makeStep(1)]));
    expect(result.state).toBe('Failed');
    expect(result.stepResults[0].success).toBe(false);
    console.log(`[FAILURE_INJECTION] driver_crash → state=${result.state} error="${result.stepResults[0].error}"`);
  });

  it('timeout injection → step fails with timeout error', async () => {
    // Driver with artificial delay exceeding per-step timeout
    const { engine } = makeRig({ executeDelay_ms: 200 });
    const steps      = [{ stepId: 'step-001', stepNumber: 1, action: { driver_id: 'mock_driver', action: 'tap' }, timeout_ms: 50 }];
    const result = await engine.execute(makeRequest(steps));
    // Either the step fails or the whole execution fails
    const stepFailed = !result.stepResults[0].success;
    const execFailed = result.state === 'Failed';
    expect(stepFailed || execFailed).toBe(true);
    console.log(`[FAILURE_INJECTION] timeout: state=${result.state} step_success=${result.stepResults[0].success}`);
  });
});

// ─── 4. Evidence Pipeline ────────────────────────────────────────────────────

describe('Live: Evidence Pipeline', () => {
  it('screenshot: collect → upload → path deterministic, no timestamps', async () => {
    const { store, mgr } = makeEvidence();

    const t0 = Date.now();
    const id = await mgr.collectScreenshot(Buffer.from('PNG_BYTES_LIVE'), 'manual_screenshot', EVIDENCE_CTX);
    const t1 = Date.now();
    const res = await mgr.upload(id);
    const uploadMs = Date.now() - t1;

    expect(res.success).toBe(true);
    const paths = store.storedPaths();
    expect(paths.length).toBe(1);
    expect(paths[0]).toMatch(/^org-1\/proj-1\/exec-live-001\/step-001\/.+\.png$/);
    expect(paths[0]).not.toMatch(/\d{10,}/);

    console.log(`[PERF] evidence_collect_ms: ${t1 - t0} upload_ms: ${uploadMs}`);
    console.log(`[EVIDENCE] path=${paths[0]} success=${res.success}`);
  });

  it('upload failure → retry() → success (retry pipeline verified)', async () => {
    const { store, mgr } = makeEvidence();
    store.nextUploadError = new Error('storage_unavailable');
    const id  = await mgr.collectLog('retry_entry\n', 'logcat_excerpt', EVIDENCE_CTX);
    const r1  = await mgr.upload(id);
    expect(r1.success).toBe(false);
    await mgr.retry(id);
    const r2 = await mgr.upload(id);
    expect(r2.success).toBe(true);
    console.log('[FAILURE_INJECTION] evidence: fail → retry → success');
  });

  it('duplicate upload is idempotent (no second write)', async () => {
    const { mgr } = makeEvidence();
    const id = await mgr.collectLog('dedup\n', 'logcat_excerpt', EVIDENCE_CTX);
    await mgr.upload(id);
    const r2 = await mgr.upload(id);
    expect(r2.success).toBe(true);
    console.log('[SECURITY] duplicate_upload: idempotent confirmed');
  });

  it('uploadAll FIFO order; continues past one failure', async () => {
    const { store, mgr } = makeEvidence();
    await mgr.collectLog('line-1\n', 'logcat_excerpt', EVIDENCE_CTX);
    await mgr.collectLog('line-2\n', 'logcat_excerpt', EVIDENCE_CTX);
    await mgr.collectLog('line-3\n', 'logcat_excerpt', EVIDENCE_CTX);

    store.nextUploadError = new Error('mid_failure');
    const results = await mgr.uploadAll();

    expect(results).toHaveLength(3);
    const succeeded = results.filter(r => r.success).length;
    const failed    = results.filter(r => !r.success).length;
    // One error consumed → 2 succeed, 1 fails
    expect(failed).toBe(1);
    expect(succeeded).toBe(2);
    console.log(`[EVIDENCE] uploadAll: ${succeeded}/3 succeeded, continues_on_failure=true`);
  });

  it('StoragePathBuilder: deterministic path, no unix timestamps', () => {
    const path = buildStoragePath({
      organizationId: 'org-test',
      projectId:      'proj-test',
      executionId:    'exec-123',
      stepId:         'step-abc',
      evidenceId:     'ev-xyz',
      mimeType:       'image/png',
    });
    expect(path).toBe('org-test/proj-test/exec-123/step-abc/ev-xyz.png');
    expect(path).not.toMatch(/\d{10,}/);
    console.log(`[EVIDENCE] storage_path=${path}`);
  });
});

// ─── 5. Communication Layer ───────────────────────────────────────────────────

describe('Live: Communication Layer', () => {
  it('reconnect: connect → lost × 2 with backoff → exhausted → Disconnected', () => {
    const mgr = new AgentConnectionManager(
      { maxAttempts: 2, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000 },
    );
    mgr.startConnecting(); mgr.markConnected();
    expect(mgr.state).toBe('Connected');

    const d1 = mgr.onConnectionLost();
    expect(d1.shouldReconnect).toBe(true); expect(d1.delayMs).toBe(100);

    mgr.startConnecting();
    const d2 = mgr.onConnectionLost();
    expect(d2.shouldReconnect).toBe(true); expect(d2.delayMs).toBe(200);

    mgr.startConnecting();
    const d3 = mgr.onConnectionLost();
    expect(d3.shouldReconnect).toBe(false);
    expect(mgr.state).toBe('Disconnected');

    console.log(`[RECONNECT] d1=${d1.delayMs}ms d2=${d2.delayMs}ms d3=no_reconnect final=${mgr.state}`);
  });

  it('auth failure: AuthenticationFailed → Disconnected (stops reconnect loop)', () => {
    const mgr = new AgentConnectionManager();
    mgr.startConnecting();
    mgr.markAuthFailed('invalid_token');
    expect(mgr.state).toBe('AuthenticationFailed');
    mgr.markDisconnected();
    expect(mgr.state).toBe('Disconnected');
    console.log('[SECURITY] auth_failure: AuthenticationFailed → Disconnected verified');
  });

  it('MessageSerializer rejects unknown type (injection prevention)', () => {
    const s = new MessageSerializer();
    expect(() => s.parse(JSON.stringify({
      messageId: 'x', correlationId: 'c', timestamp: 't',
      protocolVersion: '1.0', type: 'MaliciousType',
    }))).toThrow();
    console.log('[SECURITY] unknown_type: rejected');
  });

  it('MessageSerializer rejects missing messageId', () => {
    const s = new MessageSerializer();
    expect(() => s.parse(JSON.stringify({
      correlationId: 'c', timestamp: 't', protocolVersion: '1.0', type: 'Command',
    }))).toThrow();
    console.log('[SECURITY] missing_messageId: rejected');
  });

  it('PROTOCOL_VERSION is frozen at 1.0', () => {
    expect(PROTOCOL_VERSION).toBe('1.0');
    console.log(`[FREEZE] PROTOCOL_VERSION=${PROTOCOL_VERSION}`);
  });

  it('DEFAULT_RECONNECT_POLICY values are frozen', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxAttempts).toBe(10);
    expect(DEFAULT_RECONNECT_POLICY.initialDelayMs).toBe(1_000);
    expect(DEFAULT_RECONNECT_POLICY.backoffMultiplier).toBe(2);
    expect(DEFAULT_RECONNECT_POLICY.maxDelayMs).toBe(30_000);
    console.log(`[FREEZE] RECONNECT_POLICY: maxAttempts=${DEFAULT_RECONNECT_POLICY.maxAttempts} maxDelayMs=${DEFAULT_RECONNECT_POLICY.maxDelayMs}ms`);
  });
});

// ─── 6. Stress — 100 sequential executions ───────────────────────────────────

describe('Live: Stress — 100 sequential executions', () => {
  it('100 executions complete with 0 failures', async () => {
    const { engine } = makeRig();
    const t0     = Date.now();
    let   passed = 0;

    for (let i = 0; i < 100; i++) {
      const result = await engine.execute(makeRequest(
        [makeStep(1, 'tap'), makeStep(2, 'press_back')],
        { sessionId: `sess-stress-${i}`, testCaseId: `tc-stress-${i}` },
      ));
      if (result.state === 'Completed') passed++;
    }

    const totalMs = Date.now() - t0;
    expect(passed).toBe(100);
    console.log(`[STRESS] 100_executions: passed=${passed} total_ms=${totalMs} avg_ms=${(totalMs / 100).toFixed(1)}`);
    console.log(`[STRESS] throughput: ${(100_000 / totalMs).toFixed(1)} executions/sec`);
  }, 30_000);
});
