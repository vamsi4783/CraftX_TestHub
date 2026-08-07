// ─── IArtifactStore — Artifact Store Abstraction ─────────────────────────────
// EvidenceManager speaks ONLY to this interface.
// No Supabase SDK calls inside EvidenceManager itself.

export interface ArtifactUploadResult {
  /** Public or signed URL for retrieval. */
  url:           string;
  /** Storage path as accepted (may differ from requested if store normalises it). */
  path:          string;
  size_bytes:    number;
  uploaded_at:   string;  // ISO8601Z
}

export interface IArtifactStore {
  /**
   * Upload raw bytes to the given path.
   * Throws on any storage failure so callers can apply retry logic.
   */
  upload(path: string, data: Buffer, mimeType: string): Promise<ArtifactUploadResult>;

  /** Return true if an object exists at path. */
  exists(path: string): Promise<boolean>;

  /** Delete the object at path. No-op if path does not exist. */
  delete(path: string): Promise<void>;

  /**
   * Return a retrieval URL for a path without uploading.
   * Useful for generating links to already-uploaded evidence.
   */
  getUrl(path: string): string;
}
