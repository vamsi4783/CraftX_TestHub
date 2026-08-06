// ─── ChromeDriver ─────────────────────────────────────────────────────────────
// Drives a Chrome browser via Playwright CDP.
// DriverHost owns timeout, cancellation, and lifecycle logging.
// ChromeDriver uses PlaywrightAdapter so tests can inject a mock.

import { BaseDriver }                            from '../BaseDriver.js';
import type { ActionRequest, ActionResult }      from '../IDriver.js';
import type { DriverManifest, Capability }       from '../CapabilityManifest.js';
import { RealPlaywrightAdapter }                 from './PlaywrightAdapter.js';
import type { PlaywrightAdapter,
              PlaywrightBrowser,
              PlaywrightPage }                   from './PlaywrightAdapter.js';
import { DriverExecutionException,
         DriverNotConnectedException }           from '../DriverExceptions.js';

// ─── Connect config schema ────────────────────────────────────────────────────

export interface ChromeDriverConfig {
  /** CDP endpoint URL of the running Chrome instance. Default: http://localhost:9222 */
  cdp_endpoint?: string;
}

const DEFAULT_CDP_ENDPOINT = 'http://localhost:9222';

// ─── Manifest ─────────────────────────────────────────────────────────────────

const CHROME_CAPABILITIES: Capability[] = [
  'navigate',
  'click',
  'fill',
  'screenshot',
  'evaluate',
  'wait',
  'wait_for_selector',
  'get_dom',
  'scroll',
];

export const CHROME_DRIVER_MANIFEST: DriverManifest = {
  driver_id:          'chrome_cdp',
  driver_name:        'Chrome CDP Driver',
  version:            '1.0.0',
  capabilities:       new Set<Capability>(CHROME_CAPABILITIES),
  config_schema: {
    type: 'object',
    properties: {
      cdp_endpoint: { type: 'string', format: 'uri' },
    },
  },
  platforms:           ['chromium'],
  agent_compatibility: ['>=1.0.0'],
  description:         'Chrome browser control via Playwright CDP connection.',
};

// ─── Driver ───────────────────────────────────────────────────────────────────

export class ChromeDriver extends BaseDriver {
  readonly id       = 'chrome_cdp';
  readonly manifest = CHROME_DRIVER_MANIFEST;

  private readonly pw: PlaywrightAdapter;
  private browser: PlaywrightBrowser | null = null;
  private page:    PlaywrightPage    | null = null;

  /**
   * @param pw Injected PlaywrightAdapter. Defaults to RealPlaywrightAdapter.
   *           Tests pass a mock.
   */
  constructor(pw?: PlaywrightAdapter) {
    super();
    this.pw = pw ?? new RealPlaywrightAdapter();
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const cfg      = config as ChromeDriverConfig;
    const endpoint = cfg.cdp_endpoint ?? DEFAULT_CDP_ENDPOINT;
    this.browser   = await this.pw.connectOverCDP(endpoint);
    this.page      = await this.browser.newPage();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this.page    = null;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this._connected = false;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (!this.page) throw new DriverNotConnectedException(this.id);
    try {
      return await this._dispatch(this.page, request);
    } catch (err) {
      if (err instanceof DriverExecutionException) throw err;
      if (err instanceof DriverNotConnectedException) throw err;
      throw new DriverExecutionException(this.id, request.action, err);
    }
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  private async _dispatch(page: PlaywrightPage, request: ActionRequest): Promise<ActionResult> {
    switch (request.action) {

      case 'navigate': {
        const url     = request.value ?? '';
        const timeout = Number(request.params?.timeout_ms) || 30_000;
        await page.goto(url, { timeout });
        return { success: true, duration_ms: 0, raw: page.url() };
      }

      case 'click': {
        const timeout = Number(request.params?.timeout_ms) || 30_000;
        await page.click(request.selector ?? '', { timeout });
        return { success: true, duration_ms: 0 };
      }

      case 'fill': {
        const timeout = Number(request.params?.timeout_ms) || 30_000;
        await page.fill(request.selector ?? '', request.value ?? '', { timeout });
        return { success: true, duration_ms: 0 };
      }

      case 'screenshot': {
        const buf = await page.screenshot({ type: 'png' });
        return { success: true, duration_ms: 0, screenshot: buf };
      }

      case 'evaluate': {
        const result = await page.evaluate(request.value ?? 'undefined');
        return { success: true, duration_ms: 0, raw: result };
      }

      case 'wait': {
        if (request.selector) {
          const timeout = Number(request.params?.timeout_ms) || 30_000;
          await page.waitForSelector(request.selector, { timeout });
        } else {
          const ms = Number(request.value) || 1_000;
          await page.waitForTimeout(ms);
        }
        return { success: true, duration_ms: 0 };
      }

      case 'wait_for_selector': {
        const timeout = Number(request.params?.timeout_ms) || 30_000;
        await page.waitForSelector(request.selector ?? '', { timeout });
        return { success: true, duration_ms: 0 };
      }

      case 'get_dom': {
        const content = await page.content();
        return { success: true, duration_ms: 0, raw: content };
      }

      case 'scroll': {
        const x = request.params?.x ?? 0;
        const y = request.params?.y ?? 0;
        await page.evaluate(`window.scrollBy(${x}, ${y})`);
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
