import { describe, it, expect } from 'vitest';
import { ZipProjectSourceProvider } from '../../services/projectIngestion/providers/ZipProjectSourceProvider.js';
import { zipSync } from 'fflate';

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = new TextEncoder().encode(content);
  }
  return zipSync(entries);
}

describe('ZipProjectSourceProvider', () => {
  it('connects and lists files', async () => {
    const zip = makeZip({
      'src/main.ts':   'export function main() {}',
      'src/utils.ts':  'export const noop = () => {}',
      'package.json':  '{"name":"test"}',
    });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    const files = await provider.listFiles();
    expect(files.length).toBe(3);
    expect(files.map(f => f.path)).toContain('src/main.ts');
  });

  it('strips common root prefix', async () => {
    const zip = makeZip({
      'my-app/src/main.ts': 'export default {}',
      'my-app/package.json': '{}',
    });
    const provider = new ZipProjectSourceProvider(zip, 'my-app.zip');
    await provider.connect();
    const files = await provider.listFiles();
    expect(files.map(f => f.path)).toContain('src/main.ts');
    expect(files.map(f => f.path)).toContain('package.json');
  });

  it('marks node_modules files as ignored', async () => {
    const zip = makeZip({
      'src/index.ts':                    'export {}',
      'node_modules/react/index.js':     'module.exports = {}',
    });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    const files = await provider.listFiles();
    const nm = files.find(f => f.path === 'node_modules/react/index.js');
    expect(nm).toBeDefined();
    expect(nm!.isIgnored).toBe(true);
  });

  it('rejects path traversal entries', async () => {
    // We can't easily create a real traversal ZIP with fflate, so test the detection function
    // by checking the provider rejects malformed entries
    const enc = new TextEncoder();
    // Directly build a zip with a malicious path
    const zip = zipSync({ '../evil.sh': enc.encode('rm -rf /') });
    const provider = new ZipProjectSourceProvider(zip, 'evil.zip');
    await expect(provider.connect()).rejects.toThrow(/traversal/i);
  });

  it('reads file content', async () => {
    const zip = makeZip({ 'src/hello.ts': 'export const greeting = "hello";' });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    const content = await provider.readFile('src/hello.ts');
    expect(content.content).toContain('greeting');
  });

  it('cleanup clears state', async () => {
    const zip = makeZip({ 'src/a.ts': 'export {}' });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    await provider.cleanup();
    await expect(provider.listFiles()).rejects.toThrow(/connect/);
  });

  it('enforces max file size', async () => {
    const bigContent = 'x'.repeat(600_000); // > 500 KB default
    const zip = makeZip({ 'big.ts': bigContent, 'small.ts': 'export {}' });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    const files = await provider.listFiles();
    expect(files.map(f => f.path)).not.toContain('big.ts');
    expect(files.map(f => f.path)).toContain('small.ts');
  });

  it('marks .gitignore-matched files as ignored', async () => {
    const zip = makeZip({
      '.gitignore':   '*.log\ndebug/',
      'app.ts':       'export {}',
      'server.log':   'log content',
      'debug/out.ts': 'debug output',
    });
    const provider = new ZipProjectSourceProvider(zip, 'test.zip');
    await provider.connect();
    const files = await provider.listFiles();
    const byPath = new Map(files.map(f => [f.path, f]));
    expect(byPath.get('server.log')?.isIgnored).toBe(true);
    expect(byPath.get('debug/out.ts')?.isIgnored).toBe(true);
    expect(byPath.get('app.ts')?.isIgnored).toBe(false);
  });
});
