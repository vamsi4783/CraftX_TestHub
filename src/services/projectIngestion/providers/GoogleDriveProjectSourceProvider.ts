// ─── M10: GoogleDriveProjectSourceProvider — stub (future milestone) ─────────
// Full implementation requires Google Drive API OAuth + Picker API.
// This stub satisfies the IProjectSourceProvider interface so the pipeline
// can be tested end-to-end without real Drive access.

import type { IProjectSourceProvider, ProviderCapability, SourceFileContent } from '../IProjectSourceProvider.js';
import type {
  ProjectSourceKind,
  ProjectFileMetadata,
  ProjectSourceMetadata,
  ListFilesOptions,
} from '../types.js';
import { ProviderNotImplementedError } from '../IProjectSourceProvider.js';

export class GoogleDriveProjectSourceProvider implements IProjectSourceProvider {
  readonly kind: ProjectSourceKind = 'google_drive';
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set<ProviderCapability>();

  async connect(): Promise<void> {
    throw new ProviderNotImplementedError('google_drive');
  }

  async cleanup(): Promise<void> {
    // Nothing to clean up in a stub
  }

  async listFiles(_options?: ListFilesOptions): Promise<ProjectFileMetadata[]> {
    throw new ProviderNotImplementedError('google_drive');
  }

  async readFile(_path: string): Promise<SourceFileContent> {
    throw new ProviderNotImplementedError('google_drive');
  }

  async readFiles(_paths: string[]): Promise<SourceFileContent[]> {
    throw new ProviderNotImplementedError('google_drive');
  }

  async getMetadata(): Promise<ProjectSourceMetadata> {
    return {
      kind:        this.kind,
      displayName: 'Google Drive (not yet implemented)',
    };
  }
}
