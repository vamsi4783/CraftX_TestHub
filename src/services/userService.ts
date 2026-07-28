import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';

export const userService = {
  async list(): Promise<Profile[]> {
    const { data, error } = await supabase.from('profiles')
      .select('*').eq('is_active', true).order('full_name');
    if (error) throw error;
    return (data ?? []) as Profile[];
  },

  async get(id: string): Promise<Profile> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Profile;
  },

  async update(id: string, payload: { full_name?: string; avatar_url?: string; preferences?: Record<string, unknown> }): Promise<Profile> {
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as Profile;
  },

  async updateRole(id: string, role: UserRole): Promise<void> {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) throw error;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },

  async activate(id: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', id);
    if (error) throw error;
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `avatars/${userId}.${ext}`;
    const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('attachments').getPublicUrl(path);
    return data.publicUrl;
  },

  async changePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async inviteByEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.admin.inviteUserByEmail(email);
    if (error) throw error;
  },
};
