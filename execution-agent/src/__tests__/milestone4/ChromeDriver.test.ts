// ─── Milestone 4: ChromeDriver Tests ─────────────────────────────────────────

import { ChromeDriver, CHROME_DRIVER_MANIFEST } from '../../drivers/chrome/ChromeDriver.js';
import { DriverExecutionException }             from '../../drivers/DriverExceptions.js';
import type { PlaywrightAdapter,
              PlaywrightBrowser,
              PlaywrightPage }                  from '../../drivers/chrome/PlaywrightAdapter.js';

// ─── Mock Playwright layer ────────────────────────────────────────────────────

interface PageCall { method: string; args: unknown[] }

function makeMockPage(opts: {
  screenshotResult?: Buffer;
  evaluateResult?:   unknown;
  domContent?:       string;
  currentUrl?:       string;
  failOn?:           string[];    // method names that throw
} = {}): PlaywrightPage & { calls: PageCall[] } {
  const calls: PageCall[] = [];
  const fail = opts.failOn ?? [];

  function mayFail(method: string): void {
    if (fail.includes(method)) throw new Error(`${method} failed`);
  }

  return {
    calls,
    async goto(url, _opts)       { calls.push({ method: 'goto', args: [url] }); mayFail('goto'); },
    async click(sel, _opts)      { calls.push({ method: 'click', args: [sel] }); mayFail('click'); },
    async fill(sel, val, _opts)  { calls.push({ method: 'fill', args: [sel, val] }); mayFail('fill'); },
    async screenshot(_opts)      { calls.push({ method: 'screenshot', args: [] }); mayFail('screenshot'); return opts.screenshotResult ?? Buffer.from('PNG'); },
    async evaluate(fn, ...args)  { calls.push({ method: 'evaluate', args: [fn, ...args] }); mayFail('evaluate'); return opts.evaluateResult; },
    async waitForSelector(sel, _opts) { calls.push({ method: 'waitForSelector', args: [sel] }); mayFail('waitForSelector'); },
    async waitForTimeout(ms)     { calls.push({ method: 'waitForTimeout', args: [ms] }); mayFail('waitForTimeout'); },
    async content()              { calls.push({ method: 'content', args: [] }); return opts.domContent ?? '<html></html>'; },
    url()                        { return opts.currentUrl ?? 'https://example.com'; },
  };
}

function makeMockBrowser(page: PlaywrightPage): PlaywrightBrowser {
  return {
    isConnected: () => true,
    close:       async () => {},
    newPage:     async () => page,
  };
}

function makeMockAdapter(page: PlaywrightPage): PlaywrightAdapter {
  const browser = makeMockBrowser(page);
  return { connectOverCDP: async (_url: string) => browser };
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

describe('ChromeDriver — manifest', () => {
  it('CHROME_DRIVER_MANIFEST has correct driver_id', () => {
    expect(CHROME_DRIVER_MANIFEST.driver_id).toBe('chrome_cdp');
  });

  it('CHROME_DRIVER_MANIFEST has correct driver_name', () => {
    expect(CHROME_DRIVER_MANIFEST.driver_name).toBe('Chrome CDP Driver');
  });

  it('CHROME_DRIVER_MANIFEST targets chromium platform', () => {
    expect(CHROME_DRIVER_MANIFEST.platforms).toContain('chromium');
  });

  it('CHROME_DRIVER_MANIFEST declares navigate capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('navigate')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares click capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('click')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares fill capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('fill')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares screenshot capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('screenshot')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares evaluate capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('evaluate')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares wait capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('wait')).toBe(true);
  });

  it('CHROME_DRIVER_MANIFEST declares get_dom capability', () => {
    expect(CHROME_DRIVER_MANIFEST.capabilities.has('get_dom')).toBe(true);
  });

  it('driver.id matches manifest.driver_id', () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    expect(driver.id).toBe(driver.manifest.driver_id);
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('ChromeDriver — lifecycle', () => {
  it('isConnected() is false before connect()', () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    expect(driver.isConnected()).toBe(false);
  });

  it('isConnected() is true after connect()', async () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    await driver.connect({});
    expect(driver.isConnected()).toBe(true);
  });

  it('isConnected() is false after disconnect()', async () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    await driver.connect({});
    await driver.disconnect();
    expect(driver.isConnected()).toBe(false);
  });

  it('dispose() disconnects if connected', async () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    await driver.connect({});
    await driver.dispose();
    expect(driver.isConnected()).toBe(false);
  });

  it('connects to the provided cdp_endpoint', async () => {
    let capturedEndpoint = '';
    const adapter: PlaywrightAdapter = {
      connectOverCDP: async (url) => {
        capturedEndpoint = url;
        return makeMockBrowser(makeMockPage());
      },
    };
    const driver = new ChromeDriver(adapter);
    await driver.connect({ cdp_endpoint: 'http://localhost:1234' });
    expect(capturedEndpoint).toBe('http://localhost:1234');
  });
});

// ─── Actions ──────────────────────────────────────────────────────────────────

describe('ChromeDriver — navigate', () => {
  it('calls page.goto with the request url', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'navigate', value: 'https://example.com' });
    expect(page.calls.some(c => c.method === 'goto' && c.args[0] === 'https://example.com')).toBe(true);
  });

  it('returns success: true', async () => {
    const driver = new ChromeDriver(makeMockAdapter(makeMockPage()));
    await driver.connect({});
    const result = await driver.execute({ action: 'navigate', value: 'https://example.com' });
    expect(result.success).toBe(true);
  });
});

describe('ChromeDriver — click', () => {
  it('calls page.click with the selector', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'click', selector: '#submit-btn' });
    expect(page.calls.some(c => c.method === 'click' && c.args[0] === '#submit-btn')).toBe(true);
  });
});

describe('ChromeDriver — fill', () => {
  it('calls page.fill with selector and value', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'fill', selector: '#username', value: 'alice' });
    expect(page.calls.some(c => c.method === 'fill' && c.args[0] === '#username' && c.args[1] === 'alice')).toBe(true);
  });
});

describe('ChromeDriver — screenshot', () => {
  it('returns screenshot Buffer', async () => {
    const buf    = Buffer.from('\x89PNG');
    const page   = makeMockPage({ screenshotResult: buf });
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    const result = await driver.execute({ action: 'screenshot' });
    expect(result.screenshot).toBe(buf);
    expect(result.success).toBe(true);
  });
});

describe('ChromeDriver — evaluate', () => {
  it('calls page.evaluate and returns result in raw', async () => {
    const page   = makeMockPage({ evaluateResult: 42 });
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    const result = await driver.execute({ action: 'evaluate', value: 'document.title.length' });
    expect(result.raw).toBe(42);
    expect(result.success).toBe(true);
  });
});

describe('ChromeDriver — wait', () => {
  it('calls page.waitForTimeout when no selector', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'wait', value: '500' });
    expect(page.calls.some(c => c.method === 'waitForTimeout' && c.args[0] === 500)).toBe(true);
  });

  it('calls page.waitForSelector when selector is provided', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'wait', selector: '#loading', params: { timeout_ms: 5000 } });
    expect(page.calls.some(c => c.method === 'waitForSelector' && c.args[0] === '#loading')).toBe(true);
  });
});

describe('ChromeDriver — get_dom', () => {
  it('returns page content in raw', async () => {
    const html   = '<html><body>hello</body></html>';
    const page   = makeMockPage({ domContent: html });
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    const result = await driver.execute({ action: 'get_dom' });
    expect(result.raw).toBe(html);
    expect(result.success).toBe(true);
  });
});

describe('ChromeDriver — scroll', () => {
  it('calls page.evaluate with window.scrollBy', async () => {
    const page   = makeMockPage();
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await driver.execute({ action: 'scroll', params: { x: 0, y: 300 } });
    expect(page.calls.some(c => c.method === 'evaluate' && String(c.args[0]).includes('scrollBy'))).toBe(true);
  });
});

describe('ChromeDriver — error wrapping', () => {
  it('wraps page errors in DriverExecutionException', async () => {
    const page   = makeMockPage({ failOn: ['goto'] });
    const driver = new ChromeDriver(makeMockAdapter(page));
    await driver.connect({});

    await expect(driver.execute({ action: 'navigate', value: 'https://example.com' }))
      .rejects.toThrow(DriverExecutionException);
  });
});
