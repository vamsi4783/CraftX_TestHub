// ─── Milestone 1 Type Validation Tests ───────────────────────────────────────
// These tests verify that all core types can be constructed with the correct
// shape and that required fields are enforced at compile time via TypeScript.
// Runtime assertions confirm the structures are sound at the JS level.

import type { EventEnvelope, CommandEnvelope, AutomationConfig } from '../events/envelope.js';
import type { EvidenceItem, DeviceContext, AppContext, DriverContext } from '../evidence/EvidenceMetadata.js';
import type { DriverManifest } from '../drivers/CapabilityManifest.js';
import type { ActionRequest, ActionResult } from '../drivers/IDriver.js';
import type {
  StepIntendedPayload,
  StepCompletedPayload,
  StepFailedPayload,
  ExecutionStartedPayload,
} from '../events/definitions/execution.events.js';
import type { AgentHeartbeatPayload, ConnectedDevice } from '../events/definitions/health.events.js';
import { SPANS } from '../otel/stubs.js';
import { CORE_RULE_PACK_ID, coreRules } from '../rules/packs/core.js';
import { ANDROID_CRASH_RULE_PACK_ID, androidCrashRules } from '../rules/packs/android_crash.js';

// ─── EventEnvelope ───────────────────────────────────────────────────────────

describe('EventEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    const env: EventEnvelope<ExecutionStartedPayload> = {
      event_id:       'evt-001',
      event_type:     'ExecutionStarted',
      schema_version: 1,
      causation_id:   'cmd-001',
      correlation_id: 'session-abc',
      org_id:         'org-xyz',
      agent_id:       'execution-agent/android',
      occurred_at:    '2026-08-06T12:00:00Z',
      sequence:       1,
      payload: {
        session_id:   'session-abc',
        test_case_id: 'tc-001',
        driver_id:    'android_adb',
        total_steps:  5,
      },
    };
    expect(env.event_type).toBe('ExecutionStarted');
    expect(env.schema_version).toBe(1);
    expect(env.sequence).toBe(1);
    expect(env.payload.total_steps).toBe(5);
  });

  it('enforces past-tense event_type convention (runtime string check)', () => {
    const pastTenseEvents = [
      'ExecutionStarted', 'StepCompleted', 'StepFailed',
      'StepIntended', 'EvidenceCaptured', 'SessionCompleted',
      'ExecutionCancelled', 'RulePackViolation', 'AgentHeartbeat',
    ];
    pastTenseEvents.forEach(name => {
      // Names must not start with an imperative verb pattern
      expect(name).not.toMatch(/^(Run|Execute|Pause|Cancel|Stop|Start)[A-Z]/);
    });
  });
});

// ─── CommandEnvelope ─────────────────────────────────────────────────────────

describe('CommandEnvelope', () => {
  it('accepts a well-formed RunSession command', () => {
    const cmd: CommandEnvelope<{ session_id: string; driver_id: string }> = {
      command_id:     'cmd-001',
      command_type:   'RunSession',
      correlation_id: 'session-abc',
      org_id:         'org-xyz',
      issued_at:      '2026-08-06T12:00:00Z',
      payload: { session_id: 'session-abc', driver_id: 'android_adb' },
    };
    expect(cmd.command_type).toBe('RunSession');
    expect(cmd.payload.driver_id).toBe('android_adb');
  });

  it('enforces imperative command_type convention (runtime string check)', () => {
    const imperativeCommands = ['RunSession', 'ExecuteStep', 'PauseSession', 'CancelExecution'];
    imperativeCommands.forEach(name => {
      expect(name).toMatch(/^[A-Z][a-z]+/); // starts with capital verb
    });
  });
});

// ─── AutomationConfig ────────────────────────────────────────────────────────

describe('AutomationConfig', () => {
  it('accepts minimum required fields', () => {
    const cfg: AutomationConfig = { driver_id: 'android_adb', action: 'tap' };
    expect(cfg.driver_id).toBe('android_adb');
    expect(cfg.action).toBe('tap');
    expect(cfg.selector).toBeUndefined();
    expect(cfg.timeout_ms).toBeUndefined();
  });

  it('accepts full config with optional fields', () => {
    const cfg: AutomationConfig = {
      driver_id:  'chrome_cdp',
      action:     'click',
      selector:   '#submit-button',
      value:      undefined,
      timeout_ms: 5000,
      params:     { wait_for_navigation: true },
    };
    expect(cfg.timeout_ms).toBe(5000);
    expect(cfg.params?.['wait_for_navigation']).toBe(true);
  });
});

// ─── EvidenceItem ────────────────────────────────────────────────────────────

describe('EvidenceItem', () => {
  const device: DeviceContext = {
    device_model:     'Google Pixel 7a',
    os_name:          'Android',
    os_version:       '14.0',
    screen_width_px:  1080,
    screen_height_px: 2400,
    orientation:      'portrait',
  };

  const app: AppContext = {
    app_package: 'com.example.myapp',
    app_version: '2.1.0',
    app_build:   '1042',
  };

  const driver: DriverContext = {
    driver_id:           'android_adb',
    driver_version:      '1.0.0',
    driver_capabilities: ['tap', 'swipe', 'screenshot'],
  };

  it('constructs a full EvidenceItem with all context fields', () => {
    const item: EvidenceItem = {
      evidence_id:             'ev-uuid-001',
      execution_id:            'exec-001',
      step_id:                 'step-003',
      step_number:             3,
      evidence_type:           'failure_screenshot',
      file_url:                'evidence/org-xyz/proj-abc/ev-uuid-001.png',
      file_type:               'image/png',
      file_size_bytes:         204800,
      storage_tier:            'hot',
      execution_timestamp:     '2026-08-06T12:01:05Z',
      step_duration_ms:        1250,
      step_status_at_capture:  'failed',
      device,
      app,
      driver,
      archived_at:  null,
      created_at:   '2026-08-06T12:01:06Z',
    };

    expect(item.evidence_type).toBe('failure_screenshot');
    expect(item.storage_tier).toBe('hot');
    expect(item.archived_at).toBeNull();
    expect(item.device.os_name).toBe('Android');
    expect(item.app.app_version).toBe('2.1.0');
    expect(item.driver.driver_capabilities).toContain('screenshot');
  });

  it('enforces orientation is portrait or landscape', () => {
    const validOrientations: DeviceContext['orientation'][] = ['portrait', 'landscape'];
    validOrientations.forEach(o => expect(['portrait', 'landscape']).toContain(o));
  });

  it('enforces storage_tier is hot | warm | cold', () => {
    const valid: EvidenceItem['storage_tier'][] = ['hot', 'warm', 'cold'];
    valid.forEach(t => expect(['hot', 'warm', 'cold']).toContain(t));
  });

  it('URL follows path-stable pattern (no timestamps, uses UUID)', () => {
    const url = 'evidence/org-xyz/proj-abc/ev-uuid-001.png';
    // Must match: evidence/{org_id}/{project_id}/{uuid}.ext
    expect(url).toMatch(/^evidence\/[^/]+\/[^/]+\/[^/]+\.\w+$/);
    // Must NOT contain timestamps or session names
    expect(url).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(url).not.toMatch(/session/i);
  });
});

// ─── DriverManifest ──────────────────────────────────────────────────────────

describe('DriverManifest', () => {
  it('constructs a valid manifest with capability set', () => {
    const manifest: DriverManifest = {
      driver_id:    'android_adb',
      driver_name:  'Android ADB Driver',
      version:      '1.0.0',
      capabilities: new Set(['tap', 'swipe', 'screenshot', 'launch_app']),
      config_schema: {
        type: 'object',
        properties: { device_serial: { type: 'string' } },
        required: ['device_serial'],
      },
    };

    expect(manifest.capabilities.has('tap')).toBe(true);
    expect(manifest.capabilities.has('navigate')).toBe(false); // Chrome-only
    expect(manifest.capabilities.size).toBe(4);
  });
});

// ─── ActionRequest / ActionResult ────────────────────────────────────────────

describe('ActionRequest and ActionResult', () => {
  it('constructs minimum ActionRequest', () => {
    const req: ActionRequest = { action: 'tap', selector: 'com.example:id/button' };
    expect(req.action).toBe('tap');
  });

  it('constructs ActionResult with success', () => {
    const result: ActionResult = {
      success:     true,
      duration_ms: 320,
    };
    expect(result.success).toBe(true);
    expect(result.screenshot).toBeUndefined();
  });

  it('constructs ActionResult with failure and screenshot', () => {
    const result: ActionResult = {
      success:    false,
      duration_ms: 30001,
      error:       'Element not found: com.example:id/missing',
      screenshot:  Buffer.from('fake-png-data'),
    };
    expect(result.success).toBe(false);
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });
});

// ─── AgentHeartbeat ──────────────────────────────────────────────────────────

describe('AgentHeartbeatPayload', () => {
  it('constructs a valid heartbeat payload', () => {
    const device: ConnectedDevice = {
      driver_id:     'android_adb',
      device_serial: 'emulator-5554',
      device_model:  'Google Pixel 7a',
      os_version:    '14.0',
      status:        'ready',
    };

    const hb: AgentHeartbeatPayload = {
      agent_version:          '1.0.0',
      agent_id:               'agent-local-001',
      uptime_seconds:         342,
      connected_to_supabase:  true,
      ws_clients_connected:   1,
      cpu_percent:            12,
      memory_used_mb:         88,
      memory_total_mb:        16384,
      active_executions:      1,
      queue_depth:            0,
      completed_today:        3,
      connected_devices:      [device],
    };

    expect(hb.connected_to_supabase).toBe(true);
    expect(hb.connected_devices[0]?.status).toBe('ready');
    expect(hb.cpu_percent).toBeLessThanOrEqual(100);
  });
});

// ─── OTel Stubs ──────────────────────────────────────────────────────────────

describe('OTel stubs', () => {
  it('exposes all named span constants', () => {
    expect(SPANS.EXECUTION_SESSION).toBe('testhub.execution.session');
    expect(SPANS.EXECUTION_STEP).toBe('testhub.execution.step');
    expect(SPANS.DRIVER_EXECUTE).toBe('testhub.driver.execute');
    expect(SPANS.EVIDENCE_UPLOAD).toBe('testhub.evidence.upload');
    expect(SPANS.EVENT_STORE_APPEND).toBe('testhub.eventstore.append');
    expect(SPANS.RULE_EVALUATE).toBe('testhub.rule.evaluate');
  });
});

// ─── Rule Pack IDs ───────────────────────────────────────────────────────────

describe('Rule pack constants', () => {
  it('core pack has correct ID and rule keys', () => {
    expect(CORE_RULE_PACK_ID).toBe('core');
    expect(coreRules.STEP_TIMEOUT).toBe('core.step_timeout');
    expect(coreRules.ELEMENT_NOT_FOUND).toBe('core.element_not_found');
    expect(coreRules.ASSERTION_FAILURE).toBe('core.assertion_failure');
  });

  it('android_crash pack has correct ID and rule keys', () => {
    expect(ANDROID_CRASH_RULE_PACK_ID).toBe('android_crash');
    expect(androidCrashRules.CRASH_DETECTED).toBe('android_crash.crash_detected');
    expect(androidCrashRules.ANR_DETECTED).toBe('android_crash.anr_detected');
  });
});

// ─── StepIntended write-ahead shape ──────────────────────────────────────────

describe('StepIntendedPayload (write-ahead)', () => {
  it('contains all fields needed for crash recovery', () => {
    const payload: StepIntendedPayload = {
      session_id:  'session-abc',
      step_id:     'step-001',
      step_number: 1,
      action: {
        driver_id: 'android_adb',
        action:    'tap',
        selector:  'com.example:id/login_button',
      },
    };
    // All fields required — crash recovery reads these to know what was intended
    expect(payload.session_id).toBeTruthy();
    expect(payload.step_id).toBeTruthy();
    expect(payload.step_number).toBeGreaterThan(0);
    expect(payload.action.driver_id).toBeTruthy();
  });
});

describe('StepCompletedPayload', () => {
  it('records duration and assertion status', () => {
    const p: StepCompletedPayload = {
      session_id:       'session-abc',
      step_id:          'step-001',
      step_number:      1,
      duration_ms:      480,
      assertion_passed: true,
    };
    expect(p.duration_ms).toBeGreaterThan(0);
    expect(p.assertion_passed).toBe(true);
  });
});

describe('StepFailedPayload', () => {
  it('captures failure reason and optional rule pack reference', () => {
    const p: StepFailedPayload = {
      session_id:    'session-abc',
      step_id:       'step-002',
      step_number:   2,
      duration_ms:   30001,
      failure_reason: 'core.step_timeout',
      rule_pack_id:  'core',
    };
    expect(p.failure_reason).toBeTruthy();
    expect(p.rule_pack_id).toBe('core');
  });
});
