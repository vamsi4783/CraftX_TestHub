import { supabase } from '@/lib/supabase';

export type ImportMode = 'CREATE_NEW' | 'MERGE_EXISTING';

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  error_code: string;
  error_message: string;
  test_case_id?: string;
  field_path?: string;
}

export interface ImportPreview {
  mode: ImportMode;
  suite: { id: string | null; name: string; module: string | null; version: string };
  total_cases: number;
  total_steps: number;
  cases_by_priority: Record<string, number>;
  cases_by_module: Record<string, number>;
  warnings: ValidationIssue[];
}

export interface PreviewResult {
  success: boolean;
  job_id: string;
  error_count: number;
  warning_count: number;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
  preview?: ImportPreview;
}

export interface ConfirmResult {
  success: boolean;
  job_id: string;
  mode: ImportMode;
  cases_created: number;
  cases_updated: number;
  steps_total: number;
}

export const importSuiteService = {
  async preview(payload: unknown, mode: ImportMode, projectId: string, planId?: string): Promise<PreviewResult> {
    const { data, error } = await supabase.functions.invoke('import-test-suite', {
      body: { action: 'preview', payload, mode, project_id: projectId, plan_id: planId ?? null },
    });
    if (error) throw error;
    return data as PreviewResult;
  },

  async confirm(jobId: string): Promise<ConfirmResult> {
    const { data, error } = await supabase.functions.invoke('import-test-suite', {
      body: { action: 'confirm', job_id: jobId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error ?? 'Import failed');
    return data as ConfirmResult;
  },
};
