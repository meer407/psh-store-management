import { supabase } from './supabase';

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>,
  userName?: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('audit_logs').insert({
    user_id: user?.id ?? null,
    user_name: userName ?? user?.email ?? 'Unknown',
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    details: details ?? {},
  });
}
