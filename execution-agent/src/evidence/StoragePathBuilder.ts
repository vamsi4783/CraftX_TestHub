// ─── Storage Path Builder ─────────────────────────────────────────────────────
// Deterministic, timestamp-free path:
//   {organizationId}/{projectId}/{executionId}/{stepId}/{evidenceId}.{ext}
//
// Rules:
//   - No timestamps anywhere in the path
//   - The evidenceId is the uniqueness guarantee (UUID v7)
//   - Path segments are lowercased and stripped of characters unsafe for storage URLs

/** Map from MIME type to file extension. */
const MIME_TO_EXT: Record<string, string> = {
  'image/png':        'png',
  'image/jpeg':       'jpg',
  'image/webp':       'webp',
  'text/plain':       'txt',
  'text/html':        'html',
  'application/xml':  'xml',
  'text/xml':         'xml',
  'application/json': 'json',
  'video/mp4':        'mp4',
  'video/webm':       'webm',
};

/** Fallback extension when MIME type is not in the map. */
const FALLBACK_EXT = 'bin';

/**
 * Returns the file extension for a given MIME type.
 * Falls back to 'bin' for unknown types.
 */
export function mimeTypeToExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase().trim()] ?? FALLBACK_EXT;
}

/**
 * Sanitise a path segment: lowercase, replace non-word chars with underscores.
 * Does NOT strip hyphens (UUIDs use them).
 */
function sanitise(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '_');
}

export interface StoragePathParams {
  organizationId: string;
  projectId:      string;
  executionId:    string;
  stepId:         string;
  evidenceId:     string;
  mimeType:       string;
}

/**
 * Build the deterministic storage path for an evidence item.
 *
 * Format: {org}/{project}/{execution}/{step}/{evidenceId}.{ext}
 *
 * No timestamps appear anywhere — the evidenceId (UUID v7) provides uniqueness
 * and ordering is derived from its embedded timestamp when needed.
 */
export function buildStoragePath(params: StoragePathParams): string {
  const ext = mimeTypeToExtension(params.mimeType);
  return [
    sanitise(params.organizationId),
    sanitise(params.projectId),
    sanitise(params.executionId),
    sanitise(params.stepId),
    `${sanitise(params.evidenceId)}.${ext}`,
  ].join('/');
}
