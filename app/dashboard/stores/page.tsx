'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Store, Product, IssueSlip, Purchase, Donation, Profile } from '@/lib/types';
import { isSuperAdmin, canEdit, canDelete } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, Store as StoreIcon, Package, Eye, FileSpreadsheet, Printer,
  ArrowRightLeft, ShoppingCart, Heart, TrendingUp, Lock, Building2, AlertTriangle,
  Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printDocument } from '@/lib/export';

const emptyStore = { name: '', description: '' };

interface StoreStats {
  totalProducts: number;
  totalNewStock: number;
  totalDonationStock: number;
  lowStockCount: number;
  totalIssues: number;
  totalPurchases: number;
  totalDonations: number;
  recentIssues: IssueSlip[];
  recentPurchases: Purchase[];
  recentDonations: Donation[];
  inventory: Product[];
}

const PAGE_SIZE = 10;

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState(emptyStore);
  const [saving, setSaving] = useState(false);
  const [viewStore, setViewStore] = useState<Store | null>(null);
  const [storeStats, setStoreStats] = useState<StoreStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'name' | 'products' | 'created'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [storeProductCounts, setStoreProductCounts] = useState<Record<string, number>>({});

  // Inventory tab (inside the full-screen Store Dashboard) — search box + category select
  const [invSearch, setInvSearch] = useState('');
  const [invCategoryFilter, setInvCategoryFilter] = useState('all');

  const canManage = isSuperAdmin(profile?.role);
  const canEditRecords = canEdit(profile?.role);
  const canDeleteRecords = canDelete(profile?.role);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data, error }, { data: prof }, { data: prodCount }] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('profiles').select('*').eq('id', user?.id || '').maybeSingle(),
      supabase.from('products').select('store_id, is_active'),
    ]);
    if (error) toast.error(error.message);
    else setStores(data as unknown as Store[]);
    setProfile(prof as Profile | null);

    const counts: Record<string, number> = {};
    (prodCount || []).forEach((p: { store_id: string; is_active: boolean }) => {
      if (p.is_active) counts[p.store_id] = (counts[p.store_id] || 0) + 1;
    });
    setStoreProductCounts(counts);

    setLoading(false);
  };

  const fetchStoreStats = async (storeId: string) => {
    setStatsLoading(true);
    const { data: products } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name');
    const productList = (products || []) as unknown as Product[];
    const productIds = productList.map(p => p.id);
    const [
      { data: issues },
      { data: purchases },
      { data: donations },
    ] = await Promise.all([
      supabase.from('issue_slips').select('*, branches(name), issue_items(quantity)').eq('store_id', storeId).order('created_at', { ascending: false }).limit(10),
      productIds.length > 0
        ? supabase.from('purchases').select('*, products(name, unit)').in('product_id', productIds).order('purchase_date', { ascending: false }).limit(10)
        : Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: '', next: null, prev: null } as never),
      productIds.length > 0
        ? supabase.from('donations').select('*, products(name, unit)').in('product_id', productIds).order('donation_date', { ascending: false }).limit(10)
        : Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: '', next: null, prev: null } as never),
    ]);

    const issueList = (issues || []) as unknown as IssueSlip[];
    const purchaseList = (purchases || []) as unknown as Purchase[];
    const donationList = (donations || []) as unknown as Donation[];

    const totalNewStock = productList.reduce((s, p) => s + (p.current_stock_new || 0), 0);
    const totalDonationStock = productList.reduce((s, p) => s + (p.current_stock_donation || 0), 0);
    const lowStockCount = productList.filter(p =>
      (p.current_stock_new + p.current_stock_donation) <= p.min_stock && p.min_stock > 0
    ).length;

    setStoreStats({
      totalProducts: productList.length,
      totalNewStock,
      totalDonationStock,
      lowStockCount,
      totalIssues: issueList.length,
      totalPurchases: purchaseList.length,
      totalDonations: donationList.length,
      recentIssues: issueList,
      recentPurchases: purchaseList,
      recentDonations: donationList,
      inventory: productList,
    });
    setStatsLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyStore);
    setDialogOpen(true);
  };

  const openEdit = (s: Store) => {
    setEditing(s);
    setForm({ name: s.name, description: s.description || '' });
    setDialogOpen(true);
  };

  const openView = (s: Store) => {
    setViewStore(s);
    setInvSearch('');
    setInvCategoryFilter('all');
    fetchStoreStats(s.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Store name is required');
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('stores').update(form).eq('id', editing.id);
      if (error) toast.error(error.message);
      else {
        toast.success('Store updated');
        logAudit('UPDATE', 'stores', editing.id, { name: form.name });
      }
    } else {
      const { error } = await supabase.from('stores').insert(form);
      if (error) toast.error(error.message);
      else {
        toast.success('Store added');
        logAudit('INSERT', 'stores', undefined, { name: form.name });
      }
    }
    setSaving(false);
    setDialogOpen(false);
    fetchStores();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('stores').delete().eq('id', deleteId);
    if (error) toast.error(error.message);
    else {
      toast.success('Store deleted');
      logAudit('DELETE', 'stores', deleteId);
    }
    setDeleteId(null);
    fetchStores();
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map((s, i) => ({
        '#': i + 1,
        'Store Name': s.name,
        Description: s.description || '',
        Products: storeProductCounts[s.id] || 0,
        Created: new Date(s.created_at).toLocaleDateString(),
      })),
      'stores'
    );
    toast.success('CSV exported');
  };

  const handleExportInventory = () => {
    if (!storeStats) return;
    exportToCSV(
      storeStats.inventory.map(p => ({
        Product: p.name,
        Code: p.product_code || '',
        Barcode: p.barcode || '',
        SKU: p.sku || '',
        Category: (p.categories as { name: string } | null)?.name || '',
        Unit: p.unit,
        'New Stock': p.current_stock_new,
        'Donation Stock': p.current_stock_donation,
        Total: p.current_stock_new + p.current_stock_donation,
        'Min Stock': p.min_stock,
        Status: (p.current_stock_new + p.current_stock_donation) <= p.min_stock && p.min_stock > 0 ? 'LOW' : 'OK',
      })),
      `store-${viewStore?.name || 'inventory'}-inventory`
    );
    toast.success('Inventory exported');
  };

  const handlePrintStore = (store: Store) => {
    printDocument({
      title: `Store - ${store.name}`,
      columns: [
        { header: 'Field', key: 'field', width: '200px' },
        { header: 'Value', key: 'value' },
      ],
      rows: [
        { field: 'Store Name', value: store.name },
        { field: 'Description', value: store.description || '-' },
        { field: 'Products', value: String(storeProductCounts[store.id] || 0) },
        { field: 'Created', value: new Date(store.created_at).toLocaleDateString() },
      ],
    });
  };

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedFiltered = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'products') cmp = (storeProductCounts[a.id] || 0) - (storeProductCounts[b.id] || 0);
    else if (sortBy === 'created') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE);
  const paginated = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (col: 'name' | 'products' | 'created') => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Unique categories present in this store's inventory, for the select filter
  const inventoryCategories = useMemo(() => {
    if (!storeStats) return [];
    const map = new Map<string, string>();
    storeStats.inventory.forEach(p => {
      const catId = p.category_id;
      const catName = (p.categories as { name: string } | null)?.name;
      if (catId && catName) map.set(catId, catName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [storeStats]);

  // Inventory filtered by the search box + category select
  const filteredInventory = useMemo(() => {
    if (!storeStats) return [];
    const q = invSearch.toLowerCase();
    return storeStats.inventory.filter(p => {
      const matchSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.product_code || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q);
      const matchCategory = invCategoryFilter === 'all' || p.category_id === invCategoryFilter;
      return matchSearch && matchCategory;
    });
  }, [storeStats, invSearch, invCategoryFilter]);

  const statCards = storeStats
    ? [
        { label: 'Total Products', value: storeStats.totalProducts, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
        { label: 'New Stock', value: storeStats.totalNewStock, icon: ShoppingCart, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950' },
        { label: 'Donation Stock', value: storeStats.totalDonationStock, icon: Heart, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
        { label: 'Low Stock', value: storeStats.lowStockCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
        { label: 'Total Issues', value: storeStats.totalIssues, icon: ArrowRightLeft, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950' },
        { label: 'Purchases', value: storeStats.totalPurchases, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
      ]
    : [];

  const SortIcon = ({ col }: { col: 'name' | 'products' | 'created' }) => {
    if (sortBy !== col) return <Minus className="w-3 h-3 text-muted-foreground/40 ml-1 inline" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <StoreIcon className="w-6 h-6 text-cyan-600" /> Stores
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your institution stores and view their dashboards</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />Export CSV
          </Button>
          {canManage && (
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" /> Add Store
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            You have view-only access. Only Super Admin can add, edit, or delete stores.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search stores..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{filtered.length} stores</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('name')}>
                    Store Name <SortIcon col="name" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50 text-center" onClick={() => toggleSort('products')}>
                    Products <SortIcon col="products" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('created')}>
                    Created <SortIcon col="created" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {search ? 'No stores match your search' : 'No stores added yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map(s => (
                    <TableRow key={s.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950 flex items-center justify-center flex-shrink-0">
                            <StoreIcon className="w-4 h-4 text-cyan-600" />
                          </div>
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[300px] truncate">
                        {s.description || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{storeProductCounts[s.id] || 0}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" title="View Dashboard" onClick={() => openView(s)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Print" onClick={() => handlePrintStore(s)} className="hidden sm:inline-flex">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && canEditRecords && (
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(s)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canManage && canDeleteRecords && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(s.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Store' : 'Add New Store'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Store Name *</Label>
              <Input
                className="mt-1"
                placeholder="Clothing Store"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1"
                placeholder="Brief description..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Store Dashboard — now FULL SCREEN (like the Stock "View" sheet), not a narrow side drawer */}
      <Sheet open={!!viewStore} onOpenChange={() => setViewStore(null)}>
        <SheetContent className="w-screen sm:max-w-none h-screen flex flex-col p-0 gap-0 bg-gradient-to-br from-cyan-50 via-white to-blue-50 dark:from-background dark:via-background dark:to-background">
          <SheetHeader className="px-6 py-4 shrink-0 border-b bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-950 dark:to-blue-950">
            <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-lg text-white truncate">{viewStore?.name || 'Store Dashboard'}</SheetTitle>
                  <p className="text-xs text-cyan-100 mt-0.5 truncate">{viewStore?.description || 'Detailed overview'}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setViewStore(null)} className="bg-white/20 text-white hover:bg-white/30 border-0 flex-shrink-0">
                <X className="w-4 h-4 mr-1.5" /> Close
              </Button>
            </div>
          </SheetHeader>

          {viewStore && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
              <div className="max-w-4xl mx-auto space-y-5">

                {statsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {statCards.map(({ label, value, icon: Icon, color, bg }) => (
                        <Card key={label} className="border shadow-sm">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground uppercase">{label}</p>
                                <p className="text-lg font-bold mt-0.5">{value}</p>
                              </div>
                              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                                <Icon className={`w-4 h-4 ${color}`} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="inventory">
                      <TabsList className="w-full">
                        <TabsTrigger value="inventory" className="flex-1">
                          Inventory
                        </TabsTrigger>
                        <TabsTrigger value="issues" className="flex-1">
                          Issues
                        </TabsTrigger>
                        <TabsTrigger value="purchases" className="flex-1">
                          Purchases
                        </TabsTrigger>
                        <TabsTrigger value="donations" className="flex-1">
                          Donations
                        </TabsTrigger>
                      </TabsList>

                      {/* Inventory Tab — table style */}
                      <TabsContent value="inventory" className="mt-4">
                        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                          <p className="text-sm font-medium">Products in this store</p>
                          <Button size="sm" variant="outline" onClick={handleExportInventory}>
                            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Export
                          </Button>
                        </div>

                        {/* Search + Category select */}
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <div className="relative flex-1 min-w-[180px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Search by name, code, barcode, SKU..."
                              value={invSearch}
                              onChange={e => setInvSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <Select value={invCategoryFilter} onValueChange={setInvCategoryFilter}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {inventoryCategories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Badge variant="secondary">{filteredInventory.length} items</Badge>
                        </div>

                        {storeStats?.inventory.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">No products in this store</p>
                        ) : filteredInventory.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">No products match your search/filter</p>
                        ) : (
                          <div className="rounded-md border bg-white dark:bg-card overflow-y-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                  <TableHead className="w-[40px]">#</TableHead>
                                  <TableHead>Product</TableHead>
                                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                                  <TableHead className="text-right">New</TableHead>
                                  <TableHead className="text-right">Donation</TableHead>
                                  <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredInventory.map((p, i) => {
                                  const total = p.current_stock_new + p.current_stock_donation;
                                  const isLow = total <= p.min_stock && p.min_stock > 0;
                                  return (
                                    <TableRow key={p.id} className="hover:bg-muted/50">
                                      <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                                      <TableCell className="font-medium">
                                        <span className="flex items-center gap-1.5">
                                          {p.name}
                                          {isLow && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                                        </span>
                                      </TableCell>
                                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                        {(p.categories as { name: string } | null)?.name || 'Uncategorized'}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm">{p.current_stock_new}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{p.current_stock_donation}</TableCell>
                                      <TableCell className="text-right">
                                        <Badge variant={isLow ? 'destructive' : 'secondary'} className="font-mono">
                                          {total} {p.unit}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* Issues Tab — table style */}
                      <TabsContent value="issues" className="mt-4">
                        {storeStats?.recentIssues.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">No issues recorded</p>
                        ) : (
                          <div className="rounded-md border bg-white dark:bg-card overflow-y-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                  <TableHead>Issue #</TableHead>
                                  <TableHead className="hidden sm:table-cell">Branch</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {storeStats?.recentIssues.map(issue => (
                                  <TableRow key={issue.id} className="hover:bg-muted/50">
                                    <TableCell className="font-mono text-sm font-medium text-primary">
                                      {issue.issue_number}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                      {(issue.branches as { name: string } | null)?.name || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {new Date(issue.issue_date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant={issue.status === 'issued' ? 'default' : 'secondary'} className="text-xs">
                                        {issue.status}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* Purchases Tab — table style */}
                      <TabsContent value="purchases" className="mt-4">
                        {storeStats?.recentPurchases.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">No purchases recorded</p>
                        ) : (
                          <div className="rounded-md border bg-white dark:bg-card overflow-y-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                  <TableHead>Product</TableHead>
                                  <TableHead className="hidden sm:table-cell">Supplier</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead className="text-right">Cost</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {storeStats?.recentPurchases.map(p => (
                                  <TableRow key={p.id} className="hover:bg-muted/50">
                                    <TableCell className="font-medium">
                                      {(p.products as { name: string } | null)?.name || 'Unknown'}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                      {p.supplier || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {new Date(p.purchase_date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant="outline" className="text-xs font-mono">
                                        Rs {p.total_cost?.toLocaleString() || 0}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* Donations Tab — table style */}
                      <TabsContent value="donations" className="mt-4">
                        {storeStats?.recentDonations.length === 0 ? (
                          <p className="text-center py-8 text-sm text-muted-foreground">No donations recorded</p>
                        ) : (
                          <div className="rounded-md border bg-white dark:bg-card overflow-y-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                  <TableHead>Donor</TableHead>
                                  <TableHead className="hidden sm:table-cell">Product</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {storeStats?.recentDonations.map(d => (
                                  <TableRow key={d.id} className="hover:bg-muted/50">
                                    <TableCell className="font-medium">{d.donor_name}</TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                      {(d.products as { name: string } | null)?.name || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {new Date(d.donation_date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        +{d.quantity}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the store and may affect related products and categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}