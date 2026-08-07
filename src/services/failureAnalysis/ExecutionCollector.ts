// ─── ExecutionCollector (Phase 4 M8) ─────────────────────────────────────────
// Reads completed run data from Supabase — autonomous_run_results,
// assertion_results, healing_events — and returns a typed ExecutionSummary.

import { supabase } from '@/lib/supabase';
import type {
  ExecutionSummary, StepSummary, AssertionSummary, HealingAttemptSummary,
} from './FailureAnalysisTypes';

export class ExecutionCollector {
  async collect(runId: string): Promise<ExecutionSummary> {
    const [runResult, assertResult, healResult] = await Promise.all([
      supabase
        .from('autonomous_run_results')
        .select('*, test_cases(title)')
        .eq('run_id', runId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('assertion_results')
        .select('*')
        .eq('run_id', runId)
        .order('step_number'),
      supabase
        .from('healing_events')
        .select('*')
        .eq('run_id', runId)
        .order('created_at'),
    ]);

    if (runResult.error) throw new Error(`ExecutionCollector: ${runResult.error.message}`);
    if (!runResult.data) throw new Error(`ExecutionCollector: run "${runId}" not found`);

    const run     = runResult.data as Record<string, unknown>;
    const rawSteps = (run['step_progress'] as unknown[]) ?? [];

    const steps: StepSummary[] = rawSteps.map((s: unknown) => {
      const step = s as Record<string, unknown>;
      return {
        stepId:           String(step['stepId'] ?? step['step_id'] ?? ''),
        stepNumber:       Number(step['stepNumber'] ?? step['step_number'] ?? 0),
        action:           String(step['action'] ?? ''),
        selector:         step['selector'] ? String(step['selector']) : undefined,
        status:           (step['status'] === 'passed' ? 'passed' : step['status'] === 'skipped' ? 'skipped' : 'failed') as StepSummary['status'],
        error:            step['error'] ? String(step['error']) : undefined,
        duration_ms:      Number(step['duration_ms'] ?? 0),
        screenshotUrl:    step['screenshotUrl'] ? String(step['screenshotUrl']) : undefined,
        healingAttempted: Boolean(step['healingAttempted'] ?? false),
      };
    });

    const failedStepList = steps.filter(s => s.status === 'failed');

    const assertions: AssertionSummary[] = (assertResult.data ?? []).map((a: Record<string, unknown>) => ({
      id:            String(a['id'] ?? ''),
      stepNumber:    Number(a['step_number'] ?? 0),
      assertionKind: String(a['assertion_kind'] ?? ''),
      status:        String(a['status'] ?? 'SKIPPED') as AssertionSummary['status'],
      expected:      String(a['expected'] ?? ''),
      actual:        String(a['actual'] ?? ''),
      message:       String(a['message'] ?? ''),
      error:         a['error'] ? String(a['error']) : undefined,
      evidenceUrl:   a['evidence_url'] ? String(a['evidence_url']) : undefined,
    }));

    const healingAttempts: HealingAttemptSummary[] = (healResult.data ?? []).map((h: Record<string, unknown>) => ({
      stepId:          String(h['step_id'] ?? ''),
      stepNumber:      Number(h['step_number'] ?? 0),
      outcome:         String(h['outcome'] ?? 'not_applicable') as HealingAttemptSummary['outcome'],
      strategyUsed:    h['strategy_used'] ? String(h['strategy_used']) : undefined,
      confidence:      h['confidence'] != null ? Number(h['confidence']) : undefined,
      originalLocator: h['original_locator_value'] ? String(h['original_locator_value']) : undefined,
      resolvedLocator: h['resolved_locator_value'] ? String(h['resolved_locator_value']) : undefined,
    }));

    // Extract device info from timeline_events if present
    const timeline = (run['timeline_events'] as unknown[]) ?? [];
    const sessionEvent = (timeline as Record<string, unknown>[]).find(e =>
      typeof e['deviceInfo'] === 'object' || typeof e['device_info'] === 'object',
    );
    const rawDevice = sessionEvent
      ? ((sessionEvent['deviceInfo'] ?? sessionEvent['device_info']) as Record<string, unknown>)
      : null;

    const testCaseRow = run['test_cases'] as Record<string, unknown> | null;

    return {
      runId,
      testCaseId:   run['test_case_id'] ? String(run['test_case_id']) : undefined,
      testCaseName: testCaseRow?.['title'] ? String(testCaseRow['title']) : undefined,
      status:       String(run['state'] ?? run['status'] ?? 'unknown'),
      totalSteps:   Number(run['total_steps'] ?? steps.length),
      passedSteps:  Number(run['passed_steps'] ?? steps.filter(s => s.status === 'passed').length),
      failedSteps:  Number(run['failed_steps'] ?? failedStepList.length),
      skippedSteps: Number(run['skipped_steps'] ?? steps.filter(s => s.status === 'skipped').length),
      duration_ms:  Number(run['duration_ms'] ?? 0),
      error:        run['error'] ? String(run['error']) : undefined,
      startedAt:    String(run['started_at'] ?? run['created_at'] ?? ''),
      completedAt:  run['completed_at'] ? String(run['completed_at']) : undefined,
      deviceInfo:   rawDevice ? {
        platform:    String(rawDevice['platform'] ?? 'unknown'),
        os_version:  rawDevice['os_version'] ? String(rawDevice['os_version']) : undefined,
        device_name: rawDevice['device_name'] ?? rawDevice['deviceName'] ? String(rawDevice['device_name'] ?? rawDevice['deviceName']) : undefined,
        driver_id:   rawDevice['driver_id'] ?? rawDevice['driverId'] ? String(rawDevice['driver_id'] ?? rawDevice['driverId']) : undefined,
      } : undefined,
      steps,
      failedStepList,
      assertions,
      healingAttempts,
    };
  }
}
