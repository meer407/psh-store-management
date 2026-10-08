'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product, Store, Branch, LedgerEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Search, ArrowDownCircle, ArrowUpCircle, Package, Download, Printer, TrendingUp, TrendingDown, MinusCircle, CalendarRange } from 'lucide-react';
import { exportToCSV, printTable } from '@/lib/export';

type StockType = 'all' | 'new' | 'donation';

interface RawPurchaseRow {
  id: string;
  purchase_date: string;
  quantity: number;
  product_id: string;
  branch_id: string | null;
  products: { name: string; unit: string; store_id: string } | null;
  branches: { name: string } | null;
}

export default function ProductLedgerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [stockType, setStockType] = useState<StockType>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [viewEntry, setViewEntry] = useState<LedgerEntry | null>(null);

  // Which top-level view is active: the single-product transaction ledger,
  // or the date-wise pivot summary across all products (item once, dates as columns).
  const [activeTab, setActiveTab] = useState<'ledger' | 'pivot'>('ledger');

  // Date-wise pivot summary state
  const [pivotRaw, setPivotRaw] = useState<RawPurchaseRow[]>([]);
  const [pivotLoaded, setPivotLoaded] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [pivotStoreFilter, setPivotStoreFilter] = useState('all');
  const [pivotBranchFilter, setPivotBranchFilter] = useState('all');
  const [pivotFrom, setPivotFrom] = useState('');
  const [pivotTo, setPivotTo] = useState('');
  const [pivotSearch, setPivotSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [{ data: prods }, { data: strs }, { data: brs }] = await Promise.all([
      supabase.from('products').select('*, stores(name), categories(name)').eq('is_active', true).order('name'),
      supabase.from('stores').select('*').order('name'),
      supabase.from('branches').select('*').eq('status', 'active').order('name'),
    ]);
    setProducts((prods || []) as unknown as Product[]);
    setStores((strs || []) as unknown as Store[]);
    setBranches((brs || []) as unknown as Branch[]);
    setLoading(false);
  };

  // Loads every purchase once (with product + branch info) so the date-wise
  // pivot can be filtered/re-sliced entirely client-side without refetching.
  const fetchPivotData = async () => {
    setPivotLoading(true);
    const { data } = await supabase
      .from('purchases')
      .select('id, purchase_date, quantity, product_id, branch_id, products(name, unit, store_id), branches(name)')
      .order('purchase_date', { ascending: true });
    setPivotRaw((data || []) as unknown as RawPurchaseRow[]);
    setPivotLoaded(true);
    setPivotLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'pivot' && !pivotLoaded) fetchPivotData();
  }, [activeTab, pivotLoaded]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (storeFilter !== 'all') {
      result = result.filter(p => p.store_id === storeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.product_code?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [products, storeFilter, search]);

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const fetchLedger = async (productId: string) => {
    if (!productId) {
      setLedgerEntries([]);
      return;
    }
    setLoadingLedger(true);
    const entries: LedgerEntry[] = [];
    let balanceNew = 0;
    let balanceUsed = 0;

    // Get product opening stock
    const product = products.find(p => p.id === productId);
    if (!product) {
      setLoadingLedger(false);
      return;
    }

    // Opening balance
    const openingNew = product.opening_stock_new || 0;
    const openingDonation = product.opening_stock_donation || 0;
    if (openingNew > 0 || openingDonation > 0) {
      entries.push({
        date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        type: 'opening',
        reference: 'Opening Stock',
        description: 'System opening balance',
        qty_in: openingNew + openingDonation,
        qty_out: 0,
        balance_new: openingNew,
        balance_used: openingDonation,
        branch: '-',
      });
      balanceNew = openingNew;
      balanceUsed = openingDonation;
    }

    // Fetch all transactions for this product (now also pulling branch name
    // for purchases and issues so it can be shown as its own column/filter).
    const [{ data: purchases }, { data: donations }, { data: issues }, { data: returns }] = await Promise.all([
      supabase.from('purchases').select('*, branches(name)').eq('product_id', productId).order('purchase_date', { ascending: true }),
      supabase.from('donations').select('*').eq('product_id', productId).order('donation_date', { ascending: true }),
      supabase.from('issue_items').select('*, issue_slips(issue_number, issue_date, branches(name))').eq('product_id', productId).order('created_at', { ascending: true }),
      supabase.from('returns').select('*').eq('product_id', productId).order('return_date', { ascending: true }),
    ]);

    // Process purchases
    (purchases || []).forEach((p: { purchase_date: string; id: string; supplier?: string; invoice_number?: string; quantity: number; unit_price?: number; branches?: { name: string } | null }) => {
      balanceNew += p.quantity;
      entries.push({
        date: p.purchase_date,
        type: 'purchase',
        reference: p.invoice_number || `PO-${p.id.substring(0, 8)}`,
        description: `Purchased from ${p.supplier || 'Supplier'}`,
        qty_in: p.quantity,
        qty_out: 0,
        balance_new: balanceNew,
        balance_used: balanceUsed,
        branch: p.branches?.name || '-',
      });
    });

    // Process donations
    (donations || []).forEach((d: { donation_date: string; id: string; donor_name: string; quantity: number; condition?: string }) => {
      const isUsed = (d.condition || 'new') === 'used';
      if (isUsed) {
        balanceUsed += d.quantity;
      } else {
        balanceNew += d.quantity;
      }
      entries.push({
        date: d.donation_date,
        type: 'donation',
        reference: `DON-${d.id.substring(0, 8)}`,
        description: `Donated by ${d.donor_name} (${isUsed ? 'Used' : 'New'})`,
        qty_in: d.quantity,
        qty_out: 0,
        balance_new: balanceNew,
        balance_used: balanceUsed,
        branch: '-',
      });
    });

    // Process issues
    (issues || []).forEach((i: { created_at: string; id: string; quantity: number; condition?: string; issue_slips?: { issue_number: string; issue_date: string; branches?: { name: string } | null } }) => {
      const isUsed = (i.condition || 'new') === 'used';
      if (isUsed) {
        balanceUsed -= i.quantity;
      } else {
        balanceNew -= i.quantity;
      }
      entries.push({
        date: i.issue_slips?.issue_date || i.created_at.split('T')[0],
        type: 'issue',
        reference: i.issue_slips?.issue_number || `ISS-${i.id.substring(0, 8)}`,
        description: `Issued (${isUsed ? 'Used' : 'New'})`,
        qty_in: 0,
        qty_out: i.quantity,
        balance_new: balanceNew,
        balance_used: balanceUsed,
        branch: i.issue_slips?.branches?.name || '-',
      });
    });

    // Process returns
    (returns || []).forEach((r: { return_date: string; id: string; quantity: number; condition?: string; reason?: string }) => {
      const isUsed = (r.condition || 'new') === 'used';
      if (isUsed) {
        balanceUsed += r.quantity;
      } else {
        balanceNew += r.quantity;
      }
      entries.push({
        date: r.return_date,
        type: 'return',
        reference: `RET-${r.id.substring(0, 8)}`,
        description: `Returned - ${r.reason || 'No reason'} (${isUsed ? 'Used' : 'New'})`,
        qty_in: r.quantity,
        qty_out: 0,
        balance_new: balanceNew,
        balance_used: balanceUsed,
        branch: '-',
      });
    });

    // Sort all entries by date
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Recalculate running balances after sorting
    let runningNew = openingNew;
    let runningUsed = openingDonation;
    entries.forEach(entry => {
      if (entry.type !== 'opening') {
        if (entry.qty_in > 0) {
          if (entry.description.includes('Used')) {
            runningUsed += entry.qty_in;
          } else {
            runningNew += entry.qty_in;
          }
        } else if (entry.qty_out > 0) {
          if (entry.description.includes('Used')) {
            runningUsed -= entry.qty_out;
          } else {
            runningNew -= entry.qty_out;
          }
        }
        entry.balance_new = runningNew;
        entry.balance_used = runningUsed;
      }
    });

    setLedgerEntries(entries);
    setLoadingLedger(false);
  };

  useEffect(() => {
    if (selectedProductId) {
      fetchLedger(selectedProductId);
    } else {
      setLedgerEntries([]);
    }
  }, [selectedProductId]);

  const filteredEntries = useMemo(() => {
    let result = ledgerEntries;
    if (stockType !== 'all') {
      result = result.filter(e => {
        if (stockType === 'new') {
          return !e.description.includes('Used') || e.type === 'opening';
        }
        return e.description.includes('Used') || e.type === 'opening';
      });
    }
    if (branchFilter !== 'all') {
      result = result.filter(e => e.branch === branchFilter || e.type === 'opening');
    }
    return result;
  }, [ledgerEntries, stockType, branchFilter]);

  const stats = useMemo(() => ({
    totalIn: ledgerEntries.reduce((s, e) => s + e.qty_in, 0),
    totalOut: ledgerEntries.reduce((s, e) => s + e.qty_out, 0),
    currentNew: selectedProduct?.current_stock_new || 0,
    currentUsed: selectedProduct?.current_stock_donation || 0,
  }), [ledgerEntries, selectedProduct]);

  const handleExport = () => {
    if (!selectedProduct) return;
    exportToCSV(filteredEntries.map(e => ({
      'Date': e.date,
      'Type': e.type.toUpperCase(),
      'Reference': e.reference,
      'Branch': e.branch || '-',
      'Description': e.description,
      'Qty In': e.qty_in || '',
      'Qty Out': e.qty_out || '',
      'Balance New': e.balance_new,
      'Balance Used': e.balance_used,
    })), `ledger-${selectedProduct.name.replace(/\s+/g, '-').toLowerCase()}`);
  };

  const handlePrint = () => {
    if (!selectedProduct) return;
    const headers = ['Date', 'Type', 'Reference', 'Branch', 'Description', 'In', 'Out', 'New', 'Used'];
    const rows = filteredEntries.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.type.toUpperCase(),
      e.reference,
      e.branch || '-',
      e.description,
      e.qty_in > 0 ? `+${e.qty_in}` : '',
      e.qty_out > 0 ? `-${e.qty_out}` : '',
      String(e.balance_new),
      String(e.balance_used),
    ]);
    printTable(`Product Ledger - ${selectedProduct.name}`, headers, rows);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <ArrowDownCircle className="w-4 h-4 text-blue-600" />;
      case 'donation': return <ArrowDownCircle className="w-4 h-4 text-green-600" />;
      case 'issue': return <ArrowUpCircle className="w-4 h-4 text-red-600" />;
      case 'return': return <ArrowDownCircle className="w-4 h-4 text-amber-600" />;
      case 'opening': return <Package className="w-4 h-4 text-purple-600" />;
      default: return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      purchase: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      donation: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      issue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      return: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      opening: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return variants[type] || 'bg-gray-100 text-gray-800';
  };

  // ---- Date-wise pivot summary (Item shown once, one column per date) ----
  const pivotFiltered = useMemo(() => {
    return pivotRaw.filter(row => {
      if (!row.products) return false;
      if (pivotStoreFilter !== 'all' && row.products.store_id !== pivotStoreFilter) return false;
      if (pivotBranchFilter !== 'all' && row.branch_id !== pivotBranchFilter) return false;
      if (pivotFrom && row.purchase_date < pivotFrom) return false;
      if (pivotTo && row.purchase_date > pivotTo) return false;
      if (pivotSearch && !row.products.name.toLowerCase().includes(pivotSearch.toLowerCase())) return false;
      return true;
    });
  }, [pivotRaw, pivotStoreFilter, pivotBranchFilter, pivotFrom, pivotTo, pivotSearch]);

  const pivotDates = useMemo(() => {
    const set = new Set<string>();
    pivotFiltered.forEach(row => set.add(row.purchase_date));
    return Array.from(set).sort();
  }, [pivotFiltered]);

  const pivotRows = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; byDate: Record<string, number> }>();
    pivotFiltered.forEach(row => {
      if (!row.products) return;
      if (!map.has(row.product_id)) {
        map.set(row.product_id, { name: row.products.name, unit: row.products.unit, byDate: {} });
      }
      const entry = map.get(row.product_id)!;
      entry.byDate[row.purchase_date] = (entry.byDate[row.purchase_date] || 0) + row.quantity;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pivotFiltered]);

  const pivotDateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    pivotDates.forEach(d => {
      totals[d] = pivotRows.reduce((s, r) => s + (r.byDate[d] || 0), 0);
    });
    return totals;
  }, [pivotDates, pivotRows]);

  const formatDateLabel = (d: string) => new Date(d).toLocaleDateString('en-GB');

  const handlePivotPrint = () => {
    if (pivotRows.length === 0) return;
    const headers = ['Item', 'Unit', ...pivotDates.map(formatDateLabel), 'Total'];
    const rows = pivotRows.map(r => {
      const rowTotal = pivotDates.reduce((s, d) => s + (r.byDate[d] || 0), 0);
      return [r.name, r.unit, ...pivotDates.map(d => (r.byDate[d] ? String(r.byDate[d]) : '-')), String(rowTotal)];
    });
    printTable('Date-wise Stock Received Summary', headers, rows);
  };

  const handlePivotExport = () => {
    if (pivotRows.length === 0) return;
    exportToCSV(pivotRows.map(r => {
      const row: Record<string, string | number> = { 'Item': r.name, 'Unit': r.unit };
      pivotDates.forEach(d => { row[formatDateLabel(d)] = r.byDate[d] || ''; });
      row['Total'] = pivotDates.reduce((s, d) => s + (r.byDate[d] || 0), 0);
      return row;
    }), 'date-wise-stock-summary');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-purple-600" /> Product Ledger
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Complete transaction history and date-wise stock summaries</p>
        </div>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'ledger' | 'pivot')}>
          <TabsList>
            <TabsTrigger value="ledger">Transaction Ledger</TabsTrigger>
            <TabsTrigger value="pivot">Date-wise Summary</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'ledger' ? (
        <>
          {/* Product Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Select Product</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label>Store</Label>
                  <Select value={storeFilter} onValueChange={v => { setStoreFilter(v); setSelectedProductId(''); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="All Stores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stores</SelectItem>
                      {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2] min-w-[300px]">
                  <Label>Product</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 mb-2" />
                  </div>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger><SelectValue placeholder="Select a product to view ledger" /></SelectTrigger>
                    <SelectContent>
                      {filteredProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({(p.stores as { name: string } | null)?.name}) - New: {p.current_stock_new}, Used: {p.current_stock_donation}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Branch</Label>
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="mt-1 w-[160px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Stock Type</Label>
                  <Select value={stockType} onValueChange={v => setStockType(v as StockType)}>
                    <SelectTrigger className="mt-1 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="new">New Only</SelectItem>
                      <SelectItem value="donation">Used Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">Loading products...</CardContent>
            </Card>
          ) : !selectedProduct ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a product above to view its transaction ledger</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Product Info & Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="border-l-4 border-l-purple-500 col-span-2">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Product</p>
                    <p className="text-lg font-bold mt-1">{selectedProduct.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{(selectedProduct.stores as { name: string } | null)?.name}</span>
                      {selectedProduct.product_code && <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{selectedProduct.product_code}</code>}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total In</p>
                    <p className="text-2xl font-bold mt-1 flex items-center gap-2 text-blue-600">
                      <TrendingUp className="w-5 h-5" />
                      {stats.totalIn}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Out</p>
                    <p className="text-2xl font-bold mt-1 flex items-center gap-2 text-red-600">
                      <TrendingDown className="w-5 h-5" />
                      {stats.totalOut}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Stock</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-lg font-bold text-green-600">N: {stats.currentNew}</span>
                      <span className="text-lg font-bold text-amber-600">U: {stats.currentUsed}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Ledger Table */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{filteredEntries.length} entries</Badge>
                      <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-3.5 h-3.5 mr-1.5" />Print</Button>
                      <Button size="sm" variant="outline" onClick={handleExport}><Download className="w-3.5 h-3.5 mr-1.5" />Excel</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty In</TableHead>
                          <TableHead className="text-right">Qty Out</TableHead>
                          <TableHead className="text-right">Balance New</TableHead>
                          <TableHead className="text-right">Balance Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingLedger ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
                          ))
                        ) : filteredEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No transactions found for this product.</TableCell>
                          </TableRow>
                        ) : filteredEntries.map((entry, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/50 cursor-pointer" onClick={() => setViewEntry(entry)}>
                            <TableCell className="text-sm">{new Date(entry.date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTypeIcon(entry.type)}
                                <Badge className={getTypeBadge(entry.type)}>{entry.type}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{entry.reference}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{entry.branch || '-'}</TableCell>
                            <TableCell className="text-sm">{entry.description}</TableCell>
                            <TableCell className="text-right">
                              {entry.qty_in > 0 && <span className="font-medium text-green-600">+{entry.qty_in}</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.qty_out > 0 && <span className="font-medium text-red-600">-{entry.qty_out}</span>}
                            </TableCell>
                            <TableCell className="text-right font-medium">{entry.balance_new}</TableCell>
                            <TableCell className="text-right font-medium">{entry.balance_used}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          {/* Date-wise Pivot Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><CalendarRange className="w-4 h-4" /> Date-wise Stock Received Summary</CardTitle>
              <p className="text-xs text-muted-foreground">Each item appears once; every date it was received on becomes its own column.</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[180px]">
                  <Label>Search Item</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="e.g. Sugar" value={pivotSearch} onChange={e => setPivotSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div>
                  <Label>Store</Label>
                  <Select value={pivotStoreFilter} onValueChange={setPivotStoreFilter}>
                    <SelectTrigger className="mt-1 w-[160px]"><SelectValue placeholder="All Stores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stores</SelectItem>
                      {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Branch</Label>
                  <Select value={pivotBranchFilter} onValueChange={setPivotBranchFilter}>
                    <SelectTrigger className="mt-1 w-[160px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From</Label>
                  <Input className="mt-1 w-[150px]" type="date" value={pivotFrom} onChange={e => setPivotFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input className="mt-1 w-[150px]" type="date" value={pivotTo} onChange={e => setPivotTo(e.target.value)} />
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" variant="outline" onClick={handlePivotPrint} disabled={pivotRows.length === 0}><Printer className="w-3.5 h-3.5 mr-1.5" />Print</Button>
                  <Button size="sm" variant="outline" onClick={handlePivotExport} disabled={pivotRows.length === 0}><Download className="w-3.5 h-3.5 mr-1.5" />Excel</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Summary</CardTitle>
                <Badge variant="secondary">{pivotRows.length} items · {pivotDates.length} dates</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Item</TableHead>
                      <TableHead>Unit</TableHead>
                      {pivotDates.map(d => (
                        <TableHead key={d} className="text-right whitespace-nowrap">{formatDateLabel(d)}</TableHead>
                      ))}
                      <TableHead className="text-right font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pivotLoading ? (
                      <TableRow><TableCell colSpan={pivotDates.length + 3} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : pivotRows.length === 0 ? (
                      <TableRow><TableCell colSpan={pivotDates.length + 3} className="text-center py-12 text-muted-foreground">No records match these filters.</TableCell></TableRow>
                    ) : (
                      <>
                        {pivotRows.map(r => {
                          const rowTotal = pivotDates.reduce((s, d) => s + (r.byDate[d] || 0), 0);
                          return (
                            <TableRow key={r.name}>
                              <TableCell className="font-medium sticky left-0 bg-background">{r.name}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{r.unit}</Badge></TableCell>
                              {pivotDates.map(d => (
                                <TableCell key={d} className="text-right">{r.byDate[d] ? r.byDate[d] : <span className="text-muted-foreground">-</span>}</TableCell>
                              ))}
                              <TableCell className="text-right font-semibold text-green-600">{rowTotal}</TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/50">
                          <TableCell className="font-bold sticky left-0 bg-muted/50">Total</TableCell>
                          <TableCell />
                          {pivotDates.map(d => (
                            <TableCell key={d} className="text-right font-bold">{pivotDateTotals[d] || 0}</TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            {Object.values(pivotDateTotals).reduce((s, v) => s + v, 0)}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Entry Detail Sheet */}
      <Sheet open={!!viewEntry} onOpenChange={() => setViewEntry(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Transaction Details</SheetTitle>
            <SheetDescription>Ledger entry information</SheetDescription>
          </SheetHeader>
          {viewEntry && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                {getTypeIcon(viewEntry.type)}
                <div>
                  <Badge className={getTypeBadge(viewEntry.type)}>{viewEntry.type.toUpperCase()}</Badge>
                  <p className="font-mono text-sm mt-1">{viewEntry.reference}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Date</p>
                  <p className="font-medium">{new Date(viewEntry.date).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Branch</p>
                  <p className="font-medium">{viewEntry.branch || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Quantity Change</p>
                  <p className="font-medium">
                    {viewEntry.qty_in > 0 && <span className="text-green-600">+{viewEntry.qty_in}</span>}
                    {viewEntry.qty_out > 0 && <span className="text-red-600">-{viewEntry.qty_out}</span>}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Description</p>
                  <p className="font-medium">{viewEntry.description}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Balance New</p>
                  <p className="font-medium text-green-600">{viewEntry.balance_new}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase">Balance Used</p>
                  <p className="font-medium text-amber-600">{viewEntry.balance_used}</p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}