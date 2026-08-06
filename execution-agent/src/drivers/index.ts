// ─── Drivers barrel export ───────────────────────────────────────────────────

export type { Capability, DriverManifest }          from './CapabilityManifest.js';
export type { ActionRequest, ActionResult, IDriver } from './IDriver.js';

export type { CancellationToken }           from './DriverCancellation.js';
export { CancellationTokenSource,
         NON_CANCELLABLE }                  from './DriverCancellation.js';

export type { DriverExecutionContext }      from './DriverExecutionContext.js';
export type { DriverResult }               from './DriverResult.js';

export {
  DriverException,
  DriverTimeoutException,
  DriverCancelledException,
  DriverCapabilityException,
  DriverExecutionException,
  DriverNotConnectedException,
  DriverRegistrationException,
  DriverNotFoundException,
}                                           from './DriverExceptions.js';

export { DriverRegistry }                  from './DriverRegistry.js';
export { DriverHost, DEFAULT_TIMEOUT_MS }  from './DriverHost.js';
export type { DriverHostOptions,
              ExecuteOptions }             from './DriverHost.js';

export type { IDriverMiddleware }          from './middleware/IDriverMiddleware.js';
export type { IDeadLetterQueue,
              DeadLetterItem,
              DeadLetterContext }          from './deadletter/IDeadLetterQueue.js';

// ─── M4: Concrete drivers ─────────────────────────────────────────────────────

export type { Platform }                   from './CapabilityManifest.js';
export { BaseDriver }                      from './BaseDriver.js';

export { AndroidDriver,
         ANDROID_DRIVER_MANIFEST }         from './android/AndroidDriver.js';
export type { AndroidDriverConfig }        from './android/AndroidDriver.js';
export type { AdbShell, AdbExecResult }    from './android/AdbShell.js';
export { SystemAdbShell }                  from './android/AdbShell.js';

export { ChromeDriver,
         CHROME_DRIVER_MANIFEST }          from './chrome/ChromeDriver.js';
export type { ChromeDriverConfig }         from './chrome/ChromeDriver.js';
export type { PlaywrightAdapter,
              PlaywrightBrowser,
              PlaywrightPage }             from './chrome/PlaywrightAdapter.js';
export { RealPlaywrightAdapter }           from './chrome/PlaywrightAdapter.js';

export { MockDriver }                      from './mock/MockDriver.js';
export type { MockDriverOptions }          from './mock/MockDriver.js';
