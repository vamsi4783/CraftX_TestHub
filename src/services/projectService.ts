import { supabase } from '@/lib/supabase';
import type { Project, ProjectMember, UserRole } from '@/types';

export interface ProjectFilters {
  search?: string;
  status?: string;
  platform?: string;
  page?: number;
  pageSize?: number;
}

export const projectService = {
  async list(filters: ProjectFilters = {}): Promise<Project[]> {
    let q = supabase.from('projects').select(`
      *, owner:profiles!owner_id(id,full_name,email,avatar_url)
    `).order('created_at', { ascending: false });

    if (filters.status) q = q.eq('status', filters.status);
    else q = q.neq('status', 'archived');
    if (filters.platform) q = q.eq('platform', filters.platform);
    if (filters.search) q = q.ilike('name', `%${filters.search}%`);
    if (filters.page !== undefined && filters.pageSize) {
      const from = filters.page * filters.pageSize;
      q = q.range(from, from + filters.pageSize - 1);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Project[];
  },

  async get(id: string): Promise<Project> {
    const { data, error } = await supabase.from('projects')
      .select('*, owner:profiles!owner_id(id,full_name,email,avatar_url)')
      .eq('id', id).single();
    if (error) throw error;
    return data as Project;
  },

  async create(payload: {
    name: string; description?: string; platform: string; owner_id: string;
    color: string; version?: string; repository_url?: string; tags?: string[];
  }): Promise<Project> {
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 20);
    const { data, error } = await supabase.from('projects').insert({
      ...payload, slug, status: 'active', tags: payload.tags ?? [],
    }).select().single();
    if (error) throw error;
    await supabase.from('project_members').insert({ project_id: data.id, user_id: payload.owner_id, role: 'administrator' });
    return data as Project;
  },

  async update(id: string, payload: Partial<Project>): Promise<Project> {
    const { data, error } = await supabase.from('projects').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as Project;
  },

  async archive(id: string): Promise<void> {
    const { error } = await supabase.from('projects').update({ status: 'archived' }).eq('id', id);
    if (error) throw error;
  },

  async restore(id: string): Promise<void> {
    const { error } = await supabase.from('projects').update({ status: 'active' }).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  async getMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await supabase.from('project_members')
      .select('*, profile:profiles(id,full_name,email,avatar_url,role)')
      .eq('project_id', projectId).order('joined_at');
    if (error) throw error;
    return (data ?? []) as ProjectMember[];
  },

  async addMember(projectId: string, userId: string, role: UserRole = 'viewer'): Promise<void> {
    const { error } = await supabase.from('project_members').upsert({ project_id: projectId, user_id: userId, role });
    if (error) throw error;
  },

  async updateMemberRole(projectId: string, userId: string, role: UserRole): Promise<void> {
    const { error } = await supabase.from('project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId);
    if (error) throw error;
  },

  async removeMember(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
    if (error) throw error;
  },

  async getStats(projectId: string) {
    const [bugs, releases] = await Promise.all([
      supabase.from('bugs').select('id', { count: 'exact', head: true }).eq('project_id', projectId).neq('status', 'closed'),
      supabase.from('releases').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'testing'),
    ]);
    return { open_bugs: bugs.count ?? 0, active_releases: releases.count ?? 0 };
  },
};
