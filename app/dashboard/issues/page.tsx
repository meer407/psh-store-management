'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { IssueSlip, Branch, Store, Product, ProductVariant, Profile } from '@/lib/types';
import { hasPermission, canEdit, canDelete, isSuperAdmin } from '@/lib/constants';
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
import { Plus, Search, Eye, Download, ArrowRightLeft, Trash2, Printer, User, CreditCard, CheckCircle, AlertTriangle, Calendar, Package, Building2, Pencil, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printDocument } from '@/lib/export';
import { logAudit } from '@/lib/audit';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface IssueItemForm {
  product_id: string;
  variant_id: string;
  item_type: 'new' | 'donation' | 'used';
  condition: 'new' | 'used';
  quantity: number;
  received_by: string;
}

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom';

const emptySlipForm = {
  issue_date: new Date().toISOString().split('T')[0],
  branch_id: '',
  store_id: '',
  issued_by: '',
  beneficiary_name: '',
  beneficiary_cnic: '',
  approved_by: '',
  remarks: '',
};

const PAGE_SIZE = 10;

// Which product field to deduct/restore based on item condition ('new' -> current_stock_new,
// 'used'/'donation' -> current_stock_donation). Kept as a helper so create/edit/delete all
// agree on the same mapping — this mirrors the same field used in variant stock updates below.
const stockFieldFor = (condition: string) => (condition === 'new' ? 'current_stock_new' : 'current_stock_donation');

export default function IssuesPage() {
  const [slips, setSlips] = useState<IssueSlip[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Record<string, ProductVariant[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewSlip, setViewSlip] = useState<IssueSlip | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<string[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'branch'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Forms
  const [slipForm, setSlipForm] = useState(emptySlipForm);
  const [items, setItems] = useState<IssueItemForm[]>([
    { product_id: '', variant_id: '', item_type: 'new', condition: 'new', quantity: 1, received_by: '' }
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canManage = hasPermission(profile?.role, 'issues.manage');
  const canEditRecords = canEdit(profile?.role);
  const canDeleteRecords = canDelete(profile?.role);
  const isBranchUser = !!profile?.branch_id;
  // Branch User can only view their own branch's issue slips — creating new
  // ones is restricted to Store Keeper and Super Admin.
  const canCreateIssue = canManage && !isBranchUser;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user?.id || '').maybeSingle();
    setProfile(prof as Profile | null);

    const profData = prof as Profile | null;
    const branchId = profData?.branch_id;

    const queries = [
      supabase.from('issue_slips').select('*, branches(name), stores(name), issue_items(*, products(name, unit), product_variants(id, variant_name, variant_value, barcode, sku))')
        .order('created_at', { ascending: false }),
      supabase.from('branches').select('*').eq('status', 'active').order('name'),
      supabase.from('stores').select('*').order('name'),
      supabase.from('products').select('*, stores(name)').eq('is_active', true).order('name'),
      supabase.from('product_variants').select('*'),
    ];

    const [slipRes, branchRes, storeRes, prodRes, variantRes] = await Promise.all(queries);
    let slipData = (slipRes.data || []) as unknown as IssueSlip[];

    // Branch user: only see their branch
    // Any user assigned to a branch only sees their branch's data
    if (branchId) {
      slipData = slipData.filter(s => s.branch_id === branchId);
    }

    setSlips(slipData);
    setBranches((branchRes.data || []) as unknown as Branch[]);
    setStores((storeRes.data || []) as unknown as Store[]);
    setProducts((prodRes.data || []) as unknown as Product[]);

    const variantMap: Record<string, ProductVariant[]> = {};
    (variantRes.data || []).forEach((v: ProductVariant) => {
      if (!variantMap[v.product_id]) variantMap[v.product_id] = [];
      variantMap[v.product_id].push(v);
    });
    setVariants(variantMap);

    setLoading(false);
  };

  const filteredProducts = slipForm.store_id
    ? products.filter(p => p.store_id === slipForm.store_id)
    : products;

  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
    let result = slips;
    const { start, end } = getDateRange();
    if (start && end) result = result.filter(s => { const d = new Date(s.issue_date); return d >= start && d < end; });
    if (branchFilter !== 'all') result = result.filter(s => s.branch_id === branchFilter);
    if (storeFilter !== 'all') result = result.filter(s => s.store_id === storeFilter);
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.issue_number.toLowerCase().includes(q) ||
        (s.branches as { name: string } | null)?.name?.toLowerCase().includes(q) ||
        s.issued_by.toLowerCase().includes(q) ||
        ((s as IssueSlip & { beneficiary_name?: string }).beneficiary_name?.toLowerCase().includes(q) ?? false)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
      else if (sortBy === 'number') cmp = a.issue_number.localeCompare(b.issue_number);
      else if (sortBy === 'branch') cmp = ((a.branches as { name: string } | null)?.name || '').localeCompare((b.branches as { name: string } | null)?.name || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [slips, dateFilter, customStart, customEnd, branchFilter, storeFilter, statusFilter, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { count: number; qty: number; name: string }> = {};
    filtered.forEach(s => {
      const month = s.issue_date.substring(0, 7);
      const totalQty = (s.issue_items || []).reduce((sum, i) => sum + (i as { quantity: number }).quantity, 0);
      if (!byMonth[month]) byMonth[month] = { count: 0, qty: 0, name: month };
      byMonth[month].count++;
      byMonth[month].qty += totalQty;
    });
    return Object.values(byMonth).sort((a, b) => a.name.localeCompare(b.name)).slice(-12);
  }, [filtered]);

  const statusData = useMemo(() => {
    const counts = { issued: 0, partial_return: 0, returned: 0 };
    filtered.forEach(s => { counts[s.status as keyof typeof counts]++; });
    return [
      { name: 'Issued', value: counts.issued, color: '#3b82f6' },
      { name: 'Partial Return', value: counts.partial_return, color: '#f59e0b' },
      { name: 'Returned', value: counts.returned, color: '#10b981' },
    ].filter(d => d.value > 0);
  }, [filtered]);

  const stats = useMemo(() => ({
    totalSlips: filtered.length,
    totalItems: filtered.reduce((sum, s) => sum + (s.issue_items || []).length, 0),
    totalQty: filtered.reduce((sum, s) => sum + (s.issue_items || []).reduce((isum, i) => isum + (i as { quantity: number }).quantity, 0), 0),
    withBeneficiary: filtered.filter(s => (s as IssueSlip & { beneficiary_name?: string }).beneficiary_name).length,
  }), [filtered]);

  // NOTE: When an item has a variant selected, stock is validated ONLY
  // against that variant's own stock (current_stock_new / current_stock_donation
  // on product_variants) — NOT against the parent product's totals. For
  // variant-tracked products the product-level totals aren't reliably kept
  // in sync with the sum of their variants, so checking them here was
  // producing false "have 0" alerts even when the chosen variant clearly
  // had stock. Only items WITHOUT a variant fall back to the product-level
  // totals.
  const validateStock = (): boolean => {
    const warnings: string[] = [];
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    for (const item of validItems) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) continue;

      if (item.variant_id) {
        const variantList = variants[item.product_id] || [];
        const variant = variantList.find(v => v.id === item.variant_id);
        if (variant) {
          const variantAvailable = item.condition === 'new' ? variant.current_stock_new : variant.current_stock_donation;
          if (Number(item.quantity) > variantAvailable) {
            warnings.push(`${product.name} (${variant.variant_name}: ${variant.variant_value}): need ${item.quantity} ${item.condition}, have ${variantAvailable}`);
          }
        }
        continue;
      }

      const available = item.condition === 'new' ? product.current_stock_new : product.current_stock_donation;
      if (Number(item.quantity) > available) {
        warnings.push(`${product.name}: need ${item.quantity} ${item.condition}, have ${available}`);
      }
    }
    setStockWarnings(warnings);
    return warnings.length === 0;
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', variant_id: '', item_type: 'new', condition: 'new', quantity: 1, received_by: '' }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof IssueItemForm, value: string | number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'condition') updated.item_type = value === 'new' ? 'new' : 'donation';
      if (field === 'product_id') updated.variant_id = '';
      return updated;
    }));
  };

  const openCreate = () => {
    setSlipForm({ ...emptySlipForm, branch_id: isBranchUser && profile?.branch_id ? profile.branch_id : '' });
    setItems([{ product_id: '', variant_id: '', item_type: 'new', condition: 'new', quantity: 1, received_by: '' }]);
    setStockWarnings([]);
    setNewDialogOpen(true);
  };

  const openEdit = (slip: IssueSlip) => {
    setEditingId(slip.id);
    setSlipForm({
      issue_date: slip.issue_date,
      branch_id: slip.branch_id,
      store_id: slip.store_id,
      issued_by: slip.issued_by,
      beneficiary_name: (slip as IssueSlip & { beneficiary_name?: string }).beneficiary_name || '',
      beneficiary_cnic: (slip as IssueSlip & { beneficiary_cnic?: string }).beneficiary_cnic || '',
      approved_by: (slip as IssueSlip & { approved_by?: string }).approved_by || '',
      remarks: slip.remarks || '',
    });
    const issueItems = (slip.issue_items || []) as Array<{ product_id: string; variant_id: string | null; item_type: string; condition: string; quantity: number; received_by: string | null }>;
    setItems(issueItems.map(i => ({
      product_id: i.product_id,
      variant_id: i.variant_id || '',
      item_type: i.item_type as 'new' | 'donation' | 'used',
      condition: (i.condition || 'new') as 'new' | 'used',
      quantity: i.quantity,
      received_by: i.received_by || '',
    })));
    setStockWarnings([]);
    setEditDialogOpen(true);
  };

  // Deduct `qty` from a variant's own stock (current_stock_new or current_stock_donation,
  // based on condition). Used whenever an issue item has a variant_id set.
  const adjustVariantStock = async (variantId: string, condition: string, delta: number) => {
    const field = stockFieldFor(condition);
    const { data: variantRow } = await supabase.from('product_variants').select(field).eq('id', variantId).maybeSingle();
    if (!variantRow) return;
    const current = (variantRow[field as keyof typeof variantRow] as number) || 0;
    const next = current + delta;
    await supabase.from('product_variants').update({ [field]: next }).eq('id', variantId);
  };

  // Always reads the CURRENT value from the DB right before writing, instead
  // of using the possibly-stale `products` array from local state. This
  // matters when one slip issues the same product more than once (e.g. 3
  // different sizes of the same product) — without a fresh read each time,
  // every update overwrites the previous one instead of stacking.
  const adjustProductStock = async (productId: string, condition: string, delta: number) => {
    const field = stockFieldFor(condition);
    const { data: productRow } = await supabase.from('products').select(field).eq('id', productId).maybeSingle();
    if (!productRow) return;
    const current = (productRow[field as keyof typeof productRow] as number) || 0;
    await supabase.from('products').update({ [field]: current + delta, updated_at: new Date().toISOString() }).eq('id', productId);
  };

  const handleCreateIssue = async () => {
    if (!canCreateIssue) { toast.error('Only Store Keeper or Super Admin can create issue slips'); return; }
    if (!slipForm.branch_id) { toast.error('Please select a branch'); return; }
    if (!slipForm.store_id) { toast.error('Please select a store'); return; }
    if (!slipForm.issued_by.trim()) { toast.error('Please enter issued by name'); return; }
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { toast.error('Please add at least one item'); return; }
    if (!validateStock()) { toast.error('Insufficient stock for some items'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: slip, error: slipError } = await supabase.from('issue_slips').insert({
      ...slipForm, beneficiary_name: slipForm.beneficiary_name.trim() || null,
      beneficiary_cnic: slipForm.beneficiary_cnic.trim() || null, approved_by: slipForm.approved_by.trim() || null,
      remarks: slipForm.remarks.trim() || null, created_by: user?.id,
    }).select().maybeSingle();

    if (slipError || !slip) { toast.error(slipError?.message || 'Failed to create issue slip'); setSaving(false); return; }

    let itemError: string | null = null;
    for (const item of validItems) {
      const { error: itemInsertError } = await supabase.from('issue_items').insert({
        issue_slip_id: slip.id, product_id: item.product_id, variant_id: item.variant_id || null,
        item_type: item.item_type, condition: item.condition, quantity: Number(item.quantity),
        received_by: item.received_by.trim() || null,
      });
      if (itemInsertError) {
        // Stop immediately — don't touch stock for an item that never saved,
        // and don't keep silently skipping the rest of the items either.
        itemError = itemInsertError.message;
        break;
      }
      await adjustProductStock(item.product_id, item.condition, -Number(item.quantity));
      // Deduct the same qty from the specific variant's own stock, if one was chosen.
      if (item.variant_id) {
        await adjustVariantStock(item.variant_id, item.condition, -Number(item.quantity));
      }
    }

    if (itemError) {
      toast.error(`Issue slip ${slip.issue_number} created, but items failed to save: ${itemError}`);
      setSaving(false);
      fetchData();
      return;
    }

    toast.success(`Issue slip ${slip.issue_number} created`);
    logAudit('INSERT', 'issue_slips', slip.id, { issue_number: slip.issue_number, items: validItems.length });
    setSaving(false); setNewDialogOpen(false);
    setSlipForm(emptySlipForm);
    setItems([{ product_id: '', variant_id: '', item_type: 'new', condition: 'new', quantity: 1, received_by: '' }]);
    setStockWarnings([]);
    fetchData();
  };

  const handleEditIssue = async () => {
    if (!editingId) return;
    if (!slipForm.branch_id || !slipForm.store_id || !slipForm.issued_by.trim()) { toast.error('Please fill required fields'); return; }
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { toast.error('Please add at least one item'); return; }

    setSaving(true);
    // Restore stock from old items (both product-level and variant-level)
    const oldSlip = slips.find(s => s.id === editingId);
    if (oldSlip) {
      const oldItems = (oldSlip.issue_items || []) as Array<{ product_id: string; variant_id: string | null; condition: string; quantity: number }>;
      for (const item of oldItems) {
        await adjustProductStock(item.product_id, item.condition, item.quantity);
        if (item.variant_id) {
          await adjustVariantStock(item.variant_id, item.condition, item.quantity);
        }
      }
    }

    // Delete old items
    await supabase.from('issue_items').delete().eq('issue_slip_id', editingId);

    // Update slip
    // NOTE: issue_slips does not have an `updated_at` column, so it's
    // intentionally left out of this update payload (including it caused a
    // "Could not find the 'updated_at' column" error from Supabase).
    const { error: slipError } = await supabase.from('issue_slips').update({
      ...slipForm, beneficiary_name: slipForm.beneficiary_name.trim() || null,
      beneficiary_cnic: slipForm.beneficiary_cnic.trim() || null, approved_by: slipForm.approved_by.trim() || null,
      remarks: slipForm.remarks.trim() || null,
    }).eq('id', editingId);

    if (slipError) { toast.error(slipError.message); setSaving(false); return; }

    // Insert new items and deduct stock (product-level and variant-level)
    let editItemError: string | null = null;
    for (const item of validItems) {
      const { error: itemInsertError } = await supabase.from('issue_items').insert({
        issue_slip_id: editingId, product_id: item.product_id, variant_id: item.variant_id || null,
        item_type: item.item_type, condition: item.condition, quantity: Number(item.quantity),
        received_by: item.received_by.trim() || null,
      });
      if (itemInsertError) { editItemError = itemInsertError.message; break; }
      await adjustProductStock(item.product_id, item.condition, -Number(item.quantity));
      if (item.variant_id) {
        await adjustVariantStock(item.variant_id, item.condition, -Number(item.quantity));
      }
    }

    if (editItemError) {
      toast.error(`Slip updated, but items failed to save: ${editItemError}`);
      setSaving(false);
      fetchData();
      return;
    }

    toast.success('Issue slip updated');
    logAudit('UPDATE', 'issue_slips', editingId);
    setSaving(false); setEditDialogOpen(false); setEditingId(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const slip = slips.find(s => s.id === deleteId);
    if (slip) {
      const oldItems = (slip.issue_items || []) as Array<{ product_id: string; variant_id: string | null; condition: string; quantity: number }>;
      for (const item of oldItems) {
        await adjustProductStock(item.product_id, item.condition, item.quantity);
        // Restore the variant's own stock too, if this item had a variant.
        if (item.variant_id) {
          await adjustVariantStock(item.variant_id, item.condition, item.quantity);
        }
      }
    }
    const { error } = await supabase.from('issue_slips').delete().eq('id', deleteId);
    if (error) toast.error(error.message); else { toast.success('Issue slip deleted'); logAudit('DELETE', 'issue_slips', deleteId); }
    setDeleteId(null);
    fetchData();
  };

  const handlePrint = (slip: IssueSlip) => {
    const issueItems = (slip.issue_items || []) as Array<{ products?: { name: string; unit: string }; product_variants?: { variant_name: string; variant_value: string } | null; item_type: string; condition?: string; quantity: number; received_by?: string }>;
    printDocument({
      title: `Issue Slip ${slip.issue_number}`,
      subtitle: `Issued on ${new Date(slip.issue_date).toLocaleDateString('en-PK', { dateStyle: 'full' })}`,
      meta: [
        { label: 'Branch', value: (slip.branches as { name: string } | null)?.name || '-' },
        { label: 'Store', value: (slip.stores as { name: string } | null)?.name || '-' },
        { label: 'Issued By', value: slip.issued_by },
        { label: 'Beneficiary', value: (slip as IssueSlip & { beneficiary_name?: string }).beneficiary_name || '-' },
        { label: 'Status', value: slip.status.replace('_', ' ').toUpperCase() },
        { label: 'Total Items', value: String(issueItems.length) },
      ],
      columns: [
        { header: '#', key: 'no', width: '40px', align: 'center' },
        { header: 'Product', key: 'product', width: '200px' },
        { header: 'Variant', key: 'variant', width: '120px' },
        { header: 'Condition', key: 'condition', width: '80px' },
        { header: 'Quantity', key: 'qty', width: '80px', align: 'right' },
        { header: 'Received By', key: 'received', width: '120px' },
      ],
      rows: issueItems.map((i, idx) => ({
        no: idx + 1,
        product: i.products?.name || '',
        variant: i.product_variants ? `${i.product_variants.variant_name}: ${i.product_variants.variant_value}` : '-',
        condition: (i.condition || i.item_type).toUpperCase(),
        qty: `${i.quantity} ${i.products?.unit || ''}`,
        received: i.received_by || '-',
      })),
    });
  };

  const handleExport = () => {
    exportToCSV(filtered.map(s => ({
      'Issue No': s.issue_number, 'Date': s.issue_date,
      'Branch': (s.branches as { name: string } | null)?.name || '',
      'Store': (s.stores as { name: string } | null)?.name || '',
      'Issued By': s.issued_by,
      'Beneficiary': (s as IssueSlip & { beneficiary_name?: string }).beneficiary_name || '',
      'Items': (s.issue_items || []).length, 'Status': s.status,
    })), 'issue-slips');
  };

  const toggleSort = (col: 'date' | 'number' | 'branch') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const renderItemsForm = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Issue Items</h3>
        <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" /> Add Item</Button>
      </div>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const selectedProduct = filteredProducts.find(p => p.id === item.product_id);
          const productVariants = item.product_id ? (variants[item.product_id] || []) : [];
          const selectedVariant = item.variant_id ? productVariants.find(v => v.id === item.variant_id) : undefined;

          // If a variant is selected, show/validate against that variant's own stock;
          // otherwise fall back to the product-level totals as before.
          const availableNew = selectedVariant ? selectedVariant.current_stock_new : (selectedProduct?.current_stock_new ?? 0);
          const availableUsed = selectedVariant ? selectedVariant.current_stock_donation : (selectedProduct?.current_stock_donation ?? 0);
          const currentAvail = item.condition === 'new' ? availableNew : availableUsed;
          const isLow = selectedProduct && Number(item.quantity) > currentAvail;

          return (
            <div key={idx} className={`grid grid-cols-12 gap-2 items-end p-3 border rounded-lg ${isLow ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'bg-card'}`}>
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-xs">Product *</Label>
                <Select value={item.product_id} onValueChange={v => updateItem(idx, 'product_id', v)}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-xs">Variant</Label>
                {productVariants.length > 0 ? (
                  /* FIX: Radix SelectItem cannot have value="". Use "none" sentinel and
                     translate it back to "" when updating item state, so variant_id
                     stays "" (no variant) in the actual form/DB payload. */
                  <Select
                    value={item.variant_id || 'none'}
                    onValueChange={v => updateItem(idx, 'variant_id', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Variant</SelectItem>
                      {productVariants.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.variant_name}: {v.variant_value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="mt-1 h-8 text-sm" disabled placeholder="No variants" />
                )}
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-xs">Condition *</Label>
                <Select value={item.condition} onValueChange={v => updateItem(idx, 'condition', v as 'new' | 'used')}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New (Stock: {availableNew})</SelectItem>
                    <SelectItem value="used">Used (Stock: {availableUsed})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4 sm:col-span-1">
                <Label className="text-xs">Qty {selectedProduct && <span className={isLow ? 'text-red-600' : 'text-muted-foreground'}>({currentAvail})</span>}</Label>
                <Input className={`mt-1 h-8 text-sm ${isLow ? 'border-red-400' : ''}`} type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-xs">Received By</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="Name" value={item.received_by} onChange={e => updateItem(idx, 'received_by', e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-center pb-0.5">
                {items.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeItem(idx)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSlipForm = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <div>
          <Label className="flex items-center gap-1"><User className="w-3 h-3" /> Beneficiary Name</Label>
          <Input className="mt-1" placeholder="Name of beneficiary" value={slipForm.beneficiary_name} onChange={e => setSlipForm(f => ({ ...f, beneficiary_name: e.target.value }))} />
        </div>
        <div>
          <Label className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Beneficiary CNIC</Label>
          <Input className="mt-1" placeholder="XXXXX-XXXXXXX-X" value={slipForm.beneficiary_cnic} onChange={e => setSlipForm(f => ({ ...f, beneficiary_cnic: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
        <div>
          <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Issue Date</Label>
          <Input className="mt-1" type="date" value={slipForm.issue_date} onChange={e => setSlipForm(f => ({ ...f, issue_date: e.target.value }))} />
        </div>
        <div>
          <Label className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Branch *</Label>
          <Select value={slipForm.branch_id} onValueChange={v => setSlipForm(f => ({ ...f, branch_id: v }))} disabled={isBranchUser && !!profile?.branch_id}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Store *</Label>
          <Select value={slipForm.store_id} onValueChange={v => setSlipForm(f => ({ ...f, store_id: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
            <SelectContent>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Issued By *</Label>
          <Input className="mt-1" placeholder="Name" value={slipForm.issued_by} onChange={e => setSlipForm(f => ({ ...f, issued_by: e.target.value }))} />
        </div>
        <div>
          <Label className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approved By</Label>
          <Input className="mt-1" placeholder="Approver" value={slipForm.approved_by} onChange={e => setSlipForm(f => ({ ...f, approved_by: e.target.value }))} />
        </div>
        <div>
          <Label>Remarks</Label>
          <Input className="mt-1" placeholder="Optional" value={slipForm.remarks} onChange={e => setSlipForm(f => ({ ...f, remarks: e.target.value }))} />
        </div>
      </div>
      {stockWarnings.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-2"><AlertTriangle className="w-4 h-4" /> Stock Alert</div>
          <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">{stockWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {renderItemsForm()}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ArrowRightLeft className="w-6 h-6 text-blue-600" /> Issue Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Issue items to branches with variant tracking and stock validation</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          {canCreateIssue && <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Issue Slip</Button>}
        </div>
      </div>

      {!canEditRecords && canCreateIssue && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Lock className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-400">You can add new issue slips. Editing and deleting is restricted to Super Admin.</p>
        </div>
      )}

      {isBranchUser && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">View-only: you can see your branch&apos;s issued items. Creating new issue slips is handled by the Store Keeper or Super Admin.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total Slips</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" />{stats.totalSlips}</p></CardContent></Card>
        <Card className="border-l-4 border-l-green-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total Items</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />{stats.totalItems}</p></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total Qty</p><p className="text-2xl font-bold mt-1">{stats.totalQty.toLocaleString()}</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">With Beneficiary</p><p className="text-2xl font-bold mt-1 flex items-center gap-2"><User className="w-5 h-5 text-purple-600" />{stats.withBeneficiary}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Monthly Issue Trends</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Status Distribution</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>{statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
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
                <SelectContent><SelectItem value="all">All Branches</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={storeFilter} onValueChange={setStoreFilter}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Store" /></SelectTrigger><SelectContent><SelectItem value="all">All Stores</SelectItem>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="issued">Issued</SelectItem><SelectItem value="partial_return">Partial</SelectItem><SelectItem value="returned">Returned</SelectItem></SelectContent></Select>
            <div className="relative flex-1 min-w-[150px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
            <Badge variant="secondary">{filtered.length} slips</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('number')}>Issue No {sortBy === 'number' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('date')}>Date {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('branch')}>Branch {sortBy === 'branch' && (sortDir === 'asc' ? '↑' : '↓')}</TableHead>
                  <TableHead className="hidden md:table-cell">Store</TableHead>
                  <TableHead className="hidden lg:table-cell">Beneficiary</TableHead>
                  <TableHead className="hidden sm:table-cell">Issued By</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>))
                ) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No issue slips found.</TableCell></TableRow>
                ) : paginated.map(s => (
                  <TableRow key={s.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono font-semibold text-primary">{s.issue_number}</TableCell>
                    <TableCell className="text-sm">{new Date(s.issue_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{(s.branches as { name: string } | null)?.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{(s.stores as { name: string } | null)?.name}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{(s as IssueSlip & { beneficiary_name?: string }).beneficiary_name || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{s.issued_by}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{(s.issue_items || []).length}</Badge></TableCell>
                    <TableCell><Badge variant={s.status === 'issued' ? 'default' : s.status === 'returned' ? 'secondary' : 'outline'} className={s.status === 'issued' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : s.status === 'returned' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}>{s.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewSlip(s)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handlePrint(s)} className="hidden sm:inline-flex"><Printer className="w-3.5 h-3.5" /></Button>
                        {canEditRecords && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>}
                        {canDeleteRecords && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
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
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Issue Slip</DialogTitle></DialogHeader>
          {renderSlipForm()}
          <div className="flex justify-end gap-3 pt-2 border-t mt-4">
            <Button variant="outline" onClick={() => { setNewDialogOpen(false); setStockWarnings([]); }}>Cancel</Button>
            <Button onClick={handleCreateIssue} disabled={saving}>{saving ? 'Creating...' : 'Create Issue Slip'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Issue Slip</DialogTitle></DialogHeader>
          {renderSlipForm()}
          <div className="flex justify-end gap-3 pt-2 border-t mt-4">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={handleEditIssue} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Sheet */}
      <Sheet open={!!viewSlip} onOpenChange={() => setViewSlip(null)}>
        <SheetContent className="w-full sm:w-[560px] overflow-y-auto">
          <SheetHeader><SheetTitle>Issue Slip Details</SheetTitle><SheetDescription>Complete issue slip information</SheetDescription></SheetHeader>
          {viewSlip && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                <div><p className="font-mono text-2xl font-bold text-blue-700 dark:text-blue-400">{viewSlip.issue_number}</p><p className="text-sm text-muted-foreground mt-0.5">{new Date(viewSlip.issue_date).toLocaleDateString('en-PK', { dateStyle: 'full' })}</p></div>
                <Badge variant={viewSlip.status === 'issued' ? 'default' : 'secondary'} className="text-sm">{viewSlip.status.replace('_', ' ')}</Badge>
              </div>
              {(viewSlip as IssueSlip & { beneficiary_name?: string }).beneficiary_name && (
                <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Beneficiary</p>
                  <p className="font-semibold">{(viewSlip as IssueSlip & { beneficiary_name?: string }).beneficiary_name}</p>
                  {(viewSlip as IssueSlip & { beneficiary_cnic?: string }).beneficiary_cnic && <code className="text-sm text-muted-foreground">{(viewSlip as IssueSlip & { beneficiary_cnic?: string }).beneficiary_cnic}</code>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[['Branch', (viewSlip.branches as { name: string } | null)?.name || '-'], ['Store', (viewSlip.stores as { name: string } | null)?.name || '-'], ['Issued By', viewSlip.issued_by], ['Approved By', (viewSlip as IssueSlip & { approved_by?: string }).approved_by || '-']].map(([label, value]) => (
                  <div key={label} className="p-3 bg-card border rounded-lg"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium mt-0.5">{value}</p></div>
                ))}
              </div>
              {viewSlip.remarks && <div className="p-3 bg-card border rounded-lg"><p className="text-xs text-muted-foreground">Remarks</p><p className="text-sm mt-0.5">{viewSlip.remarks}</p></div>}
              <div>
                <h3 className="font-semibold mb-2">Issued Items ({(viewSlip.issue_items || []).length})</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="text-xs">Product</TableHead><TableHead className="text-xs">Variant</TableHead><TableHead className="text-xs">Condition</TableHead><TableHead className="text-xs text-right">Qty</TableHead><TableHead className="text-xs hidden sm:table-cell">Received By</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(viewSlip.issue_items || []).map((item) => {
                        const it = item as { id: string; products?: { name: string; unit: string }; product_variants?: { variant_name: string; variant_value: string } | null; item_type: string; condition?: string; quantity: number; received_by?: string };
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="text-sm font-medium">{it.products?.name}</TableCell>
                            <TableCell className="text-xs">{it.product_variants ? `${it.product_variants.variant_name}: ${it.product_variants.variant_value}` : '-'}</TableCell>
                            <TableCell><Badge variant={(it.condition || it.item_type) === 'used' ? 'secondary' : 'default'} className="text-xs">{(it.condition || it.item_type).toUpperCase()}</Badge></TableCell>
                            <TableCell className="text-right text-sm">{it.quantity} {it.products?.unit}</TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{it.received_by || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <Button className="w-full" variant="outline" onClick={() => handlePrint(viewSlip)}><Printer className="w-4 h-4 mr-2" /> Print Issue Slip</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Issue Slip?</AlertDialogTitle><AlertDialogDescription>This will restore stock and delete all related items. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}