import { supabase } from '@/lib/supabase';
import type { TestPlan, TestPlanCase } from '@/types';

export const testPlanService = {
  async list(projectId: string): Promise<TestPlan[]> {
    const { data, error } = await supabase
      .from('test_plans')
      .select(`*, release:releases(id,name,version), creator:profiles!created_by(id,full_name)`)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as TestPlan[];
  },

  async get(id: string): Promise<TestPlan> {
    const { data, error } = await supabase
      .from('test_plans')
      .select(`
        *, release:releases(id,name,version), creator:profiles!created_by(id,full_name,avatar_url),
        cases:test_plan_cases(*, test_case:test_cases(id,test_id,title,priority,status,module:modules(id,name)))
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    const plan = data as TestPlan;
    if (plan.cases) plan.cases.sort((a, b) => a.order_index - b.order_index);
    return plan;
  },

  async create(input: {
    project_id: string; name: string; description?: string;
    release_id?: string; created_by: string;
  }): Promise<TestPlan> {
    const { data, error } = await supabase.from('test_plans').insert(input).select().single();
    if (error) throw error;
    return data as TestPlan;
  },

  async update(id: string, input: Partial<TestPlan>): Promise<TestPlan> {
    const { data, error } = await supabase.from('test_plans').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as TestPlan;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('test_plans').delete().eq('id', id);
    if (error) throw error;
  },

  async addCases(planId: string, testCaseIds: string[]): Promise<void> {
    const { data: existing } = await supabase
      .from('test_plan_cases')
      .select('order_index')
      .eq('plan_id', planId)
      .order('order_index', { ascending: false })
      .limit(1);
    const startIdx = existing?.[0]?.order_index ?? -1;
    const rows = testCaseIds.map((tc_id, i) => ({
      plan_id: planId,
      test_case_id: tc_id,
      order_index: startIdx + i + 1,
    }));
    const { error } = await supabase.from('test_plan_cases').upsert(rows, { onConflict: 'plan_id,test_case_id' });
    if (error) throw error;
  },

  async removeCase(planCaseId: string): Promise<void> {
    const { error } = await supabase.from('test_plan_cases').delete().eq('id', planCaseId);
    if (error) throw error;
  },

  async reorderCases(cases: { id: string; order_index: number }[]): Promise<void> {
    await Promise.all(
      cases.map(c => supabase.from('test_plan_cases').update({ order_index: c.order_index }).eq('id', c.id))
    );
  },

  async getCases(planId: string): Promise<TestPlanCase[]> {
    const { data, error } = await supabase
      .from('test_plan_cases')
      .select(`*, test_case:test_cases(id,test_id,title,priority,status,estimated_minutes,module:modules(id,name))`)
      .eq('plan_id', planId)
      .order('order_index');
    if (error) throw error;
    return data as TestPlanCase[];
  },
};
