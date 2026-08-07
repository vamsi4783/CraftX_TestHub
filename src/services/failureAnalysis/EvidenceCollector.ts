// ─── EvidenceCollector (Phase 4 M8) ──────────────────────────────────────────
// Gathers screenshots, visual diffs, logs, and exceptions for a run.

import { supabase } from '@/lib/supabase';
import type { Evidence, StepSummary } from './FailureAnalysisTypes';

export class EvidenceCollector {
  async collect(runId: string, steps: StepSummary[]): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    // ── Step screenshots (from step_progress embedded data) ─────────────────
    for (const step of steps) {
      if (step.screenshotUrl) {
        evidence.push({
          id:         `screenshot-step-${step.stepNumber}`,
          type:       'screenshot',
          stepNumber: step.stepNumber,
          url:        step.screenshotUrl,
          metadata:   { stepId: step.stepId, status: step.status },
        });
      }
      if (step.error) {
        evidence.push({
          id:         `exception-step-${step.stepNumber}`,
          type:       'exception',
          stepNumber: step.stepNumber,
          content:    step.error,
          metadata:   { action: step.action, selector: step.selector },
        });
      }
    }

    // ── Assertion evidence ────────────────────────────────────────────────────
    const { data: assertEvidence } = await supabase
      .from('assertion_results')
      .select('id, step_number, evidence_url, evidence_type, status, message')
      .eq('run_id', runId)
      .in('status', ['FAIL', 'ERROR'])
      .not('evidence_url', 'is', null);

    for (const ae of (assertEvidence ?? [])) {
      const row = ae as Record<string, unknown>;
      evidence.push({
        id:         `assert-${String(row['id'])}`,
        type:       'assertion_evidence',
        stepNumber: Number(row['step_number'] ?? 0),
        url:        String(row['evidence_url'] ?? ''),
        content:    String(row['message'] ?? ''),
        metadata:   { evidenceType: row['evidence_type'] },
      });
    }

    // ── Visual diff evidence ──────────────────────────────────────────────────
    const { data: visualDiffs } = await supabase
      .from('visual_comparison_results')
      .select('id, step_number, status, diff_percent, diff_url, current_url, baseline_url, message')
      .eq('run_id', runId)
      .eq('status', 'FAIL');

    for (const vd of (visualDiffs ?? [])) {
      const row = vd as Record<string, unknown>;
      evidence.push({
        id:         `visual-${String(row['id'])}`,
        type:       'visual_diff',
        stepNumber: Number(row['step_number'] ?? 0),
        url:        row['diff_url'] ? String(row['diff_url']) : (row['current_url'] ? String(row['current_url']) : undefined),
        content:    String(row['message'] ?? ''),
        metadata:   {
          hasDiff:     true,
          diffPercent: Number(row['diff_percent'] ?? 0),
          baselineUrl: row['baseline_url'] ? String(row['baseline_url']) : undefined,
          currentUrl:  row['current_url']  ? String(row['current_url'])  : undefined,
        },
      });
    }

    return evidence.sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0));
  }
}
