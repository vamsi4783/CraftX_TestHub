// ─── Test Case Generator (Phase 4 M6) ─────────────────────────────────────────
// Builds the structured prompt for Claude and parses the JSON response
// into TestSuggestion[]. The actual API call is handled by AITestGenerationEngine.
// Pure functions — no network calls here.

import type {
  ProjectModel,
  GenerationOptions,
  TestSuggestion,
  TestCategory,
  DraftStep,
  DraftTestCase,
} from './types.js';

// ─── Category descriptions ────────────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<TestCategory, string> = {
  smoke:       'Basic sanity checks: app launches, key screens load.',
  happy_path:  'Primary user flows with valid input completing successfully.',
  validation:  'Form field validation: required fields, format errors, error messages.',
  boundary:    'Edge-case inputs: empty strings, max-length, numeric extremes.',
  negative:    'Intentionally wrong input, invalid auth, unauthorized actions.',
  permission:  'Feature gating, role-based access, OS permission prompts.',
  navigation:  'Back navigation, deep links, screen transitions, flow continuity.',
  regression:  'Tests for known critical paths that must not regress.',
};

// ─── JSON schema that Claude must follow ─────────────────────────────────────

const RESPONSE_SCHEMA = `
{
  "suggestions": [
    {
      "title": "string (concise test name)",
      "description": "string (what this test verifies)",
      "priority": "critical | high | medium | low",
      "preconditions": "string | null",
      "tags": ["string"],
      "estimated_minutes": number,
      "steps": [
        {
          "step_number": number,
          "description": "string (action to perform)",
          "expected_result": "string (what should happen)",
          "notes": "string | null"
        }
      ],
      "category": "smoke | happy_path | validation | boundary | negative | permission | navigation | regression",
      "reason": "string (why this test was generated and what risk it covers)",
      "source_files": ["string"],
      "confidence": number (0.0–1.0),
      "coverage_area": "string (screen or feature name)"
    }
  ]
}`;

// ─── TestCaseGenerator ────────────────────────────────────────────────────────

export class TestCaseGenerator {

  /**
   * Build the full Claude prompt from a ProjectModel and generation options.
   * The prompt is deterministic and testable without any API call.
   */
  buildPrompt(model: ProjectModel, options: GenerationOptions): string {
    const categoryList = options.categories
      .map(c => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`)
      .join('\n');

    const screensSection = model.screens.length > 0
      ? model.screens.map(s => {
          const elems = s.elements.map(e => `    • ${e.type}${e.id ? ` [${e.id}]` : ''}${e.label ? ` "${e.label}"` : ''}`).join('\n');
          const nav   = s.navigation.map(n => `    → ${n.targetScreen} (${n.trigger})`).join('\n');
          return `  Screen: ${s.name} (${s.type})\n${elems || '    (no elements detected)'}\n${nav || '    (no navigation detected)'}`;
        }).join('\n\n')
      : '  (no screens detected)';

    const formsSection = model.forms.length > 0
      ? model.forms.map(f => {
          const fields = f.fields.map(field => `    • ${field.name} [${field.type}]${field.required ? ' *required*' : ''}${field.validations?.length ? ' (' + field.validations.join(', ') + ')' : ''}`).join('\n');
          return `  Form: ${f.name}\n${fields}`;
        }).join('\n\n')
      : '  (no forms detected)';

    const apisSection = model.apis.length > 0
      ? model.apis.map(a => `  ${a.method} ${a.path}`).join('\n')
      : '  (no APIs detected)';

    const flowsSection = model.flows.length > 0
      ? model.flows.map(f => `  ${f.name}`).join('\n')
      : '  (no navigation flows detected)';

    const max = options.maxSuggestions ?? 20;

    return `You are an expert QA engineer generating structured test cases for a ${model.projectType} application.

IMPORTANT RULES:
- Generate ONLY the test categories listed below.
- Each test must be actionable, specific, and based on the project structure provided.
- Do NOT invent screens, endpoints, or features not present in the project model.
- Return ONLY valid JSON matching the schema below. No markdown. No explanation outside JSON.
- Generate at most ${max} suggestions total.
- Confidence scores: 0.9+ for clearly supported tests, 0.6–0.9 for inferred tests, below 0.6 for speculative tests.

PROJECT: ${model.projectName ?? 'Unnamed'} (${model.projectType})
Analysis confidence: ${(model.analysisConfidence * 100).toFixed(0)}%${model.analysisNotes ? '\nNotes: ' + model.analysisNotes.join('; ') : ''}

SCREENS DETECTED:
${screensSection}

FORMS DETECTED:
${formsSection}

APIS DETECTED:
${apisSection}

NAVIGATION FLOWS:
${flowsSection}

CATEGORIES TO GENERATE:
${categoryList}

RESPONSE SCHEMA (return exactly this structure):
${RESPONSE_SCHEMA}

Generate test cases now:`;
  }

  /**
   * Parse the raw JSON string returned by Claude into TestSuggestion[].
   * Returns an empty array (not a throw) on malformed responses.
   */
  parseResponse(raw: string, sessionId: string): TestSuggestion[] {
    let parsed: unknown;
    try {
      // Strip markdown code fences if Claude wrapped the JSON
      const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return [];
    }

    if (
      typeof parsed !== 'object' || parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).suggestions)
    ) {
      return [];
    }

    const suggestions = (parsed as { suggestions: unknown[] }).suggestions;
    const results: TestSuggestion[] = [];

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i] as Record<string, unknown>;
      const draft = this._parseDraft(s);
      if (!draft) continue;

      results.push({
        id:           `${sessionId}-${i}`,
        draft,
        category:     this._safeCategory(String(s.category ?? 'smoke')),
        reason:       String(s.reason ?? ''),
        sourceFiles:  Array.isArray(s.source_files) ? s.source_files.map(String) : [],
        confidence:   typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.5,
        coverageArea: String(s.coverage_area ?? ''),
        isDuplicate:  false,
        status:       'pending',
      });
    }

    return results;
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private _parseDraft(s: Record<string, unknown>): DraftTestCase | null {
    const title = String(s.title ?? '').trim();
    if (!title) return null;

    const rawSteps = Array.isArray(s.steps) ? s.steps as Record<string, unknown>[] : [];
    const steps: DraftStep[] = rawSteps.map((step, idx) => ({
      step_number:      typeof step.step_number === 'number' ? step.step_number : idx + 1,
      description:      String(step.description ?? ''),
      expected_result:  String(step.expected_result ?? ''),
      notes:            step.notes != null ? String(step.notes) : null,
      automation_config: null,
    }));

    return {
      title,
      description:        String(s.description ?? null) || null,
      priority:           this._safePriority(String(s.priority ?? 'medium')),
      preconditions:      s.preconditions != null ? String(s.preconditions) : null,
      tags:               Array.isArray(s.tags) ? s.tags.map(String) : [],
      is_automation_ready: false,
      estimated_minutes:  typeof s.estimated_minutes === 'number' ? s.estimated_minutes : 10,
      steps,
    };
  }

  private _safePriority(v: string): DraftTestCase['priority'] {
    const valid = ['critical', 'high', 'medium', 'low'] as const;
    return valid.includes(v as typeof valid[number]) ? v as typeof valid[number] : 'medium';
  }

  private _safeCategory(v: string): TestCategory {
    const valid: TestCategory[] = [
      'smoke', 'happy_path', 'validation', 'boundary',
      'negative', 'permission', 'navigation', 'regression',
    ];
    return valid.includes(v as TestCategory) ? v as TestCategory : 'smoke';
  }
}
