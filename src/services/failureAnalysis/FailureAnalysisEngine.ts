// ─── FailureAnalysisEngine (Phase 4 M8) ───────────────────────────────────────
// Orchestrator: collect → classify → build context → AI analyze → recommend → persist.

import { supabase }          from '@/lib/supabase';
import { ExecutionCollector } from './ExecutionCollector';
import { EvidenceCollector }  from './EvidenceCollector';
import { FailureClassifier }  from './FailureClassifier';
import { ContextBuilder }     from './ContextBuilder';
import { AIAnalysisEngine }   from './AIAnalysisEngine';
import { RecommendationEngine } from './RecommendationEngine';
import type {
  AnalysisReport, AnalysisStatus, PreviousFailure,
} from './FailureAnalysisTypes';

const uuidv4 = () => crypto.randomUUID();

export interface FailureAnalysisEngineOptions {
  skipAI?: boolean; // skip AI call (useful in tests / offline)
}

export class FailureAnalysisEngine {
  private readonly executionCollector  = new ExecutionCollector();
  private readonly evidenceCollector   = new EvidenceCollector();
  private readonly classifier          = new FailureClassifier();
  private readonly contextBuilder      = new ContextBuilder();
  private readonly aiEngine            = new AIAnalysisEngine();
  private readonly recommendationEngine = new RecommendationEngine();

  async analyze(
    runId:   string,
    options: FailureAnalysisEngineOptions = {},
  ): Promise<AnalysisReport> {
    const reportId  = uuidv4();
    const createdAt = new Date().toISOString();

    // ── 1. Collect execution data ────────────────────────────────────────────
    const summary  = await this.executionCollector.collect(runId);
    const evidence = await this.evidenceCollector.collect(runId, summary.steps);

    // ── 2. Deterministic classification ─────────────────────────────────────
    const classification = this.classifier.classify(summary, evidence);

    // ── 3. Load previous failures for this test case ─────────────────────────
    const previousFailures: PreviousFailure[] = await this._loadPreviousFailures(
      summary.testCaseId ?? null,
      runId,
    );

    // ── 4. Persist report (pending → analyzing) ───────────────────────────────
    await this._upsertReport(reportId, runId, summary, classification, 'analyzing');

    // ── 5. AI analysis (may be skipped in test mode) ──────────────────────────
    let aiAnalysis = null;
    if (!options.skipAI) {
      try {
        const context  = this.contextBuilder.build(summary, classification, evidence, previousFailures);
        aiAnalysis     = await this.aiEngine.analyze(context);
      } catch (err) {
        // AI failure must not crash the whole pipeline
        console.warn('FailureAnalysisEngine: AI analysis failed, continuing without it:', err);
      }
    }

    // ── 6. Recommendations ───────────────────────────────────────────────────
    const recommendations = this.recommendationEngine.generate(classification, aiAnalysis, summary);

    // ── 7. Persist completed report ───────────────────────────────────────────
    await this._upsertReport(reportId, runId, summary, classification, 'complete', aiAnalysis, recommendations, previousFailures);

    // ── 8. Append to history ─────────────────────────────────────────────────
    if (summary.testCaseId) {
      await supabase.from('failure_analysis_history').insert({
        report_id:            reportId,
        test_case_id:         summary.testCaseId,
        run_id:               runId,
        failure_category:     classification.category,
        ai_confidence:        aiAnalysis?.confidence ?? null,
        regression_probability: aiAnalysis?.regressionProbability ?? null,
        resolved:             false,
      });
    }

    return {
      id:               reportId,
      runId,
      testCaseId:       summary.testCaseId,
      createdAt,
      status:           'complete',
      classification,
      executionSummary: summary,
      evidence,
      aiAnalysis,
      recommendations,
      previousFailures,
    };
  }

  async loadReport(reportId: string): Promise<AnalysisReport | null> {
    const { data, error } = await supabase
      .from('failure_analysis_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (error || !data) return null;
    return this._rowToReport(data as Record<string, unknown>);
  }

  async listReports(testCaseId?: string, limit = 20): Promise<AnalysisReport[]> {
    let q = supabase
      .from('failure_analysis_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (testCaseId) q = q.eq('test_case_id', testCaseId);

    const { data } = await q;
    return (data ?? []).map(row => this._rowToReport(row as Record<string, unknown>));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async _loadPreviousFailures(
    testCaseId: string | null,
    currentRunId: string,
  ): Promise<PreviousFailure[]> {
    if (!testCaseId) return [];
    const { data } = await supabase
      .from('failure_analysis_history')
      .select('run_id, failure_category, resolved, created_at')
      .eq('test_case_id', testCaseId)
      .neq('run_id', currentRunId)
      .order('created_at', { ascending: false })
      .limit(10);

    return (data ?? []).map(row => ({
      runId:     String(row['run_id'] ?? ''),
      category:  String(row['failure_category'] ?? 'unknown') as PreviousFailure['category'],
      createdAt: String(row['created_at'] ?? ''),
      resolved:  Boolean(row['resolved']),
    }));
  }

  private async _upsertReport(
    id:              string,
    runId:           string,
    summary:         Awaited<ReturnType<ExecutionCollector['collect']>>,
    classification:  Awaited<ReturnType<FailureClassifier['classify']>>,
    status:          AnalysisStatus,
    aiAnalysis?:     Awaited<ReturnType<AIAnalysisEngine['analyze']>> | null,
    recommendations?: Awaited<ReturnType<RecommendationEngine['generate']>>,
    previousFailures?: PreviousFailure[],
  ): Promise<void> {
    const row: Record<string, unknown> = {
      id,
      run_id:                   runId,
      test_case_id:             summary.testCaseId ?? null,
      status,
      failure_category:         classification.category,
      classification_confidence: classification.confidence,
      classification_signals:   classification.signals,
      recommendations:          recommendations ?? [],
      previous_failures:        previousFailures ?? [],
      execution_snapshot:       {
        testCaseName:  summary.testCaseName,
        totalSteps:    summary.totalSteps,
        failedSteps:   summary.failedSteps,
        duration_ms:   summary.duration_ms,
        deviceInfo:    summary.deviceInfo,
        startedAt:     summary.startedAt,
      },
      updated_at: new Date().toISOString(),
    };

    if (aiAnalysis) {
      row['ai_root_cause']             = aiAnalysis.rootCause;
      row['ai_confidence']             = aiAnalysis.confidence;
      row['ai_evidence_summary']       = aiAnalysis.evidenceSummary;
      row['ai_likely_source_files']    = aiAnalysis.likelySourceFiles;
      row['ai_suggested_fix']          = aiAnalysis.suggestedFix;
      row['ai_suggested_healing']      = aiAnalysis.suggestedHealing ?? null;
      row['ai_regression_probability'] = aiAnalysis.regressionProbability;
      row['ai_developer_explanation']  = aiAnalysis.developerExplanation;
      row['ai_qa_explanation']         = aiAnalysis.qaExplanation;
      row['ai_raw_response']           = aiAnalysis.rawResponse ?? null;
    }

    await supabase.from('failure_analysis_reports').upsert(row);
  }

  private _rowToReport(row: Record<string, unknown>): AnalysisReport {
    const snapshot = (row['execution_snapshot'] as Record<string, unknown>) ?? {};
    return {
      id:         String(row['id'] ?? ''),
      runId:      String(row['run_id'] ?? ''),
      testCaseId: row['test_case_id'] ? String(row['test_case_id']) : undefined,
      createdAt:  String(row['created_at'] ?? ''),
      status:     String(row['status'] ?? 'complete') as AnalysisReport['status'],
      classification: {
        category:   String(row['failure_category'] ?? 'unknown') as AnalysisReport['classification']['category'],
        confidence: Number(row['classification_confidence'] ?? 0),
        signals:    (row['classification_signals'] as string[]) ?? [],
      },
      executionSummary: {
        runId:         String(row['run_id'] ?? ''),
        testCaseName:  snapshot['testCaseName'] ? String(snapshot['testCaseName']) : undefined,
        totalSteps:    Number(snapshot['totalSteps'] ?? 0),
        failedSteps:   Number(snapshot['failedSteps'] ?? 0),
        passedSteps:   0,
        skippedSteps:  0,
        duration_ms:   Number(snapshot['duration_ms'] ?? 0),
        startedAt:     String(snapshot['startedAt'] ?? ''),
        status:        'failed',
        steps:         [],
        failedStepList: [],
        assertions:    [],
        healingAttempts: [],
        deviceInfo:    snapshot['deviceInfo'] as AnalysisReport['executionSummary']['deviceInfo'],
      },
      evidence:     [],
      aiAnalysis:   row['ai_root_cause'] ? {
        rootCause:             String(row['ai_root_cause'] ?? ''),
        confidence:            Number(row['ai_confidence'] ?? 0),
        evidenceSummary:       String(row['ai_evidence_summary'] ?? ''),
        likelySourceFiles:     (row['ai_likely_source_files'] as string[]) ?? [],
        suggestedFix:          String(row['ai_suggested_fix'] ?? ''),
        suggestedHealing:      row['ai_suggested_healing'] ? String(row['ai_suggested_healing']) : undefined,
        regressionProbability: Number(row['ai_regression_probability'] ?? 0),
        developerExplanation:  String(row['ai_developer_explanation'] ?? ''),
        qaExplanation:         String(row['ai_qa_explanation'] ?? ''),
      } : null,
      recommendations:  (row['recommendations'] as AnalysisReport['recommendations']) ?? [],
      previousFailures: (row['previous_failures'] as AnalysisReport['previousFailures']) ?? [],
    };
  }
}

// Singleton for use in components
export const failureAnalysisEngine = new FailureAnalysisEngine();
