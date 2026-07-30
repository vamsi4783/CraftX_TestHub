import { supabase } from '@/lib/supabase';
import type { TestExecution, ExecutionStepResult, ExecutionAttachment } from '@/types';

export const executionService = {
  async start(input: {
    session_id: string;
    session_case_id: string;
    test_case_id: string;
    project_id: string;
    release_id?: string;
    executed_by: string;
    environment?: string;
    device_info?: string;
    app_version?: string;
    build_number?: string;
    step_snapshot?: unknown;
  }): Promise<TestExecution> {
    const { data, error } = await supabase
      .from('test_executions')
      .insert({ ...input, status: 'in_progress' })
      .select()
      .single();
    if (error) throw error;
    // Link execution to session case — only set in_progress if not already completed
    await supabase.from('test_session_cases')
      .update({ execution_id: data.id, status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', input.session_case_id)
      .not('status', 'in', '("pass","fail","blocked","skipped")');
    return data as TestExecution;
  },

  async get(id: string): Promise<TestExecution> {
    const { data, error } = await supabase
      .from('test_executions')
      .select(`
        *, test_case:test_cases(id,test_id,title,priority,preconditions,module:modules(id,name)),
        executor:profiles!executed_by(id,full_name,avatar_url),
        step_results:execution_step_results(*, bug:bugs(id,bug_id,title,severity,status)),
        attachments:execution_attachments(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    const exec = data as TestExecution;
    if (exec.step_results) exec.step_results.sort((a, b) => a.step_number - b.step_number);
    return exec;
  },

  async getBySessionCase(sessionCaseId: string): Promise<TestExecution | null> {
    const { data, error } = await supabase
      .from('test_executions')
      .select(`*, step_results:execution_step_results(*), attachments:execution_attachments(*)`)
      .eq('session_case_id', sessionCaseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as TestExecution | null;
  },

  async saveStepResult(input: {
    execution_id: string;
    step_id?: string;
    step_number: number;
    step_description?: string;
    expected_result?: string;
    status: string;
    actual_result?: string;
    notes?: string;
  }): Promise<ExecutionStepResult> {
    // Upsert by execution_id + step_number
    const { data: existing } = await supabase
      .from('execution_step_results')
      .select('id')
      .eq('execution_id', input.execution_id)
      .eq('step_number', input.step_number)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('execution_step_results')
        .update({ status: input.status, actual_result: input.actual_result, notes: input.notes })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as ExecutionStepResult;
    } else {
      const { data, error } = await supabase
        .from('execution_step_results')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ExecutionStepResult;
    }
  },

  async getStepResults(executionId: string): Promise<ExecutionStepResult[]> {
    const { data, error } = await supabase
      .from('execution_step_results')
      .select(`*, bug:bugs(id,bug_id,title,severity,status)`)
      .eq('execution_id', executionId)
      .order('step_number');
    if (error) throw error;
    return data as ExecutionStepResult[];
  },

  async complete(id: string, finalStatus: string, notes?: string): Promise<void> {
    const { error } = await supabase.from('test_executions').update({
      status: finalStatus, notes, completed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  async abandon(id: string): Promise<void> {
    await supabase.from('test_executions').update({ status: 'abandoned' }).eq('id', id);
  },

  async linkBugToStep(stepResultId: string, bugId: string): Promise<void> {
    const { error } = await supabase.from('execution_step_results').update({ bug_id: bugId }).eq('id', stepResultId);
    if (error) throw error;
  },

  async uploadAttachment(input: {
    execution_id: string;
    step_result_id?: string;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size?: number;
    uploaded_by: string;
  }): Promise<ExecutionAttachment> {
    const { data, error } = await supabase.from('execution_attachments').insert(input).select().single();
    if (error) throw error;
    return data as ExecutionAttachment;
  },

  async getAttachments(executionId: string): Promise<ExecutionAttachment[]> {
    const { data, error } = await supabase
      .from('execution_attachments')
      .select('*')
      .eq('execution_id', executionId)
      .order('created_at');
    if (error) throw error;
    return data as ExecutionAttachment[];
  },

  async deleteAttachment(id: string): Promise<void> {
    const { error } = await supabase.from('execution_attachments').delete().eq('id', id);
    if (error) throw error;
  },

  async getHistory(testCaseId: string, limit = 20): Promise<TestExecution[]> {
    const { data, error } = await supabase
      .from('test_executions')
      .select(`*, executor:profiles!executed_by(id,full_name,avatar_url)`)
      .eq('test_case_id', testCaseId)
      .not('status', 'eq', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as TestExecution[];
  },

  async getSessionHistory(sessionId: string): Promise<TestExecution[]> {
    const { data, error } = await supabase
      .from('test_executions')
      .select(`
        *, test_case:test_cases(id,test_id,title),
        executor:profiles!executed_by(id,full_name,avatar_url)
      `)
      .eq('session_id', sessionId)
      .order('created_at');
    if (error) throw error;
    return data as TestExecution[];
  },
};
