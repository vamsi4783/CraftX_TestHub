// ─── M10: OneDriveProjectSourceProvider — stub (future milestone) ────────────
// Full implementation requires Microsoft Graph API OAuth.

import type { IProjectSourceProvider, ProviderCapability, SourceFileContent } from '../IProjectSourceProvider.js';
import type {
  ProjectSourceKind,
  ProjectFileMetadata,
  ProjectSourceMetadata,
  ListFilesOptions,
} from '../types.js';
import { ProviderNotImplementedError } from '../IProjectSourceProvider.js';

export class OneDriveProjectSourceProvider implements IProjectSourceProvider {
  readonly kind: ProjectSourceKind = 'onedrive';
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set<ProviderCapability>();

  async connect(): Promise<void> {
    throw new ProviderNotImplementedError('onedrive');
  }

  async cleanup(): Promise<void> {}

  async listFiles(_options?: ListFilesOptions): Promise<ProjectFileMetadata[]> {
    throw new ProviderNotImplementedError('onedrive');
  }

  async readFile(_path: string): Promise<SourceFileContent> {
    throw new ProviderNotImplementedError('onedrive');
  }

  async readFiles(_paths: string[]): Promise<SourceFileContent[]> {
    throw new ProviderNotImplementedError('onedrive');
  }

  async getMetadata(): Promise<ProjectSourceMetadata> {
    return {
      kind:        this.kind,
      displayName: 'OneDrive (not yet implemented)',
    };
  }
}
