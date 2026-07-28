import { supabase } from '@/lib/supabase';
import type { Bug, BugComment, BugHistory, BugRelationship, BugAttachment, BugRelationshipType } from '@/types';

export interface BugFilters {
  status?: string;
  severity?: string;
  priority?: string;
  release_id?: string;
  assigned_to?: string;
  module_id?: string;
  search?: string;
  is_regression?: boolean;
  page?: number;
  pageSize?: number;
}

export const bugService = {
  async list(projectId: string, filters: BugFilters = {}): Promise<Bug[]> {
    let q = supabase.from('bugs').select(`
      *, reporter:profiles!reported_by(id,full_name,avatar_url),
      assignee:profiles!assigned_to(id,full_name,avatar_url),
      module:modules(id,name),
      release:releases(id,name,version)
    `).eq('project_id', projectId).order('created_at', { ascending: false });

    if (filters.status) q = q.eq('status', filters.status);
    if (filters.severity) q = q.eq('severity', filters.severity);
    if (filters.priority) q = q.eq('priority', filters.priority);
    if (filters.release_id) q = q.eq('release_id', filters.release_id);
    if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
    if (filters.module_id) q = q.eq('module_id', filters.module_id);
    if (filters.is_regression !== undefined) q = q.eq('is_regression', filters.is_regression);
    if (filters.search) q = q.or(`title.ilike.%${filters.search}%,bug_id.ilike.%${filters.search}%`);
    if (filters.page !== undefined && filters.pageSize) {
      const from = filters.page * filters.pageSize;
      q = q.range(from, from + filters.pageSize - 1);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Bug[];
  },

  async get(id: string): Promise<Bug> {
    const { data, error } = await supabase.from('bugs').select(`
      *, reporter:profiles!reported_by(id,full_name,email,avatar_url),
      assignee:profiles!assigned_to(id,full_name,email,avatar_url),
      module:modules(id,name), release:releases(id,name,version),
      project:projects(id,name,slug,color)
    `).eq('id', id).single();
    if (error) throw error;
    return data as Bug;
  },

  async create(payload: Partial<Bug>): Promise<Bug> {
    const { data, error } = await supabase.from('bugs').insert(payload).select().single();
    if (error) throw error;
    return data as Bug;
  },

  async update(id: string, payload: Partial<Bug>): Promise<Bug> {
    const { data, error } = await supabase.from('bugs').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as Bug;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('bugs').delete().eq('id', id);
    if (error) throw error;
  },

  async getComments(bugId: string): Promise<BugComment[]> {
    const { data, error } = await supabase.from('bug_comments')
      .select('*, user:profiles(id,full_name,avatar_url)')
      .eq('bug_id', bugId).order('created_at');
    if (error) throw error;
    return (data ?? []) as BugComment[];
  },

  async addComment(bugId: string, userId: string, content: string, isInternal = false): Promise<BugComment> {
    const { data, error } = await supabase.from('bug_comments')
      .insert({ bug_id: bugId, user_id: userId, content, is_internal: isInternal })
      .select('*, user:profiles(id,full_name,avatar_url)').single();
    if (error) throw error;
    return data as BugComment;
  },

  async updateComment(id: string, content: string): Promise<void> {
    const { error } = await supabase.from('bug_comments').update({ content }).eq('id', id);
    if (error) throw error;
  },

  async deleteComment(id: string): Promise<void> {
    const { error } = await supabase.from('bug_comments').delete().eq('id', id);
    if (error) throw error;
  },

  async getHistory(bugId: string): Promise<BugHistory[]> {
    const { data, error } = await supabase.from('bug_history')
      .select('*, changer:profiles!changed_by(id,full_name,avatar_url)')
      .eq('bug_id', bugId).order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as BugHistory[];
  },

  async getStats(projectId: string) {
    const { data } = await supabase.from('bugs').select('severity,status').eq('project_id', projectId);
    const bugs = data ?? [];
    return {
      bySeverity: {
        critical: bugs.filter(b => b.severity === 'critical').length,
        high: bugs.filter(b => b.severity === 'high').length,
        medium: bugs.filter(b => b.severity === 'medium').length,
        low: bugs.filter(b => b.severity === 'low').length,
      },
      byStatus: {
        open: bugs.filter(b => !['closed', 'rejected', 'duplicate'].includes(b.status)).length,
        closed: bugs.filter(b => b.status === 'closed').length,
        rejected: bugs.filter(b => b.status === 'rejected').length,
      },
    };
  },

  async checkDuplicate(projectId: string, title: string): Promise<Bug[]> {
    const { data } = await supabase.from('bugs')
      .select('id,bug_id,title,status,severity')
      .eq('project_id', projectId)
      .ilike('title', `%${title.substring(0, 30)}%`)
      .neq('status', 'closed').limit(5);
    return (data ?? []) as Bug[];
  },

  async assign(id: string, assignedTo: string | null, updatedBy: string): Promise<Bug> {
    const { data, error } = await supabase.from('bugs')
      .update({ assigned_to: assignedTo, status: assignedTo ? 'assigned' : 'triaged', updated_by: updatedBy } as Partial<Bug> & { updated_by: string })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Bug;
  },

  async bulkUpdate(ids: string[], payload: Partial<Bug>): Promise<void> {
    const { error } = await supabase.from('bugs').update(payload).in('id', ids);
    if (error) throw error;
  },

  // Relationships
  async getRelationships(bugId: string): Promise<BugRelationship[]> {
    const { data, error } = await supabase
      .from('bug_relationships')
      .select(`
        *, creator:profiles!created_by(id,full_name),
        related_bug:bugs!related_bug_id(id,bug_id,title,status,severity)
      `)
      .eq('bug_id', bugId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as BugRelationship[];
  },

  async addRelationship(bugId: string, relatedBugId: string, relationship: BugRelationshipType, createdBy: string): Promise<BugRelationship> {
    const { data, error } = await supabase
      .from('bug_relationships')
      .insert({ bug_id: bugId, related_bug_id: relatedBugId, relationship, created_by: createdBy })
      .select()
      .single();
    if (error) throw error;
    return data as BugRelationship;
  },

  async removeRelationship(id: string): Promise<void> {
    const { error } = await supabase.from('bug_relationships').delete().eq('id', id);
    if (error) throw error;
  },

  // Watchers
  async getWatchers(bugId: string): Promise<{ id: string; user_id: string; user?: { full_name: string; avatar_url: string | null } | null }[]> {
    const { data, error } = await supabase
      .from('bug_watchers')
      .select('id,user_id,user:profiles(id,full_name,avatar_url)')
      .eq('bug_id', bugId);
    if (error) throw error;
    return (data ?? []) as unknown as { id: string; user_id: string; user?: { full_name: string; avatar_url: string | null } | null }[];
  },

  async addWatcher(bugId: string, userId: string): Promise<void> {
    await supabase.from('bug_watchers').upsert({ bug_id: bugId, user_id: userId }, { onConflict: 'bug_id,user_id' });
  },

  async removeWatcher(bugId: string, userId: string): Promise<void> {
    await supabase.from('bug_watchers').delete().eq('bug_id', bugId).eq('user_id', userId);
  },

  // Attachments
  async getAttachments(bugId: string): Promise<BugAttachment[]> {
    const { data, error } = await supabase
      .from('bug_attachments')
      .select('*, uploader:profiles!uploaded_by(id,full_name)')
      .eq('bug_id', bugId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as BugAttachment[];
  },

  async addAttachment(input: {
    bug_id: string; file_name: string; file_url: string;
    file_type: string; file_size?: number; uploaded_by: string; comment_id?: string;
  }): Promise<BugAttachment> {
    const { data, error } = await supabase.from('bug_attachments').insert(input).select().single();
    if (error) throw error;
    return data as BugAttachment;
  },

  async deleteAttachment(id: string): Promise<void> {
    const { error } = await supabase.from('bug_attachments').delete().eq('id', id);
    if (error) throw error;
  },

  // Developer resolution
  async submitResolution(id: string, resolution: {
    fix_version?: string; commit_ref?: string; pull_request?: string;
    root_cause?: string; resolution_notes?: string; files_changed?: string;
  }): Promise<Bug> {
    const { data, error } = await supabase.from('bugs')
      .update({ ...resolution, status: 'ready_for_qa' })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Bug;
  },

  // QA retest workflow
  async markRetesting(id: string, retesterId: string): Promise<Bug> {
    const { data, error } = await supabase.from('bugs')
      .update({ status: 'retesting', retested_by: retesterId, retested_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Bug;
  },

  async failRetest(id: string, notes: string): Promise<Bug> {
    const { data, error } = await supabase.from('bugs')
      .update({ status: 'in_progress', resolution_notes: notes })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Bug;
  },

  async getRetestQueue(userId: string): Promise<Bug[]> {
    const { data, error } = await supabase.from('bugs')
      .select(`*, project:projects(id,name,color), release:releases(id,name,version), module:modules(id,name)`)
      .eq('retested_by', userId)
      .in('status', ['ready_for_qa', 'retesting'])
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Bug[];
  },

  async getMyBugs(userId: string): Promise<Bug[]> {
    const { data, error } = await supabase.from('bugs')
      .select(`*, project:projects(id,name,color), release:releases(id,name,version), module:modules(id,name)`)
      .eq('assigned_to', userId)
      .not('status', 'in', '("closed","verified","rejected","duplicate","wont_fix")')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Bug[];
  },
};
