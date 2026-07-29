import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types';

export const notificationService = {
  async getForUser(userId: string, limit = 50): Promise<Notification[]> {
    const { data, error } = await supabase.from('notifications')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Notification[];
  },

  async getUnreadCount(userId: string): Promise<number> {
    const { count } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('is_read', false);
    return count ?? 0;
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) throw error;
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false);
    if (error) throw error;
  },

  async send(payload: {
    user_id: string; type: string; title: string; message: string;
    entity_type?: string; entity_id?: string;
  }): Promise<void> {
    await supabase.from('notifications').insert(payload);
  },

  subscribeToUser(userId: string, onNew: (n: Notification) => void) {
    const channelName = `notifications:${userId}:${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => onNew(payload.new as Notification))
      .subscribe();
    return {
      unsubscribe: () => supabase.removeChannel(channel),
    };
  },
};
