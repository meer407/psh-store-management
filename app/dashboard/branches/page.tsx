'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Branch, IssueSlip, Return, Product } from '@/lib/types';
import { isSuperAdmin, canEdit, canDelete } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus, Pencil, Trash2, Search, GitBranch, Eye, Printer, FileSpreadsheet,
  Package, ArrowRightLeft, Undo2, AlertTriangle, Building2, Phone, MapPin,
  User, Lock, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printTable } from '@/lib/export';

const emptyBranch = {
  name: '',
  address: '',
  contact_number: '',
  incharge_name: '',
  status: 'active' as 'active' | 'inactive',
};

interface BranchStats {
  totalIssued: number;
  totalReturned: number;
  totalProducts: number;
  lowStockCount: number;
  recentIssues: IssueSlip[];
  recentReturns: Return[];
  inventory: { product: Product; quantity: number }[];
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyBranch);
  const [saving, setSaving] = useState(false);
  const [viewBranch, setViewBranch] = useState<Branch | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canEditState, setCanEditState] = useState(false);
  const [canDeleteState, setCanDeleteState] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'name' | 'incharge' | 'status'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const PAGE_SIZE = 10;

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('role').eq('id', user?.id || '').maybeSingle(),
    ]);
    if (error) toast.error(error.message);
    else setBranches(data as unknown as Branch[]);
    setCanManage(isSuperAdmin((profile as { role: string } | null)?.role));
    setCanEditState(canEdit((profile as { role: string } | null)?.role));
    setCanDeleteState(canDelete((profile as { role: string } | null)?.role));
    setLoading(false);
  };

  const fetchBranchStats = async (branchId: string) => {
    setStatsLoading(true);
    const [
      { data: issues },
      { data: returns },
      { data: branchStock },
      { data: products },
    ] = await Promise.all([
      supabase.from('issue_slips').select('*, branches(name), stores(name), issue_items(quantity, item_type)').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(10),
      supabase.from('returns').select('*, products(name, unit), branches(name)').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(10),
      supabase.from('branch_stock').select('quantity_new, quantity_donation, products(name, unit, min_stock, current_stock_new, current_stock_donation)').eq('branch_id', branchId),
      supabase.from('products').select('id, name, unit, min_stock, current_stock_new, current_stock_donation, stores(name)').eq('is_active', true),
    ]);

    const issueList = (issues || []) as unknown as IssueSlip[];
    const returnList = (returns || []) as unknown as Return[];
    const stockList = (branchStock || []) as unknown as Array<{ quantity_new: number; quantity_donation: number; products: Product | Product[] }>;
    const productList = (products || []) as unknown as Product[];

    const totalIssued = issueList.length;
    const totalReturned = returnList.length;

    const inventory = stockList
      .map(s => {
        const prod = Array.isArray(s.products) ? s.products[0] : s.products;
        return { product: prod, quantity: s.quantity_new + s.quantity_donation };
      })
      .filter(item => item.product && item.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);

    const lowStockCount = productList.filter(p =>
      (p.current_stock_new + p.current_stock_donation) <= p.min_stock && p.min_stock > 0
    ).length;

    setBranchStats({
      totalIssued,
      totalReturned,
      totalProducts: inventory.length,
      lowStockCount,
      recentIssues: issueList,
      recentReturns: returnList,
      inventory,
    });
    setStatsLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyBranch);
    setDialogOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({
      name: b.name,
      address: b.address || '',
      contact_number: b.contact_number || '',
      incharge_name: b.incharge_name || '',
      status: b.status,
    });
    setDialogOpen(true);
  };

  const openView = (b: Branch) => {
    setViewBranch(b);
    fetchBranchStats(b.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Branch name is required');
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('branches').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Branch updated');
        logAudit('UPDATE', 'branches', editing.id, { name: form.name });
      }
    } else {
      const { error } = await supabase.from('branches').insert(form);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Branch added');
        logAudit('INSERT', 'branches', undefined, { name: form.name });
      }
    }
    setSaving(false);
    setDialogOpen(false);
    fetchBranches();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('branches').delete().eq('id', deleteId);
    if (error) toast.error(error.message);
    else {
      toast.success('Branch deleted');
      logAudit('DELETE', 'branches', deleteId);
    }
    setDeleteId(null);
    fetchBranches();
  };

  const filtered = branches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.incharge_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedFiltered = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'incharge') cmp = (a.incharge_name || '').localeCompare(b.incharge_name || '');
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE);
  const paginated = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (col: 'name' | 'incharge' | 'status') => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const handlePrintBranch = (branch: Branch) => {
    printTable(
      `Branch - ${branch.name}`,
      ['Field', 'Value'],
      [
        ['Branch Name', branch.name],
        ['Incharge', branch.incharge_name || '-'],
        ['Contact', branch.contact_number || '-'],
        ['Address', branch.address || '-'],
        ['Status', branch.status],
        ['Created', new Date(branch.created_at).toLocaleDateString()],
      ]
    );
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map((b, i) => ({
        '#': i + 1,
        'Branch Name': b.name,
        Incharge: b.incharge_name || '',
        Contact: b.contact_number || '',
        Address: b.address || '',
        Status: b.status,
        Created: new Date(b.created_at).toLocaleDateString(),
      })),
      'branches'
    );
    toast.success('CSV exported');
  };

  const handleExportInventory = () => {
    if (!branchStats) return;
    exportToCSV(
      branchStats.inventory.map(item => ({
        Product: item.product.name,
        Unit: item.product.unit,
        Quantity: item.quantity,
        Store: (item.product.stores as { name: string } | null)?.name || '-',
      })),
      `branch-${viewBranch?.name || 'inventory'}-inventory`
    );
    toast.success('Inventory exported');
  };

  const statCards = branchStats
    ? [
        { label: 'Total Issues', value: branchStats.totalIssued, icon: ArrowRightLeft, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
        { label: 'Total Returns', value: branchStats.totalReturned, icon: Undo2, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
        { label: 'Products in Stock', value: branchStats.totalProducts, icon: Package, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
        { label: 'Low Stock Alerts', value: branchStats.lowStockCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
      ]
    : [];

  const SortIcon = ({ col }: { col: 'name' | 'incharge' | 'status' }) => {
    if (sortBy !== col) return <Minus className="w-3 h-3 text-muted-foreground/40 ml-1 inline" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-purple-600" /> Branches
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage institution branches and hostels</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />Export CSV
          </Button>
          {canManage && (
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" /> Add Branch
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            You have view-only access. Only Super Admin can add, edit, or delete branches.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search branches..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{filtered.length} branches</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('name')}>
                    Branch Name <SortIcon col="name" />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('incharge')}>
                    Incharge <SortIcon col="incharge" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Address</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('status')}>
                    Status <SortIcon col="status" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      {search ? 'No branches match your search' : 'No branches added yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map(b => (
                    <TableRow key={b.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{b.incharge_name || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{b.contact_number || '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                        {b.address || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={b.status === 'active' ? 'default' : 'secondary'}
                          className={b.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
                        >
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" title="View Dashboard" onClick={() => openView(b)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Print" onClick={() => handlePrintBranch(b)} className="hidden sm:inline-flex">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && canEditState && (
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(b)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canManage && canDeleteState && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(b.id)}
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
            <DialogTitle>{editing ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Branch Name *</Label>
              <Input
                className="mt-1"
                placeholder="Girls Hostel"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Incharge Name</Label>
              <Input
                className="mt-1"
                placeholder="Ahmed Khan"
                value={form.incharge_name}
                onChange={e => setForm(f => ({ ...f, incharge_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input
                className="mt-1"
                placeholder="+92 300 0000000"
                value={form.contact_number}
                onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                className="mt-1"
                placeholder="Full address"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as 'active' | 'inactive' }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Branch Dashboard Sheet — Stock-style table view */}
      <Sheet open={!!viewBranch} onOpenChange={() => setViewBranch(null)}>
        <SheetContent className="w-full sm:w-[600px] md:w-[760px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" /> Branch Dashboard
            </SheetTitle>
            <SheetDescription>{viewBranch?.name} - detailed overview</SheetDescription>
          </SheetHeader>

          {viewBranch && (
            <div className="mt-6 space-y-5">
              {/* Branch Info Header */}
              <div className="flex items-center gap-4 p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <GitBranch className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold truncate">{viewBranch.name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    {viewBranch.incharge_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {viewBranch.incharge_name}
                      </span>
                    )}
                    {viewBranch.contact_number && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {viewBranch.contact_number}
                      </span>
                    )}
                    {viewBranch.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {viewBranch.address}
                      </span>
                    )}
                  </div>
                </div>
                <Badge
                  variant={viewBranch.status === 'active' ? 'default' : 'secondary'}
                  className={viewBranch.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                >
                  {viewBranch.status}
                </Badge>
              </div>

              {statsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                        Recent Issues
                      </TabsTrigger>
                      <TabsTrigger value="returns" className="flex-1">
                        Recent Returns
                      </TabsTrigger>
                    </TabsList>

                    {/* Inventory Tab — table style */}
                    <TabsContent value="inventory" className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Products at this branch</p>
                        <Button size="sm" variant="outline" onClick={handleExportInventory}>
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Export
                        </Button>
                      </div>
                      {branchStats?.inventory.length === 0 ? (
                        <p className="text-center py-8 text-sm text-muted-foreground">No inventory at this branch</p>
                      ) : (
                        <div className="rounded-md border max-h-[340px] overflow-y-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead className="w-[40px]">#</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="hidden sm:table-cell">Store</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {branchStats?.inventory.map((item, i) => (
                                <TableRow key={i} className="hover:bg-muted/50">
                                  <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                                  <TableCell className="font-medium">{item.product.name}</TableCell>
                                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                    {(item.product.stores as { name: string } | null)?.name || '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant="secondary" className="font-mono">
                                      {item.quantity} {item.product.unit}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>

                    {/* Issues Tab — table style */}
                    <TabsContent value="issues" className="mt-4">
                      {branchStats?.recentIssues.length === 0 ? (
                        <p className="text-center py-8 text-sm text-muted-foreground">No issues recorded</p>
                      ) : (
                        <div className="rounded-md border max-h-[340px] overflow-y-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead>Issue #</TableHead>
                                <TableHead className="hidden sm:table-cell">Store</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {branchStats?.recentIssues.map(issue => (
                                <TableRow key={issue.id} className="hover:bg-muted/50">
                                  <TableCell className="font-mono text-sm font-medium text-primary">
                                    {issue.issue_number}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                    {(issue.stores as { name: string } | null)?.name || '-'}
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

                    {/* Returns Tab — table style */}
                    <TabsContent value="returns" className="mt-4">
                      {branchStats?.recentReturns.length === 0 ? (
                        <p className="text-center py-8 text-sm text-muted-foreground">No returns recorded</p>
                      ) : (
                        <div className="rounded-md border max-h-[340px] overflow-y-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {branchStats?.recentReturns.map(ret => (
                                <TableRow key={ret.id} className="hover:bg-muted/50">
                                  <TableCell className="font-medium">
                                    {(ret.products as { name: string } | null)?.name || 'Unknown'}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {new Date(ret.return_date).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant="outline" className="text-xs font-mono">
                                      {ret.quantity} items
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
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All related issue records will also be affected.
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
