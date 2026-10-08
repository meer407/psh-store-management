'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Return, Branch, Product, IssueSlip, ProductVariant, Profile } from '@/lib/types';
import { hasPermission, canEdit, canDelete } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Undo2, Search, Download, Eye, Printer, FileText, User, Calendar, ArrowRightLeft, Pencil, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printDocument } from '@/lib/export';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const emptyForm = {
  return_date: new Date().toISOString().split('T')[0],
  product_id: '',
  variant_id: '',
  branch_id: '',
  issue_slip_id: '',
  item_type: 'new' as 'new' | 'donation',
  condition: 'new' as 'new' | 'used',
  quantity: 1,
  returned_by: '',
  reason: '',
};

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom';
const PAGE_SIZE = 10;

export default function ReturnsPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [issueSlips, setIssueSlips] = useState<IssueSlip[]>([]);
  const [variants, setVariants] = useState<Record<string, ProductVariant[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewReturn, setViewReturn] = useState<Return | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'date' | 'product' | 'branch'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');

  const canManage = hasPermission(profile?.role, 'returns.manage');
  const canEditRecords = canEdit(profile?.role);
  const canDeleteRecords = canDelete(profile?.role);
  const isBranchUser = !!profile?.branch_id;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user?.id || '').maybeSingle();
    setProfile(prof as Profile | null);

    const profData = prof as Profile | null;
    const branchId = profData?.branch_id;

    const [retRes, branchRes, prodRes, slipRes, variantRes] = await Promise.all([
      supabase.from('returns').select('*, products(name, unit, stores(name)), branches(name), issue_slips(issue_number, beneficiary_name), product_variants(id, variant_name, variant_value, barcode, sku)').order('return_date', { ascending: false }),
      supabase.from('branches').select('*').eq('status', 'active').order('name'),
      supabase.from('products').select('id, name, unit, stores(name)').eq('is_active', true).order('name'),
      supabase.from('issue_slips').select('id, issue_number, beneficiary_name, branch_id').order('issue_date', { ascending: false }),
      supabase.from('product_variants').select('*'),
    ]);

    let retData = (retRes.data || []) as unknown as Return[];
    // Any user assigned to a branch only sees their branch's data
    if (branchId) {
      retData = retData.filter(r => r.branch_id === branchId);
    }

    setReturns(retData);
    setBranches((branchRes.data || []) as unknown as Branch[]);
    setProducts((prodRes.data || []) as unknown as Product[]);
    setIssueSlips((slipRes.data || []) as unknown as IssueSlip[]);

    const variantMap: Record<string, ProductVariant[]> = {};
    (variantRes.data || []).forEach((v: ProductVariant) => {
      if (!variantMap[v.product_id]) variantMap[v.product_id] = [];
      variantMap[v.product_id].push(v);
    });
    setVariants(variantMap);

    setLoading(false);
  };

  const getDateRange = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    switch (dateFilter) {
      case 'today': return { start: today, end: new Date(today.getTime() + 86400000) };
      case 'week': return { start: new Date(today.getTime() - 7 * 86400000), end: new Date(today.getTime() + 86400000) };
      case 'month': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getTime() + 86400000) };
      case 'last_month': return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) };
      case 'custom': return { start: customStart ? new Date(customStart) : null, end: customEnd ? new Date(customEnd + 'T23:59:59') : null };
      default: return { start: null, end: null };
    }
  };

  const filtered = useMemo(() => {
    let result = returns;
    const { start, end } = getDateRange();
    if (start && end) result = result.filter(r => { const d = new Date(r.return_date); return d >= start && d < end; });
    if (branchFilter !== 'all') result = result.filter(r => r.branch_id === branchFilter);
    if (conditionFilter !== 'all') result = result.filter(r => (r as Return & { condition?: string }).condition === conditionFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        (r.products as { name: string } | null)?.name?.toLowerCase().includes(q) ||
        (r.branches as { name: string } | null)?.name?.toLowerCase().includes(q) ||
        (r as Return & { returned_by?: string }).returned_by?.toLowerCase().includes(q) ||
        ((r.issue_slips as { issue_number?: string } | null)?.issue_number?.toLowerCase().includes(q) ?? false)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.return_date).getTime() - new Date(b.return_date).getTime();
      else if (sortBy === 'product') cmp = ((a.products as { name: string } | null)?.name || '').localeCompare((b.products as { name: string } | null)?.name || '');
      else if (sortBy === 'branch') cmp = ((a.branches as { name: string } | null)?.name || '').localeCompare((b.branches as { name: string } | null)?.name || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [returns, dateFilter, customStart, customEnd, branchFilter, conditionFilter, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { count: number; qty: number; name: string }> = {};
    filtered.forEach(r => {
      const month = r.return_date.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = { count: 0, qty: 0, name: month };
      byMonth[month].count++; byMonth[month].qty += r.quantity;
    });
    return Object.values(byMonth).sort((a, b) => a.name.localeCompare(b.name)).slice(-12);
  }, [filtered]);

  const conditionData = useMemo(() => {
    const counts = { new: 0, used: 0 };
    filtered.forEach(r => { const cond = (r as Return & { condition?: string }).condition || 'new'; counts[cond as keyof typeof counts] += r.quantity; });
    return [{ name: 'New', value: counts.new, color: '#10b981' }, { name: 'Used', value: counts.used, color: '#f59e0b' }];
  }, [filtered]);

  const stats = useMemo(() => ({
    total: filtered.length,
    totalQty: filtered.reduce((s, r) => s + r.quantity, 0),
    withIssueRef: filtered.filter(r => r.issue_slip_id).length,
    uniqueReturners: Array.from(new Set(filtered.map(r => (r as Return & { returned_by?: string }).returned_by).filter(Boolean))).length,
  }), [filtered]);

  const filteredIssueSlips = useMemo(() => {
    if (!form.branch_id) return issueSlips;
    return issueSlips.filter(s => s.branch_id === form.branch_id);
  }, [issueSlips, form.branch_id]);

  const currentVariants = form.product_id ? (variants[form.product_id] || []) : [];

  const openCreate = () => {
    setForm({ ...emptyForm, branch_id: isBranchUser && profile?.branch_id ? profile.branch_id : '' });
    setDialogOpen(true);
  };

  const openEdit = (ret: Return) => {
    setEditingId(ret.id);
    setForm({
      return_date: ret.return_date,
      product_id: ret.product_id,
      variant_id: (ret as Return & { variant_id?: string }).variant_id || '',
      branch_id: ret.branch_id,
      issue_slip_id: ret.issue_slip_id || '',
      item_type: ret.item_type as 'new' | 'donation',
      condition: (ret as Return & { condition?: string }).condition || 'new',
      quantity: ret.quantity,
      returned_by: (ret as Return & { returned_by?: string }).returned_by || '',
      reason: ret.reason || '',
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_id) { toast.error('Please select a product'); return; }
    if (!form.branch_id) { toast.error('Please select a branch'); return; }
    if (Number(form.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('returns').insert({
      return_date: form.return_date, product_id: form.product_id, variant_id: form.variant_id || null,
      branch_id: form.branch_id, issue_slip_id: form.issue_slip_id || null,
      item_type: form.item_type, condition: form.condition, quantity: Number(form.quantity),
      returned_by: form.returned_by.trim() || null, reason: form.reason.trim() || null, created_by: user?.id,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    const stockField = form.condition === 'new' ? 'current_stock_new' : 'current_stock_donation';
    const { data: product } = await supabase.from('products').select(stockField).eq('id', form.product_id).maybeSingle();
    if (product) {
      await supabase.from('products').update({
        [stockField]: (product[stockField as keyof typeof product] as number || 0) + Number(form.quantity),
        updated_at: new Date().toISOString(),
      }).eq('id', form.product_id);
    }
    toast.success('Return recorded and stock restored');
    logAudit('INSERT', 'returns', undefined, { product_id: form.product_id, quantity: form.quantity });
    setSaving(false); setDialogOpen(false); setForm(emptyForm); fetchData();
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    if (!form.product_id || !form.branch_id || Number(form.quantity) <= 0) { toast.error('Please fill required fields'); return; }
    setSaving(true);
    const oldRet = returns.find(r => r.id === editingId);
    if (oldRet) {
      const cond = (oldRet as Return & { condition?: string }).condition || 'new';
      const stockField = cond === 'new' ? 'current_stock_new' : 'current_stock_donation';
      const { data: product } = await supabase.from('products').select(stockField).eq('id', oldRet.product_id).maybeSingle();
      if (product) {
        await supabase.from('products').update({
          [stockField]: Math.max(0, (product[stockField as keyof typeof product] as number || 0) - oldRet.quantity),
          updated_at: new Date().toISOString(),
        }).eq('id', oldRet.product_id);
      }
    }
    const { error } = await supabase.from('returns').update({
      return_date: form.return_date, product_id: form.product_id, variant_id: form.variant_id || null,
      branch_id: form.branch_id, issue_slip_id: form.issue_slip_id || null,
      item_type: form.item_type, condition: form.condition, quantity: Number(form.quantity),
      returned_by: form.returned_by.trim() || null, reason: form.reason.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editingId);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const stockField = form.condition === 'new' ? 'current_stock_new' : 'current_stock_donation';
    const { data: product } = await supabase.from('products').select(stockField).eq('id', form.product_id).maybeSingle();
    if (product) {
      await supabase.from('products').update({
        [stockField]: (product[stockField as keyof typeof product] as number || 0) + Number(form.quantity),
        updated_at: new Date().toISOString(),
      }).eq('id', form.product_id);
    }
    toast.success('Return updated');
    logAudit('UPDATE', 'returns', editingId);
    setSaving(false); setEditDialogOpen(false); setEditingId(null); setForm(emptyForm); fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const ret = returns.find(r => r.id === deleteId);
    if (ret) {
      const cond = (ret as Return & { condition?: string }).condition || 'new';
      const stockField = cond === 'new' ? 'current_stock_new' : 'current_stock_donation';
      const { data: product } = await supabase.from('products').select(stockField).eq('id', ret.product_id).maybeSingle();
      if (product) {
        await supabase.from('products').update({
          [stockField]: Math.max(0, (product[stockField as keyof typeof product] as number || 0) - ret.quantity),
          updated_at: new Date().toISOString(),
        }).eq('id', ret.product_id);
      }
    }
    const { error } = await supabase.from('returns').delete().eq('id', deleteId);
    if (error) toast.error(error.message); else { toast.success('Return deleted and stock adjusted'); logAudit('DELETE', 'returns', deleteId); }
    setDeleteId(null); fetchData();
  };

  const handleExport = () => {
    exportToCSV(filtered.map(r => ({
      'Date': r.return_date, 'Product': (r.products as { name: string } | null)?.name || '',
      'Variant': (r.product_variants as { variant_name: string; variant_value: string } | null) ? `${(r.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(r.product_variants as { variant_name: string; variant_value: string }).variant_value}` : '',
      'Branch': (r.branches as { name: string } | null)?.name || '',
      'Issue Ref': (r.issue_slips as { issue_number?: string } | null)?.issue_number || '',
      'Condition': (r as Return & { condition?: string }).condition || 'new',
      'Quantity': r.quantity, 'Unit': (r.products as { unit: string } | null)?.unit || '',
      'Returned By': (r as Return & { returned_by?: string }).returned_by || '', 'Reason': r.reason || '',
    })), 'returns');
  };

  const handlePrint = () => {
    printDocument({
      title: 'Return Records',
      subtitle: `Total: ${filtered.length} records, ${stats.totalQty} items returned`,
      columns: [
        { header: '#', key: 'no', width: '40px', align: 'center' },
        { header: 'Date', key: 'date', width: '100px' },
        { header: 'Product', key: 'product', width: '160px' },
        { header: 'Variant', key: 'variant', width: '100px' },
        { header: 'Branch', key: 'branch', width: '120px' },
        { header: 'Issue Ref', key: 'ref', width: '100px' },
        { header: 'Condition', key: 'cond', width: '80px' },
        { header: 'Qty', key: 'qty', width: '60px', align: 'right' },
        { header: 'Returned By', key: 'by', width: '100px' },
        { header: 'Reason', key: 'reason', width: '120px' },
      ],
      rows: filtered.map((r, i) => ({
        no: i + 1, date: new Date(r.return_date).toLocaleDateString(),
        product: (r.products as { name: string } | null)?.name || '-',
        variant: (r.product_variants as { variant_name: string; variant_value: string } | null) ? `${(r.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(r.product_variants as { variant_name: string; variant_value: string }).variant_value}` : '-',
        branch: (r.branches as { name: string } | null)?.name || '-',
        ref: (r.issue_slips as { issue_number?: string } | null)?.issue_number || '-',
        cond: ((r as Return & { condition?: string }).condition || 'new').toUpperCase(),
        qty: `${r.quantity} ${(r.products as { unit: string } | null)?.unit || ''}`,
        by: (r as Return & { returned_by?: string }).returned_by || '-',
        reason: r.reason || '-',
      })),
    });
  };

  const toggleSort = (col: 'date' | 'product' | 'branch') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const renderForm = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Return Date</Label>
        <Input className="mt-1" type="date" value={form.return_date} onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
      </div>
      <div>
        <Label>Condition *</Label>
        <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v as 'new' | 'used', item_type: v === 'new' ? 'new' : 'donation' }))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="used">Used</SelectItem></SelectContent>
        </Select>
      </div>
      <div>
        <Label>Branch *</Label>
        <Select value={form.branch_id} onValueChange={v => setForm(f => ({ ...f, branch_id: v, issue_slip_id: '' }))} disabled={isBranchUser && !!profile?.branch_id}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Product *</Label>
        <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v, variant_id: '' }))}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
          <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({(p.stores as { name: string } | null)?.name})</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {currentVariants.length > 0 && (
        <div>
          <Label>Variant</Label>
          {/* FIX: SelectItem value can't be "". Use "none" sentinel, translate back to "" in state */}
          <Select
            value={form.variant_id || 'none'}
            onValueChange={v => setForm(f => ({ ...f, variant_id: v === 'none' ? '' : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="No variant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Variant</SelectItem>
              {currentVariants.map(v => <SelectItem key={v.id} value={v.id}>{v.variant_name}: {v.variant_value}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Quantity *</Label>
        <Input className="mt-1" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <Label className="flex items-center gap-1"><FileText className="w-3 h-3" /> Issue Reference (Optional)</Label>
        {/* FIX: same empty-value issue — use "none" sentinel */}
        <Select
          value={form.issue_slip_id || 'none'}
          onValueChange={v => setForm(f => ({ ...f, issue_slip_id: v === 'none' ? '' : v }))}
        >
          <SelectTrigger className="mt-1"><SelectValue placeholder="Link to issue slip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Issue Slip</SelectItem>
            {filteredIssueSlips.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.issue_number} {(s as IssueSlip & { beneficiary_name?: string }).beneficiary_name ? `- ${(s as IssueSlip & { beneficiary_name?: string }).beneficiary_name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="flex items-center gap-1"><User className="w-3 h-3" /> Returned By</Label>
        <Input className="mt-1" placeholder="Name" value={form.returned_by} onChange={e => setForm(f => ({ ...f, returned_by: e.target.value }))} />
      </div>
      <div>
        <Label>Reason</Label>
        <Input className="mt-1" placeholder="Reason for return" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Undo2 className="w-6 h-6 text-amber-600" /> Returns</h1>
          <p className="text-muted-foreground text-sm mt-1">Record items returned by branches with variant tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print</Button>
          <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          {canManage && <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Record Return</Button>}
        </div>
      </div>

      {!canEditRecords && canManage && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Lock className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-400">You can add return records. Editing and deleting is restricted to Super Admin.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total Returns</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><Undo2 className="w-5 h-5 text-amber-600" />{stats.total}</p></CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Items Returned</p><p className="text-2xl font-bold mt-1">{stats.totalQty.toLocaleString()}</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">With Issue Ref</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" />{stats.withIssueRef}</p></CardContent></Card>
        <Card className="border-l-4 border-l-green-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Unique Returners</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><User className="w-5 h-5 text-green-600" />{stats.uniqueReturners}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Monthly Return Trends</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="qty" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Condition Distribution</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={conditionData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>{conditionData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={dateFilter} onValueChange={v => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Time</SelectItem><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="last_month">Last Month</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
            </Select>
            {dateFilter === 'custom' && (<><Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" /><span className="text-muted-foreground text-sm">to</span><Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" /></>)}
            {!isBranchUser && (
              <Select value={branchFilter} onValueChange={setBranchFilter} disabled={isBranchUser}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Branch" /></SelectTrigger>
                {/* FIX: was value="" — changed to "all" to match branchFilter default state + filter logic (branchFilter !== 'all') */}
                <SelectContent><SelectItem value="all">All Branches</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={conditionFilter} onValueChange={setConditionFilter}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="used">Used</SelectItem></SelectContent></Select>
            <div className="relative flex-1 min-w-[150px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
            <Badge variant="secondary">{filtered.length} records</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('date')}>Date {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('product')}>Product {sortBy === 'product' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="hidden md:table-cell">Variant</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('branch')}>Branch {sortBy === 'branch' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="hidden lg:table-cell">Issue Ref</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden sm:table-cell">Returned By</TableHead>
                  <TableHead className="hidden xl:table-cell">Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>))
                ) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No return records found.</TableCell></TableRow>
                ) : paginated.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{new Date(r.return_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{(r.products as { name: string } | null)?.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{(r.product_variants as { variant_name: string; variant_value: string } | null) ? `${(r.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(r.product_variants as { variant_name: string; variant_value: string }).variant_value}` : '-'}</TableCell>
                    <TableCell className="text-sm">{(r.branches as { name: string } | null)?.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">{r.issue_slip_id ? <Badge variant="outline" className="font-mono text-xs"><ArrowRightLeft className="w-3 h-3 mr-1" />{(r.issue_slips as { issue_number?: string } | null)?.issue_number}</Badge> : '-'}</TableCell>
                    <TableCell><Badge variant={(r as Return & { condition?: string }).condition === 'used' ? 'secondary' : 'default'} className={(r as Return & { condition?: string }).condition === 'used' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}>{((r as Return & { condition?: string }).condition || 'new').toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-right font-medium text-amber-600">+{r.quantity} {(r.products as { unit: string } | null)?.unit}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{(r as Return & { returned_by?: string }).returned_by || '-'}</TableCell>
                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{r.reason || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewReturn(r)}><Eye className="w-3.5 h-3.5" /></Button>
                        {canEditRecords && <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>}
                        {canDeleteRecords && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Return</DialogTitle></DialogHeader>
          {renderForm()}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Return'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Return</DialogTitle></DialogHeader>
          {renderForm()}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Sheet */}
      <Sheet open={!!viewReturn} onOpenChange={() => setViewReturn(null)}>
        <SheetContent className="w-full sm:w-[540px] overflow-y-auto">
          <SheetHeader><SheetTitle>Return Details</SheetTitle><SheetDescription>Complete return information</SheetDescription></SheetHeader>
          {viewReturn && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[['Date', new Date(viewReturn.return_date).toLocaleDateString()], ['Condition', ((viewReturn as Return & { condition?: string }).condition || 'new').toUpperCase()], ['Product', (viewReturn.products as { name: string } | null)?.name || '-'], ['Variant', (viewReturn.product_variants as { variant_name: string; variant_value: string } | null) ? `${(viewReturn.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(viewReturn.product_variants as { variant_name: string; variant_value: string }).variant_value}` : '-'], ['Branch', (viewReturn.branches as { name: string } | null)?.name || '-'], ['Quantity', `+${viewReturn.quantity} ${(viewReturn.products as { unit: string } | null)?.unit || ''}`], ['Returned By', (viewReturn as Return & { returned_by?: string }).returned_by || '-'], ['Reason', viewReturn.reason || '-']].map(([label, value]) => (
                  <div key={label} className="space-y-1"><p className="text-xs text-muted-foreground uppercase">{label}</p><p className="font-medium">{value}</p></div>
                ))}
                {viewReturn.issue_slip_id && (
                  <div className="col-span-2 space-y-1"><p className="text-xs text-muted-foreground uppercase">Issue Reference</p><Badge variant="outline" className="font-mono"><ArrowRightLeft className="w-3 h-3 mr-1" />{(viewReturn.issue_slips as { issue_number?: string } | null)?.issue_number}</Badge></div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Return Record?</AlertDialogTitle><AlertDialogDescription>This will remove the return and adjust stock accordingly.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}