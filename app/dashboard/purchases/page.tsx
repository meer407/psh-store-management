'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Purchase, Product, Branch, Category, ProductVariant } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ShoppingCart, Search, Download, Eye, Printer, TrendingUp, Package, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printTable } from '@/lib/export';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type DateRange = 'all' | 'today' | 'week' | 'month' | 'lastmonth' | 'custom';

interface PurchaseItemForm {
  product_id: string;
  variant_id: string;
  category_id: string;
  quantity: number;
  unit_price: number;
}

const emptyItem: PurchaseItemForm = { product_id: '', variant_id: '', category_id: '', quantity: 1, unit_price: 0 };

const emptySlipForm = {
  purchase_date: new Date().toISOString().split('T')[0],
  supplier: '',
  invoice_number: '',
  branch_id: '',
  notes: '',
};

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Set when editing an existing purchase row (null when recording a new one).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [slipForm, setSlipForm] = useState(emptySlipForm);
  const [items, setItems] = useState<PurchaseItemForm[]>([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [variants, setVariants] = useState<Record<string, ProductVariant[]>>({});
  // Per-row search text for the "Product" dropdown in the Record Purchase
  // dialog. Keyed by item index so each row's search box is independent.
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [{ data: purch }, { data: prods }, { data: brs }, { data: cats }, { data: strs }, { data: variantData }] = await Promise.all([
      supabase.from('purchases').select('*, products(name, unit, store_id, stores(name)), branches(name), categories(name), product_variants(id, variant_name, variant_value)')
        .order('purchase_date', { ascending: false }),
      supabase.from('products').select('*, stores(name), categories(name)').eq('is_active', true).order('name'),
      supabase.from('branches').select('id, name').eq('status', 'active').order('name'),
      supabase.from('categories').select('*, stores(name)').order('name'),
      supabase.from('stores').select('id, name').order('name'),
      supabase.from('product_variants').select('*'),
    ]);
    setPurchases((purch || []) as unknown as Purchase[]);
    setProducts((prods || []) as unknown as Product[]);
    setBranches((brs || []) as unknown as Branch[]);
    setCategories((cats || []) as unknown as Category[]);
    setStores((strs || []) as { id: string; name: string }[]);
    const vmap: Record<string, ProductVariant[]> = {};
    (variantData || []).forEach((v: ProductVariant) => {
      if (!vmap[v.product_id]) vmap[v.product_id] = [];
      vmap[v.product_id].push(v);
    });
    setVariants(vmap);
    setLoading(false);
  };

  // Categories available for a specific item — narrowed to that item's
  // product's store if a product has been picked, otherwise show all.
  const getCategoriesForItem = (item: PurchaseItemForm) => {
    const storeId = products.find(p => p.id === item.product_id)?.store_id;
    if (storeId) return categories.filter(c => c.store_id === storeId);
    return categories;
  };

  // Categories shown in the toolbar filter dropdown — scoped to the selected
  // store filter (if any), same pattern used on the Stock page.
  const toolbarCategories = categories.filter(c => storeFilter === 'all' || c.store_id === storeFilter);

  // Products matching a row's search text — matched by product name or its
  // store's name, case-insensitive. Empty search shows everything.
  const getFilteredProducts = (idx: number) => {
    const q = (productSearch[idx] || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => {
      const storeName = (p.stores as { name: string } | null)?.name || '';
      return p.name.toLowerCase().includes(q) || storeName.toLowerCase().includes(q);
    });
  };

  const getDateBounds = () => {
    const now = new Date();
    if (dateRange === 'today') {
      const d = now.toISOString().split('T')[0];
      return { from: d, to: d };
    }
    if (dateRange === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    if (dateRange === 'month') {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    if (dateRange === 'lastmonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
    }
    if (dateRange === 'custom') return { from: customFrom, to: customTo };
    return null;
  };

  const filtered = useMemo(() => {
    const bounds = getDateBounds();
    return purchases.filter(p => {
      const prod = p.products as { name: string; store_id: string } | null;
      const matchSearch = (prod?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.supplier || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.invoice_number || '').toLowerCase().includes(search.toLowerCase());
      const matchStore = storeFilter === 'all' || prod?.store_id === storeFilter;
      const matchCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
      const matchBranch = branchFilter === 'all' || p.branch_id === branchFilter;
      const matchProduct = productFilter === 'all' || p.product_id === productFilter;
      const matchDate = !bounds || (
        (!bounds.from || p.purchase_date >= bounds.from) &&
        (!bounds.to || p.purchase_date <= bounds.to)
      );
      return matchSearch && matchStore && matchCategory && matchBranch && matchProduct && matchDate;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, search, storeFilter, categoryFilter, branchFilter, productFilter, dateRange, customFrom, customTo]);

  const totalCost = filtered.reduce((s, p) => s + (p.total_cost || 0), 0);
  const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);

  // Monthly analytics for chart
  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      map[d.toLocaleString('default', { month: 'short', year: '2-digit' })] = 0;
    }
    filtered.forEach(p => {
      const d = new Date(p.purchase_date);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (key in map) map[key] += p.quantity;
    });
    return Object.entries(map).map(([name, qty]) => ({ name, qty }));
  }, [filtered]);

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    // Re-key productSearch so it stays aligned with the new (shifted) indexes.
    setProductSearch(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, val]) => {
        const i = Number(key);
        if (i < idx) next[i] = val;
        else if (i > idx) next[i - 1] = val;
      });
      return next;
    });
  };
  const updateItem = (idx: number, field: keyof PurchaseItemForm, value: string | number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        updated.variant_id = '';
        // If the newly picked product's store no longer matches the item's
        // previously chosen category, clear it so a stale category can't linger.
        const storeId = products.find(p => p.id === value)?.store_id;
        const cat = categories.find(c => c.id === updated.category_id);
        if (storeId && cat && cat.store_id !== storeId) updated.category_id = '';
      }
      return updated;
    }));
  };

  const itemsTotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  // NOTE: Purchases is a standalone record-keeping system. Recording or
  // deleting a purchase here does NOT touch products.current_stock_new or
  // product_variants.current_stock_new — Stock is managed only from the
  // Stock page (Restock / barcode scan / manual edit).
  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0);
    if (validItems.length === 0) { toast.error('Please add at least one item with a product and quantity'); return; }

    // FIX 1: branch_id is NOT NULL in the database, so branch is required
    if (!slipForm.branch_id) { toast.error('Please select a branch'); return; }

    // FIX 2: store_id is NOT NULL in the database, so make sure every product has one
    const missingStore = validItems.find(i => !products.find(p => p.id === i.product_id)?.store_id);
    if (missingStore) { toast.error('Selected product has no store assigned'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (editingId) {
      // Editing an existing purchase row — one row, one item.
      const i = validItems[0];
      const updateRow = {
        purchase_date: slipForm.purchase_date,
        supplier: slipForm.supplier,
        invoice_number: slipForm.invoice_number,
        product_id: i.product_id,
        store_id: products.find(p => p.id === i.product_id)?.store_id, // FIX 2
        variant_id: i.variant_id || null,
        branch_id: slipForm.branch_id,                                  // FIX 1
        category_id: i.category_id || null,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        total_cost: Number(i.quantity) * Number(i.unit_price),          // FIX 3
        notes: slipForm.notes,
      };
      const { error } = await supabase.from('purchases').update(updateRow).eq('id', editingId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Purchase updated');
      logAudit('UPDATE', 'purchases', editingId, { invoice: slipForm.invoice_number });
    } else {
      // purchase_no is generated automatically by the database (sequence default)
      const rows = validItems.map(i => ({
        purchase_date: slipForm.purchase_date,
        supplier: slipForm.supplier,
        invoice_number: slipForm.invoice_number,
        product_id: i.product_id,
        store_id: products.find(p => p.id === i.product_id)?.store_id, // FIX 2
        variant_id: i.variant_id || null,
        branch_id: slipForm.branch_id,                                  // FIX 1
        category_id: i.category_id || null,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        total_cost: Number(i.quantity) * Number(i.unit_price),          // FIX 3
        notes: slipForm.notes,
        created_by: user?.id,
      }));

      const { error } = await supabase.from('purchases').insert(rows);
      if (error) { toast.error(error.message); setSaving(false); return; }

      toast.success(`${validItems.length} purchase item${validItems.length > 1 ? 's' : ''} recorded`);
      logAudit('INSERT', 'purchases', undefined, { items: validItems.length, invoice: slipForm.invoice_number });
    }

    setSaving(false);
    setDialogOpen(false);
    setEditingId(null);
    setSlipForm(emptySlipForm);
    setItems([{ ...emptyItem }]);
    setProductSearch({});
    fetchData();
  };

  const openEdit = (p: Purchase) => {
    setEditingId(p.id);
    setSlipForm({
      purchase_date: p.purchase_date,
      supplier: p.supplier || '',
      invoice_number: p.invoice_number || '',
      branch_id: p.branch_id || '',
      notes: p.notes || '',
    });
    setItems([{
      product_id: p.product_id,
      variant_id: p.variant_id || '',
      category_id: p.category_id || '',
      quantity: p.quantity,
      unit_price: p.unit_price,
    }]);
    setProductSearch({});
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('purchases').delete().eq('id', deleteId);
    if (error) toast.error(error.message); else toast.success('Purchase deleted');
    setDeleteId(null);
    fetchData();
  };

  const handlePrint = (p: Purchase) => {
    const prod = p.products as { name: string; unit: string } | null;
    const br = p.branches as { name: string } | null;
    const variant = p.product_variants as { variant_name: string; variant_value: string } | null;
    printTable(
      `Purchase Record — ${p.invoice_number || p.id.slice(0, 8)}`,
      ['Field', 'Value'],
      [
        ['Date', p.purchase_date],
        ['Product', prod?.name || '-'],
        ['Variant', variant ? `${variant.variant_name}: ${variant.variant_value}` : '-'],
        ['Branch', br?.name || '-'],
        ['Supplier', p.supplier || '-'],
        ['Invoice', p.invoice_number || '-'],
        ['Quantity', `${p.quantity} ${prod?.unit || ''}`],
        ['Unit Price', `Rs. ${p.unit_price}`],
        ['Total Cost', `Rs. ${p.total_cost}`],
        ['Notes', p.notes || '-'],
      ]
    );
  };

  const handleExport = () => {
    exportToCSV(filtered.map(p => ({
      'Date': p.purchase_date,
      'Invoice': p.invoice_number || '',
      'Product': (p.products as { name: string } | null)?.name || '',
      'Variant': (p.product_variants as { variant_name: string; variant_value: string } | null)
        ? `${(p.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(p.product_variants as { variant_name: string; variant_value: string }).variant_value}`
        : '',
      'Branch': (p.branches as { name: string } | null)?.name || '',
      'Supplier': p.supplier || '',
      'Qty': p.quantity,
      'Unit Price': p.unit_price,
      'Total': p.total_cost,
    })), 'purchases');
    toast.success('Exported to CSV');
  };

  const renderItemsForm = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm">Purchase Items</h4>
        {!editingId && (
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" /> Add Item</Button>
        )}
      </div>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const itemVariants = item.product_id ? (variants[item.product_id] || []) : [];
          const itemCategories = getCategoriesForItem(item);
          const filteredProducts = getFilteredProducts(idx);
          const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
          return (
            <div key={idx} className="p-3 border rounded-lg bg-card space-y-2">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5">
                  <Label className="text-xs">Product *</Label>
                  <Select
                    value={item.product_id}
                    onValueChange={v => updateItem(idx, 'product_id', v)}
                    onOpenChange={open => { if (!open) setProductSearch(prev => ({ ...prev, [idx]: '' })); }}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {/* Search box pinned at the top of the dropdown. Clicks and
                          keystrokes here are kept from bubbling to Radix's own
                          type-ahead / close-on-Escape handling. */}
                      <div className="sticky top-0 z-10 bg-popover px-1.5 pb-1.5 pt-1" onPointerDown={e => e.stopPropagation()}>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            autoFocus
                            placeholder="Search product or store..."
                            value={productSearch[idx] || ''}
                            onChange={e => setProductSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                            onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); }}
                            className="h-8 pl-7 text-sm"
                          />
                        </div>
                      </div>
                      {filteredProducts.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">No products match</div>
                      ) : (
                        filteredProducts.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — {(p.stores as { name: string } | null)?.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <Label className="text-xs">Category</Label>
                  <Select value={item.category_id || 'none'} onValueChange={v => updateItem(idx, 'category_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Category</SelectItem>
                      {itemCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 sm:col-span-2 flex justify-end">
                  {items.length > 1 && !editingId && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeItem(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 sm:col-span-3">
                  <Label className="text-xs">Variant</Label>
                  {itemVariants.length > 0 ? (
                    <Select value={item.variant_id || 'none'} onValueChange={v => updateItem(idx, 'variant_id', v === 'none' ? '' : v)}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Variant</SelectItem>
                        {itemVariants.map(v => <SelectItem key={v.id} value={v.id}>{v.variant_name}: {v.variant_value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="mt-1 h-8 text-sm" disabled placeholder="No variants" />
                  )}
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <Label className="text-xs">Quantity *</Label>
                  <Input className="mt-1 h-8 text-sm" type="number" min="0.01" step="0.01" value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <Label className="text-xs">Unit Price (Rs.)</Label>
                  <Input className="mt-1 h-8 text-sm" type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <Label className="text-xs">Total</Label>
                  <div className="mt-1 h-8 px-2 flex items-center text-xs font-medium bg-muted rounded-md">Rs. {lineTotal.toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <div className="px-4 py-2 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-xs text-muted-foreground mr-2">Grand Total:</span>
          <span className="font-bold text-primary">Rs. {itemsTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> Purchases
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Record and manage all stock purchases</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          <Button onClick={() => { setEditingId(null); setSlipForm(emptySlipForm); setItems([{ ...emptyItem }]); setProductSearch({}); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> New Purchase
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Records', value: filtered.length, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
          { label: 'Total Cost', value: `Rs. ${totalCost.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
          { label: 'Total Quantity', value: totalQty.toLocaleString(), icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
          { label: 'Suppliers', value: new Set(filtered.map(p => p.supplier).filter(Boolean)).size, icon: ShoppingCart, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Monthly Purchase Quantity (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Qty" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search product, supplier, invoice..." value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div>
              <Tabs value={dateRange} onValueChange={v => setDateRange(v as DateRange)}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
                  <TabsTrigger value="today" className="text-xs px-2">Today</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs px-2">Week</TabsTrigger>
                  <TabsTrigger value="month" className="text-xs px-2">Month</TabsTrigger>
                  <TabsTrigger value="lastmonth" className="text-xs px-2">Last Month</TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs px-2">Custom</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {dateRange === 'custom' && (
              <>
                <div><Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 text-sm" /></div>
                <div><Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 text-sm" /></div>
              </>
            )}
            <Select value={storeFilter} onValueChange={v => { setStoreFilter(v); setCategoryFilter('all'); }}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Stores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {toolbarCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue placeholder="All Products" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="h-9 px-3 flex items-center">{filtered.length} records</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No purchase records found.</TableCell></TableRow>
              ) : filtered.map(p => {
                const variant = p.product_variants as { variant_name: string; variant_value: string } | null;
                return (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.invoice_number || '-'}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{(p.products as { name: string } | null)?.name}</span>
                      {variant && (
                        <Badge variant="outline" className="text-xs w-fit mt-0.5">{variant.variant_name}: {variant.variant_value}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(p.branches as { name: string } | null)?.name || '-'}</TableCell>
                  <TableCell className="text-sm">{p.supplier || '-'}</TableCell>
                  <TableCell className="text-right font-medium">{p.quantity} {(p.products as { unit: string } | null)?.unit}</TableCell>
                  <TableCell className="text-right text-sm">Rs. {(p.unit_price || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-semibold text-green-700 dark:text-green-400">Rs. {(p.total_cost || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(p)} title="View"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handlePrint(p)} title="Print"><Printer className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Purchase Dialog — Category moved into each item row (see renderItemsForm) */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0"><DialogTitle>{editingId ? 'Edit Purchase' : 'Record New Purchase'}</DialogTitle></DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <Label>Purchase Date</Label>
                <Input className="mt-1" type="date" value={slipForm.purchase_date}
                  onChange={e => setSlipForm(f => ({ ...f, purchase_date: e.target.value }))} />
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input className="mt-1" placeholder="INV-001" value={slipForm.invoice_number}
                  onChange={e => setSlipForm(f => ({ ...f, invoice_number: e.target.value }))} />
              </div>
              <div>
                <Label>Branch *</Label>
                <Select value={slipForm.branch_id} onValueChange={v => setSlipForm(f => ({ ...f, branch_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Supplier</Label>
                <Input className="mt-1" placeholder="Supplier name" value={slipForm.supplier}
                  onChange={e => setSlipForm(f => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Remarks / Notes</Label>
                <Input className="mt-1" placeholder="Optional remarks" value={slipForm.notes}
                  onChange={e => setSlipForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div className="border-t pt-4">
              {renderItemsForm()}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Purchase' : 'Record Purchase'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Sheet — shows Variant, header fixed + body scrollable */}
      <Sheet open={!!viewing} onOpenChange={() => setViewing(null)}>
        <SheetContent className="w-[420px] flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-2 shrink-0"><SheetTitle>Purchase Details</SheetTitle></SheetHeader>
          {viewing && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="font-mono text-lg font-bold text-primary">{viewing.invoice_number || 'No Invoice'}</p>
                <p className="text-sm text-muted-foreground">{new Date(viewing.purchase_date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Product', (viewing.products as { name: string } | null)?.name || '-'],
                  ['Variant', (viewing.product_variants as { variant_name: string; variant_value: string } | null)
                    ? `${(viewing.product_variants as { variant_name: string; variant_value: string }).variant_name}: ${(viewing.product_variants as { variant_name: string; variant_value: string }).variant_value}`
                    : '-'],
                  ['Branch', (viewing.branches as { name: string } | null)?.name || '-'],
                  ['Supplier', viewing.supplier || '-'],
                  ['Category', (viewing.categories as { name: string } | null)?.name || '-'],
                  ['Quantity', `${viewing.quantity} ${(viewing.products as { unit: string } | null)?.unit || ''}`],
                  ['Unit Price', `Rs. ${(viewing.unit_price || 0).toLocaleString()}`],
                  ['Total Cost', `Rs. ${(viewing.total_cost || 0).toLocaleString()}`],
                  ['Notes', viewing.notes || '-'],
                ].map(([l, v]) => (
                  <div key={l} className={`p-3 bg-card border rounded-lg ${l === 'Total Cost' ? 'border-green-200 bg-green-50 dark:bg-green-950/30' : ''}`}>
                    <p className="text-xs text-muted-foreground">{l}</p>
                    <p className={`font-medium mt-0.5 ${l === 'Total Cost' ? 'text-green-700 dark:text-green-400' : ''}`}>{v}</p>
                  </div>
                ))}
              </div>
              <Button className="w-full" variant="outline" onClick={() => handlePrint(viewing)}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the purchase record. Stock levels are not affected.</AlertDialogDescription>
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