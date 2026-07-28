import { supabase } from '@/lib/supabase';
import type { DashboardStats } from '@/types';

export const dashboardService = {
  async getStats(userId: string): Promise<DashboardStats> {
    const [projects, releases, bugs, critBugs, tests, completedTests, passedTests, features] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
      supabase.from('releases').select('id', { count: 'exact', head: true }).in('status', ['testing', 'planning']),
      supabase.from('bugs').select('id', { count: 'exact', head: true }).not('status', 'in', '(closed,rejected,duplicate)'),
      supabase.from('bugs').select('id', { count: 'exact', head: true }).eq('severity', 'critical').not('status', 'in', '(closed,rejected)'),
      supabase.from('test_assignments').select('id', { count: 'exact', head: true }).eq('assigned_to', userId).eq('status', 'pending'),
      supabase.from('test_assignments').select('id', { count: 'exact', head: true }).eq('assigned_to', userId).eq('status', 'completed'),
      supabase.from('test_results').select('id', { count: 'exact', head: true }).eq('executed_by', userId).eq('status', 'pass'),
      supabase.from('feature_requests').select('id', { count: 'exact', head: true }).not('status', 'in', '(rejected,completed)'),
    ]);

    return {
      total_projects: projects.count ?? 0,
      active_releases: releases.count ?? 0,
      open_bugs: bugs.count ?? 0,
      critical_bugs: critBugs.count ?? 0,
      assigned_tests: tests.count ?? 0,
      completed_tests: completedTests.count ?? 0,
      passed_tests: passedTests.count ?? 0,
      feature_requests: features.count ?? 0,
    };
  },

  async getRecentBugs(limit = 5) {
    const { data } = await supabase.from('bugs')
      .select('id,bug_id,title,severity,status,created_at,project:projects(id,name,color)')
      .order('created_at', { ascending: false }).limit(limit);
    return data ?? [];
  },

  async getMyTests(userId: string, limit = 5) {
    const { data } = await supabase.from('test_assignments')
      .select('*, test_case:test_cases(id,test_id,title,priority), release:releases(id,name,version)')
      .eq('assigned_to', userId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(limit);
    return data ?? [];
  },

  async getBugTrend() {
    // Last 8 weeks of bug creation
    const weeks: { week: string; count: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const { count } = await supabase.from('bugs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      weeks.push({ week: `W${8 - i}`, count: count ?? 0 });
    }
    return weeks;
  },
};
