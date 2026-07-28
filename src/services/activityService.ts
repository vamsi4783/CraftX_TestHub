import { supabase } from '@/lib/supabase';
import type { ActivityLog } from '@/types';

export const activityService = {
  async log(entry: {
    project_id?: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await supabase.from('activity_logs').insert({
      ...entry,
      details: entry.details ?? {},
    });
  },

  async getForProject(projectId: string, limit = 50): Promise<ActivityLog[]> {
    const { data, error } = await supabase.from('activity_logs')
      .select('*, user:profiles(id,full_name,avatar_url)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ActivityLog[];
  },

  async getRecent(limit = 20): Promise<ActivityLog[]> {
    const { data, error } = await supabase.from('activity_logs')
      .select('*, user:profiles(id,full_name,avatar_url)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ActivityLog[];
  },
};
