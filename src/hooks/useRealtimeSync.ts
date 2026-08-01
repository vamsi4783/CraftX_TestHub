import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to Supabase Realtime for all key tables and invalidates
 * the matching React Query caches so every page auto-refreshes when
 * any user makes a change.
 *
 * Mount once at the app root (inside QueryClientProvider + AuthProvider).
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('realtime-sync')

      // ── Bugs ──────────────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bugs' }, () => {
        qc.invalidateQueries({ queryKey: ['bugs'] });
        qc.invalidateQueries({ queryKey: ['bug'] });
        qc.invalidateQueries({ queryKey: ['bug-dist'] });
        qc.invalidateQueries({ queryKey: ['bug-dist-dash'] });
        qc.invalidateQueries({ queryKey: ['bug-trend'] });
        qc.invalidateQueries({ queryKey: ['bug-trend-dash'] });
        qc.invalidateQueries({ queryKey: ['bugs-analytics'] });
        qc.invalidateQueries({ queryKey: ['bugs-by-module'] });
        qc.invalidateQueries({ queryKey: ['bugs-release'] });
        qc.invalidateQueries({ queryKey: ['module-coverage'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats-v2'] });
        qc.invalidateQueries({ queryKey: ['release-readiness'] });
        qc.invalidateQueries({ queryKey: ['my-bugs-dash'] });
        qc.invalidateQueries({ queryKey: ['my-retests-dash'] });
        qc.invalidateQueries({ queryKey: ['release-status'] });
        qc.invalidateQueries({ queryKey: ['release-status-dash'] });
      })

      // ── Bug comments ──────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_comments' }, () => {
        qc.invalidateQueries({ queryKey: ['bug-comments'] });
      })

      // ── Bug history ───────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_history' }, () => {
        qc.invalidateQueries({ queryKey: ['bug-history'] });
      })

      // ── Bug relationships ─────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_relationships' }, () => {
        qc.invalidateQueries({ queryKey: ['bug-relationships'] });
      })

      // ── Test assignments ──────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_assignments' }, () => {
        qc.invalidateQueries({ queryKey: ['assignments'] });
        qc.invalidateQueries({ queryKey: ['my-assignments'] });
        qc.invalidateQueries({ queryKey: ['assignments-analytics'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats-v2'] });
        qc.invalidateQueries({ queryKey: ['release-readiness'] });
      })

      // ── Test results ──────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_results' }, () => {
        qc.invalidateQueries({ queryKey: ['assignments'] });
        qc.invalidateQueries({ queryKey: ['my-assignments'] });
        qc.invalidateQueries({ queryKey: ['test-session'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats-v2'] });
      })

      // ── Test session cases ────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_session_cases' }, () => {
        qc.invalidateQueries({ queryKey: ['test-session'] });
        qc.invalidateQueries({ queryKey: ['release-readiness'] });
      })

      // ── Test sessions ─────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_sessions' }, () => {
        qc.invalidateQueries({ queryKey: ['test-sessions'] });
        qc.invalidateQueries({ queryKey: ['test-session'] });
        qc.invalidateQueries({ queryKey: ['sessions-release'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats-v2'] });
      })

      // ── Test cases ────────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_cases' }, () => {
        qc.invalidateQueries({ queryKey: ['test-cases'] });
        qc.invalidateQueries({ queryKey: ['test-case'] });
        qc.invalidateQueries({ queryKey: ['module-coverage'] });
      })

      // ── Test executions ───────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_executions' }, () => {
        qc.invalidateQueries({ queryKey: ['test-session'] });
      })

      // ── Releases ──────────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'releases' }, () => {
        qc.invalidateQueries({ queryKey: ['releases'] });
        qc.invalidateQueries({ queryKey: ['release'] });
        qc.invalidateQueries({ queryKey: ['release-readiness'] });
        qc.invalidateQueries({ queryKey: ['release-status'] });
        qc.invalidateQueries({ queryKey: ['release-status-dash'] });
        qc.invalidateQueries({ queryKey: ['release-history'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats-v2'] });
      })

      // ── Feature requests ──────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_requests' }, () => {
        qc.invalidateQueries({ queryKey: ['feature-requests'] });
      })

      // ── Notifications ─────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      })

      // ── Projects ──────────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['project'] });
      })

      // ── Modules ───────────────────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modules' }, () => {
        qc.invalidateQueries({ queryKey: ['modules'] });
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
