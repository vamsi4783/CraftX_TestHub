// ─── M10: Project Ingestion Types ────────────────────────────────────────────
// All domain types for the Project Ingestion & Intelligence subsystem.
//
// STORAGE POLICY (enforced architecturally):
//   Raw source file content is NEVER persisted to Supabase.
//   Only compact metadata, hashes, summaries, and symbols are stored.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProjectSourceKind =
  | 'zip'
  | 'local_folder'
  | 'github'
  | 'google_drive'
  | 'onedrive';

export type IngestionStatus =
  | 'never'
  | 'source_connected'
  | 'scanning'
  | 'filtering'
  | 'analyzing'
  | 'indexing'
  | 'understanding'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'stale'
  | 'reindex_required';

export type FileCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'build'
  | 'documentation'
  | 'schema'
  | 'migration'
  | 'asset'
  | 'generated'
  | 'binary'
  | 'dependency'
  | 'ignored';

export type FileImportance =
  | 'critical'   // entry points, main service files
  | 'high'       // important business logic
  | 'medium'     // supporting files
  | 'low'        // utilities, helpers
  | 'ignore';    // excluded from AI context

export type ProjectLanguage =
  | 'TypeScript' | 'JavaScript' | 'Kotlin' | 'Java'
  | 'Swift' | 'Dart' | 'Python' | 'CSharp' | 'Go'
  | 'Rust' | 'Ruby' | 'PHP' | 'Unknown';

// ─── File model ───────────────────────────────────────────────────────────────

/** Rich in-memory file representation built during ingestion. */
export interface ProjectFileMetadata {
  path:          string;        // relative to project root, forward slashes
  name:          string;        // filename only
  extension:     string;        // lowercase, no dot (e.g. "ts", "kt")
  language:      ProjectLanguage;
  sizeBytes:     number;
  hash:          string;        // SHA-256, first 16 hex chars
  category:      FileCategory;
  importance:    FileImportance;
  isGenerated:   boolean;
  isBinary:      boolean;
  isIgnored:     boolean;
  isTest:        boolean;
  isSensitive:   boolean;       // secret/credential pattern detected
  lastModified?: string;        // ISO 8601 if available
}

/** Compact DB representation for JSONB storage (~80 bytes/file). */
export interface FileIndexEntry {
  p:   string;           // path
  s:   number;           // sizeBytes
  h:   string;           // hash (16-char hex)
  l:   string;           // language/extension
  c:   FileCategory;
  i:   FileImportance;
  b?:  1;                // binary
  x?:  1;                // ignored
  t?:  1;                // test file
  se?: 1;                // sensitive
  e?:  1;                // error reading this file
}

// ─── Project structure ────────────────────────────────────────────────────────

/** A logical code module (directory/package level grouping). */
export interface CodeModule {
  id:          string;
  name:        string;          // e.g. 'auth', 'payment'
  path:        string;          // root directory
  filePaths:   string[];
  description: string;
  type:        'feature' | 'core' | 'shared' | 'test' | 'build' | 'config' | 'infrastructure';
  dependsOn:   string[];        // other CodeModule.id values
  fileCount:   number;
  testCount:   number;
}

/** Application entry point. */
export interface EntryPoint {
  path:         string;
  kind:         'main' | 'activity' | 'screen' | 'route' | 'api_handler' | 'test_suite' | 'service';
  name:         string;
  description?: string;
}

/** External dependency (from manifest file). */
export interface ProjectDependency {
  name:    string;
  version: string;
  kind:    'runtime' | 'test' | 'build' | 'peer' | 'dev';
  source:  'npm' | 'gradle' | 'maven' | 'pubspec' | 'pypi' | 'cargo' | 'nuget' | 'other';
}

/** Per-file AI knowledge (compact — purpose + symbols only, no raw source). */
export interface FileSummary {
  path:         string;
  hash:         string;         // for incremental invalidation
  purpose:      string;         // 1-line description
  symbols:      string[];       // exported class/function/component names
  imports:      string[];       // top-level imported module names
  testTargets:  string[];       // what this file tests (for test files)
  moduleId:     string;         // parent CodeModule.id
  tags:         string[];       // searchable labels: 'screen','form','api','service'...
  isSensitive:  boolean;
}

// ─── Project Knowledge (the complete intelligence model) ──────────────────────

export interface ProjectKnowledge {
  projectId:         string;
  sourceId:          string;
  generatedAt:       string;
  schemaVersion:     number;
  // Identity
  name:              string;
  description:       string;
  purpose:           string;
  languages:         string[];
  frameworks:        string[];
  buildSystem:       string | null;
  testFrameworks:    string[];
  architectureStyle: string | null;
  // Structure
  codeModules:       CodeModule[];
  entryPoints:       EntryPoint[];
  dependencies:      ProjectDependency[];
  configFiles:       string[];
  // Test intelligence
  existingTestPaths: string[];
  coveredModules:    string[];
  uncoveredModules:  string[];
  coverageScore:     number;    // 0–1 estimate
  // File intelligence (summaries — NOT raw source)
  fileSummaries:     FileSummary[];
  // Stats
  totalFiles:        number;
  indexedFiles:      number;
  ignoredFiles:      number;
  sensitiveFiles:    number;
  languageStats:     Record<string, number>;
}

// ─── AI context retrieval ─────────────────────────────────────────────────────

export interface ProjectContextQuery {
  projectId:      string;
  feature?:       string;       // e.g. "payment", "login"
  filePaths?:     string[];     // specific files
  moduleIds?:     string[];     // specific modules
  maxTokens?:     number;       // default 32_000
  includeTests?:  boolean;
}

/** Assembled context fed to the AI model — replaces manual file paste. */
export interface ProjectContext {
  projectName:      string;
  projectSummary:   string;
  architecture:     string | null;
  techStack:        string;
  relevantModules:  CodeModule[];
  relevantFiles:    FileSummary[];
  dependencies:     ProjectDependency[];
  existingTests:    string[];
  tokenEstimate:    number;
}

// ─── Source metadata ──────────────────────────────────────────────────────────

export interface ProjectSourceMetadata {
  kind:              ProjectSourceKind;
  displayName:       string;
  remoteUrl?:        string;
  branch?:           string;
  headRef?:          string;
  totalFiles?:       number;
  totalSizeBytes?:   number;
}

export interface ProjectSourceConfig {
  maxFileSizeBytes?:     number;     // default 500_000 (500 KB)
  maxTotalFiles?:        number;     // default 10_000
  maxTotalSizeBytes?:    number;     // default 100_000_000 (100 MB)
  maxIngestionTimeMs?:   number;     // default 120_000 (2 min)
  extraIgnorePatterns?:  string[];
  includePatterns?:      string[];
}

// ─── DB record shapes ─────────────────────────────────────────────────────────

export interface ProjectSourceRecord {
  id:               string;
  project_id:       string;
  kind:             ProjectSourceKind;
  display_name:     string;
  remote_url:       string | null;
  branch:           string | null;
  head_ref:         string | null;
  status:           IngestionStatus;
  error_message:    string | null;
  total_files:      number | null;
  indexed_files:    number | null;
  ignored_files:    number | null;
  sensitive_files:  number | null;
  total_size_bytes: number | null;
  last_indexed_at:  string | null;
  config:           ProjectSourceConfig;
  created_at:       string;
  updated_at:       string;
}

export interface ProjectFileIndexRecord {
  id:               string;
  source_id:        string;
  project_id:       string;
  indexed_at:       string;
  head_ref:         string | null;
  schema_version:   number;
  total_files:      number;
  ignored_files:    number;
  binary_files:     number;
  sensitive_files:  number;
  total_size_bytes: number;
  language_stats:   Record<string, number>;
  entries:          FileIndexEntry[];
  error_paths:      string[];
}

// ─── Ingestion progress ───────────────────────────────────────────────────────

export interface IngestionProgress {
  status:         IngestionStatus;
  phase:          string;
  filesFound:     number;
  filesFiltered:  number;
  filesIndexed:   number;
  filesAnalyzed:  number;
  errorCount:     number;
  message:        string;
  cancellable:    boolean;
  elapsedMs:      number;
}

// ─── Secret scanning ─────────────────────────────────────────────────────────

export interface SecretFinding {
  type:    string;
  pattern: string;
  line?:   number;
  preview: string;   // redacted, safe to log (e.g. "sk-...abc")
}

// ─── List files options ───────────────────────────────────────────────────────

export interface ListFilesOptions {
  maxFiles?:         number;
  maxSizeBytes?:     number;
  includeIgnored?:   boolean;
  extensions?:       string[];
}
