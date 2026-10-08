'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Branch } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Settings, User, Shield, Users, UserPlus, Trash2, Mail, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { USER_ROLES, isSuperAdmin } from '@/lib/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { logAudit } from '@/lib/audit';

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'viewer', branch_id: '' });
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (data) {
          setProfile(data as Profile);
          setForm({ full_name: (data as Profile).full_name, email: (data as Profile).email });
        }
        if (isSuperAdmin((data as Profile)?.role)) {
          const { data: users } = await supabase.from('profiles').select('*').order('created_at');
          setAllUsers((users || []) as Profile[]);
          const { data: branchList } = await supabase.from('branches').select('*').eq('status', 'active').order('name');
          setBranches((branchList || []) as unknown as Branch[]);
        }
      }
    });
  }, []);

  const handleUpdateProfile = async () => {
    if (!profile) return;
    if (!form.full_name.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }

    setSaving(true);

    // If email changed, update the actual auth email first.
    // Supabase sends a confirmation link to the NEW email — the change only
    // takes effect in auth.users once the person clicks that link.
    const emailChanged = form.email.trim() !== profile.email;
    if (emailChanged) {
      const { error: authError } = await supabase.auth.updateUser({ email: form.email.trim() });
      if (authError) {
        toast.error(authError.message);
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    setProfile(p => p ? { ...p, full_name: form.full_name.trim(), email: form.email.trim() } : p);

    if (emailChanged) {
      toast.success('Name updated. Check your new email inbox and click the confirmation link to finish changing your email.');
    } else {
      toast.success('Profile updated');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (passwordForm.new !== passwordForm.confirm) { toast.error('Passwords do not match'); return; }
    if (passwordForm.new.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.new });
    if (error) toast.error(error.message);
    else { toast.success('Password changed successfully'); setPasswordForm({ current: '', new: '', confirm: '' }); }
    setChangingPassword(false);
  };

  const handleUpdateUserRole = async (userId: string, role: string) => {
    // If switching a user OUT of branch_user, clear their branch_id.
    // If switching a user INTO branch_user without a branch already set,
    // they'll need one assigned via the branch column below (handled separately).
    const payload: { role: string; branch_id?: string | null } = { role };
    if (role !== 'branch_user') payload.branch_id = null;

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error) toast.error(error.message);
    else {
      toast.success('User role updated');
      logAudit('UPDATE', 'profiles', userId, { role });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as Profile['role'], branch_id: payload.branch_id !== undefined ? payload.branch_id : u.branch_id } : u));
    }
  };

  const handleUpdateUserBranch = async (userId: string, branchId: string) => {
    const { error } = await supabase.from('profiles').update({ branch_id: branchId || null }).eq('id', userId);
    if (error) toast.error(error.message);
    else {
      toast.success('Branch assignment updated');
      logAudit('UPDATE', 'profiles', userId, { branch_id: branchId });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, branch_id: branchId || null } : u));
    }
  };

  // Creates the user through our own server-side API route (/api/admin/users),
  // which uses the Supabase service-role key to create the auth account and
  // profile in one atomic step. This does NOT touch the currently logged-in
  // admin's own session (unlike client-side supabase.auth.signUp(), which can
  // silently replace/log out the admin's session).
  const handleCreateUser = async () => {
    if (!newUser.email.trim() || !newUser.password) { toast.error('Email and password are required'); return; }
    if (newUser.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newUser.role === 'branch_user' && !newUser.branch_id) { toast.error('Please select a branch for this user'); return; }

    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          email: newUser.email.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          branch_id: newUser.branch_id,
        }),
      });

      let result: { error?: string; userId?: string } = {};
      try {
        result = await res.json();
      } catch {
        throw new Error(`Server error (status ${res.status}). Check server logs / SUPABASE_SERVICE_ROLE_KEY.`);
      }

      if (!res.ok) {
        toast.error(result.error || 'Failed to create user');
        return;
      }

      toast.success('User created successfully');
      logAudit('INSERT', 'profiles', result.userId, { email: newUser.email, role: newUser.role, branch_id: newUser.branch_id });
      setCreateUserOpen(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'viewer', branch_id: '' });
      const { data: users } = await supabase.from('profiles').select('*').order('created_at');
      setAllUsers((users || []) as Profile[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong while creating the user');
    } finally {
      setCreatingUser(false);
    }
  };

  // Deletes the user through our own server-side API route (/api/admin/users/[id]),
  // which uses the service-role key to bypass RLS entirely AND fully removes
  // the auth.users account — this is why the user no longer reappears after
  // a refresh (the old client-side delete could be silently blocked by RLS).
  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    const idToDelete = deleteUserId;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/users/${idToDelete}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      let result: { error?: string } = {};
      try {
        result = await res.json();
      } catch {
        throw new Error(`Server error (status ${res.status}). Check server logs / SUPABASE_SERVICE_ROLE_KEY.`);
      }

      if (!res.ok) {
        toast.error(result.error || 'Failed to delete user');
        return;
      }

      toast.success('User removed');
      logAudit('DELETE', 'profiles', idToDelete);
      setAllUsers(prev => prev.filter(u => u.id !== idToDelete));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong while deleting the user');
    } finally {
      setDeleteUserId(null);
    }
  };

  const roleColors: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    store_keeper: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    branch_user: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your profile and system configuration</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> Profile</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-2xl font-bold">
              {profile?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-semibold">{profile?.full_name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${roleColors[profile?.role || 'viewer']}`}>
                {USER_ROLES.find(r => r.value === profile?.role)?.label || 'Viewer'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input className="mt-1" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              {form.email.trim() !== profile?.email && (
                <p className="text-xs text-muted-foreground mt-1">
                  You&apos;ll get a confirmation email at the new address — the change applies once you click that link.
                </p>
              )}
            </div>
          </div>
          <Button onClick={handleUpdateProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Update Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Security</CardTitle>
          <CardDescription>Change your password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>New Password</Label>
            <Input className="mt-1" type="password" placeholder="••••••••" value={passwordForm.new}
              onChange={e => setPasswordForm(f => ({ ...f, new: e.target.value }))} />
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <Input className="mt-1" type="password" placeholder="••••••••" value={passwordForm.confirm}
              onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline">
            {changingPassword ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* User Management (Super Admin only) */}
      {isSuperAdmin(profile?.role) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> User Management</CardTitle>
                <CardDescription>Create, edit, and manage user roles and permissions</CardDescription>
              </div>
              <Button size="sm" onClick={() => setCreateUserOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" /> Add User
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || 'User'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={roleColors[user.role]}>
                        {USER_ROLES.find(r => r.value === user.role)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.id !== profile?.id && (
                        <Select value={user.role} onValueChange={v => handleUpdateUserRole(user.id, v)}>
                          <SelectTrigger className="w-[160px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {USER_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.id !== profile?.id && user.role === 'branch_user' ? (
                        <Select
                          value={user.branch_id || 'none'}
                          onValueChange={v => handleUpdateUserBranch(user.id, v === 'none' ? '' : v)}
                        >
                          <SelectTrigger className="w-[160px] h-8">
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Branch</SelectItem>
                            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.id !== profile?.id && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteUserId(user.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input className="mt-1" placeholder="Enter full name" value={newUser.full_name}
                onChange={e => setNewUser(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>Email *</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" type="email" placeholder="user@example.com" value={newUser.email}
                  onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Password *</Label>
              <Input className="mt-1" type="password" placeholder="Minimum 6 characters" value={newUser.password}
                onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(f => ({ ...f, role: v, branch_id: v === 'branch_user' ? f.branch_id : '' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Branch selection only appears (and is required) for branch_user role —
                e.g. a girls-section branch. Super admin just picks the branch here. */}
            {newUser.role === 'branch_user' && (
              <div>
                <Label className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Branch *</Label>
                <Select value={newUser.branch_id || 'none'} onValueChange={v => setNewUser(f => ({ ...f, branch_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a branch...</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">This user will only see data for the selected branch.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the user profile and their auth account. The user will no longer be able to access the system.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteUser}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}