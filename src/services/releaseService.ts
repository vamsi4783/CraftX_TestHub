import { supabase } from '@/lib/supabase';
import type { Release, ReleaseReadiness, ReleaseBuild, ReleaseDocument, QAApproval, QAApprovalChecklist } from '@/types';

export const releaseService = {
  async list(projectId: string): Promise<Release[]> {
    const { data, error } = await supabase
      .from('releases')
      .select(`*, creator:profiles!created_by(id,full_name,avatar_url)`)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Release[];
  },

  async get(id: string): Promise<Release> {
    const { data, error } = await supabase
      .from('releases')
      .select(`*, creator:profiles!created_by(id,full_name,avatar_url), project:projects(id,name,slug,color)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Release;
  },

  async create(input: {
    project_id: string; name: string; version: string; build_number?: string;
    start_date?: string; end_date?: string; description?: string; created_by: string;
  }): Promise<Release> {
    const { data, error } = await supabase.from('releases').insert(input).select().single();
    if (error) throw error;
    return data as Release;
  },

  async update(id: string, input: Partial<Release>): Promise<Release> {
    const { data, error } = await supabase.from('releases').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Release;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('releases').delete().eq('id', id);
    if (error) throw error;
  },

  async getReadiness(releaseId: string): Promise<ReleaseReadiness> {
    const { data, error } = await supabase.rpc('calculate_release_readiness', { p_release_id: releaseId });
    if (error) throw error;
    return data as ReleaseReadiness;
  },

  // ── Builds ───────────────────────────────────────────────
  async getBuilds(releaseId: string): Promise<ReleaseBuild[]> {
    const { data, error } = await supabase
      .from('release_builds')
      .select('*, uploader:profiles!uploaded_by(id,full_name)')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReleaseBuild[];
  },

  async addBuild(input: Omit<ReleaseBuild, 'id' | 'created_at' | 'uploader'>): Promise<ReleaseBuild> {
    // Mark previous builds of same platform as not latest
    await supabase.from('release_builds')
      .update({ is_latest: false })
      .eq('release_id', input.release_id)
      .eq('platform', input.platform);
    const { data, error } = await supabase.from('release_builds').insert({ ...input, is_latest: true }).select().single();
    if (error) throw error;
    return data as ReleaseBuild;
  },

  async deleteBuild(id: string): Promise<void> {
    const { error } = await supabase.from('release_builds').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Documents ────────────────────────────────────────────
  async getDocuments(releaseId: string): Promise<ReleaseDocument[]> {
    const { data, error } = await supabase
      .from('release_documents')
      .select('*, uploader:profiles!uploaded_by(id,full_name)')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReleaseDocument[];
  },

  async addDocument(input: Omit<ReleaseDocument, 'id' | 'created_at' | 'updated_at' | 'uploader'>): Promise<ReleaseDocument> {
    const { data, error } = await supabase.from('release_documents').insert(input).select().single();
    if (error) throw error;
    return data as ReleaseDocument;
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from('release_documents').delete().eq('id', id);
    if (error) throw error;
  },

  // ── QA Approval ──────────────────────────────────────────
  async getApproval(releaseId: string): Promise<QAApproval | null> {
    const { data, error } = await supabase
      .from('qa_approvals')
      .select('*, approver:profiles!approved_by(id,full_name,avatar_url)')
      .eq('release_id', releaseId)
      .maybeSingle();
    if (error) throw error;
    return data as QAApproval | null;
  },

  async upsertApproval(releaseId: string, input: {
    status?: string; checklist?: Partial<QAApprovalChecklist>;
    notes?: string; approved_by?: string;
  }): Promise<QAApproval> {
    const existing = await this.getApproval(releaseId);
    if (existing) {
      const merged = { ...existing.checklist, ...(input.checklist ?? {}) };
      const update: Record<string, unknown> = { notes: input.notes, checklist: merged };
      if (input.status) {
        update.status = input.status;
        update.approved_by = input.approved_by;
        update.action_taken_at = new Date().toISOString();
      }
      const { data, error } = await supabase.from('qa_approvals').update(update).eq('id', existing.id).select().single();
      if (error) throw error;
      return data as QAApproval;
    } else {
      const { data, error } = await supabase.from('qa_approvals').insert({
        release_id: releaseId,
        checklist: input.checklist ?? {},
        notes: input.notes,
        status: input.status ?? 'pending',
        approved_by: input.approved_by,
      }).select().single();
      if (error) throw error;
      return data as QAApproval;
    }
  },

  async clone(releaseId: string, userId: string, newName: string, newVersion: string): Promise<Release> {
    const original = await this.get(releaseId);
    const { data, error } = await supabase.from('releases').insert({
      project_id: original.project_id,
      name: newName,
      version: newVersion,
      description: original.description,
      created_by: userId,
      cloned_from: releaseId,
      status: 'planning',
    }).select().single();
    if (error) throw error;
    return data as Release;
  },
};
