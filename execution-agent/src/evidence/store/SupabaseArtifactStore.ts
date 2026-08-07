// ─── SupabaseArtifactStore ────────────────────────────────────────────────────
// Adapter: translates IArtifactStore calls to Supabase Storage API calls.
// EvidenceManager never imports @supabase/supabase-js directly.
//
// Phase 3: adapter shape only — methods throw NotImplementedError so the build
// stays green. Phase 4: replace each stub with a real Supabase Storage call.

import type { IArtifactStore, ArtifactUploadResult } from './IArtifactStore.js';

// ─── Minimal Supabase Storage client shape ────────────────────────────────────
// We type only what we need so the adapter doesn't depend on the full SDK shape.

interface SupabaseStorageClient {
  from(bucket: string): {
    upload(
      path: string,
      data: Buffer,
      options?: { contentType?: string; upsert?: boolean },
    ): Promise<{ data: { path: string } | null; error: Error | null }>;
    remove(paths: string[]): Promise<{ error: Error | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
    list(prefix?: string): Promise<{ data: Array<{ name: string }> | null; error: Error | null }>;
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class SupabaseArtifactStore implements IArtifactStore {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket:  string,
    /** Public base URL for the Supabase project (e.g. https://xxx.supabase.co). */
    private readonly projectUrl: string,
  ) {}

  async upload(path: string, data: Buffer, mimeType: string): Promise<ArtifactUploadResult> {
    const { data: result, error } = await this.storage
      .from(this.bucket)
      .upload(path, data, { contentType: mimeType, upsert: false });

    if (error || !result) {
      throw new Error(`SupabaseArtifactStore upload failed: ${error?.message ?? 'unknown'}`);
    }

    return {
      url:         this.getUrl(path),
      path:        result.path,
      size_bytes:  data.byteLength,
      uploaded_at: new Date().toISOString(),
    };
  }

  async exists(path: string): Promise<boolean> {
    // Supabase Storage has no direct head(); list the prefix and check for the filename.
    const segments = path.split('/');
    const fileName = segments.pop() ?? '';
    const prefix   = segments.join('/');

    const { data, error } = await this.storage.from(this.bucket).list(prefix);
    if (error || !data) return false;
    return data.some(f => f.name === fileName);
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new Error(`SupabaseArtifactStore delete failed: ${error.message}`);
    }
  }

  getUrl(path: string): string {
    return `${this.projectUrl}/storage/v1/object/public/${this.bucket}/${path}`;
  }
}
