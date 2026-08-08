// ─── M10: projectIngestionDbService — Supabase CRUD for M10 tables ────────────
// Manages project_sources, project_file_indexes, project_knowledge.
// RAW SOURCE CONTENT IS NEVER WRITTEN. Only compact metadata.

import { supabase } from '../../lib/supabase.js';
import type {
  ProjectSourceRecord,
  ProjectFileIndexRecord,
  ProjectKnowledge,
  IngestionStatus,
  ProjectSourceConfig,
  ProjectSourceKind,
} from './types.js';

// ─── project_sources ──────────────────────────────────────────────────────────

export async function upsertProjectSource(
  record: Omit<ProjectSourceRecord, 'created_at' | 'updated_at'>,
): Promise<ProjectSourceRecord> {
  const { data, error } = await supabase
    .from('project_sources')
    .upsert({ ...record, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(`upsertProjectSource: ${error.message}`);
  return data as ProjectSourceRecord;
}

export async function createProjectSource(
  projectId:   string,
  kind:        ProjectSourceKind,
  displayName: string,
  config:      ProjectSourceConfig = {},
  remoteUrl?:  string,
  branch?:     string,
): Promise<ProjectSourceRecord> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('project_sources')
    .insert({
      project_id:   projectId,
      kind,
      display_name: displayName,
      remote_url:   remoteUrl ?? null,
      branch:       branch ?? null,
      head_ref:     null,
      status:       'never' as IngestionStatus,
      error_message: null,
      config,
      created_at:   now,
      updated_at:   now,
    })
    .select()
    .single();
  if (error) throw new Error(`createProjectSource: ${error.message}`);
  return data as ProjectSourceRecord;
}

export async function updateSourceStatus(
  sourceId:  string,
  status:    IngestionStatus,
  extras:    Partial<Pick<ProjectSourceRecord,
    'error_message' | 'total_files' | 'indexed_files' | 'ignored_files' |
    'sensitive_files' | 'total_size_bytes' | 'last_indexed_at' | 'head_ref'
  >> = {},
): Promise<void> {
  const { error } = await supabase
    .from('project_sources')
    .update({ status, ...extras, updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) throw new Error(`updateSourceStatus: ${error.message}`);
}

export async function getProjectSources(
  projectId: string,
): Promise<ProjectSourceRecord[]> {
  const { data, error } = await supabase
    .from('project_sources')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getProjectSources: ${error.message}`);
  return (data ?? []) as ProjectSourceRecord[];
}

export async function deleteProjectSource(sourceId: string): Promise<void> {
  // Cascade deletes project_file_indexes rows via FK
  const { error } = await supabase
    .from('project_sources')
    .delete()
    .eq('id', sourceId);
  if (error) throw new Error(`deleteProjectSource: ${error.message}`);
}

// ─── project_file_indexes ─────────────────────────────────────────────────────

export async function upsertFileIndex(
  record: Omit<ProjectFileIndexRecord, 'id'> & { id?: string },
): Promise<void> {
  const { error } = await supabase
    .from('project_file_indexes')
    .upsert(record, { onConflict: 'source_id' });
  if (error) throw new Error(`upsertFileIndex: ${error.message}`);
}

export async function getFileIndex(
  sourceId: string,
): Promise<ProjectFileIndexRecord | null> {
  const { data, error } = await supabase
    .from('project_file_indexes')
    .select('*')
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) throw new Error(`getFileIndex: ${error.message}`);
  return (data ?? null) as ProjectFileIndexRecord | null;
}

export async function deleteFileIndex(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('project_file_indexes')
    .delete()
    .eq('source_id', sourceId);
  if (error) throw new Error(`deleteFileIndex: ${error.message}`);
}

// ─── project_knowledge ────────────────────────────────────────────────────────

export async function upsertProjectKnowledge(
  knowledge: ProjectKnowledge,
): Promise<void> {
  const row = {
    project_id:    knowledge.projectId,
    source_id:     knowledge.sourceId,
    schema_version: knowledge.schemaVersion,
    generated_at:  knowledge.generatedAt,
    name:          knowledge.name,
    description:   knowledge.description,
    purpose:       knowledge.purpose,
    languages:     knowledge.languages,
    frameworks:    knowledge.frameworks,
    build_system:  knowledge.buildSystem,
    test_frameworks: knowledge.testFrameworks,
    architecture_style: knowledge.architectureStyle,
    code_modules:  knowledge.codeModules,
    entry_points:  knowledge.entryPoints,
    dependencies:  knowledge.dependencies,
    config_files:  knowledge.configFiles,
    existing_test_paths: knowledge.existingTestPaths,
    covered_modules:   knowledge.coveredModules,
    uncovered_modules: knowledge.uncoveredModules,
    coverage_score:    knowledge.coverageScore,
    file_summaries:    knowledge.fileSummaries,
    total_files:       knowledge.totalFiles,
    indexed_files:     knowledge.indexedFiles,
    ignored_files:     knowledge.ignoredFiles,
    sensitive_files:   knowledge.sensitiveFiles,
    language_stats:    knowledge.languageStats,
    updated_at:        new Date().toISOString(),
  };

  const { error } = await supabase
    .from('project_knowledge')
    .upsert(row, { onConflict: 'project_id' });
  if (error) throw new Error(`upsertProjectKnowledge: ${error.message}`);
}

export async function getProjectKnowledge(
  projectId: string,
): Promise<ProjectKnowledge | null> {
  const { data, error } = await supabase
    .from('project_knowledge')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`getProjectKnowledge: ${error.message}`);
  if (!data) return null;

  return {
    projectId:         data.project_id,
    sourceId:          data.source_id,
    generatedAt:       data.generated_at,
    schemaVersion:     data.schema_version,
    name:              data.name,
    description:       data.description,
    purpose:           data.purpose,
    languages:         data.languages,
    frameworks:        data.frameworks,
    buildSystem:       data.build_system,
    testFrameworks:    data.test_frameworks,
    architectureStyle: data.architecture_style,
    codeModules:       data.code_modules,
    entryPoints:       data.entry_points,
    dependencies:      data.dependencies,
    configFiles:       data.config_files,
    existingTestPaths: data.existing_test_paths,
    coveredModules:    data.covered_modules,
    uncoveredModules:  data.uncovered_modules,
    coverageScore:     data.coverage_score,
    fileSummaries:     data.file_summaries,
    totalFiles:        data.total_files,
    indexedFiles:      data.indexed_files,
    ignoredFiles:      data.ignored_files,
    sensitiveFiles:    data.sensitive_files,
    languageStats:     data.language_stats,
  };
}

export async function deleteProjectKnowledge(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('project_knowledge')
    .delete()
    .eq('project_id', projectId);
  if (error) throw new Error(`deleteProjectKnowledge: ${error.message}`);
}
