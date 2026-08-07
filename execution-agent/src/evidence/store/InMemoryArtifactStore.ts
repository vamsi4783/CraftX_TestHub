// ─── InMemoryArtifactStore ────────────────────────────────────────────────────
// Test double and local-run implementation of IArtifactStore.
// Stores blobs in a Map<path, Buffer>; returns memory:// URLs.

import type { IArtifactStore, ArtifactUploadResult } from './IArtifactStore.js';

export class InMemoryArtifactStore implements IArtifactStore {
  private readonly _blobs  = new Map<string, Buffer>();
  private readonly _mimes  = new Map<string, string>();

  /** Number of upload() calls made (for assertion in tests). */
  uploadCallCount = 0;
  /** Number of delete() calls made. */
  deleteCallCount = 0;

  /**
   * Simulated failure mode.
   * When set, the next upload() throws this error instead of storing the blob.
   * The value is cleared after one use (one-shot failure).
   */
  nextUploadError: Error | null = null;

  async upload(path: string, data: Buffer, mimeType: string): Promise<ArtifactUploadResult> {
    this.uploadCallCount++;

    if (this.nextUploadError) {
      const err = this.nextUploadError;
      this.nextUploadError = null;
      throw err;
    }

    this._blobs.set(path, Buffer.from(data));
    this._mimes.set(path, mimeType);

    return {
      url:         this.getUrl(path),
      path,
      size_bytes:  data.byteLength,
      uploaded_at: new Date().toISOString(),
    };
  }

  async exists(path: string): Promise<boolean> {
    return this._blobs.has(path);
  }

  async delete(path: string): Promise<void> {
    this.deleteCallCount++;
    this._blobs.delete(path);
    this._mimes.delete(path);
  }

  getUrl(path: string): string {
    return `memory://evidence-bucket/${path}`;
  }

  // ─── Test helpers ──────────────────────────────────────────────────────────

  /** Retrieve the stored blob for a path (for assertion). */
  getBlob(path: string): Buffer | undefined {
    return this._blobs.get(path);
  }

  /** All stored paths, in insertion order. */
  storedPaths(): string[] {
    return Array.from(this._blobs.keys());
  }

  /** Total number of blobs currently in store. */
  size(): number {
    return this._blobs.size;
  }

  /** Clear all stored blobs. */
  clear(): void {
    this._blobs.clear();
    this._mimes.clear();
    this.uploadCallCount = 0;
    this.deleteCallCount = 0;
    this.nextUploadError = null;
  }
}
