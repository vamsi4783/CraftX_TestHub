import { supabase } from '@/lib/supabase';
import type { TestPlan, TestPlanCase } from '@/types';

export interface SuiteExportPayload {
  version: '1.0';
  metadata: {
    exported_at: string;
    source_plan_id: string;
    source_plan_name: string;
  };
  suite: {
    id: string;
    name: string;
    description: null;
    module: string;
    version: string;
    tags: string[];
    automation: { runner: null; config: Record<string, never> };
  };
  test_cases: Array<{
    id: string;
    title: string;
    description: string | null;
    priority: string;
    module: string;
    preconditions: string | null;
    expected_result: string | null;
    tags: string[];
    automation: { type: 'MANUAL'; automation_id: null; runner: null; runner_config: Record<string, never>; expected_duration_ms: null };
    steps: Array<{ order: number; action: string; expected: string; notes: string | null; automation_selector: null; automation_action_config: Record<string, never> }>;
  }>;
}

export const testPlanService = {
  async list(projectId: string): Promise<TestPlan[]> {
    const { data, error } = await supabase
      .from('test_plans')
      .select(`*, release:releases(id,name,version), creator:profiles!created_by(id,full_name), test_plan_cases(count)`)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      ...p,
      case_count: p.test_plan_cases?.[0]?.count ?? 0,
      test_plan_cases: undefined,
    })) as TestPlan[];
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

  async resetStatus(planId: string): Promise<{ success: boolean; plan_name: string; sessions_reset: number; executions_reset: number }> {
    const { data, error } = await supabase.functions.invoke('import-test-suite', {
      body: { action: 'reset', plan_id: planId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error ?? 'Reset failed');
    return data;
  },

  async getSuiteExportData(planId: string, planName: string, projectId: string): Promise<SuiteExportPayload> {
    const { data: planCases, error: pcErr } = await supabase
      .from('test_plan_cases')
      .select(`
        order_index,
        test_case:test_cases(
          id, test_id, title, description, priority, preconditions, expected_result, tags,
          module:modules(id, name),
          steps:test_case_steps(id, step_number, action, expected_result, notes)
        )
      `)
      .eq('plan_id', planId)
      .order('order_index');
    if (pcErr) throw pcErr;

    const test_cases = (planCases ?? []).map((pc: any) => {
      const tc = pc.test_case;
      const steps = (tc.steps ?? [])
        .sort((a: any, b: any) => a.step_number - b.step_number)
        .map((s: any) => ({
          order: s.step_number,
          action: s.action ?? '',
          expected: s.expected_result ?? '',
          notes: s.notes ?? null,
          automation_selector: null,
          automation_action_config: {},
        }));
      return {
        id: tc.test_id,
        title: tc.title,
        description: tc.description ?? null,
        priority: tc.priority,
        module: tc.module?.name ?? 'General',
        preconditions: tc.preconditions ?? null,
        expected_result: tc.expected_result ?? null,
        tags: tc.tags ?? [],
        automation: { type: 'MANUAL' as const, automation_id: null, runner: null, runner_config: {}, expected_duration_ms: null },
        steps,
      };
    });

    return {
      version: '1.0',
      metadata: {
        exported_at: new Date().toISOString(),
        source_plan_id: planId,
        source_plan_name: planName,
      },
      suite: {
        id: planId,
        name: planName,
        description: null,
        module: 'General',
        version: '1.0.0',
        tags: [],
        automation: { runner: null, config: {} },
      },
      test_cases,
    };
  },
};
