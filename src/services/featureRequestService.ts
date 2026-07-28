import { supabase } from '@/lib/supabase';
import type { FeatureRequest } from '@/types';

export const featureRequestService = {
  async list(projectId: string): Promise<FeatureRequest[]> {
    const { data, error } = await supabase
      .from('feature_requests')
      .select(`*, submitter:profiles!submitted_by(id,full_name,avatar_url)`)
      .eq('project_id', projectId)
      .order('vote_count', { ascending: false });
    if (error) throw error;
    return data as FeatureRequest[];
  },

  async create(input: {
    project_id: string; title: string; description: string;
    business_value?: string; category?: string; priority?: string; submitted_by: string;
  }): Promise<FeatureRequest> {
    const { data, error } = await supabase.from('feature_requests').insert(input).select().single();
    if (error) throw error;
    return data as FeatureRequest;
  },

  async update(id: string, input: Partial<FeatureRequest>): Promise<FeatureRequest> {
    const { data, error } = await supabase.from('feature_requests').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as FeatureRequest;
  },

  async vote(featureRequestId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('feature_request_votes').insert({ feature_request_id: featureRequestId, user_id: userId });
    if (error) throw error;
  },

  async unvote(featureRequestId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('feature_request_votes').delete().eq('feature_request_id', featureRequestId).eq('user_id', userId);
    if (error) throw error;
  },

  async checkVoted(featureRequestId: string, userId: string): Promise<boolean> {
    const { data } = await supabase.from('feature_request_votes').select('id').eq('feature_request_id', featureRequestId).eq('user_id', userId).single();
    return !!data;
  },
};
