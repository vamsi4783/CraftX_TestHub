// ─── JSON Import Service (M12 Phase C) ───────────────────────────────────────
// Parses an arbitrary JSON structure into canonical DraftTestCases via the
// TestCaseNormalizer, then saves accepted cases through the standard
// testCaseService.create() path (same as manual creation).
//
// Supported input shapes:
//  - Array of test case objects:  [...]
//  - Wrapped object:              { test_cases: [...] } | { cases: [...] } | { tests: [...] }
//  - SuiteExportPayload:          { test_cases: [...], suite: {...} }   (testPlanService format)
//  - Single test case object:     { title: "...", steps: [...] }

import { supabase } from '@/lib/supabase';
import { normalizeTestCase, normalizeTestCaseBatch } from './testCaseNormalizer.js';
import { SuggestionEngine } from './aiTestGenerator/SuggestionEngine.js';
import type { AiGenerationMetadata } from '@/types';
import type { JsonImportResult } from './aiTestGenerator/types.js';

interface JsonImportOptions {
  projectId:    string;
  moduleId:     string | null;
  createdBy:    string;
  checkDuplicates?: boolean;
  existingTitles?:  string[];
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Extract a raw array of test case objects from arbitrary JSON input.
 * Returns null if the input cannot be parsed at all.
 */
export function parseJsonInput(text: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // Direct array
  if (Array.isArray(parsed)) return parsed;

  // Single object that looks like a test case
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // Wrapped arrays under known keys
    for (const key of ['test_cases', 'cases', 'tests', 'items', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }

    // Single test case — wrap in array
    if (typeof obj.title === 'string' || typeof obj.name === 'string') {
      return [obj];
    }
  }

  return null;
}

// ─── Validate (dry run — no persistence) ─────────────────────────────────────

export interface DryRunResult {
  total:      number;
  valid:      number;
  invalid:    number;
  previews:   Array<{ title: string; category?: string; priority: string }>;
  errors:     Array<{ index: number; errors: string[] }>;
}

export function dryRunJsonImport(raws: unknown[]): DryRunResult {
  const { results } = normalizeTestCaseBatch(raws);

  const previews: DryRunResult['previews'] = [];
  const errors:   DryRunResult['errors']   = [];

  results.forEach((r, i) => {
    if (r.ok && r.draft) {
      previews.push({
        title:    r.draft.title,
        priority: r.draft.priority,
        category: (r.draft as unknown as Record<string, unknown>)._category as string | undefined,
      });
    } else {
      errors.push({ index: i, errors: r.errors.map(e => `${e.field}: ${e.message}`) });
    }
  });

  return { total: raws.length, valid: previews.length, invalid: errors.length, previews, errors };
}

// ─── Import (with persistence) ────────────────────────────────────────────────

export async function importJsonTestCases(
  raws:    unknown[],
  options: JsonImportOptions,
): Promise<JsonImportResult> {
  const { results } = normalizeTestCaseBatch(raws);

  // Load existing titles for duplicate detection if not provided
  let existingTitles = options.existingTitles ?? [];
  if (options.checkDuplicates && existingTitles.length === 0) {
    try {
      const { data } = await supabase
        .from('test_cases')
        .select('title')
        .eq('project_id', options.projectId);
      existingTitles = (data ?? []).map((r: { title: string }) => r.title);
    } catch { /* non-fatal */ }
  }

  const suggestionEngine = new SuggestionEngine();

  let imported   = 0;
  let duplicates = 0;
  let invalid    = 0;
  const errors: string[] = [];

  const provenance: AiGenerationMetadata = {
    source_type:  'json_import',
    project_id:   options.projectId,
    generated_at: new Date().toISOString(),
  };

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok || !r.draft) {
      invalid++;
      errors.push(`Item ${i + 1}: ${r.errors.map(e => e.message).join('; ')}`);
      continue;
    }

    // Duplicate check
    if (options.checkDuplicates) {
      const dup = suggestionEngine.checkDuplicate(r.draft.title, existingTitles);
      if (dup.isDuplicate) {
        duplicates++;
        continue;
      }
    }

    try {
      const { data: tc, error: tcErr } = await supabase
        .from('test_cases')
        .insert({
          project_id:           options.projectId,
          module_id:            options.moduleId,
          title:                r.draft.title,
          description:          r.draft.description,
          priority:             r.draft.priority,
          preconditions:        r.draft.preconditions,
          tags:                 r.draft.tags,
          is_automation_ready:  r.draft.is_automation_ready,
          estimated_minutes:    r.draft.estimated_minutes,
          status:               'draft',
          created_by:           options.createdBy,
          ai_generation_metadata: provenance,
        })
        .select('id')
        .single();

      if (tcErr) throw tcErr;
      if (!tc?.id) throw new Error('No ID returned');

      if (r.draft.steps.length > 0) {
        const { error: stepsErr } = await supabase
          .from('test_case_steps')
          .insert(
            r.draft.steps.map(s => ({
              test_case_id:    tc.id,
              step_number:     s.step_number,
              description:     s.description,
              expected_result: s.expected_result,
              notes:           s.notes,
            })),
          );
        if (stepsErr) throw stepsErr;
      }

      existingTitles.push(r.draft.title); // prevent duplicates within this batch
      imported++;
    } catch (err) {
      errors.push(`Item ${i + 1} ("${r.draft.title}"): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { total: raws.length, imported, duplicates, invalid, errors };
}
