'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BarChart3, Download, Printer, FileText, Package, GitBranch,
  ShoppingCart, Heart, ArrowRightLeft, Undo2, AlertTriangle, Search
} from 'lucide-react';
import { exportToCSV, printTable } from '@/lib/export';
import { toast } from 'sonner';

type ReportType =
  | 'current_stock'
  | 'low_stock'
  | 'daily_issues'
  | 'monthly_issues'
  | 'branch_issues'
  | 'purchases'
  | 'donations'
  | 'returns'
  | 'dead_stock'
  | 'item_date_pivot';

interface ReportRow {
  [key: string]: string | number | null;
}

const REPORT_TYPES = [
  { value: 'current_stock', label: 'Current Stock Report', icon: Package, color: 'text-blue-600' },
  { value: 'low_stock', label: 'Low Stock Report', icon: AlertTriangle, color: 'text-red-600' },
  { value: 'dead_stock', label: 'Dead Stock Report', icon: Package, color: 'text-gray-500' },
  { value: 'daily_issues', label: 'Daily Issue Report', icon: ArrowRightLeft, color: 'text-cyan-600' },
  { value: 'monthly_issues', label: 'Monthly Issue Report', icon: FileText, color: 'text-blue-600' },
  { value: 'branch_issues', label: 'Branch-wise Issue Report', icon: GitBranch, color: 'text-green-600' },
  { value: 'item_date_pivot', label: 'Item-wise Date Report', icon: GitBranch, color: 'text-purple-600' },
  { value: 'purchases', label: 'Purchase Report', icon: ShoppingCart, color: 'text-amber-600' },
  { value: 'donations', label: 'Donation Report', icon: Heart, color: 'text-green-600' },
  { value: 'returns', label: 'Return Report', icon: Undo2, color: 'text-amber-600' },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('current_stock');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemPickerValue, setItemPickerValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('role, branch_id').eq('id', user?.id || '').maybeSingle();
      const profData = prof as { role: string | null; branch_id: string | null } | null;
      const ubid = profData?.branch_id || null;
      setUserBranchId(ubid);
      setUserRole(profData?.role || null);
      if (ubid) {
        setBranchFilter(ubid);
        // Branch users land straight on the one report that's already
        // branch-scoped AND breaks issued items down by date — matches what
        // a branch account actually needs (their own monthly issued items).
        if (profData?.role === 'branch_user') setReportType('branch_issues');
      }
      const [bRes, sRes, pRes, cRes] = await Promise.all([
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('stores').select('id, name').order('name'),
        supabase.from('products').select('id, name, unit, category_id').eq('is_active', true).order('name'),
        supabase.from('categories').select('id, name').order('name'),
      ]);
      setBranches((bRes.data || []) as { id: string; name: string }[]);
      setStores((sRes.data || []) as { id: string; name: string }[]);
      setAllProducts((pRes.data || []) as { id: string; name: string; unit: string }[]);
      setCategories((cRes.data || []) as { id: string; name: string }[]);
    })();
  }, []);

  const generateReport = async () => {
    setGenerating(true);
    setSearchQuery('');
    let data: ReportRow[] = [];
    let hdrs: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type AnyRow = any;

    if (reportType === 'current_stock') {
      let q = supabase.from('products').select('product_code, name, stores(name), categories(name), unit, current_stock_new, current_stock_donation, min_stock').eq('is_active', true);
      if (storeFilter && storeFilter !== 'all') q = q.eq('store_id', storeFilter);
      const { data: rows } = await q.order('name');
      hdrs = ['Code', 'Product', 'Store', 'Category', 'Unit', 'New Stock', 'Donation Stock', 'Total', 'Min Stock'];
      data = ((rows || []) as AnyRow[]).map((r: AnyRow) => ({
        'Code': r.product_code || '-',
        'Product': r.name,
        'Store': r.stores?.name || '-',
        'Category': r.categories?.name || '-',
        'Unit': r.unit,
        'New Stock': r.current_stock_new,
        'Donation Stock': r.current_stock_donation,
        'Total': r.current_stock_new + r.current_stock_donation,
        'Min Stock': r.min_stock,
      }));
    } else if (reportType === 'low_stock') {
      const { data: rows } = await supabase.from('products').select('product_code, name, stores(name), unit, current_stock_new, current_stock_donation, min_stock').eq('is_active', true).order('name');
      hdrs = ['Code', 'Product', 'Store', 'Unit', 'Current Stock', 'Min Stock', 'Shortage'];
      data = ((rows || []) as AnyRow[])
        .filter((r: AnyRow) => (r.current_stock_new + r.current_stock_donation) <= r.min_stock && r.min_stock > 0)
        .map((r: AnyRow) => ({
          'Code': r.product_code || '-',
          'Product': r.name,
          'Store': r.stores?.name || '-',
          'Unit': r.unit,
          'Current Stock': r.current_stock_new + r.current_stock_donation,
          'Min Stock': r.min_stock,
          'Shortage': r.min_stock - (r.current_stock_new + r.current_stock_donation),
        }));
    } else if (reportType === 'dead_stock') {
      const { data: rows } = await supabase.from('products').select('product_code, name, stores(name), unit, current_stock_new, current_stock_donation').eq('is_active', true);
      hdrs = ['Code', 'Product', 'Store', 'Unit', 'New Stock', 'Donation Stock'];
      data = ((rows || []) as AnyRow[])
        .filter((r: AnyRow) => r.current_stock_new === 0 && r.current_stock_donation === 0)
        .map((r: AnyRow) => ({
          'Code': r.product_code || '-',
          'Product': r.name,
          'Store': r.stores?.name || '-',
          'Unit': r.unit,
          'New Stock': r.current_stock_new,
          'Donation Stock': r.current_stock_donation,
        }));
    } else if (reportType === 'daily_issues') {
      let q = supabase.from('issue_slips').select('issue_number, issue_date, branches(name), stores(name), issued_by, issue_items(id)')
        .gte('issue_date', dateFrom).lte('issue_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      if (storeFilter && storeFilter !== 'all') q = q.eq('store_id', storeFilter);
      const { data: rows } = await q.order('issue_date');
      hdrs = ['Issue No', 'Date', 'Branch', 'Store', 'Issued By', 'Items'];
      data = ((rows || []) as AnyRow[]).map((r: AnyRow) => ({
        'Issue No': r.issue_number,
        'Date': r.issue_date,
        'Branch': r.branches?.name || '-',
        'Store': r.stores?.name || '-',
        'Issued By': r.issued_by,
        'Items': r.issue_items?.length || 0,
      }));
    } else if (reportType === 'monthly_issues') {
      let q = supabase.from('issue_slips').select('issue_number, issue_date, branches(name), issued_by')
        .gte('issue_date', dateFrom).lte('issue_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data: rows } = await q.order('issue_date');
      const monthMap: Record<string, number> = {};
      ((rows || []) as AnyRow[]).forEach((r: AnyRow) => {
        const m = new Date(r.issue_date).toLocaleString('default', { month: 'long', year: 'numeric' });
        monthMap[m] = (monthMap[m] || 0) + 1;
      });
      hdrs = ['Month', 'Total Issues'];
      data = Object.entries(monthMap).map(([month, count]) => ({ 'Month': month, 'Total Issues': count }));
    } else if (reportType === 'branch_issues') {
      let q = supabase.from('issue_slips').select('issue_number, issue_date, branches(name), issue_items(product_id, quantity, item_type, products(name, unit))')
        .gte('issue_date', dateFrom).lte('issue_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data: rows } = await q.order('issue_date');

      // Pivot: har item+branch ek hi row mein, har date ek column
      // Agar specific items select kiye hain to sirf unhi ko include karo
      const dateSet = new Set<string>();
      ((rows || []) as AnyRow[]).forEach((slip: AnyRow) => dateSet.add(slip.issue_date));
      const sortedDates = Array.from(dateSet).sort();

      const itemMap: Record<string, ReportRow> = {};

      ((rows || []) as AnyRow[]).forEach((slip: AnyRow) => {
        const branchName = slip.branches?.name || '-';
        (slip.issue_items || []).forEach((item: AnyRow) => {
          if (selectedItemIds.length > 0 && !selectedItemIds.includes(item.product_id)) return;

          const name = item.products?.name || 'Unknown';
          const unit = item.products?.unit || '';
          const key = `${branchName}__${name}__${unit}`;

          if (!itemMap[key]) {
            itemMap[key] = { 'Branch': branchName, 'Item': name, 'Unit': unit };
            sortedDates.forEach(d => { itemMap[key][d] = 0; });
          }
          const current = (itemMap[key][slip.issue_date] as number) || 0;
          itemMap[key][slip.issue_date] = current + item.quantity;
        });
      });

      hdrs = ['Branch', 'Item', 'Unit', ...sortedDates];
      data = Object.values(itemMap);
    } else if (reportType === 'item_date_pivot') {
      // Item-wise Date Report: har item ek hi row mein, har date ek column
      let q = supabase
        .from('issue_slips')
        .select('issue_date, branches(name), issue_items(product_id, quantity, item_type, products(name, unit))')
        .gte('issue_date', dateFrom)
        .lte('issue_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data: rows } = await q.order('issue_date');

      // Step A: sab unique dates nikal ke sort karo (ye columns banenge)
      const dateSet = new Set<string>();
      ((rows || []) as AnyRow[]).forEach((slip: AnyRow) => dateSet.add(slip.issue_date));
      const sortedDates = Array.from(dateSet).sort();

      // Step B: har item ke liye ek row banao, date-wise quantity ikhatti karo
      // Agar user ne specific items select kiye hain (selectedItemIds), to sirf unhi ko include karo
      const itemMap: Record<string, ReportRow> = {};

      ((rows || []) as AnyRow[]).forEach((slip: AnyRow) => {
        (slip.issue_items || []).forEach((item: AnyRow) => {
          // filter: agar koi item select kiya hua hai to sirf wahi allow karo
          if (selectedItemIds.length > 0 && !selectedItemIds.includes(item.product_id)) return;

          const name = item.products?.name || 'Unknown';
          const unit = item.products?.unit || '';
          const key = `${name}__${unit}`;

          if (!itemMap[key]) {
            itemMap[key] = { 'Item': name, 'Unit': unit };
            // har date ka default 0 rakho taake column mein khaali na dikhe
            sortedDates.forEach(d => { itemMap[key][d] = 0; });
          }
          const current = (itemMap[key][slip.issue_date] as number) || 0;
          itemMap[key][slip.issue_date] = current + item.quantity;
        });
      });

      hdrs = ['Item', 'Unit', ...sortedDates];
      data = Object.values(itemMap);
    } else if (reportType === 'purchases') {
      // Branch + Item filters added: lets you pull e.g. "how much Sugar was
      // purchased for Cadet College branch" by combining both filters.
      let q = supabase.from('purchases').select('product_id, purchase_date, products(name, stores(name)), branches(name), supplier, invoice_number, quantity, unit_price, total_cost')
        .gte('purchase_date', dateFrom).lte('purchase_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data: rows } = await q.order('purchase_date');
      hdrs = ['Date', 'Branch', 'Product', 'Store', 'Supplier', 'Invoice', 'Quantity', 'Unit Price', 'Total'];
      data = ((rows || []) as AnyRow[])
        .filter((r: AnyRow) => selectedItemIds.length === 0 || selectedItemIds.includes(r.product_id))
        .map((r: AnyRow) => ({
          'Date': r.purchase_date,
          'Branch': r.branches?.name || '-',
          'Product': r.products?.name || '-',
          'Store': r.products?.stores?.name || '-',
          'Supplier': r.supplier || '-',
          'Invoice': r.invoice_number || '-',
          'Quantity': r.quantity,
          'Unit Price': r.unit_price,
          'Total': r.total_cost,
        }));
    } else if (reportType === 'donations') {
      let q = supabase.from('donations').select('donation_date, donor_name, products(name, stores(name)), quantity, remarks')
        .gte('donation_date', dateFrom).lte('donation_date', dateTo);
      const { data: rows } = await q.order('donation_date');
      hdrs = ['Date', 'Donor', 'Product', 'Store', 'Quantity', 'Remarks'];
      data = ((rows || []) as AnyRow[]).map((r: AnyRow) => ({
        'Date': r.donation_date,
        'Donor': r.donor_name,
        'Product': r.products?.name || '-',
        'Store': r.products?.stores?.name || '-',
        'Quantity': r.quantity,
        'Remarks': r.remarks || '-',
      }));
    } else if (reportType === 'returns') {
      let q = supabase.from('returns').select('return_date, products(name, unit), branches(name), item_type, quantity, reason')
        .gte('return_date', dateFrom).lte('return_date', dateTo);
      if (branchFilter && branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data: rows } = await q.order('return_date');
      hdrs = ['Date', 'Product', 'Branch', 'Type', 'Quantity', 'Reason'];
      data = ((rows || []) as AnyRow[]).map((r: AnyRow) => ({
        'Date': r.return_date,
        'Product': r.products?.name || '-',
        'Branch': r.branches?.name || '-',
        'Type': r.item_type,
        'Quantity': `${r.quantity} ${r.products?.unit || ''}`,
        'Reason': r.reason || '-',
      }));
    }

    setHeaders(hdrs);
    setReportData(data);
    setGenerated(true);
    setGenerating(false);
    // select all rows by default when report is generated
    setSelectedRows(new Set(data.map((_, i) => i)));

    if (data.length === 0) {
      toast.info('No data found for the selected filters');
    } else {
      toast.success(`Report generated: ${data.length} records`);
    }
  };

  const toggleRow = (index: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === reportData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(reportData.map((_, i) => i)));
    }
  };

  const getSelectedData = () => reportData.filter((_, i) => selectedRows.has(i));

  const handleExport = () => {
    const rows = getSelectedData();
    if (!rows.length) { toast.error('Select at least one row'); return; }
    exportToCSV(rows, reportType);
    toast.success(`Exported ${rows.length} row(s) to CSV`);
  };

  const handlePrint = () => {
    const rows = getSelectedData();
    if (!rows.length) { toast.error('Select at least one row'); return; }
    const reportLabel = REPORT_TYPES.find(r => r.value === reportType)?.label || 'Report';
    printTable(reportLabel, headers, rows.map(row => headers.map(h => String(row[h] ?? ''))));
  };

  const needsDateRange = !['current_stock', 'low_stock', 'dead_stock'].includes(reportType);
  const allSelected = reportData.length > 0 && selectedRows.size === reportData.length;

  // Pivot-style reports ke label columns ko horizontal scroll ke doran fix (sticky) rakhna
  const STICKY_COLS_BY_REPORT: Partial<Record<ReportType, string[]>> = {
    item_date_pivot: ['Item', 'Unit'],
    branch_issues: ['Branch', 'Item', 'Unit'],
  };
  const stickyColNames = STICKY_COLS_BY_REPORT[reportType] || [];
  const CHECKBOX_COL_WIDTH = 40;
  const colWidth = (name: string) => (name === 'Branch' ? 160 : name === 'Item' ? 180 : name === 'Unit' ? 90 : 120);
  const stickyLeftMap: Record<string, number> = {};
  let cumulativeLeft = CHECKBOX_COL_WIDTH;
  stickyColNames.forEach(col => {
    if (headers.includes(col)) {
      stickyLeftMap[col] = cumulativeLeft;
      cumulativeLeft += colWidth(col);
    }
  });

  // Search: har row ke sab columns ke andar match dhoondo
  const filteredIndices = reportData.reduce<number[]>((acc, row, i) => {
    if (!searchQuery.trim()) { acc.push(i); return acc; }
    const q = searchQuery.trim().toLowerCase();
    const isMatch = headers.some(h => String(row[h] ?? '').toLowerCase().includes(q));
    if (isMatch) acc.push(i);
    return acc;
  }, []);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6" /> Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Generate and export comprehensive inventory reports</p>
      </div>

      {/* Report type cards — branch users only see branch-scoped reports.
          Donations aren't filtered by branch anywhere in this app and isn't
          part of a branch_user's permissions, so it's hidden here rather
          than silently showing every branch's data. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(userRole === 'branch_user'
          ? REPORT_TYPES.filter(r => !['purchases', 'donations', 'current_stock', 'low_stock', 'dead_stock', 'daily_issues'].includes(r.value))
          : REPORT_TYPES
        ).map(({ value, label, icon: Icon, color }) => (
          <button
            key={value}
            onClick={() => { setReportType(value as ReportType); setGenerated(false); setSelectedRows(new Set()); setSelectedItemIds([]); setItemPickerValue(''); }}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all text-sm font-medium
              ${reportType === value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'}`}
          >
            <Icon className={`w-5 h-5 ${reportType === value ? 'text-primary' : color}`} />
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report Filters</CardTitle>
          <CardDescription>Configure filters for {REPORT_TYPES.find(r => r.value === reportType)?.label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {needsDateRange && (
              <>
                <div>
                  <Label>From Date</Label>
                  <Input className="mt-1" type="date" value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input className="mt-1" type="date" value={dateTo}
                    onChange={e => setDateTo(e.target.value)} />
                </div>
              </>
            )}
            {/* Branch filter now also shown for Purchase Report, so a
                branch-wise purchase breakdown (e.g. Cadet College only)
                can be pulled. Still hidden for Donations/Dead Stock, which
                aren't branch-scoped in this app. */}
            {!['donations', 'dead_stock'].includes(reportType) && (
              <div>
                <Label>Branch</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter} disabled={!!userBranchId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All branches" /></SelectTrigger>
                  <SelectContent>
                    {!userBranchId && <SelectItem value="all">All Branches</SelectItem>}
                    {branches.filter(b => !userBranchId || b.id === userBranchId).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {['current_stock', 'low_stock', 'dead_stock', 'daily_issues'].includes(reportType) && (
              <div>
                <Label>Store</Label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All stores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Item filter — now also available for Purchase Report, so e.g.
              "Sugar purchased for Cadet College" can be pulled by combining
              this with the Branch filter above. */}
          {(reportType === 'item_date_pivot' || reportType === 'branch_issues' || reportType === 'purchases') && (
            <div className="mt-4">
              <Label>Filter Items (optional )</Label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={itemPickerValue}
                  onValueChange={(val) => {
                    setItemPickerValue(val);
                    if (val && !selectedItemIds.includes(val)) {
                      setSelectedItemIds(prev => [...prev, val]);
                    }
                  }}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Item select (e.g. Sugar)" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProducts
                      .filter(p => !selectedItemIds.includes(p.id))
                      .map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedItemIds.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => { setSelectedItemIds([]); setItemPickerValue(''); }}>
                    Clear All
                  </Button>
                )}
              </div>
              {selectedItemIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedItemIds.map(id => {
                    const p = allProducts.find(pp => pp.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
                        {p?.name || id}
                        <button
                          type="button"
                          onClick={() => setSelectedItemIds(prev => prev.filter(x => x !== id))}
                          className="ml-1 rounded-full hover:bg-muted-foreground/20 w-4 h-4 flex items-center justify-center text-xs"
                          aria-label={`Remove ${p?.name}`}
                        >
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button onClick={generateReport} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Report'}
            </Button>
            {generated && reportData.length > 0 && (
              <>
                <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export CSV ({selectedRows.size})</Button>
                <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print ({selectedRows.size})</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {generated && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {REPORT_TYPES.find(r => r.value === reportType)?.label}
              </CardTitle>
              <CardDescription>
                {reportData.length} records found, {selectedRows.size} selected
                {searchQuery.trim() && `, ${filteredIndices.length} matching search`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {reportData.length > 0 && (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8 w-48 sm:w-64"
                    placeholder="Search in report..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              )}
              {reportData.length > 0 && (
                <Badge variant="secondary">{reportData.length} rows</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {reportData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No data found for the selected filters and date range.
              </div>
            ) : filteredIndices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No rows match your search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="w-10 sticky left-0 z-20 bg-card"
                        style={{ left: 0, minWidth: CHECKBOX_COL_WIDTH, width: CHECKBOX_COL_WIDTH }}
                      >
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                      </TableHead>
                      {headers.map(h => {
                        const isSticky = stickyLeftMap[h] !== undefined;
                        return (
                          <TableHead
                            key={h}
                            className={isSticky ? 'sticky z-20 bg-card' : ''}
                            style={isSticky ? { left: stickyLeftMap[h], minWidth: colWidth(h), width: colWidth(h) } : undefined}
                          >
                            {h}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIndices.slice(0, 100).map((i) => {
                      const row = reportData[i];
                      const isSelected = selectedRows.has(i);
                      return (
                        <TableRow key={i} data-state={isSelected ? 'selected' : undefined}>
                          <TableCell
                            className={`w-10 sticky left-0 z-10 ${isSelected ? 'bg-muted' : 'bg-background'}`}
                            style={{ left: 0, minWidth: CHECKBOX_COL_WIDTH, width: CHECKBOX_COL_WIDTH }}
                          >
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(i)} aria-label={`Select row ${i + 1}`} />
                          </TableCell>
                          {headers.map(h => {
                            const isSticky = stickyLeftMap[h] !== undefined;
                            return (
                              <TableCell
                                key={h}
                                className={`text-sm ${isSticky ? `sticky z-10 ${isSelected ? 'bg-muted' : 'bg-background'}` : ''}`}
                                style={isSticky ? { left: stickyLeftMap[h], minWidth: colWidth(h), width: colWidth(h) } : undefined}
                              >
                                {String(row[h] ?? '-')}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {filteredIndices.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={headers.length + 1} className="text-center text-muted-foreground py-3 text-sm">
                          Showing first 100 matching rows. Only rows shown here can be selected/checked. Export to CSV for full data.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}