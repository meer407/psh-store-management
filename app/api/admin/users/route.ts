import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireSuperAdmin(req: NextRequest) {
  console.log('[users API] step 1: checking auth header');
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth token', status: 401 } as const;

  console.log('[users API] step 2: calling supabaseAdmin.auth.getUser');
  const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
  console.log('[users API] step 3: getUser result', { caller: !!caller, callerError });
  if (callerError || !caller) return { error: 'Invalid or expired session', status: 401 } as const;

  console.log('[users API] step 4: fetching caller profile');
  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  console.log('[users API] step 5: callerProfile', callerProfile);
  if (callerProfile?.role !== 'super_admin') return { error: 'Only super admins can manage users', status: 403 } as const;

  return { caller } as const;
}

export async function POST(req: NextRequest) {
  console.log('[users API] POST hit');
  const check = await requireSuperAdmin(req);
  console.log('[users API] requireSuperAdmin done', check);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  console.log('[users API] body parsed', body);

  const { email, password, full_name, role, branch_id } = body as {
    email?: string; password?: string; full_name?: string; role?: string; branch_id?: string;
  };

  if (!email?.trim() || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  if (role === 'branch_user' && !branch_id) return NextResponse.json({ error: 'Please select a branch for this user' }, { status: 400 });

  console.log('[users API] step 6: calling auth.admin.createUser');
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name?.trim() || '' },
  });
  console.log('[users API] step 7: createUser result', { created: !!created?.user, createError });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 500 });
  }

  console.log('[users API] step 8: upserting profile');
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: created.user.id,
    email: email.trim(),
    full_name: full_name?.trim() || '',
    role: role || 'viewer',
    branch_id: role === 'branch_user' ? (branch_id || null) : null,
  });
  console.log('[users API] step 9: done', { profileError });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: created.user.id });
}