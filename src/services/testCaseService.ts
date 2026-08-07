import { supabase } from '@/lib/supabase';
import type { TestCase, TestCaseStep, TestAssignment, TestResult } from '@/types';

export const testCaseService = {
  async list(projectId: string, filters?: { module_id?: string; status?: string; search?: string }): Promise<TestCase[]> {
    let q = supabase
      .from('test_cases')
      .select(`*, module:modules(id,name), creator:profiles!created_by(id,full_name)`)
      .eq('project_id', projectId)
      .order('test_id', { ascending: true });

    if (filters?.module_id) q = q.eq('module_id', filters.module_id);
    if (filters?.status)    q = q.eq('status', filters.status);
    if (filters?.search)    q = q.ilike('title', `%${filters.search}%`);

    const { data, error } = await q;
    if (error) throw error;
    return data as TestCase[];
  },

  async get(id: string): Promise<TestCase> {
    const { data, error } = await supabase
      .from('test_cases')
      .select(`*, module:modules(id,name), creator:profiles!created_by(id,full_name,avatar_url), steps:test_case_steps(*)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    const tc = data as TestCase;
    if (tc.steps) tc.steps.sort((a, b) => a.step_number - b.step_number);
    return tc;
  },

  async create(input: Partial<TestCase> & { project_id: string; title: string; created_by: string }): Promise<TestCase> {
    const { data, error } = await supabase.from('test_cases').insert(input).select().single();
    if (error) throw error;
    return data as TestCase;
  },

  async update(id: string, input: Partial<TestCase>): Promise<TestCase> {
    const { data, error } = await supabase.from('test_cases').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as TestCase;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('test_cases').delete().eq('id', id);
    if (error) throw error;
  },

  async saveSteps(testCaseId: string, steps: Omit<TestCaseStep, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    await supabase.from('test_case_steps').delete().eq('test_case_id', testCaseId);
    if (steps.length > 0) {
      const { error } = await supabase.from('test_case_steps').insert(steps.map((s, i) => ({ ...s, test_case_id: testCaseId, step_number: i + 1 })));
      if (error) throw error;
    }
  },

  async saveStepAutomation(stepId: string, config: import('@/types').AutomationConfig | null): Promise<void> {
    const { error } = await supabase
      .from('test_case_steps')
      .update({ automation_config: config })
      .eq('id', stepId);
    if (error) throw error;
  },

  // Assignments
  async getAssignments(releaseId: string, userId?: string): Promise<TestAssignment[]> {
    let q = supabase
      .from('test_assignments')
      .select(`
        *, test_case:test_cases(id,test_id,title,priority,estimated_minutes,module:modules(id,name)),
        assignee:profiles!assigned_to(id,full_name,avatar_url),
        release:releases(id,name,version)
      `)
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false });

    if (userId) q = q.eq('assigned_to', userId);
    const { data, error } = await q;
    if (error) throw error;
    return data as TestAssignment[];
  },

  async getMyAssignments(userId: string): Promise<TestAssignment[]> {
    const { data, error } = await supabase
      .from('test_assignments')
      .select(`
        *, test_case:test_cases(id,test_id,title,priority,module:modules(id,name)),
        release:releases(id,name,version,project:projects(id,name,color))
      `)
      .eq('assigned_to', userId)
      .not('status', 'eq', 'completed')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as TestAssignment[];
  },

  async assign(input: {
    test_case_id: string; release_id: string; assigned_to: string; assigned_by: string;
    priority?: string; deadline?: string; notes?: string;
  }): Promise<TestAssignment> {
    const { data, error } = await supabase.from('test_assignments').insert(input).select().single();
    if (error) throw error;
    return data as TestAssignment;
  },

  async submitResult(input: {
    assignment_id: string; test_case_id: string; release_id: string;
    executed_by: string; status: string; notes?: string; duration_minutes?: number; device_info?: string;
  }): Promise<TestResult> {
    const { data, error } = await supabase
      .from('test_results')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    // Update assignment status
    await supabase.from('test_assignments').update({ status: 'completed' }).eq('id', input.assignment_id);
    return data as TestResult;
  },
};
