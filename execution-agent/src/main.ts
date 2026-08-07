// ─── TestHub Execution Agent — Entry Point ────────────────────────────────────
// Phase 5 M1: wires all subsystems and starts the AgentHubServer.
//
// Runtime configuration:
//   AGENT_ID           — unique agent identifier (default: 'agent-local')
//   AGENT_PORT         — WebSocket hub port (default: 8080)
//   AGENT_TOKEN        — auth token required from browser clients (default: off)
//   ANDROID_SERIAL     — ADB device serial (default: first connected device)
//   CHROME_CDP         — Chrome DevTools Protocol endpoint (default: http://localhost:9222)
//
// Start: node dist/main.js

import os from 'os';
import { buildRuntimeConfig }       from './runtime/RuntimeConfiguration.js';
import { AgentRuntime }             from './runtime/AgentRuntime.js';
import { makeNodeSystemMetrics }    from './runtime/HealthMonitor.js';
import { DriverRegistry }          from './drivers/DriverRegistry.js';
import { DriverHost }              from './drivers/DriverHost.js';
import { AndroidDriver }           from './drivers/android/AndroidDriver.js';
import { ChromeDriver }            from './drivers/chrome/ChromeDriver.js';
import { AssertionRegistry }       from './assertions/AssertionRegistry.js';
import { StepExecutor }            from './execution/StepExecutor.js';
import { ExecutionSessionRegistry } from './execution/ExecutionSessionRegistry.js';
import { AutonomousRunnerEngine }  from './runner/AutonomousRunnerEngine.js';
import { WebSocketEventEmitter }   from './execution/events/WebSocketEventEmitter.js';
import { AgentHubServer }          from './communication/AgentHubServer.js';
import { CommandRouter }           from './communication/CommandRouter.js';
import { EventForwarder }          from './communication/EventForwarder.js';
import { MessageSerializer }       from './communication/MessageSerializer.js';
import { StructuredLogger }        from './logging/StructuredLogger.js';

const logger = new StructuredLogger('Main');

// ─── Configuration ─────────────────────────────────────────────────────────────

const AGENT_ID    = process.env['AGENT_ID']    ?? `agent-local-${os.hostname()}`;
const AGENT_PORT  = parseInt(process.env['AGENT_PORT'] ?? '8080', 10);
const AGENT_TOKEN = process.env['AGENT_TOKEN'] ?? '';
const ANDROID_SERIAL = process.env['ANDROID_SERIAL'];
const CHROME_CDP  = process.env['CHROME_CDP']  ?? 'http://localhost:9222';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('agent_booting', { agent_id: AGENT_ID, port: AGENT_PORT });

  // ── Hub server (created first so broadcast is available to forwarder) ────────
  const hub = new AgentHubServer({
    port:          AGENT_PORT,
    requireToken:  AGENT_TOKEN !== '',
    token:         AGENT_TOKEN || undefined,
  });

  // ── Wire-layer: serialiser + event forwarder ─────────────────────────────────
  const serializer = new MessageSerializer();
  const forwarder  = new EventForwarder(
    AGENT_ID,
    (data) => hub.broadcast(data),
    (msg)  => serializer.serialize(msg),
  );

  // ── WebSocket execution event emitter ────────────────────────────────────────
  const wsEmitter = new WebSocketEventEmitter(forwarder);

  // ── Driver registry ───────────────────────────────────────────────────────────
  const driverRegistry = new DriverRegistry();

  // Drivers take no constructor args — device config is passed via driverConfig
  // in the ExecuteTest command payload (serial, adb_path, cdp_endpoint, etc.)
  try {
    driverRegistry.register(new AndroidDriver());
    logger.info('driver_registered', { id: 'android_adb' });
  } catch (err) {
    logger.warn('driver_register_failed', {
      id: 'android_adb', error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    driverRegistry.register(new ChromeDriver());
    logger.info('driver_registered', { id: 'chrome_cdp' });
  } catch (err) {
    logger.warn('driver_register_failed', {
      id: 'chrome_cdp', error: err instanceof Error ? err.message : String(err),
    });
  }

  // Log default driver configs for reference
  logger.info('driver_defaults', {
    android_serial: ANDROID_SERIAL ?? '(first connected device)',
    chrome_cdp:     CHROME_CDP,
  });

  // ── Execution subsystem ───────────────────────────────────────────────────────
  const driverHost  = new DriverHost();
  const stepExecutor = new StepExecutor(driverHost, wsEmitter);
  const sessionRegistry = new ExecutionSessionRegistry();
  const assertionRegistry = new AssertionRegistry();

  const runnerEngine = new AutonomousRunnerEngine(
    driverRegistry,
    stepExecutor,
    wsEmitter,
    assertionRegistry,
  );

  // ── AgentRuntime (health + heartbeats) ───────────────────────────────────────
  const runtimeConfig = buildRuntimeConfig({
    agentId:      AGENT_ID,
    agentVersion: '5.0.0',
    organizationId: process.env['ORG_ID'] ?? 'local',
  });

  const runtime = new AgentRuntime(runtimeConfig, {
    systemMetrics: makeNodeSystemMetrics(),
    heartbeatEmit: (payload) => hub.broadcastHeartbeat(payload),
  });

  // ── Command router ────────────────────────────────────────────────────────────
  const router = new CommandRouter(runtime);
  router.setExecutionDeps(runnerEngine, sessionRegistry, forwarder);

  // ── Wire router into hub ──────────────────────────────────────────────────────
  hub.setRouter(router);

  // ── Start ─────────────────────────────────────────────────────────────────────
  await runtime.start();
  hub.start();

  logger.info('agent_ready', {
    agent_id:  AGENT_ID,
    port:      AGENT_PORT,
    auth:      AGENT_TOKEN !== '' ? 'token-required' : 'open',
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutdown_initiated', { signal });
    await hub.stop();
    await runtime.stop();
    process.exit(0);
  };

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error during agent startup:', err);
  process.exit(1);
});
