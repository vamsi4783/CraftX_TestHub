// ─── AndroidDriver ────────────────────────────────────────────────────────────
// Wraps ADB to execute primitive UI actions on a connected Android device.
// DriverHost owns timeout, cancellation, and lifecycle logging.
// This driver is intentionally minimal — no UI orchestration.

import { BaseDriver }                            from '../BaseDriver.js';
import type { ActionRequest, ActionResult }      from '../IDriver.js';
import type { DriverManifest, Capability }       from '../CapabilityManifest.js';
import { SystemAdbShell }                        from './AdbShell.js';
import type { AdbShell }                         from './AdbShell.js';
import { DriverExecutionException }              from '../DriverExceptions.js';

// ─── Connect config schema ────────────────────────────────────────────────────

export interface AndroidDriverConfig {
  /** ADB device serial. Omit to use the single connected device. */
  serial?: string;
  /** Path to the adb binary. Default: 'adb' (must be on $PATH). */
  adb_path?: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

const ANDROID_CAPABILITIES: Capability[] = [
  'tap',
  'swipe',
  'type_text',
  'press_key',
  'press_back',
  'screenshot',
  'launch_app',
  'install_apk',
  'uninstall_apk',
];

export const ANDROID_DRIVER_MANIFEST: DriverManifest = {
  driver_id:          'android_adb',
  driver_name:        'Android ADB Driver',
  version:            '1.0.0',
  capabilities:       new Set<Capability>(ANDROID_CAPABILITIES),
  config_schema: {
    type: 'object',
    properties: {
      serial:   { type: 'string' },
      adb_path: { type: 'string' },
    },
  },
  platforms:           ['android'],
  agent_compatibility: ['>=1.0.0'],
  description:         'Primitive Android device control via ADB. No UI orchestration.',
};

// ─── Driver ───────────────────────────────────────────────────────────────────

export class AndroidDriver extends BaseDriver {
  readonly id       = 'android_adb';
  readonly manifest = ANDROID_DRIVER_MANIFEST;

  private adb: AdbShell;
  private readonly _injectedAdb: AdbShell | undefined;

  /**
   * @param adb Injected AdbShell. Defaults to SystemAdbShell (real adb binary).
   *            Tests pass a mock so the real adb binary is never invoked.
   */
  constructor(adb?: AdbShell) {
    super();
    this._injectedAdb = adb;
    this.adb = adb ?? new SystemAdbShell();
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const cfg = config as AndroidDriverConfig;
    // When no shell was injected, re-create with config (serial, adb_path).
    // When a shell was injected (tests), leave it untouched.
    if (!this._injectedAdb) {
      this.adb = new SystemAdbShell({ serial: cfg.serial, adb_path: cfg.adb_path });
    }

    // Verify device is reachable.
    await this.adb.exec(['devices']);
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    try {
      return await this._dispatch(request);
    } catch (err) {
      if (err instanceof DriverExecutionException) throw err;
      throw new DriverExecutionException(this.id, request.action, err);
    }
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  private async _dispatch(request: ActionRequest): Promise<ActionResult> {
    switch (request.action) {

      case 'tap': {
        const x = String(request.params?.x ?? 0);
        const y = String(request.params?.y ?? 0);
        await this.adb.exec(['shell', 'input', 'tap', x, y]);
        return { success: true, duration_ms: 0 };
      }

      case 'swipe': {
        const x1 = String(request.params?.x1 ?? 0);
        const y1 = String(request.params?.y1 ?? 0);
        const x2 = String(request.params?.x2 ?? 0);
        const y2 = String(request.params?.y2 ?? 0);
        const ms = String(request.params?.duration_ms ?? 300);
        await this.adb.exec(['shell', 'input', 'swipe', x1, y1, x2, y2, ms]);
        return { success: true, duration_ms: 0 };
      }

      case 'type_text': {
        // ADB requires spaces escaped as %s; single-quote the whole string.
        const text = (request.value ?? '').replace(/ /g, '%s');
        await this.adb.exec(['shell', 'input', 'text', text]);
        return { success: true, duration_ms: 0 };
      }

      case 'press_key': {
        const keycode = request.value ?? 'KEYCODE_ENTER';
        await this.adb.exec(['shell', 'input', 'keyevent', keycode]);
        return { success: true, duration_ms: 0 };
      }

      case 'press_back': {
        await this.adb.exec(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        return { success: true, duration_ms: 0 };
      }

      case 'screenshot': {
        // exec-out screencap -p writes PNG bytes to stdout.
        const buf = await this.adb.execBuffer(['exec-out', 'screencap', '-p']);
        return { success: true, duration_ms: 0, screenshot: buf };
      }

      case 'launch_app': {
        const pkg      = request.params?.package as string | undefined;
        const activity = request.params?.activity as string | undefined;
        if (pkg && activity) {
          await this.adb.exec(['shell', 'am', 'start', '-n', `${pkg}/${activity}`]);
        } else if (pkg) {
          // monkey launches the default launcher activity.
          await this.adb.exec([
            'shell', 'monkey', '-p', pkg,
            '-c', 'android.intent.category.LAUNCHER', '1',
          ]);
        } else {
          throw new DriverExecutionException(
            this.id, 'launch_app',
            new Error('launch_app requires params.package'),
          );
        }
        return { success: true, duration_ms: 0 };
      }

      case 'install_apk': {
        const apkPath = request.value ?? '';
        if (!apkPath) throw new DriverExecutionException(this.id, 'install_apk', new Error('value (apk path) required'));
        await this.adb.exec(['install', '-r', apkPath]);
        return { success: true, duration_ms: 0 };
      }

      case 'uninstall_apk': {
        const pkg = request.value ?? '';
        if (!pkg) throw new DriverExecutionException(this.id, 'uninstall_apk', new Error('value (package name) required'));
        await this.adb.exec(['uninstall', pkg]);
        return { success: true, duration_ms: 0 };
      }

      default:
        throw new DriverExecutionException(
          this.id, request.action,
          new Error(`Unsupported action: "${request.action}"`),
        );
    }
  }
}
