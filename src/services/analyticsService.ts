import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyBugCount { day: string; created: number; closed: number }
export interface DailyTestCount { day: string; pass: number; fail: number; blocked: number; skipped: number }
export interface ModuleCoverage {
  module_id: string; module_name: string; total_cases: number;
  assigned: number; completed: number; passed: number; failed: number; blocked: number;
  coverage_pct: number;
}
export interface TesterStats {
  user_id: string; full_name: string; avatar_url: string | null;
  assigned: number; executed: number; passed: number; failed: number; blocked: number; skipped: number;
  avg_duration_minutes: number | null; efficiency_pct: number;
}
export interface DeveloperStats {
  user_id: string; full_name: string; avatar_url: string | null;
  assigned_bugs: number; resolved: number; in_progress: number; reopened: number;
  avg_resolution_hours: number | null;
}
export interface BugAging { range: string; count: number }
export interface ActivityEntry {
  id: string; user_id: string; action: string; entity_type: string;
  entity_name: string | null; created_at: string;
  user?: { full_name: string | null; avatar_url: string | null };
}
export interface DashboardStatsV2 {
  total_projects: number; active_releases: number; active_sessions: number;
  open_bugs: number; critical_bugs: number; my_open_bugs: number;
  my_retest_queue: number; qa_pending: number; assigned_tests: number;
  completed_tests: number; passed_tests: number; blocked_tests: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const analyticsService = {
  // Comprehensive dashboard stats via RPC
  async getDashboardStatsV2(userId: string): Promise<DashboardStatsV2> {
    const { data, error } = await supabase.rpc('get_dashboard_stats_v2', { p_user_id: userId });
    if (error) {
      // Fallback to basic stats if RPC not yet applied
      const [projects, bugs, critical, assigned, completed, passed] = await Promise.all([
        supabase.from('projects').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
        supabase.from('bugs').select('id', { count: 'exact', head: true }).not('status', 'in', '(closed,rejected,duplicate,wont_fix,cannot_reproduce)'),
        supabase.from('bugs').select('id', { count: 'exact', head: true }).eq('severity', 'critical').not('status', 'in', '(closed,rejected,duplicate,wont_fix)'),
        supabase.from('test_assignments').select('id', { count: 'exact', head: true }).eq('assigned_to', userId).neq('status', 'completed'),
        supabase.from('test_assignments').select('id', { count: 'exact', head: true }).eq('assigned_to', userId).eq('status', 'completed'),
        supabase.from('test_results').select('id', { count: 'exact', head: true }).eq('executed_by', userId).eq('status', 'pass'),
      ]);
      return {
        total_projects: projects.count ?? 0, active_releases: 0, active_sessions: 0,
        open_bugs: bugs.count ?? 0, critical_bugs: critical.count ?? 0, my_open_bugs: 0,
        my_retest_queue: 0, qa_pending: 0,
        assigned_tests: assigned.count ?? 0, completed_tests: completed.count ?? 0,
        passed_tests: passed.count ?? 0, blocked_tests: 0,
      };
    }
    return data as DashboardStatsV2;
  },

  // Bug creation + closure trend
  async getBugTrend(projectId: string, days = 30): Promise<DailyBugCount[]> {
    const { data, error } = await supabase.rpc('get_bug_trend', { p_project_id: projectId, p_days: days });
    if (error) {
      // Fallback: client-side daily aggregation
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data: bugs } = await supabase.from('bugs')
        .select('created_at, closed_at').eq('project_id', projectId)
        .gte('created_at', since.toISOString());
      const map: Record<string, { created: number; closed: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().split('T')[0];
        map[key] = { created: 0, closed: 0 };
      }
      (bugs ?? []).forEach((b) => {
        const cd = b.created_at?.split('T')[0];
        const cl = b.closed_at?.split('T')[0];
        if (cd && map[cd]) map[cd].created++;
        if (cl && map[cl]) map[cl].closed++;
      });
      return Object.entries(map).map(([day, v]) => ({ day, ...v }));
    }
    return (data ?? []) as DailyBugCount[];
  },

  // Test execution trend
  async getTestTrend(projectId: string, days = 30): Promise<DailyTestCount[]> {
    const { data, error } = await supabase.rpc('get_test_execution_trend', { p_project_id: projectId, p_days: days });
    if (error) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const map: Record<string, DailyTestCount> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().split('T')[0];
        map[key] = { day: key, pass: 0, fail: 0, blocked: 0, skipped: 0 };
      }
      return Object.values(map);
    }
    return (data ?? []) as DailyTestCount[];
  },

  // Bug severity + status distribution
  async getBugDistribution(projectId: string) {
    const { data } = await supabase.from('bugs').select('severity,status').eq('project_id', projectId);
    const bugs = data ?? [];
    const bySeverity = [
      { name: 'Critical', value: bugs.filter(b => b.severity === 'critical').length, fill: '#7C3AED' },
      { name: 'High',     value: bugs.filter(b => b.severity === 'high').length,     fill: '#EF4444' },
      { name: 'Medium',   value: bugs.filter(b => b.severity === 'medium').length,   fill: '#F59E0B' },
      { name: 'Low',      value: bugs.filter(b => b.severity === 'low').length,      fill: '#10B981' },
    ].filter(d => d.value > 0);
    const byStatus = [
      { name: 'New',         value: bugs.filter(b => b.status === 'new').length,                                        fill: '#EF4444' },
      { name: 'In Progress', value: bugs.filter(b => ['triaged','assigned','in_progress'].includes(b.status)).length,  fill: '#4F46E5' },
      { name: 'Ready QA',    value: bugs.filter(b => b.status === 'ready_for_qa').length,                              fill: '#06B6D4' },
      { name: 'Retesting',   value: bugs.filter(b => b.status === 'retesting').length,                                 fill: '#F59E0B' },
      { name: 'Closed',      value: bugs.filter(b => ['closed','verified'].includes(b.status)).length,                 fill: '#10B981' },
      { name: 'Rejected',    value: bugs.filter(b => ['rejected','wont_fix','cannot_reproduce'].includes(b.status)).length, fill: '#9CA3AF' },
    ].filter(d => d.value > 0);
    return { bySeverity, byStatus, total: bugs.length };
  },

  // Module coverage
  async getModuleCoverage(projectId: string): Promise<ModuleCoverage[]> {
    const { data, error } = await supabase.from('v_module_coverage' as never)
      .select('*').eq('project_id', projectId).order('total_cases', { ascending: false });
    if (error) return [];
    return ((data ?? []) as Record<string, number & string>[]).map(r => ({
      module_id: r.module_id as string,
      module_name: r.module_name as string,
      total_cases: Number(r.total_cases ?? 0),
      assigned: Number(r.assigned ?? 0),
      completed: Number(r.completed ?? 0),
      passed: Number(r.passed ?? 0),
      failed: Number(r.failed ?? 0),
      blocked: Number(r.blocked ?? 0),
      coverage_pct: Number(r.total_cases) > 0
        ? Math.round((Number(r.completed) / Number(r.total_cases)) * 100)
        : 0,
    }));
  },

  // Bug aging buckets
  getBugAging(bugs: Array<{ created_at: string; status: string }>): BugAging[] {
    const open = bugs.filter(b => !['closed','rejected','duplicate','wont_fix','cannot_reproduce','verified'].includes(b.status));
    const now = Date.now();
    return [
      { range: '< 1 day',   min: 0,   max: 1 },
      { range: '1–3 days',  min: 1,   max: 3 },
      { range: '4–7 days',  min: 3,   max: 7 },
      { range: '1–2 weeks', min: 7,   max: 14 },
      { range: '2–4 weeks', min: 14,  max: 28 },
      { range: '> 1 month', min: 28,  max: Infinity },
    ].map(r => ({
      range: r.range,
      count: open.filter(b => {
        const days = (now - new Date(b.created_at).getTime()) / 86_400_000;
        return days >= r.min && days < r.max;
      }).length,
    }));
  },

  // Tester performance via view
  async getTesterPerformance(): Promise<TesterStats[]> {
    const { data, error } = await supabase.from('v_tester_performance' as never).select('*').order('executed' as never, { ascending: false });
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map(r => ({
      user_id: r.user_id as string,
      full_name: (r.full_name as string) ?? '',
      avatar_url: (r.avatar_url as string | null) ?? null,
      assigned: Number(r.assigned ?? 0),
      executed: Number(r.executed ?? 0),
      passed: Number(r.passed ?? 0),
      failed: Number(r.failed ?? 0),
      blocked: Number(r.blocked ?? 0),
      skipped: Number(r.skipped ?? 0),
      avg_duration_minutes: r.avg_duration_minutes != null ? Number(r.avg_duration_minutes) : null,
      efficiency_pct: Number(r.executed) > 0 ? Math.round((Number(r.passed) / Number(r.executed)) * 100) : 0,
    }));
  },

  // Developer performance via view
  async getDeveloperPerformance(): Promise<DeveloperStats[]> {
    const { data, error } = await supabase.from('v_developer_performance' as never).select('*').order('assigned_bugs' as never, { ascending: false });
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map(r => ({
      user_id: r.user_id as string,
      full_name: (r.full_name as string) ?? '',
      avatar_url: (r.avatar_url as string | null) ?? null,
      assigned_bugs: Number(r.assigned_bugs ?? 0),
      resolved: Number(r.resolved ?? 0),
      in_progress: Number(r.in_progress ?? 0),
      reopened: Number(r.reopened ?? 0),
      avg_resolution_hours: r.avg_resolution_hours != null ? Number(r.avg_resolution_hours) : null,
    }));
  },

  // Activity feed
  async getActivityFeed(limit = 25): Promise<ActivityEntry[]> {
    const { data } = await supabase.from('activity_logs')
      .select('id,user_id,action,entity_type,entity_name,created_at,user:profiles!user_id(full_name,avatar_url)')
      .order('created_at', { ascending: false }).limit(limit);
    return (data ?? []) as unknown as ActivityEntry[];
  },

  // Releases by status for a project
  async getReleaseStatusBreakdown(projectId: string) {
    const { data } = await supabase.from('releases').select('status').eq('project_id', projectId);
    const counts: Record<string, number> = {};
    (data ?? []).forEach(r => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
    const labels: Record<string, string> = { planning: 'Planning', testing: 'Testing', ready: 'Ready', released: 'Released', archived: 'Archived' };
    const colors: Record<string, string> = { planning: '#9CA3AF', testing: '#4F46E5', ready: '#06B6D4', released: '#10B981', archived: '#6B7280' };
    return Object.entries(counts).map(([status, value]) => ({ name: labels[status] ?? status, value, fill: colors[status] ?? '#9CA3AF' }));
  },

  // Bugs by module
  async getBugsByModule(projectId: string) {
    const { data } = await supabase.from('bugs')
      .select('module_id,status,severity,module:modules(name)').eq('project_id', projectId);
    const map: Record<string, { name: string; total: number; open: number; critical: number }> = {};
    (data ?? []).forEach((b: Record<string, unknown>) => {
      const key = (b.module_id as string) ?? 'unassigned';
      const mod = b.module as { name: string } | null;
      const name = mod?.name ?? 'Unassigned';
      if (!map[key]) map[key] = { name, total: 0, open: 0, critical: 0 };
      map[key].total++;
      if (!['closed','rejected','duplicate','wont_fix','cannot_reproduce'].includes(b.status as string)) map[key].open++;
      if (b.severity === 'critical') map[key].critical++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  },

  // Release history
  async getReleaseHistory(projectId: string) {
    const { data } = await supabase.from('releases')
      .select('*,creator:profiles!created_by(full_name),qa_approvals(status,action_taken_at)')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    return data ?? [];
  },

  // Export: all bugs for a project (flat rows for CSV/Excel)
  async exportBugs(projectId: string) {
    const { data } = await supabase.from('bugs')
      .select('bug_id,title,severity,priority,status,environment,browser,device,os_version,app_version,created_at,updated_at,closed_at,reporter:profiles!reported_by(full_name),assignee:profiles!assigned_to(full_name),module:modules(name),release:releases(name,version)')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    return (data ?? []).map((b: Record<string, unknown>) => ({
      'Bug ID':       b.bug_id,
      'Title':        b.title,
      'Severity':     b.severity,
      'Priority':     b.priority,
      'Status':       b.status,
      'Module':       (b.module as { name: string } | null)?.name ?? '',
      'Release':      (b.release as { name: string; version: string } | null)
                        ? `${(b.release as { name: string; version: string }).name} v${(b.release as { name: string; version: string }).version}` : '',
      'Reporter':     (b.reporter as { full_name: string } | null)?.full_name ?? '',
      'Assignee':     (b.assignee as { full_name: string } | null)?.full_name ?? '',
      'Environment':  b.environment,
      'Browser':      b.browser,
      'Device':       b.device,
      'OS Version':   b.os_version,
      'App Version':  b.app_version,
      'Created':      b.created_at,
      'Updated':      b.updated_at,
      'Closed':       b.closed_at,
    }));
  },

  // Export: test results
  async exportTestResults(projectId: string) {
    const { data } = await supabase.from('test_results')
      .select('status,duration_minutes,executed_at,environment,notes,executor:profiles!executed_by(full_name),test_case:test_cases(test_id,title),assignment:test_assignments(release:releases(name,version))')
      .order('executed_at', { ascending: false }).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Test ID':    (r.test_case as { test_id: string } | null)?.test_id ?? '',
      'Title':      (r.test_case as { title: string } | null)?.title ?? '',
      'Status':     r.status,
      'Executor':   (r.executor as { full_name: string } | null)?.full_name ?? '',
      'Release':    (() => { const rel = (r.assignment as { release: { name: string; version: string } } | null)?.release; return rel ? `${rel.name} v${rel.version}` : ''; })(),
      'Duration (min)': r.duration_minutes,
      'Environment': r.environment,
      'Notes':      r.notes,
      'Executed At': r.executed_at,
    }));
  },
};
