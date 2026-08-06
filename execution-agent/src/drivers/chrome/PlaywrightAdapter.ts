// ─── Playwright Adapter ───────────────────────────────────────────────────────
// Abstraction over Playwright's Browser/Page API.
// Tests inject a mock; production uses RealPlaywrightAdapter backed by playwright-core.
// ChromeDriver depends only on these interfaces, not on playwright directly.

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PlaywrightPage {
  goto(url: string, options?: { timeout?: number }): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
  screenshot(options?: { type?: 'png' | 'jpeg'; fullPage?: boolean }): Promise<Buffer>;
  evaluate(pageFunction: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  url(): string;
}

export interface PlaywrightBrowser {
  /** Open a new blank page in a new context. */
  newPage(): Promise<PlaywrightPage>;
  /** True if the underlying CDP connection is still open. */
  isConnected(): boolean;
  close(): Promise<void>;
}

export interface PlaywrightAdapter {
  /** Connect to an already-running Chrome instance via CDP endpoint URL. */
  connectOverCDP(endpointURL: string): Promise<PlaywrightBrowser>;
}

// ─── Production implementation (backed by playwright-core) ────────────────────

export class RealPlaywrightAdapter implements PlaywrightAdapter {
  async connectOverCDP(endpointURL: string): Promise<PlaywrightBrowser> {
    // Dynamic import keeps playwright-core out of the module graph when mocked.
    const { chromium } = await import('playwright-core');
    const browser = await chromium.connectOverCDP(endpointURL);

    // Wrap playwright's Browser into our PlaywrightBrowser interface.
    return {
      isConnected: () => browser.isConnected(),
      close:       () => browser.close(),
      newPage:     async () => {
        // Reuse an existing page if one is open; otherwise open a new one.
        const ctx  = browser.contexts()[0] ?? await browser.newContext();
        const page = ctx.pages()[0]        ?? await ctx.newPage();

        return {
          goto:            (url, opts)    => page.goto(url, opts).then(() => undefined),
          click:           (sel, opts)    => page.click(sel, opts),
          fill:            (sel, val, o)  => page.fill(sel, val, o),
          screenshot:      (opts)         => page.screenshot(opts) as Promise<Buffer>,
          evaluate:        (fn, ...args)  => page.evaluate(fn as never, ...args),
          waitForSelector: (sel, opts)    => page.waitForSelector(sel, opts).then(() => undefined),
          waitForTimeout:  (ms)           => page.waitForTimeout(ms),
          content:         ()             => page.content(),
          url:             ()             => page.url(),
        };
      },
    };
  }
}
