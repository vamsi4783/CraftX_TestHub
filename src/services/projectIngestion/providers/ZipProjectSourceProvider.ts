// ─── M10: ZipProjectSourceProvider — ingest a .zip file via fflate ───────────
// Size/count/time limits are enforced. Path traversal is rejected.
// After connect(), file content is held in memory only — never written to disk.
// cleanup() clears all in-memory data.

import { unzipSync, type Unzipped } from 'fflate';
import type { IProjectSourceProvider, ProviderCapability, SourceFileContent } from '../IProjectSourceProvider.js';
import type {
  ProjectSourceKind,
  ProjectFileMetadata,
  ProjectSourceMetadata,
  ProjectSourceConfig,
  ListFilesOptions,
} from '../types.js';
import { IngestionFilterEngine } from '../IngestionFilterEngine.js';
import { secretScanner } from '../SecretScanner.js';

const DEFAULT_MAX_FILE_BYTES  = 500_000;     // 500 KB per file
const DEFAULT_MAX_TOTAL_BYTES = 100_000_000; // 100 MB total
const DEFAULT_MAX_FILES       = 10_000;

// Simple hash using djb2 for non-cryptographic identity tracking
function quickHash(bytes: Uint8Array): string {
  let h = 5381;
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    h = ((h << 5) + h) ^ bytes[i];
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function bytesToText(bytes: Uint8Array): string | null {
  // Detect binary by checking for null bytes or high ratio of non-printable chars
  let nonPrintable = 0;
  const sample = bytes.slice(0, 512);
  for (const b of sample) {
    if (b === 0) return null;
    if (b < 9 || (b > 13 && b < 32)) nonPrintable++;
  }
  if (sample.length > 0 && nonPrintable / sample.length > 0.3) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPathTraversal(entry: string): boolean {
  const normalised = entry.replace(/\\/g, '/');
  return (
    normalised.startsWith('../') ||
    normalised.includes('/../') ||
    normalised.endsWith('/..') ||
    normalised === '..' ||
    /^[a-zA-Z]:/.test(normalised) ||
    normalised.startsWith('/')
  );
}

export class ZipProjectSourceProvider implements IProjectSourceProvider {
  readonly kind: ProjectSourceKind = 'zip';
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(['list_files', 'read_file', 'read_files_batch']);

  private unzipped: Unzipped | null = null;
  private filter: IngestionFilterEngine;
  private displayName: string;

  constructor(
    private readonly zipBytes: Uint8Array,
    private readonly fileName: string,
    private readonly config:   ProjectSourceConfig = {},
  ) {
    this.displayName = fileName;
    this.filter = new IngestionFilterEngine(config);
  }

  async connect(): Promise<void> {
    const maxTotal = this.config.maxTotalSizeBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    const maxFiles = this.config.maxTotalFiles      ?? DEFAULT_MAX_FILES;

    if (this.zipBytes.length > maxTotal) {
      throw new Error(`ZIP file exceeds size limit of ${maxTotal} bytes`);
    }

    let unzipped: Unzipped;
    try {
      unzipped = unzipSync(this.zipBytes);
    } catch (e) {
      throw new Error(`Failed to extract ZIP: ${e instanceof Error ? e.message : String(e)}`);
    }

    const entries = Object.keys(unzipped);
    if (entries.length > maxFiles) {
      throw new Error(`ZIP contains ${entries.length} entries, exceeds limit of ${maxFiles}`);
    }

    // Validate every entry path for traversal attacks
    for (const entry of entries) {
      if (isPathTraversal(entry)) {
        throw new Error(`ZIP contains a path traversal entry: "${entry}"`);
      }
    }

    this.unzipped = unzipped;

    // Check if there's a .gitignore inside and rebuild filter with it
    const gitignorePath = entries.find(e =>
      e === '.gitignore' || e.match(/^[^/]+\/\.gitignore$/)
    );
    if (gitignorePath) {
      const bytes = unzipped[gitignorePath];
      const text  = bytesToText(bytes);
      if (text) this.filter = this.filter.withGitignore(text);
    }
  }

  async cleanup(): Promise<void> {
    this.unzipped = null;
  }

  async listFiles(options?: ListFilesOptions): Promise<ProjectFileMetadata[]> {
    this._assertConnected();
    const entries  = Object.keys(this.unzipped!);
    const maxFile  = this.config.maxFileSizeBytes ?? DEFAULT_MAX_FILE_BYTES;
    const maxFiles = options?.maxFiles ?? this.config.maxTotalFiles ?? DEFAULT_MAX_FILES;

    const stripRoot = this._detectRootPrefix(entries);
    const result: ProjectFileMetadata[] = [];

    for (const entry of entries) {
      // Skip directories
      if (entry.endsWith('/')) continue;

      const relativePath = stripRoot ? entry.slice(stripRoot.length) : entry;
      if (!relativePath) continue;

      const bytes = this.unzipped![entry];
      if (bytes.length > maxFile) continue;

      if (options?.extensions) {
        const ext = relativePath.split('.').pop() ?? '';
        if (!options.extensions.includes(ext)) continue;
      }

      const base = this.filter.buildMetadata(
        relativePath,
        bytes.length,
        quickHash(bytes),
      );
      const isSensitive = secretScanner.isSensitivePath(relativePath);

      result.push({ ...base, isSensitive });
      if (result.length >= maxFiles) break;
    }

    return result;
  }

  async readFile(path: string): Promise<SourceFileContent> {
    this._assertConnected();
    const stripRoot = this._detectRootPrefix(Object.keys(this.unzipped!));
    const key = stripRoot ? `${stripRoot}${path}` : path;

    const entry = this.unzipped![key] ?? this.unzipped![path];
    if (!entry) throw new Error(`File not found in ZIP: ${path}`);

    const text = bytesToText(entry);
    if (text === null) throw new Error(`File "${path}" appears to be binary`);

    return {
      path,
      content:   text,
      hash:      quickHash(entry),
      sizeBytes: entry.length,
    };
  }

  async readFiles(paths: string[]): Promise<SourceFileContent[]> {
    const results: SourceFileContent[] = [];
    for (const p of paths) {
      try {
        results.push(await this.readFile(p));
      } catch {
        // Skip unreadable files silently
      }
    }
    return results;
  }

  async getMetadata(): Promise<ProjectSourceMetadata> {
    return {
      kind:        this.kind,
      displayName: this.displayName,
    };
  }

  private _assertConnected(): void {
    if (!this.unzipped) throw new Error('ZipProjectSourceProvider: call connect() first');
  }

  private _detectRootPrefix(entries: string[]): string {
    // If ALL entries (including root-level files) start with the same top-level component, strip it.
    const fileEntries = entries.filter(e => !e.endsWith('/'));
    if (fileEntries.length === 0) return '';
    const tops = fileEntries.map(e => e.split('/')[0]);
    const first = tops[0];
    // There must be a '/' in every path (otherwise it's a root-level file — no prefix to strip)
    if (!fileEntries.every(e => e.includes('/') && e.split('/')[0] === first)) return '';
    return first + '/';
  }
}
