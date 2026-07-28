import { supabase } from '@/lib/supabase';
import type { Module } from '@/types';

export const moduleService = {
  async list(projectId: string): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    if (error) throw error;
    return data as Module[];
  },

  async create(input: { project_id: string; name: string; description?: string; created_by: string }): Promise<Module> {
    const { data, error } = await supabase.from('modules').insert(input).select().single();
    if (error) throw error;
    return data as Module;
  },

  async update(id: string, input: Partial<Module>): Promise<Module> {
    const { data, error } = await supabase.from('modules').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Module;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('modules').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },

  DEFAULT_MODULES: [
    'Authentication', 'Dashboard', 'Products', 'Sales', 'Purchases',
    'Customers', 'Vendors', 'Expenses', 'Reports', 'Settings',
    'Notifications', 'Inventory', 'Subscription',
  ],
};
