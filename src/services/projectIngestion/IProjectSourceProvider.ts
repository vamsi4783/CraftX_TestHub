// ─── M10: IProjectSourceProvider — source-provider abstraction ───────────────
// All project source types implement this interface.
// The ingestion engine only speaks IProjectSourceProvider — it never depends
// on GitHub, Google Drive, OneDrive, or any specific provider directly.

import type {
  ProjectSourceKind,
  ProjectSourceMetadata,
  ProjectFileMetadata,
  ListFilesOptions,
} from './types.js';

// ─── File content ─────────────────────────────────────────────────────────────

export interface SourceFileContent {
  path:      string;
  content:   string;   // UTF-8 text only; binary files are excluded
  hash:      string;
  sizeBytes: number;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export type ProviderCapability =
  | 'list_files'
  | 'read_file'
  | 'read_files_batch'
  | 'diff_refs'           // get changed files between two git refs
  | 'watch_changes'       // filesystem change events (local folder only)
  | 'incremental_index';  // can supply a delta rather than full re-scan

// ─── IProjectSourceProvider ───────────────────────────────────────────────────

export interface IProjectSourceProvider {
  readonly kind:         ProjectSourceKind;
  readonly capabilities: ReadonlySet<ProviderCapability>;

  /**
   * One-time setup: authenticate, clone, mount, decompress.
   * Must be called before listFiles() or readFile().
   */
  connect(): Promise<void>;

  /**
   * Release all resources: close handles, delete temp files, clear in-memory data.
   * Safe to call multiple times.
   */
  cleanup(): Promise<void>;

  /**
   * Enumerate files subject to built-in ignore rules (binary, oversized).
   * The IngestionFilterEngine applies project-specific rules on top of this list.
   */
  listFiles(options?: ListFilesOptions): Promise<ProjectFileMetadata[]>;

  /**
   * Read a single text file. Throws if the file is binary or not found.
   * Never call this for files marked isBinary or isIgnored.
   */
  readFile(path: string): Promise<SourceFileContent>;

  /**
   * Read multiple files efficiently (batch).
   * Implementations should parallelise requests where the source allows it.
   */
  readFiles(paths: string[]): Promise<SourceFileContent[]>;

  /**
   * Return source metadata for display and persistence.
   */
  getMetadata(): Promise<ProjectSourceMetadata>;

  /**
   * Optional: return the list of file paths that changed between two refs.
   * Only available when the 'diff_refs' capability is present.
   */
  getChangedFiles?(fromRef: string, toRef: string): Promise<string[]>;

  /**
   * Optional: subscribe to filesystem changes.
   * Only available when the 'watch_changes' capability is present.
   * Returns an unsubscribe function.
   */
  watchChanges?(callback: (changedPaths: string[]) => void): () => void;
}

// ─── Factory helper ───────────────────────────────────────────────────────────

export class ProviderNotImplementedError extends Error {
  constructor(kind: ProjectSourceKind) {
    super(`ProjectSourceProvider for "${kind}" is not yet implemented in this version of TestHub.`);
    this.name = 'ProviderNotImplementedError';
  }
}
