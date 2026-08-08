// ─── AI Test Generation Engine (Phase 4 M6) ───────────────────────────────────
// Orchestrator: ProjectAnalyzer → FlowAnalyzer → TestCaseGenerator (AI call) →
//               SuggestionEngine → GenerationResult
//
// Safety contract:
//   - NEVER modifies existing test cases.
//   - All output is suggestions only. User approval is mandatory before saving.

const uuidv7 = () => crypto.randomUUID();
import { supabase }          from '@/lib/supabase';
import { ProjectAnalyzer }   from './ProjectAnalyzer.js';
import { FlowAnalyzer }      from './FlowAnalyzer.js';
import { TestCaseGenerator } from './TestCaseGenerator.js';
import { SuggestionEngine }  from './SuggestionEngine.js';
import { aiOrchestrationService, parseJSONFromText } from '@/features/ai-connectors/aiOrchestrationService';
import { aiRuntimePolicy } from '@/features/ai-connectors/aiRuntimePolicy';
import type {
  ProjectModel,
  GenerationOptions,
  GenerationRequest,
  GenerationResult,
  TestSuggestion,
  ContextGenerationOptions,
} from './types.js';
import { GENERATION_MODE_CATEGORIES as MODE_CATEGORIES } from './types.js';
import type { SourceFile } from './ProjectAnalyzer.js';
import type { ProjectKnowledge, ProjectContextQuery } from '../projectIngestion/types.js';
import { projectContextBuilder } from '../projectIngestion/ProjectContextBuilder.js';
import { testCaseService } from '../testCaseService.js';

// ─── Public re-exports ────────────────────────────────────────────────────────

export type { SourceFile };

// ─── Edge function response shape ─────────────────────────────────────────────

interface EdgeFnResponse {
  suggestions: unknown[];
  model:       string;
}

// ─── AITestGenerationEngine ───────────────────────────────────────────────────

export class AITestGenerationEngine {
  private readonly projectAnalyzer  = new ProjectAnalyzer();
  private readonly flowAnalyzer     = new FlowAnalyzer();
  private readonly generator        = new TestCaseGenerator();
  private readonly suggestionEngine = new SuggestionEngine();

  /**
   * Full pipeline:
   * 1. Analyze source files → ProjectModel
   * 2. Enrich flows via FlowAnalyzer
   * 3. Call AI (via Supabase Edge Function) → raw TestSuggestion[]
   * 4. Post-process: duplicate detection + sort
   *
   * SAFETY: never writes to the database. Returns suggestions only.
   */
  async generate(
    files:              SourceFile[],
    projectType:        ProjectModel['projectType'],
    options:            GenerationOptions,
    existingTestTitles: string[],
    projectName?:       string,
  ): Promise<GenerationResult> {
    const t0 = Date.now();

    // ── 1. Analyze ───────────────────────────────────────────────────────────
    const model = this.projectAnalyzer.analyze(files, projectType, projectName);

    // ── 2. Enrich flows ──────────────────────────────────────────────────────
    const flowResult = this.flowAnalyzer.analyze(model);
    const enriched: ProjectModel = { ...model, flows: flowResult.flows };

    // ── 3. Call AI ───────────────────────────────────────────────────────────
    const sessionId = uuidv7();
    const prompt    = this.generator.buildPrompt(enriched, options);

    let rawSuggestions: TestSuggestion[] = [];
    let aiModel = 'unknown';

    const req: GenerationRequest = {
      projectModel:       enriched,
      options,
      existingTestTitles,
    };

    // Path 1: user-configured connector via AIOrchestrationService (no TestHub API key)
    if (aiOrchestrationService.hasUsableConnectors()) {
      try {
        const response = await aiOrchestrationService.execute({
          requestId:    sessionId,
          task:         'test_generation',
          systemPrompt: 'You are an expert QA engineer. Return ONLY valid JSON as instructed in the user message. No explanation, no markdown, no code fences.',
          userPrompt:   prompt,
        });
        const parsed   = parseJSONFromText(response.text) as { suggestions?: unknown[] };
        const rawJson  = JSON.stringify({ suggestions: parsed.suggestions ?? [] });
        rawSuggestions = this.generator.parseResponse(rawJson, sessionId);
        aiModel        = response.model;
      } catch {
        // Orchestrator failed — fall through to edge function path
      }
    }

    // Path 2: Supabase Edge Function — only when the user has explicitly enabled it.
    // Disabled by default: calling this function uses a TestHub-owned Anthropic key.
    if (rawSuggestions.length === 0 && aiModel === 'unknown' && aiRuntimePolicy.isEdgeFunctionEnabled()) {
      try {
        const { data, error } = await supabase.functions.invoke<EdgeFnResponse>(
          'ai-test-generator',
          { body: { ...req, prompt, sessionId } },
        );

        if (error) throw new Error(error.message);
        if (data?.suggestions) {
          // Edge function returns parsed suggestions; parse as strings if raw
          const rawJson = JSON.stringify({ suggestions: data.suggestions });
          rawSuggestions = this.generator.parseResponse(rawJson, sessionId);
          aiModel        = data.model ?? 'claude';
        }
      } catch {
        // Edge function unavailable: return empty suggestions (not an error)
        // Callers should surface this to the user as "AI unavailable"
        rawSuggestions = [];
        aiModel        = 'unavailable';
      }
    }

    // Both paths skipped or failed — mark as unavailable so callers can surface the state.
    if (aiModel === 'unknown') aiModel = 'unavailable';

    // ── 4. Post-process ──────────────────────────────────────────────────────
    const processed = this.suggestionEngine.process(rawSuggestions, existingTestTitles);

    return {
      suggestions: processed,
      meta: {
        screensAnalyzed:   enriched.screens.length,
        flowsAnalyzed:     flowResult.flows.length,
        formsAnalyzed:     enriched.forms.length,
        apisAnalyzed:      enriched.apis.length,
        generationTime_ms: Date.now() - t0,
        model:             aiModel,
      },
    };
  }

  /**
   * M11: Generate tests from M10 ProjectKnowledge instead of raw source files.
   *
   * Pipeline:
   *  1. Load existing test cases from DB (for duplicate detection + coverage gaps).
   *  2. Build ProjectContext via ProjectContextBuilder (respects token budget).
   *  3. Build AI prompt via TestCaseGenerator.buildPromptFromContext().
   *  4. Call AI (same M8 connector + edge-function-fallback pattern).
   *  5. Parse + post-process with SuggestionEngine (passing existing titles).
   *
   * SAFETY: never writes to the database. Returns suggestions only.
   * Human approval via importAccepted() is required before persistence.
   */
  async generateFromContext(
    knowledge:   ProjectKnowledge,
    ctxOptions:  ContextGenerationOptions,
    projectId:   string,
  ): Promise<GenerationResult> {
    const t0 = Date.now();

    // ── 1. Load existing test cases (Phase E) ────────────────────────────────
    let existingTestTitles: string[] = [];
    try {
      const existing = await testCaseService.list(projectId);
      existingTestTitles = existing.map(tc => tc.title);
    } catch {
      // Non-fatal — proceed without duplicate awareness
    }

    // ── 2. Build ProjectContext (respects token budget, excludes sensitive) ──
    const query: ProjectContextQuery = {
      projectId: knowledge.projectId,
      moduleIds: ctxOptions.moduleIds,
      feature:   ctxOptions.feature,
      filePaths: ctxOptions.filePaths,
      maxTokens: 24_000, // conservative budget — leave room for system prompt
      includeTests: true,
    };
    const ctx = projectContextBuilder.build(knowledge, query);

    // ── 3. Build prompt ──────────────────────────────────────────────────────
    const categories = MODE_CATEGORIES[ctxOptions.mode];
    const options: GenerationOptions = {
      categories,
      maxSuggestions: ctxOptions.maxSuggestions ?? 20,
    };

    const sessionId = crypto.randomUUID();
    const prompt    = this.generator.buildPromptFromContext(ctx, knowledge, options, existingTestTitles);

    // ── 4. Call AI (identical M8 cost-safety pattern as generate()) ─────────
    let rawSuggestions: TestSuggestion[] = [];
    let aiModel = 'unknown';

    if (aiOrchestrationService.hasUsableConnectors()) {
      try {
        const response = await aiOrchestrationService.execute({
          requestId:    sessionId,
          task:         'test_generation',
          systemPrompt: 'You are an expert QA engineer. Return ONLY valid JSON as instructed. No explanation, no markdown, no code fences.',
          userPrompt:   prompt,
        });
        const parsed  = parseJSONFromText(response.text) as { suggestions?: unknown[] };
        const rawJson = JSON.stringify({ suggestions: parsed.suggestions ?? [] });
        rawSuggestions = this.generator.parseResponse(rawJson, sessionId);
        aiModel        = response.model;
      } catch {
        // fall through to edge function
      }
    }

    if (rawSuggestions.length === 0 && aiModel === 'unknown' && aiRuntimePolicy.isEdgeFunctionEnabled()) {
      try {
        const req: GenerationRequest = {
          projectModel:       this._buildProjectModelFromContext(ctx),
          options,
          existingTestTitles,
        };
        const { data, error } = await supabase.functions.invoke<EdgeFnResponse>(
          'ai-test-generator',
          { body: { ...req, prompt, sessionId } },
        );
        if (error) throw new Error(error.message);
        if (data?.suggestions) {
          const rawJson = JSON.stringify({ suggestions: data.suggestions });
          rawSuggestions = this.generator.parseResponse(rawJson, sessionId);
          aiModel        = data.model ?? 'claude';
        }
      } catch {
        rawSuggestions = [];
        aiModel        = 'unavailable';
      }
    }

    if (aiModel === 'unknown') aiModel = 'unavailable';

    // ── 5. Post-process ──────────────────────────────────────────────────────
    const processed = this.suggestionEngine.process(rawSuggestions, existingTestTitles);

    return {
      suggestions: processed,
      meta: {
        screensAnalyzed:   ctx.relevantFiles.filter(f => f.tags.includes('screen')).length,
        flowsAnalyzed:     ctx.relevantModules.length,
        formsAnalyzed:     ctx.relevantFiles.filter(f => f.tags.includes('form') || f.purpose.toLowerCase().includes('form')).length,
        apisAnalyzed:      ctx.relevantFiles.filter(f => f.tags.includes('service') || f.tags.includes('network')).length,
        generationTime_ms: Date.now() - t0,
        model:             aiModel,
      },
    };
  }

  /** Build a minimal ProjectModel from ProjectContext for edge-function compat. */
  private _buildProjectModelFromContext(ctx: import('../projectIngestion/types.js').ProjectContext): ProjectModel {
    return {
      projectType:        'generic',
      projectName:        ctx.projectName,
      screens:            [],
      apis:               [],
      flows:              [],
      forms:              [],
      sourceFiles:        ctx.relevantFiles.map(f => f.path),
      analysisConfidence: 0.9,
      analysisNotes:      ['Generated from M10 project intelligence'],
    };
  }

  /**
   * Expose ProjectAnalyzer for standalone use (e.g. preview before generation).
   */
  analyzeOnly(
    files:       SourceFile[],
    projectType: ProjectModel['projectType'],
    projectName?: string,
  ): { model: ProjectModel; flowResult: ReturnType<FlowAnalyzer['analyze']> } {
    const model      = this.projectAnalyzer.analyze(files, projectType, projectName);
    const flowResult = this.flowAnalyzer.analyze(model);
    return { model: { ...model, flows: flowResult.flows }, flowResult };
  }

  /**
   * Save accepted suggestions as real TestCases.
   * Only the suggestions the user explicitly accepted are saved.
   * Returns the count of saved test cases.
   */
  async importAccepted(
    suggestions: TestSuggestion[],
    projectId:   string,
    moduleId:    string | null,
    createdBy:   string,
  ): Promise<{ saved: number; errors: string[] }> {
    const accepted = suggestions.filter(s => s.status === 'accepted');
    if (accepted.length === 0) return { saved: 0, errors: [] };

    let saved  = 0;
    const errors: string[] = [];

    for (const suggestion of accepted) {
      try {
        // Insert test case
        const { data: tc, error: tcErr } = await supabase
          .from('test_cases')
          .insert({
            project_id:          projectId,
            module_id:           moduleId,
            title:               suggestion.draft.title,
            description:         suggestion.draft.description,
            priority:            suggestion.draft.priority,
            preconditions:       suggestion.draft.preconditions,
            tags:                suggestion.draft.tags,
            is_automation_ready: suggestion.draft.is_automation_ready,
            estimated_minutes:   suggestion.draft.estimated_minutes,
            status:              'draft',
            created_by:          createdBy,
          })
          .select('id')
          .single();

        if (tcErr) throw tcErr;
        if (!tc?.id) throw new Error('No test case ID returned');

        // Insert steps
        if (suggestion.draft.steps.length > 0) {
          const stepsToInsert = suggestion.draft.steps.map(step => ({
            test_case_id:      tc.id,
            step_number:       step.step_number,
            description:       step.description,
            expected_result:   step.expected_result,
            notes:             step.notes,
            automation_config: step.automation_config ?? undefined,
          }));

          const { error: stepsErr } = await supabase
            .from('test_case_steps')
            .insert(stepsToInsert);

          if (stepsErr) throw stepsErr;
        }

        saved++;
      } catch (err) {
        errors.push(`"${suggestion.draft.title}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { saved, errors };
  }
}

// ─── Default instance ─────────────────────────────────────────────────────────

export const aiTestGenerationEngine = new AITestGenerationEngine();
