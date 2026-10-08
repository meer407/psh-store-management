'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Donation, Product, Category, Store, ProductVariant } from '@/lib/types';
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
import { Plus, Trash2, Heart, Search, Download, Printer, Eye, Phone, CreditCard, Package, CalendarIcon, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printTable } from '@/lib/export';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const emptyForm = {
  donor_name: '',
  phone_number: '',
  cnic: '',
  donation_date: new Date().toISOString().split('T')[0],
  product_id: '',
  variant_id: '',
  category_id: '',
  quantity: 1,
  condition: 'new' as 'new' | 'used',
  remarks: '',
};

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function DonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewDonation, setViewDonation] = useState<Donation | null>(null);
  const [variants, setVariants] = useState<Record<string, ProductVariant[]>>({});

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [{ data: doms }, { data: prods }, { data: cats }, { data: strs }, { data: variantData }] = await Promise.all([
      supabase.from('donations').select('*, products(name, unit, stores(id, name)), categories(id, name), product_variants(id, variant_name, variant_value)').order('donation_date', { ascending: false }),
      supabase.from('products').select('id, name, unit, store_id, stores(id, name)').eq('is_active', true).order('name'),
      supabase.from('categories').select('id, name, store_id').order('name'),
      supabase.from('stores').select('id, name').order('name'),
      supabase.from('product_variants').select('*'),
    ]);
    setDonations((doms || []) as unknown as Donation[]);
    setProducts((prods || []) as unknown as Product[]);
    setCategories((cats || []) as unknown as Category[]);
    setStores((strs || []) as unknown as Store[]);
    const vmap: Record<string, ProductVariant[]> = {};
    (variantData || []).forEach((v: ProductVariant) => {
      if (!vmap[v.product_id]) vmap[v.product_id] = [];
      vmap[v.product_id].push(v);
    });
    setVariants(vmap);
    setLoading(false);
  };

  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (dateFilter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 86400000) };
      case 'week': {
        const weekAgo = new Date(today.getTime() - 7 * 86400000);
        return { start: weekAgo, end: new Date(today.getTime() + 86400000) };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart, end: new Date(today.getTime() + 86400000) };
      }
      case 'last_month': {
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: lastMonthStart, end: new Date(lastMonthEnd.getTime() + 86400000) };
      }
      case 'custom':
        return {
          start: customStart ? new Date(customStart) : null,
          end: customEnd ? new Date(customEnd + 'T23:59:59') : null,
        };
      default:
        return { start: null, end: null };
    }
  };

  const filtered = useMemo(() => {
    let result = donations;
    const { start, end } = getDateRange();
    if (start && end) {
      result = result.filter(d => {
        const date = new Date(d.donation_date);
        return date >= start && date < end;
      });
    }
    if (storeFilter !== 'all') {
      result = result.filter(d => {
        const prod = d.products as { stores?: { id: string } } | null;
        return prod?.stores?.id === storeFilter;
      });
    }
    if (conditionFilter !== 'all') {
      result = result.filter(d => (d as Donation & { condition?: string }).condition === conditionFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.donor_name.toLowerCase().includes(q) ||
        (d.products as { name: string } | null)?.name?.toLowerCase().includes(q) ||
        (d as Donation & { phone_number?: string }).phone_number?.includes(q)
      );
    }
    return result;
  }, [donations, dateFilter, customStart, customEnd, storeFilter, conditionFilter, search]);

  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { count: number; qty: number; name: string }> = {};
    filtered.forEach(d => {
      const month = d.donation_date.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = { count: 0, qty: 0, name: month };
      byMonth[month].count++;
      byMonth[month].qty += d.quantity;
    });
    return Object.values(byMonth).sort((a, b) => a.name.localeCompare(b.name)).slice(-12);
  }, [filtered]);

  const conditionData = useMemo(() => {
    const counts = { new: 0, used: 0 };
    filtered.forEach(d => {
      const cond = (d as Donation & { condition?: string }).condition || 'new';
      counts[cond as keyof typeof counts] += d.quantity;
    });
    return [
      { name: 'New', value: counts.new, color: '#10b981' },
      { name: 'Used', value: counts.used, color: '#f59e0b' },
    ];
  }, [filtered]);

  const stats = useMemo(() => ({
    total: filtered.length,
    totalQty: filtered.reduce((s, d) => s + d.quantity, 0),
    uniqueDonors: Array.from(new Set(filtered.map(d => d.donor_name))).length,
    withPhone: filtered.filter(d => (d as Donation & { phone_number?: string }).phone_number).length,
  }), [filtered]);

  const handleSave = async () => {
    if (!form.donor_name.trim()) { toast.error('Donor name is required'); return; }
    if (!form.product_id) { toast.error('Please select a product'); return; }
    if (Number(form.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('donations').insert({
      donor_name: form.donor_name.trim(),
      phone_number: form.phone_number.trim() || null,
      cnic: form.cnic.trim() || null,
      donation_date: form.donation_date,
      product_id: form.product_id,
      variant_id: form.variant_id || null,
      category_id: form.category_id || null,
      quantity: Number(form.quantity),
      condition: form.condition,
      remarks: form.remarks.trim() || null,
      created_by: user?.id,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    // Update stock based on condition
    const stockField = form.condition === 'new' ? 'current_stock_new' : 'current_stock_donation';
    const { data: product } = await supabase.from('products').select(stockField).eq('id', form.product_id).maybeSingle();
    if (product) {
      await supabase.from('products').update({
        [stockField]: (product[stockField as keyof typeof product] as number || 0) + Number(form.quantity),
        updated_at: new Date().toISOString(),
      }).eq('id', form.product_id);
    }

    toast.success('Donation recorded and stock updated');
    logAudit('INSERT', 'donations', undefined, { donor: form.donor_name, product_id: form.product_id, quantity: form.quantity, condition: form.condition });
    setSaving(false);
    setDialogOpen(false);
    setForm(emptyForm);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const donation = donations.find(d => d.id === deleteId);
    if (donation) {
      const cond = (donation as Donation & { condition?: string }).condition || 'new';
      const stockField = cond === 'new' ? 'current_stock_new' : 'current_stock_donation';
      const { data: product } = await supabase.from('products').select(stockField).eq('id', donation.product_id).maybeSingle();
      if (product) {
        await supabase.from('products').update({
          [stockField]: Math.max(0, (product[stockField as keyof typeof product] as number || 0) - donation.quantity),
          updated_at: new Date().toISOString(),
        }).eq('id', donation.product_id);
      }
    }
    const { error } = await supabase.from('donations').delete().eq('id', deleteId);
    if (error) toast.error(error.message); else toast.success('Donation deleted and stock adjusted');
    setDeleteId(null);
    fetchData();
  };

  const handleExport = () => {
    exportToCSV(filtered.map(d => ({
      'Date': d.donation_date,
      'Donor': d.donor_name,
      'Phone': (d as Donation & { phone_number?: string }).phone_number || '',
      'CNIC': (d as Donation & { cnic?: string }).cnic || '',
      'Product': (d.products as { name: string } | null)?.name || '',
      'Store': ((d.products as { stores?: { name: string } } | null)?.stores)?.name || '',
      'Quantity': d.quantity,
      'Unit': (d.products as { unit: string } | null)?.unit || '',
      'Condition': (d as Donation & { condition?: string }).condition || 'new',
      'Remarks': d.remarks || '',
    })), 'donations');
  };

  const handlePrint = () => {
    const headers = ['Date', 'Donor', 'Phone', 'Product', 'Store', 'Qty', 'Condition'];
    const rows = filtered.map(d => [
      new Date(d.donation_date).toLocaleDateString(),
      d.donor_name,
      (d as Donation & { phone_number?: string }).phone_number || '-',
      (d.products as { name: string } | null)?.name || '-',
      ((d.products as { stores?: { name: string } } | null)?.stores)?.name || '-',
      `${d.quantity} ${(d.products as { unit: string } | null)?.unit || ''}`,
      ((d as Donation & { condition?: string }).condition || 'new').toUpperCase(),
    ]);
    printTable('Donation Records', headers, rows);
  };

  const filteredProducts = useMemo(() => {
    if (!form.category_id) return products;
    const cat = categories.find(c => c.id === form.category_id);
    if (!cat) return products;
    return products.filter(p => p.store_id === cat.store_id);
  }, [products, form.category_id, categories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="w-6 h-6 text-green-600" /> Donations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Record donated items with condition tracking and automatic stock updates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print</Button>
          <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Donation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Donations</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600" />
              {stats.total}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Items Donated</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              {stats.totalQty.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Donors</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              {stats.uniqueDonors}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">With Contact Info</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Phone className="w-5 h-5 text-purple-600" />
              {stats.withPhone}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Donation Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Condition Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={conditionData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {conditionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={dateFilter} onValueChange={v => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
              <>
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
                <span className="text-muted-foreground text-sm">to</span>
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
              </>
            )}
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Store" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Condition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="used">Used</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search donor, product, phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Badge variant="secondary">{filtered.length} records</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>CNIC</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No donation records found.</TableCell>
                  </TableRow>
                ) : filtered.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{new Date(d.donation_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{d.donor_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(d as Donation & { phone_number?: string }).phone_number || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(d as Donation & { cnic?: string }).cnic ? (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {(d as Donation & { cnic?: string }).cnic}
                        </code>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{(d.products as { name: string } | null)?.name}</span>
                        {(d.product_variants as { variant_name: string; variant_value: string } | null) && (
                          <span className="text-xs text-muted-foreground">{(d.product_variants as { variant_name: string; variant_value: string }).variant_name}: {(d.product_variants as { variant_name: string; variant_value: string }).variant_value}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {((d.products as { stores?: { name: string } } | null)?.stores)?.name || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(d.categories as { name: string } | null)?.name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      +{d.quantity} {(d.products as { unit: string } | null)?.unit}
                    </TableCell>
                    <TableCell>
                      <Badge variant={(d as Donation & { condition?: string }).condition === 'used' ? 'secondary' : 'default'} className={(d as Donation & { condition?: string }).condition === 'used' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}>
                        {((d as Donation & { condition?: string }).condition || 'new').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewDonation(d)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Donation</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Donor Name *</Label>
              <Input className="mt-1" placeholder="Full name of donor" value={form.donor_name} onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone Number</Label>
              <Input className="mt-1" placeholder="03XX-XXXXXXX" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> CNIC (Optional)</Label>
              <Input className="mt-1" placeholder="XXXXX-XXXXXXX-X" value={form.cnic} onChange={e => setForm(f => ({ ...f, cnic: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Donation Date</Label>
              <Input className="mt-1" type="date" value={form.donation_date} onChange={e => setForm(f => ({ ...f, donation_date: e.target.value }))} />
            </div>
            <div>
              <Label>Condition *</Label>
              <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v as 'new' | 'used' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v, product_id: '' }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v, variant_id: '' }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {filteredProducts.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({(p.stores as { name: string } | null)?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.product_id && variants[form.product_id] && variants[form.product_id].length > 0 && (
              <div>
                <Label>Variant</Label>
                <Select value={form.variant_id} onValueChange={v => setForm(f => ({ ...f, variant_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No variant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Variant</SelectItem>
                    {variants[form.product_id].map(v => <SelectItem key={v.id} value={v.id}>{v.variant_name}: {v.variant_value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Quantity *</Label>
              <Input className="mt-1" type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2">
              <Label>Remarks</Label>
              <Input className="mt-1" placeholder="Optional remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Donation'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewDonation} onOpenChange={() => setViewDonation(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Donation Details</SheetTitle>
            <SheetDescription>View complete information about this donation.</SheetDescription>
          </SheetHeader>
          {viewDonation && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Donor</p>
                  <p className="font-medium">{viewDonation.donor_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Date</p>
                  <p className="font-medium">{new Date(viewDonation.donation_date).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Phone</p>
                  <p className="font-medium">{(viewDonation as Donation & { phone_number?: string }).phone_number || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">CNIC</p>
                  <p className="font-medium">{(viewDonation as Donation & { cnic?: string }).cnic || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Product</p>
                  <p className="font-medium">{(viewDonation.products as { name: string } | null)?.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Store</p>
                  <p className="font-medium">{((viewDonation.products as { stores?: { name: string } } | null)?.stores)?.name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Quantity</p>
                  <p className="font-medium text-green-600">+{viewDonation.quantity} {(viewDonation.products as { unit: string } | null)?.unit}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Condition</p>
                  <Badge variant={(viewDonation as Donation & { condition?: string }).condition === 'used' ? 'secondary' : 'default'}>
                    {((viewDonation as Donation & { condition?: string }).condition || 'new').toUpperCase()}
                  </Badge>
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Remarks</p>
                  <p className="font-medium">{viewDonation.remarks || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Donation Record?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the donation and reduce stock accordingly.</AlertDialogDescription>
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
