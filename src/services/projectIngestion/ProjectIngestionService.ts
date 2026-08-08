// ─── M10: ProjectIngestionService — full ingestion pipeline orchestrator ──────
// STATE MACHINE: SOURCE_CONNECTED → SCANNING → FILTERING → ANALYZING →
//                INDEXING → UNDERSTANDING → READY
// Raw source content is NEVER written to Supabase. Temp data cleared after each phase.

import type { IProjectSourceProvider } from './IProjectSourceProvider.js';
import type {
  IngestionProgress,
  IngestionStatus,
  ProjectFileMetadata,
  ProjectSourceConfig,
  FileIndexEntry,
} from './types.js';
import { IngestionFilterEngine } from './IngestionFilterEngine.js';
import { ProjectStructureAnalyzer } from './ProjectStructureAnalyzer.js';
import { ProjectKnowledgeBuilder } from './ProjectKnowledgeBuilder.js';
import { secretScanner } from './SecretScanner.js';
import {
  createProjectSource,
  updateSourceStatus,
  upsertFileIndex,
  upsertProjectKnowledge,
} from './projectIngestionDbService.js';

const MANIFEST_FILENAMES = new Set([
  'package.json', 'pubspec.yaml', 'build.gradle', 'build.gradle.kts',
  'settings.gradle', 'pom.xml', 'requirements.txt', 'Cargo.toml',
  'go.mod', 'AndroidManifest.xml', 'Info.plist',
]);

const MAX_SUMMARY_FILES = 500; // read content for at most this many files for knowledge building

export type IngestionProgressCallback = (progress: IngestionProgress) => void;

export interface IngestionResult {
  sourceId:   string;
  status:     IngestionStatus;
  stats: {
    total:      number;
    indexed:    number;
    ignored:    number;
    sensitive:  number;
    errors:     number;
  };
}

export class ProjectIngestionService {
  private abortController: AbortController | null = null;
  private startedAt = 0;

  constructor(
    private readonly structureAnalyzer = new ProjectStructureAnalyzer(),
    private readonly knowledgeBuilder  = new ProjectKnowledgeBuilder(),
  ) {}

  /** Cancel an in-progress ingestion. */
  cancel(): void {
    this.abortController?.abort();
  }

  async ingest(
    projectId:   string,
    projectName: string,
    provider:    IProjectSourceProvider,
    config:      ProjectSourceConfig = {},
    onProgress?: IngestionProgressCallback,
  ): Promise<IngestionResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.startedAt = Date.now();

    const emit = (status: IngestionStatus, phase: string, partial: Partial<IngestionProgress> = {}) => {
      onProgress?.({
        status,
        phase,
        filesFound:    0,
        filesFiltered: 0,
        filesIndexed:  0,
        filesAnalyzed: 0,
        errorCount:    0,
        message:       phase,
        cancellable:   true,
        elapsedMs:     Date.now() - this.startedAt,
        ...partial,
      });
    };

    // ── 0. Create DB record ───────────────────────────────────────────────────
    const meta = await provider.getMetadata();
    const dbRecord = await createProjectSource(
      projectId, provider.kind, meta.displayName, config,
      meta.remoteUrl, meta.branch,
    );
    const sourceId = dbRecord.id;

    try {
      // ── 1. Connect ────────────────────────────────────────────────────────
      emit('source_connected', 'Connecting to source…');
      await provider.connect();
      this._checkAbort(signal);

      // ── 2. Scan ───────────────────────────────────────────────────────────
      emit('scanning', 'Scanning files…');
      const allFiles = await provider.listFiles({
        maxFiles:     config.maxTotalFiles,
        maxSizeBytes: config.maxFileSizeBytes,
      });
      this._checkAbort(signal);

      emit('scanning', `Found ${allFiles.length} files`, { filesFound: allFiles.length });

      // ── 3. Filter ─────────────────────────────────────────────────────────
      emit('filtering', 'Applying include/exclude rules…');
      const filter = new IngestionFilterEngine(config);

      const filtered: ProjectFileMetadata[] = [];
      const errorPaths: string[] = [];
      let sensitiveCount = 0;
      let ignoredCount   = 0;

      for (const f of allFiles) {
        if (f.isIgnored) { ignoredCount++; continue; }
        if (f.isBinary)  { ignoredCount++; continue; }

        // Re-check sensitive path names
        const isSensitive = f.isSensitive || secretScanner.isSensitivePath(f.path);
        if (isSensitive) {
          sensitiveCount++;
          filtered.push({ ...f, isSensitive: true, isIgnored: true });
          ignoredCount++;
          continue;
        }

        filtered.push(f);
      }

      const included = filtered.filter(f => !f.isIgnored);
      this._checkAbort(signal);

      emit('filtering', `${included.length} files included`, {
        filesFound:    allFiles.length,
        filesFiltered: included.length,
      });

      // ── 4. Read manifest files ────────────────────────────────────────────
      emit('analyzing', 'Reading manifest files…');
      const manifestPaths = included
        .filter(f => MANIFEST_FILENAMES.has(f.name))
        .map(f => f.path);

      const manifests = await provider.readFiles(manifestPaths).catch(() => []);
      this._checkAbort(signal);

      // ── 5. Structure analysis ─────────────────────────────────────────────
      emit('analyzing', 'Analyzing project structure…');
      const structure = this.structureAnalyzer.analyze(included, manifests);
      this._checkAbort(signal);

      // ── 6. Build file index ───────────────────────────────────────────────
      emit('indexing', 'Building file index…');
      const entries: FileIndexEntry[] = included.map(f => {
        const e: FileIndexEntry = {
          p: f.path,
          s: f.sizeBytes,
          h: f.hash,
          l: f.language !== 'Unknown' ? f.language : f.extension,
          c: f.category,
          i: f.importance,
        };
        if (f.isBinary)    e.b  = 1;
        if (f.isIgnored)   e.x  = 1;
        if (f.isTest)      e.t  = 1;
        if (f.isSensitive) e.se = 1;
        return e;
      });

      await upsertFileIndex({
        source_id:       sourceId,
        project_id:      projectId,
        indexed_at:      new Date().toISOString(),
        head_ref:        meta.headRef ?? null,
        schema_version:  1,
        total_files:     allFiles.length,
        ignored_files:   ignoredCount,
        binary_files:    included.filter(f => f.isBinary).length,
        sensitive_files: sensitiveCount,
        total_size_bytes: included.reduce((s, f) => s + f.sizeBytes, 0),
        language_stats:  structure.languageStats,
        entries,
        error_paths:     errorPaths,
      });

      this._checkAbort(signal);
      emit('indexing', `Indexed ${entries.length} files`, { filesIndexed: entries.length });

      // ── 7. Build knowledge (read source content — in-memory only) ─────────
      emit('understanding', 'Building project knowledge…');
      const toRead = included
        .filter(f => !f.isBinary && !f.isSensitive && f.category === 'source')
        .sort((a, b) => {
          const rank = { critical: 4, high: 3, medium: 2, low: 1, ignore: 0 };
          return rank[b.importance] - rank[a.importance];
        })
        .slice(0, MAX_SUMMARY_FILES)
        .map(f => f.path);

      const sourceContents = await provider.readFiles(toRead).catch(() => []);
      this._checkAbort(signal);

      const knowledge = this.knowledgeBuilder.buildKnowledge(
        projectId, sourceId, projectName,
        filtered, sourceContents, structure,
      );

      // Source contents are no longer referenced after this point — GC'd.
      await upsertProjectKnowledge(knowledge);

      // ── 8. Finalize ───────────────────────────────────────────────────────
      await updateSourceStatus(sourceId, 'ready', {
        total_files:     allFiles.length,
        indexed_files:   included.length,
        ignored_files:   ignoredCount,
        sensitive_files: sensitiveCount,
        last_indexed_at: new Date().toISOString(),
        head_ref:        meta.headRef ?? null,
      });

      emit('ready', 'Ingestion complete', {
        filesFound:    allFiles.length,
        filesIndexed:  included.length,
        filesFiltered: ignoredCount,
        filesAnalyzed: sourceContents.length,
        cancellable:   false,
      });

      return {
        sourceId,
        status: 'ready',
        stats: {
          total:     allFiles.length,
          indexed:   included.length,
          ignored:   ignoredCount,
          sensitive: sensitiveCount,
          errors:    errorPaths.length,
        },
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const wasCancelled = (err as Error)?.name === 'AbortError';
      const finalStatus: IngestionStatus = wasCancelled ? 'cancelled' : 'failed';

      await updateSourceStatus(sourceId, finalStatus, { error_message: msg }).catch(() => {});

      emit(finalStatus, wasCancelled ? 'Ingestion cancelled' : `Error: ${msg}`, {
        cancellable: false,
      });

      return {
        sourceId,
        status: finalStatus,
        stats:  { total: 0, indexed: 0, ignored: 0, sensitive: 0, errors: 1 },
      };
    } finally {
      await provider.cleanup().catch(() => {});
    }
  }

  private _checkAbort(signal: AbortSignal): void {
    if (signal.aborted) {
      const err = new Error('Ingestion cancelled by user');
      err.name = 'AbortError';
      throw err;
    }
  }
}

export const projectIngestionService = new ProjectIngestionService();
