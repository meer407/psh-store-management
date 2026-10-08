import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-only admin client (bypasses RLS, can manage auth users directly).
// This file only ever runs on the server (Next.js API route), so the
// service role key never reaches the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth token', status: 401 } as const;

  const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
  if (callerError || !caller) {
    console.log('AUTH DEBUG:', callerError); // <-- temporary
    return { error: `Invalid or expired session: ${callerError?.message}`, status: 401 } as const;
  }

  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'super_admin') return { error: 'Only super admins can manage users', status: 403 } as const;

  return { caller } as const;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSuperAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  // Next.js 15: params is now a Promise — must be awaited before use.
  const { id: targetId } = await params;

  if (targetId === check.caller.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  // Remove the profile row (service role bypasses RLS, so this always works
  // regardless of what DELETE policies exist on the profiles table).
  const { error: profileDeleteError } = await supabaseAdmin.from('profiles').delete().eq('id', targetId);
  if (profileDeleteError) {
    return NextResponse.json({ error: profileDeleteError.message }, { status: 500 });
  }

  // Fully remove the auth account too, so the user can no longer log in at all —
  // this is the part that was never possible from the client before.
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetId);
  if (authDeleteError) {
    return NextResponse.json({ error: authDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}