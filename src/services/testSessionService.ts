import { supabase } from '@/lib/supabase';
import type { TestSession, TestSessionCase } from '@/types';

export const testSessionService = {
  async list(filters?: { project_id?: string; release_id?: string; assigned_to?: string; status?: string }): Promise<TestSession[]> {
    let q = supabase
      .from('test_sessions')
      .select(`
        *, project:projects(id,name,color), release:releases(id,name,version),
        assignee:profiles!assigned_to(id,full_name,avatar_url),
        assigner:profiles!assigned_by(id,full_name)
      `)
      .order('created_at', { ascending: false });
    if (filters?.project_id) q = q.eq('project_id', filters.project_id);
    if (filters?.release_id) q = q.eq('release_id', filters.release_id);
    if (filters?.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
    if (filters?.status)     q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return data as TestSession[];
  },

  async get(id: string): Promise<TestSession> {
    const { data, error } = await supabase
      .from('test_sessions')
      .select(`
        *, project:projects(id,name,color), release:releases(id,name,version),
        assignee:profiles!assigned_to(id,full_name,avatar_url),
        assigner:profiles!assigned_by(id,full_name),
        cases:test_session_cases(
          *, test_case:test_cases(id,test_id,title,priority,estimated_minutes,steps:test_case_steps(*),module:modules(id,name))
        )
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    const s = data as TestSession;
    if (s.cases) s.cases.sort((a, b) => a.order_index - b.order_index);
    return s;
  },

  async create(input: {
    project_id: string; name: string; assigned_to: string; assigned_by: string;
    plan_id?: string; release_id?: string; description?: string;
    start_date?: string; end_date?: string;
  }): Promise<TestSession> {
    const { data, error } = await supabase.from('test_sessions').insert(input).select().single();
    if (error) throw error;
    return data as TestSession;
  },

  async update(id: string, input: Partial<TestSession>): Promise<TestSession> {
    const { data, error } = await supabase.from('test_sessions').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as TestSession;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('test_sessions').delete().eq('id', id);
    if (error) throw error;
  },

  async addCases(sessionId: string, testCaseIds: string[]): Promise<void> {
    const { data: existing } = await supabase
      .from('test_session_cases')
      .select('order_index')
      .eq('session_id', sessionId)
      .order('order_index', { ascending: false })
      .limit(1);
    const startIdx = existing?.[0]?.order_index ?? -1;
    const rows = testCaseIds.map((tc_id, i) => ({
      session_id: sessionId,
      test_case_id: tc_id,
      order_index: startIdx + i + 1,
    }));
    const { error } = await supabase.from('test_session_cases').insert(rows);
    if (error) throw error;
  },

  async addCasesFromPlan(sessionId: string, planId: string): Promise<void> {
    const { data: planCases } = await supabase
      .from('test_plan_cases')
      .select('test_case_id, order_index')
      .eq('plan_id', planId)
      .order('order_index');
    if (!planCases?.length) return;
    const rows = planCases.map((pc, i) => ({
      session_id: sessionId,
      test_case_id: pc.test_case_id,
      order_index: i,
    }));
    const { error } = await supabase.from('test_session_cases').insert(rows);
    if (error) throw error;
    // update total count
    await supabase.from('test_sessions').update({ total_cases: rows.length }).eq('id', sessionId);
  },

  async getCases(sessionId: string): Promise<TestSessionCase[]> {
    const { data, error } = await supabase
      .from('test_session_cases')
      .select(`
        *, test_case:test_cases(id,test_id,title,priority,estimated_minutes,steps:test_case_steps(*),module:modules(id,name))
      `)
      .eq('session_id', sessionId)
      .order('order_index');
    if (error) throw error;
    return data as TestSessionCase[];
  },

  async updateCaseStatus(sessionCaseId: string, status: string): Promise<void> {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status };
    if (status === 'in_progress') update.started_at = now;
    if (['pass', 'fail', 'blocked', 'skipped'].includes(status)) update.completed_at = now;
    const { error } = await supabase.from('test_session_cases').update(update).eq('id', sessionCaseId);
    if (error) throw error;
  },

  async start(id: string): Promise<void> {
    const { error } = await supabase.from('test_sessions').update({
      status: 'in_progress', started_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  async complete(id: string): Promise<void> {
    const { error } = await supabase.from('test_sessions').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  async pause(id: string): Promise<void> {
    const { error } = await supabase.from('test_sessions').update({ status: 'paused' }).eq('id', id);
    if (error) throw error;
  },

  async saveProgress(id: string, currentCaseId: string, currentStepIndex: number): Promise<void> {
    await supabase.from('test_sessions').update({ current_case_id: currentCaseId, current_step_index: currentStepIndex }).eq('id', id);
  },

  async getMySessions(userId: string): Promise<TestSession[]> {
    const { data, error } = await supabase
      .from('test_sessions')
      .select(`*, project:projects(id,name,color), release:releases(id,name,version)`)
      .eq('assigned_to', userId)
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as TestSession[];
  },
};
