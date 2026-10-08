'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Category, Store } from '@/lib/types';
import { isSuperAdmin } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Tag, Search, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', store_id: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: cats }, { data: strs }, { data: profile }] = await Promise.all([
      supabase.from('categories').select('*, stores(name)').order('name'),
      supabase.from('stores').select('*').order('name'),
      supabase.from('profiles').select('role').eq('id', user?.id || '').maybeSingle(),
    ]);
    setCategories((cats || []) as unknown as Category[]);
    setStores((strs || []) as unknown as Store[]);
    setCanManage(isSuperAdmin((profile as { role: string } | null)?.role));
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', store_id: stores[0]?.id || '', description: '' });
    setDialogOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, store_id: c.store_id, description: c.description || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Category name is required'); return; }
    if (!form.store_id) { toast.error('Please select a store'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('categories').update(form).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('Category updated'); logAudit('UPDATE', 'categories', editing.id, { name: form.name }); }
    } else {
      const { error } = await supabase.from('categories').insert(form);
      if (error) toast.error(error.message);
      else { toast.success('Category added'); logAudit('INSERT', 'categories', undefined, { name: form.name }); }
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('categories').delete().eq('id', deleteId);
    if (error) toast.error(error.message);
    else { toast.success('Category deleted'); logAudit('DELETE', 'categories', deleteId); }
    setDeleteId(null);
    fetchData();
  };

  const filtered = categories.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStore = storeFilter === 'all' || c.store_id === storeFilter;
    return matchSearch && matchStore;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="w-6 h-6" /> Categories
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canManage ? 'Manage item categories per store' : 'View item categories (read-only)'}
          </p>
        </div>
        {canManage && (
          <Button onClick={openAdd} disabled={stores.length === 0}>
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">You have view-only access. Only Super Admin can add, edit, or delete categories.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search categories..." value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} categories</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Category Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Store</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canManage ? 5 : 4 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 5 : 4} className="text-center py-12 text-muted-foreground">
                      {search || storeFilter !== 'all' ? 'No categories match your filters' : 'No categories added yet.'}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{(c.stores as { name: string } | null)?.name || '-'}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.description || '-'}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Category' : 'Add New Category'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Category Name *</Label>
                <Input className="mt-1" placeholder="Food / Clothing / Household..." value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Store *</Label>
                <Select value={form.store_id} onValueChange={v => setForm(f => ({ ...f, store_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input className="mt-1" placeholder="Optional description" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>Products in this category will have their category removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
