// ─── TestCaseNormalizer (M12 Phase B) ────────────────────────────────────────
// Single canonical path that validates and normalises any incoming test case
// shape — manual UI, JSON import, or AI generation — before persistence.
//
// Design invariant: this is a pure function module. No network calls.
// All three ingestion paths must flow through normalizeTestCase() before
// calling testCaseService.create() / importAccepted().

import type { TcPriority } from '@/types';
import type { DraftTestCase, DraftStep, TestCategory } from './aiTestGenerator/types.js';

// ─── Valid enumerations (single source of truth) ─────────────────────────────

const VALID_PRIORITIES: TcPriority[] = ['critical', 'high', 'medium', 'low'];

const VALID_CATEGORIES: TestCategory[] = [
  'smoke', 'happy_path', 'validation', 'boundary',
  'negative', 'permission', 'navigation', 'regression',
  'integration', 'performance', 'api', 'data_validation', 'compatibility',
];

// Map legacy / variant spellings to canonical categories
const CATEGORY_ALIASES: Record<string, TestCategory> = {
  'happy path':      'happy_path',
  'happypath':       'happy_path',
  'edge case':       'boundary',
  'edge_case':       'boundary',
  'edgecase':        'boundary',
  'functional':      'happy_path',
  'auth':            'permission',
  'authorization':   'permission',
  'ui':              'smoke',
  'ui_ux':           'smoke',
  'end_to_end':      'integration',
  'e2e':             'integration',
  'end to end':      'integration',
  'perf':            'performance',
  'api_test':        'api',
  'data':            'data_validation',
  'database':        'data_validation',
};

// ─── Validation error ─────────────────────────────────────────────────────────

export interface NormalizationError {
  field:   string;
  message: string;
}

export interface NormalizationResult {
  ok:     boolean;
  draft?: DraftTestCase;
  errors: NormalizationError[];
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalise an arbitrary input object into a canonical DraftTestCase.
 *
 * Accepts loose JSON from external sources — field names may be camelCase,
 * snake_case, or human-readable. Returns {ok: false} with descriptive errors
 * for inputs that cannot be safely coerced.
 */
export function normalizeTestCase(raw: Record<string, unknown>): NormalizationResult {
  const errors: NormalizationError[] = [];

  // ── Title (required) ──────────────────────────────────────────────────────
  const title = coerceString(raw.title ?? raw.name ?? raw.test_name ?? raw.testName);
  if (!title) {
    errors.push({ field: 'title', message: 'title is required and must be a non-empty string' });
  }

  // ── Priority ──────────────────────────────────────────────────────────────
  const priority = normalizePriority(
    coerceString(raw.priority ?? raw.severity ?? raw.importance),
  );

  // ── Category ─────────────────────────────────────────────────────────────
  const category = normalizeCategory(
    coerceString(raw.category ?? raw.type ?? raw.test_type ?? raw.testType),
  );

  // ── Description ──────────────────────────────────────────────────────────
  const description = coerceStringOrNull(
    raw.description ?? raw.desc ?? raw.summary ?? raw.objective,
  );

  // ── Preconditions ─────────────────────────────────────────────────────────
  const preconditions = coerceStringOrNull(
    raw.preconditions ?? raw.pre_conditions ?? raw.prerequisites ?? raw.setup,
  );

  // ── Tags ──────────────────────────────────────────────────────────────────
  const tags = normalizeTags(raw.tags ?? raw.labels ?? raw.keywords);

  // ── Estimated minutes ────────────────────────────────────────────────────
  const estimated_minutes = normalizeMinutes(
    raw.estimated_minutes ?? raw.estimatedMinutes ?? raw.duration ?? raw.time,
  );

  // ── Steps ─────────────────────────────────────────────────────────────────
  const { steps, stepErrors } = normalizeSteps(
    raw.steps ?? raw.test_steps ?? raw.testSteps ?? raw.actions,
  );
  errors.push(...stepErrors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    draft: {
      title:               title!,
      description,
      priority,
      preconditions,
      tags,
      is_automation_ready: Boolean(raw.is_automation_ready ?? raw.isAutomationReady ?? false),
      estimated_minutes,
      steps,
      // category is stored on TestSuggestion, not DraftTestCase, but we expose it
      // here so callers can use it for routing/tagging
      ...(category !== 'smoke' ? { _category: category } : {}),
    } as DraftTestCase & { _category?: TestCategory },
  };
}

/**
 * Normalise a batch of raw objects, collecting per-item results.
 * Items that fail validation are collected as errors rather than throwing.
 */
export function normalizeTestCaseBatch(
  raws: unknown[],
): { results: NormalizationResult[]; validCount: number; invalidCount: number } {
  const results = raws.map(r =>
    typeof r === 'object' && r !== null
      ? normalizeTestCase(r as Record<string, unknown>)
      : { ok: false as const, errors: [{ field: 'root', message: 'item is not an object' }] },
  );
  return {
    results,
    validCount:   results.filter(r => r.ok).length,
    invalidCount: results.filter(r => !r.ok).length,
  };
}

// ─── Field-level normalizers ──────────────────────────────────────────────────

function normalizePriority(raw: string | null): TcPriority {
  if (!raw) return 'medium';
  const lc = raw.toLowerCase().trim();
  if ((VALID_PRIORITIES as string[]).includes(lc)) return lc as TcPriority;
  // Aliases
  if (lc === 'p1' || lc === 'blocker' || lc === 'urgent') return 'critical';
  if (lc === 'p2' || lc === 'major')                       return 'high';
  if (lc === 'p3' || lc === 'normal' || lc === 'moderate') return 'medium';
  if (lc === 'p4' || lc === 'minor' || lc === 'trivial')   return 'low';
  return 'medium';
}

export function normalizeCategory(raw: string | null): TestCategory {
  if (!raw) return 'smoke';
  const lc = raw.toLowerCase().trim().replace(/-/g, '_').replace(/\s+/g, '_');
  if ((VALID_CATEGORIES as string[]).includes(lc)) return lc as TestCategory;
  const alias = CATEGORY_ALIASES[lc] ?? CATEGORY_ALIASES[raw.toLowerCase().trim()];
  return alias ?? 'smoke';
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.flatMap(t =>
      typeof t === 'string' ? t.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [],
    );
  }
  return [];
}

function normalizeMinutes(raw: unknown): number {
  if (typeof raw === 'number' && raw > 0) return Math.min(Math.round(raw), 480);
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return Math.min(n, 480);
  }
  return 15;
}

function normalizeSteps(raw: unknown): { steps: DraftStep[]; stepErrors: NormalizationError[] } {
  const stepErrors: NormalizationError[] = [];

  if (!raw) return { steps: [], stepErrors };

  const arr = Array.isArray(raw) ? raw : null;
  if (!arr) {
    stepErrors.push({ field: 'steps', message: 'steps must be an array' });
    return { steps: [], stepErrors };
  }

  const steps: DraftStep[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i] as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) continue;

    const desc = coerceString(
      s.description ?? s.action ?? s.step ?? s.instruction ?? s.text,
    );
    if (!desc) {
      stepErrors.push({ field: `steps[${i}].description`, message: 'step description is required' });
      continue;
    }

    const expected = coerceString(
      s.expected_result ?? s.expectedResult ?? s.expected ?? s.result ?? s.assertion,
    ) ?? '';

    steps.push({
      step_number:      i + 1,
      description:      desc,
      expected_result:  expected,
      notes:            coerceStringOrNull(s.notes ?? s.note ?? s.comment),
      automation_config: null,
    });
  }

  return { steps, stepErrors };
}

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function coerceString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

function coerceStringOrNull(v: unknown): string | null {
  const s = coerceString(v);
  return s && s.length > 0 ? s : null;
}
