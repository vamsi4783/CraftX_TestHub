// ─── M10: GitHubProjectSourceProvider — GitHub REST API ──────────────────────
// Uses the GitHub REST API (tree + contents) — no git clone, no CORS proxy.
// Rate-limit aware. PAT is held only in memory for the session; never stored.

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

interface GitTreeEntry {
  path:  string;
  type:  'blob' | 'tree';
  size?: number;
  sha:   string;
  url:   string;
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

/** Parse "github.com/owner/repo[@ref]" or "https://github.com/owner/repo/tree/ref" */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | null {
  let url = input.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo  = parts[1].replace(/\.git$/, '');
    let ref: string | undefined;
    if (parts[2] === 'tree' && parts[3]) ref = parts[3];
    return { owner, repo, ref };
  } catch {
    return null;
  }
}

export class GitHubProjectSourceProvider implements IProjectSourceProvider {
  readonly kind: ProjectSourceKind = 'github';
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    'list_files', 'read_file', 'read_files_batch', 'diff_refs',
  ]);

  private tree: GitTreeEntry[] = [];
  private headSha: string | null = null;
  private filter: IngestionFilterEngine;
  private readonly baseUrl = 'https://api.github.com';

  constructor(
    private readonly owner: string,
    private readonly repo:  string,
    private readonly ref:   string = 'HEAD',
    private readonly pat:   string | null = null,   // held in memory only
    private readonly config: ProjectSourceConfig = {},
  ) {
    this.filter = new IngestionFilterEngine(config);
  }

  async connect(): Promise<void> {
    // Resolve the ref to a SHA
    const branchData = await this._get(`/repos/${this.owner}/${this.repo}/commits/${this.ref}`);
    this.headSha = String(branchData.sha);

    // Fetch the recursive tree
    const treeData = await this._get(
      `/repos/${this.owner}/${this.repo}/git/trees/${this.headSha}?recursive=1`,
    );

    if (treeData.truncated) {
      console.warn(`[M10] GitHub tree truncated for ${this.owner}/${this.repo} — only partial index`);
    }

    this.tree = (treeData.tree ?? []) as GitTreeEntry[];

    // Respect .gitignore if present
    const gitignoreEntry = this.tree.find(e => e.path === '.gitignore' && e.type === 'blob');
    if (gitignoreEntry) {
      try {
        const content = await this.readFile('.gitignore');
        this.filter = this.filter.withGitignore(content.content);
      } catch { /* skip */ }
    }
  }

  async cleanup(): Promise<void> {
    this.tree    = [];
    this.headSha = null;
  }

  async listFiles(options?: ListFilesOptions): Promise<ProjectFileMetadata[]> {
    this._assertConnected();
    const maxFile  = this.config.maxFileSizeBytes ?? 500_000;
    const maxFiles = options?.maxFiles ?? this.config.maxTotalFiles ?? 10_000;
    const result: ProjectFileMetadata[] = [];

    for (const entry of this.tree) {
      if (entry.type !== 'blob') continue;
      if ((entry.size ?? 0) > maxFile) continue;

      if (options?.extensions) {
        const ext = entry.path.split('.').pop() ?? '';
        if (!options.extensions.includes(ext)) continue;
      }

      const base = this.filter.buildMetadata(
        entry.path,
        entry.size ?? 0,
        entry.sha.slice(0, 16),
      );
      const isSensitive = secretScanner.isSensitivePath(entry.path);
      result.push({ ...base, isSensitive });
      if (result.length >= maxFiles) break;
    }

    return result;
  }

  async readFile(path: string): Promise<SourceFileContent> {
    this._assertConnected();
    const data = await this._get(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.headSha}`,
    );

    const encoding = String(data.encoding);
    if (encoding !== 'base64') {
      throw new Error(`Unexpected encoding for ${path}: ${encoding}`);
    }
    const rawContent = String(data.content).replace(/\n/g, '');
    const content = atob(rawContent);

    return {
      path,
      content,
      hash:      quickHash(content),
      sizeBytes: typeof data.size === 'number' ? data.size : content.length,
    };
  }

  async readFiles(paths: string[]): Promise<SourceFileContent[]> {
    // GitHub has rate limits — process in small concurrent batches
    const BATCH = 5;
    const results: SourceFileContent[] = [];
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(p => this.readFile(p)));
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }
    return results;
  }

  async getChangedFiles(fromRef: string, toRef: string): Promise<string[]> {
    const data = await this._get(
      `/repos/${this.owner}/${this.repo}/compare/${fromRef}...${toRef}`,
    );
    return (Array.isArray(data.files) ? data.files : []).map((f: { filename: string }) => f.filename);
  }

  async getMetadata(): Promise<ProjectSourceMetadata> {
    return {
      kind:        this.kind,
      displayName: `${this.owner}/${this.repo}`,
      remoteUrl:   `https://github.com/${this.owner}/${this.repo}`,
      branch:      this.ref,
      headRef:     this.headSha ?? undefined,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _get(path: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Accept':     'application/vnd.github.v3+json',
      'User-Agent': 'TestHub-M10',
    };
    if (this.pat) headers['Authorization'] = `Bearer ${this.pat}`;

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      const remaining = res.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const reset = res.headers.get('X-RateLimit-Reset');
        const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : 'soon';
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}. Add a Personal Access Token for higher limits.`);
      }
    }
    if (res.status === 404) {
      throw new Error(`GitHub: not found — ${url}. Check the repository is public or that your PAT has access.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  private _assertConnected(): void {
    if (!this.headSha) {
      throw new Error('GitHubProjectSourceProvider: call connect() first');
    }
  }
}
