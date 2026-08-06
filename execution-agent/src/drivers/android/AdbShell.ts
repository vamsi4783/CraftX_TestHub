// ─── ADB Shell Abstraction ────────────────────────────────────────────────────
// Separates ADB command execution from AndroidDriver logic.
// Tests inject a mock; production uses SystemAdbShell.

import { execFile } from 'node:child_process';

export interface AdbExecResult {
  stdout: string;
  stderr: string;
}

export interface AdbShell {
  /** Execute an adb command; resolve with stdout/stderr, reject on non-zero exit. */
  exec(args: string[]): Promise<AdbExecResult>;
  /** Execute an adb command and return raw binary output (e.g. screencap). */
  execBuffer(args: string[]): Promise<Buffer>;
}

// ─── Production implementation ────────────────────────────────────────────────

export interface SystemAdbShellConfig {
  adb_path?: string;   // default: 'adb'
  serial?: string;     // prepends [-s <serial>] to every invocation
}

export class SystemAdbShell implements AdbShell {
  private readonly adbPath: string;
  private readonly serialArgs: string[];

  constructor(config: SystemAdbShellConfig = {}) {
    this.adbPath    = config.adb_path ?? 'adb';
    this.serialArgs = config.serial ? ['-s', config.serial] : [];
  }

  exec(args: string[]): Promise<AdbExecResult> {
    const fullArgs = [...this.serialArgs, ...args];
    return new Promise((resolve, reject) => {
      execFile(this.adbPath, fullArgs, { encoding: 'utf8' }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`adb ${fullArgs.join(' ')} failed: ${stderr || err.message}`));
        } else {
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        }
      });
    });
  }

  execBuffer(args: string[]): Promise<Buffer> {
    const fullArgs = [...this.serialArgs, ...args];
    return new Promise((resolve, reject) => {
      execFile(this.adbPath, fullArgs, { encoding: 'buffer' }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`adb ${fullArgs.join(' ')} failed: ${stderr?.toString() ?? err.message}`));
        } else {
          resolve(stdout as unknown as Buffer);
        }
      });
    });
  }
}
