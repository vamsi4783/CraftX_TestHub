// ─── M10: LocalProjectSourceProvider — File System Access API ────────────────
// Chrome/Edge only. Uses window.showDirectoryPicker() to get a
// FileSystemDirectoryHandle. No server upload. Files are read on-demand.
// cleanup() releases the handle.

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

function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function* walkDirectory(
  dir:    FileSystemDirectoryHandle,
  prefix: string,
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of (dir as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      yield* walkDirectory(handle as FileSystemDirectoryHandle, path);
    } else {
      yield { path, handle: handle as FileSystemFileHandle };
    }
  }
}

function quickHash(text: string): string {
  let h = 5381;
  const len = Math.min(text.length, 4096);
  for (let i = 0; i < len; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export class LocalProjectSourceProvider implements IProjectSourceProvider {
  readonly kind: ProjectSourceKind = 'local_folder';
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    'list_files', 'read_file', 'read_files_batch', 'watch_changes',
  ]);

  private dirHandle: FileSystemDirectoryHandle | null = null;
  private fileHandles: Map<string, FileSystemFileHandle> = new Map();
  private filter: IngestionFilterEngine;
  private changeWatchers: Array<(paths: string[]) => void> = [];

  constructor(private readonly config: ProjectSourceConfig = {}) {
    this.filter = new IngestionFilterEngine(config);
  }

  async connect(): Promise<void> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        'Local folder access requires Chrome or Edge with File System Access API support. ' +
        'Please use a supported browser or upload a ZIP file instead.',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
    await this._scan();
  }

  async cleanup(): Promise<void> {
    this.dirHandle   = null;
    this.fileHandles.clear();
    this.changeWatchers = [];
  }

  async listFiles(options?: ListFilesOptions): Promise<ProjectFileMetadata[]> {
    this._assertConnected();
    const maxFile  = this.config.maxFileSizeBytes ?? 500_000;
    const maxFiles = options?.maxFiles ?? this.config.maxTotalFiles ?? 10_000;
    const result: ProjectFileMetadata[] = [];

    for (const [path, handle] of this.fileHandles) {
      const file = await handle.getFile();
      if (file.size > maxFile) continue;
      if (options?.extensions) {
        const ext = path.split('.').pop() ?? '';
        if (!options.extensions.includes(ext)) continue;
      }
      const base = this.filter.buildMetadata(
        path,
        file.size,
        `local-${file.lastModified}`,
        new Date(file.lastModified).toISOString(),
      );
      const isSensitive = secretScanner.isSensitivePath(path);
      result.push({ ...base, isSensitive });
      if (result.length >= maxFiles) break;
    }

    return result;
  }

  async readFile(path: string): Promise<SourceFileContent> {
    this._assertConnected();
    const handle = this.fileHandles.get(path);
    if (!handle) throw new Error(`Local file not found: ${path}`);

    const file    = await handle.getFile();
    const content = await file.text();

    return {
      path,
      content,
      hash:      quickHash(content),
      sizeBytes: file.size,
    };
  }

  async readFiles(paths: string[]): Promise<SourceFileContent[]> {
    const results: SourceFileContent[] = [];
    await Promise.allSettled(
      paths.map(async p => {
        try {
          results.push(await this.readFile(p));
        } catch { /* skip */ }
      }),
    );
    return results;
  }

  async getMetadata(): Promise<ProjectSourceMetadata> {
    const name = this.dirHandle?.name ?? 'Local Folder';
    return {
      kind:        this.kind,
      displayName: name,
      totalFiles:  this.fileHandles.size,
    };
  }

  watchChanges(callback: (changedPaths: string[]) => void): () => void {
    this.changeWatchers.push(callback);
    return () => {
      this.changeWatchers = this.changeWatchers.filter(c => c !== callback);
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _scan(): Promise<void> {
    if (!this.dirHandle) return;
    this.fileHandles.clear();
    const maxFiles = this.config.maxTotalFiles ?? 10_000;

    for await (const { path, handle } of walkDirectory(this.dirHandle, '')) {
      if (this.filter.shouldExclude(path)) continue;
      this.fileHandles.set(path, handle);
      if (this.fileHandles.size >= maxFiles) break;
    }
  }

  private _assertConnected(): void {
    if (!this.dirHandle) throw new Error('LocalProjectSourceProvider: call connect() first');
  }
}
