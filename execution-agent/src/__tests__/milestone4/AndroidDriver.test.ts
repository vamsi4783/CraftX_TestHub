// ─── Milestone 4: AndroidDriver Tests ────────────────────────────────────────

import { AndroidDriver, ANDROID_DRIVER_MANIFEST } from '../../drivers/android/AndroidDriver.js';
import { DriverExecutionException }               from '../../drivers/DriverExceptions.js';
import type { AdbShell, AdbExecResult }           from '../../drivers/android/AdbShell.js';

// ─── Mock AdbShell ────────────────────────────────────────────────────────────

interface AdbCall { args: string[] }

function makeMockAdb(opts: {
  failOn?: string[];   // args substring that triggers rejection
  bufferResult?: Buffer;
} = {}): AdbShell & { calls: AdbCall[] } {
  const calls: AdbCall[] = [];

  const exec = async (args: string[]): Promise<AdbExecResult> => {
    calls.push({ args });
    if (opts.failOn?.some(pat => args.join(' ').includes(pat))) {
      throw new Error(`adb command failed: ${args.join(' ')}`);
    }
    return { stdout: 'ok', stderr: '' };
  };

  const execBuffer = async (args: string[]): Promise<Buffer> => {
    calls.push({ args });
    return opts.bufferResult ?? Buffer.from('PNG_DATA');
  };

  return { exec, execBuffer, calls };
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

describe('AndroidDriver — manifest', () => {
  it('ANDROID_DRIVER_MANIFEST has correct driver_id', () => {
    expect(ANDROID_DRIVER_MANIFEST.driver_id).toBe('android_adb');
  });

  it('ANDROID_DRIVER_MANIFEST has correct driver_name', () => {
    expect(ANDROID_DRIVER_MANIFEST.driver_name).toBe('Android ADB Driver');
  });

  it('ANDROID_DRIVER_MANIFEST targets android platform', () => {
    expect(ANDROID_DRIVER_MANIFEST.platforms).toContain('android');
  });

  it('ANDROID_DRIVER_MANIFEST declares tap capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('tap')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares swipe capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('swipe')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares type_text capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('type_text')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares press_back capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('press_back')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares screenshot capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('screenshot')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares launch_app capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('launch_app')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares install_apk capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('install_apk')).toBe(true);
  });

  it('ANDROID_DRIVER_MANIFEST declares uninstall_apk capability', () => {
    expect(ANDROID_DRIVER_MANIFEST.capabilities.has('uninstall_apk')).toBe(true);
  });

  it('driver.id matches manifest.driver_id', () => {
    const driver = new AndroidDriver();
    expect(driver.id).toBe(driver.manifest.driver_id);
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('AndroidDriver — lifecycle', () => {
  it('isConnected() is false before connect()', () => {
    const driver = new AndroidDriver(makeMockAdb());
    expect(driver.isConnected()).toBe(false);
  });

  it('isConnected() is true after connect()', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    expect(driver.isConnected()).toBe(true);
  });

  it('connect() calls adb devices', async () => {
    const adb = makeMockAdb();
    await new AndroidDriver(adb).connect({});
    expect(adb.calls[0].args).toEqual(['devices']);
  });

  it('isConnected() is false after disconnect()', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    await driver.disconnect();
    expect(driver.isConnected()).toBe(false);
  });

  it('dispose() disconnects if connected', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    await driver.dispose();
    expect(driver.isConnected()).toBe(false);
  });
});

// ─── Primitive actions ────────────────────────────────────────────────────────

describe('AndroidDriver — tap', () => {
  it('sends correct adb shell input tap command', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0; // reset after connect

    await driver.execute({ action: 'tap', params: { x: 100, y: 200 } });
    expect(adb.calls[0].args).toEqual(['shell', 'input', 'tap', '100', '200']);
  });

  it('returns success: true', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    const result = await driver.execute({ action: 'tap', params: { x: 0, y: 0 } });
    expect(result.success).toBe(true);
  });
});

describe('AndroidDriver — swipe', () => {
  it('sends correct adb shell input swipe command', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'swipe', params: { x1: 100, y1: 200, x2: 300, y2: 400, duration_ms: 500 } });
    expect(adb.calls[0].args).toEqual(['shell', 'input', 'swipe', '100', '200', '300', '400', '500']);
  });
});

describe('AndroidDriver — type_text', () => {
  it('sends correct adb shell input text command', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'type_text', value: 'hello' });
    expect(adb.calls[0].args).toEqual(['shell', 'input', 'text', 'hello']);
  });

  it('replaces spaces with %s in text', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'type_text', value: 'hello world' });
    expect(adb.calls[0].args[3]).toBe('hello%sworld');
  });
});

describe('AndroidDriver — press_back', () => {
  it('sends KEYCODE_BACK keyevent', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'press_back' });
    expect(adb.calls[0].args).toEqual(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  });
});

describe('AndroidDriver — press_key', () => {
  it('sends the provided keycode', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'press_key', value: 'KEYCODE_HOME' });
    expect(adb.calls[0].args).toEqual(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  });
});

describe('AndroidDriver — screenshot', () => {
  it('calls exec-out screencap -p and returns Buffer', async () => {
    const screenshotBuf = Buffer.from('\x89PNG\r\n');
    const adb    = makeMockAdb({ bufferResult: screenshotBuf });
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    const result = await driver.execute({ action: 'screenshot' });
    expect(result.screenshot).toBe(screenshotBuf);
    expect(adb.calls[0].args).toEqual(['exec-out', 'screencap', '-p']);
  });
});

describe('AndroidDriver — launch_app', () => {
  it('uses am start -n when activity is provided', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'launch_app', params: { package: 'com.example', activity: '.MainActivity' } });
    expect(adb.calls[0].args).toEqual(['shell', 'am', 'start', '-n', 'com.example/.MainActivity']);
  });

  it('uses monkey when only package is provided', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'launch_app', params: { package: 'com.example' } });
    expect(adb.calls[0].args).toContain('monkey');
    expect(adb.calls[0].args).toContain('com.example');
  });

  it('throws DriverExecutionException when package is missing', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});

    await expect(driver.execute({ action: 'launch_app', params: {} }))
      .rejects.toThrow(DriverExecutionException);
  });
});

describe('AndroidDriver — install_apk', () => {
  it('calls adb install -r with apk path', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'install_apk', value: '/tmp/app.apk' });
    expect(adb.calls[0].args).toEqual(['install', '-r', '/tmp/app.apk']);
  });

  it('throws when value is missing', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});

    await expect(driver.execute({ action: 'install_apk' }))
      .rejects.toThrow(DriverExecutionException);
  });
});

describe('AndroidDriver — uninstall_apk', () => {
  it('calls adb uninstall with package name', async () => {
    const adb    = makeMockAdb();
    const driver = new AndroidDriver(adb);
    await driver.connect({});
    adb.calls.length = 0;

    await driver.execute({ action: 'uninstall_apk', value: 'com.example.app' });
    expect(adb.calls[0].args).toEqual(['uninstall', 'com.example.app']);
  });
});

describe('AndroidDriver — error wrapping', () => {
  it('wraps adb errors in DriverExecutionException', async () => {
    const adb    = makeMockAdb({ failOn: ['input tap'] });
    const driver = new AndroidDriver(adb);
    await driver.connect({});

    await expect(driver.execute({ action: 'tap', params: { x: 0, y: 0 } }))
      .rejects.toThrow(DriverExecutionException);
  });
});
