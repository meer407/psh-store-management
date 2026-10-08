'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { Product, Store, Category, ProductVariant } from '@/lib/types';
import { UNITS, hasPermission } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Package, Search, AlertTriangle, Eye, Barcode, ScanLine, RefreshCw, Printer, X, ArrowRightLeft, Download, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV, printTable } from '@/lib/export';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const emptyForm = {
  name: '', product_code: '', barcode: '', sku: '', selling_price: 0,
  store_id: '', category_id: '', unit: 'Piece',
  opening_stock_new: 0, opening_stock_donation: 0, current_stock_new: 0, current_stock_donation: 0,
  min_stock: 0, description: '',
};

const emptyVariant = { variant_name: '', variant_value: '', barcode: '', sku: '', current_stock_new: 0, current_stock_donation: 0 };

// Purchase-only row shape for the "Received History (Purchases)" table.
// Restocks no longer feed this table — they only affect the "Total Received"
// summary card at the top of the View sheet (see totalIn below).
type PurchaseRow = { id: string; date: string; supplier: string; branch: string; variant: string; quantity: number };

type Branch = { id: string; name: string };

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [newVariant, setNewVariant] = useState(emptyVariant);
  const [canManage, setCanManage] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [restockType, setRestockType] = useState<'new' | 'donation'>('new');
  const [restockVariantId, setRestockVariantId] = useState<string>('whole');
  // NEW: supplier name + branch are now required when restocking.
  const [restockSupplier, setRestockSupplier] = useState('');
  const [restockBranchId, setRestockBranchId] = useState('');
  const [restocking, setRestocking] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanQty, setScanQty] = useState(1);
  const [scanMode, setScanMode] = useState<'in' | 'out'>('in');
  const [scanning, setScanning] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Traceability: "where did this come from" (purchases) and "where did this go"
  // (issue_items -> issue_slips) for whichever product is currently open in the
  // View sheet. Fetched fresh each time a product is opened.
  const [purchaseHistory, setPurchaseHistory] = useState<Array<{
    id: string; purchase_date: string; supplier: string | null; quantity: number;
    branches: { name: string } | null; product_variants: { variant_name: string; variant_value: string } | null;
  }>>([]);
  const [issueHistory, setIssueHistory] = useState<Array<{
    id: string; quantity: number; condition: string | null; received_by: string | null;
    product_variants: { variant_name: string; variant_value: string } | null;
    issue_slips: { issue_number: string; issue_date: string; beneficiary_name: string | null; branches: { name: string } | null } | null;
  }>>([]);
  // Manual "Add Stock / Restock" receipts, pulled from stock_transactions
  // (transaction_type='stock_in', reference_type='restock'). These are used
  // ONLY for the "Total Received" summary card — they do NOT appear in the
  // Received History table below (that table is purchases-only now).
  const [restockReceipts, setRestockReceipts] = useState<Array<{
    id: string; created_at: string; quantity: number; item_type: string | null; notes: string | null;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: prods }, { data: strs }, { data: cats }, { data: profile }, { data: brnchs }] = await Promise.all([
      supabase.from('products').select('*, stores(name), categories(name), product_variants(*)').order('name'),
      supabase.from('stores').select('*').order('name'),
      supabase.from('categories').select('*, stores(name)').order('name'),
      supabase.from('profiles').select('role').eq('id', user?.id || '').maybeSingle(),
      supabase.from('branches').select('id, name').order('name'),
    ]);
    // Stock is hidden from branch_user in the sidebar, but someone could
    // still type the URL directly — redirect them to a page they do have.
    if ((profile as { role: string } | null)?.role === 'branch_user') {
      router.replace('/dashboard/issues');
      return;
    }
    setProducts((prods || []) as unknown as Product[]);
    setStores((strs || []) as unknown as Store[]);
    setCategories((cats || []) as unknown as Category[]);
    setCanManage(hasPermission((profile as { role: string } | null)?.role, 'stock.manage'));
    setBranches((brnchs || []) as unknown as Branch[]);
    setLoading(false);
  };

  const filteredCategories = categories.filter(c => !form.store_id || c.store_id === form.store_id);

  // Opens the View sheet for a product and loads its full trace: every
  // purchase that brought stock in, every manual restock, and every issue
  // slip that sent stock out.
  const openView = async (p: Product) => {
    setViewing(p);
    setPurchaseHistory([]);
    setIssueHistory([]);
    setRestockReceipts([]);
    setHistoryLoading(true);
    const [{ data: purch }, { data: issued }, { data: restocks }] = await Promise.all([
      supabase.from('purchases')
        .select('id, purchase_date, supplier, quantity, branches(name), product_variants(variant_name, variant_value)')
        .eq('product_id', p.id)
        .order('purchase_date', { ascending: false }),
      supabase.from('issue_items')
        .select('id, quantity, condition, received_by, product_variants(variant_name, variant_value), issue_slips(issue_number, issue_date, beneficiary_name, branches(name))')
        .eq('product_id', p.id),
      supabase.from('stock_transactions')
        .select('id, created_at, quantity, item_type, notes')
        .eq('product_id', p.id)
        .eq('transaction_type', 'stock_in')
        .eq('reference_type', 'restock')
        .order('created_at', { ascending: false }),
    ]);
    setPurchaseHistory((purch || []) as unknown as typeof purchaseHistory);
    setRestockReceipts((restocks || []) as unknown as typeof restockReceipts);
    const issuedSorted = ((issued || []) as unknown as typeof issueHistory).slice().sort((a, b) => {
      const da = a.issue_slips?.issue_date || '';
      const db = b.issue_slips?.issue_date || '';
      return db.localeCompare(da);
    });
    setIssueHistory(issuedSorted);
    setHistoryLoading(false);
  };

  // Categories shown in the toolbar filter dropdown — scoped to the selected
  // store filter (if any), same behavior as the add/edit form's category list.
  const toolbarCategories = categories.filter(c => storeFilter === 'all' || c.store_id === storeFilter);

  const openAdd = () => {
    setEditing(null);
    setVariants([]);
    setNewVariant(emptyVariant);
    setForm({ ...emptyForm, store_id: stores[0]?.id || '' });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setVariants((p.product_variants || []) as unknown as ProductVariant[]);
    setNewVariant(emptyVariant);
    setForm({
      name: p.name, product_code: p.product_code || '', barcode: p.barcode || '', sku: p.sku || '',
      selling_price: p.selling_price || 0,
      store_id: p.store_id, category_id: p.category_id || '', unit: p.unit,
      opening_stock_new: p.opening_stock_new, opening_stock_donation: p.opening_stock_donation,
      current_stock_new: p.current_stock_new, current_stock_donation: p.current_stock_donation,
      min_stock: p.min_stock, description: p.description || '',
    });
    setDialogOpen(true);
  };

  const addVariant = () => {
    const name = newVariant.variant_name.trim();
    const rawValue = newVariant.variant_value.trim();
    if (!name && !rawValue) { toast.error('Variant name/value required'); return; }

    const values = rawValue ? rawValue.split(',').map(v => v.trim()).filter(Boolean) : [''];

    if (values.length > 1 && (newVariant.barcode.trim() || newVariant.sku.trim())) {
      toast.error('Barcode/SKU can only be set on one variant at a time — clear them to bulk-add, or add values one by one.');
      return;
    }

    const newEntries = values.map(value => ({
      variant_name: name,
      variant_value: value,
      barcode: newVariant.barcode.trim(),
      sku: newVariant.sku.trim(),
      current_stock_new: Number(newVariant.current_stock_new),
      current_stock_donation: Number(newVariant.current_stock_donation),
    })) as ProductVariant[];

    setVariants(prev => [...prev, ...newEntries]);
    setNewVariant(emptyVariant);
    toast.success(values.length > 1 ? `${values.length} variants added` : 'Variant added');
  };

  const removeVariant = (idx: number) => setVariants(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Stock item name is required'); return; }
    if (!form.store_id) { toast.error('Please select a store'); return; }
    if (form.barcode) {
      const { data: existing } = await supabase.from('products').select('id').eq('barcode', form.barcode).neq('id', editing?.id || '').maybeSingle();
      if (existing) { toast.error('Barcode already exists on another product'); return; }
    }
    if (form.sku) {
      const { data: existing } = await supabase.from('products').select('id').eq('sku', form.sku).neq('id', editing?.id || '').maybeSingle();
      if (existing) { toast.error('SKU already exists on another product'); return; }
    }
    setSaving(true);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      product_code: form.product_code || null,
      barcode: form.barcode || null,
      sku: form.sku || null,
      selling_price: Number(form.selling_price),
      opening_stock_new: Number(form.opening_stock_new),
      opening_stock_donation: Number(form.opening_stock_donation),
      current_stock_new: Number(form.current_stock_new),
      current_stock_donation: Number(form.current_stock_donation),
      min_stock: Number(form.min_stock),
    };
    const buildVariantRows = (productId: string) => variants.map(v => {
      const { id: _id, created_at: _ca, product_id: _pid, ...rest } = v as unknown as Record<string, unknown>;
      const barcode = typeof rest.barcode === 'string' ? rest.barcode.trim() : rest.barcode;
      const sku = typeof rest.sku === 'string' ? rest.sku.trim() : rest.sku;
      return {
        ...rest,
        barcode: barcode ? barcode : null,
        sku: sku ? sku : null,
        product_id: productId,
      };
    });

    if (editing) {
      const { error } = await supabase.from('products').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await supabase.from('product_variants').delete().eq('product_id', editing.id);
      if (variants.length > 0) {
        const { error: variantError } = await supabase.from('product_variants').insert(buildVariantRows(editing.id));
        if (variantError) toast.error(`Product saved, but variants failed: ${variantError.message}`);
      }
      toast.success('Stock item updated');
      logAudit('UPDATE', 'products', editing.id, { name: form.name });
    } else {
      const { data: inserted, error } = await supabase.from('products').insert(payload).select('id').single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      if (inserted && variants.length > 0) {
        const { error: variantError } = await supabase.from('product_variants').insert(buildVariantRows(inserted.id));
        if (variantError) toast.error(`Product saved, but variants failed: ${variantError.message}`);
      }
      toast.success('Stock item added');
      logAudit('INSERT', 'products', inserted?.id, { name: form.name });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', deleteId);
    if (error) toast.error(error.message); else { toast.success('Stock item removed'); logAudit('DELETE', 'products', deleteId); }
    setDeleteId(null);
    fetchData();
  };

  const handleRestock = async () => {
    if (!restockProduct) return;
    if (restockQty <= 0) { toast.error('Quantity must be greater than 0'); return; }
    // NEW: supplier name + branch are required for every restock entry.
    if (!restockSupplier.trim()) { toast.error('Supplier name is required'); return; }
    if (!restockBranchId) { toast.error('Please select a branch'); return; }
    setRestocking(true);
    const field = restockType === 'new' ? 'current_stock_new' : 'current_stock_donation';

    const { data: prod } = await supabase.from('products').select(field).eq('id', restockProduct.id).maybeSingle();
    if (prod) {
      const newQty = (prod[field as keyof typeof prod] as number || 0) + Number(restockQty);
      await supabase.from('products').update({ [field]: newQty, updated_at: new Date().toISOString() }).eq('id', restockProduct.id);
    }

    let variantLabel = '';
    if (restockVariantId !== 'whole') {
      const { data: variantRow } = await supabase.from('product_variants').select(field).eq('id', restockVariantId).maybeSingle();
      if (variantRow) {
        const newVariantQty = (variantRow[field as keyof typeof variantRow] as number || 0) + Number(restockQty);
        const { error: variantUpdateError } = await supabase.from('product_variants').update({ [field]: newVariantQty }).eq('id', restockVariantId);
        if (variantUpdateError) toast.error(`Variant stock update failed: ${variantUpdateError.message}`);
      }
      const chosen = (restockProduct.product_variants as ProductVariant[] | undefined)?.find(v => v.id === restockVariantId);
      if (chosen) variantLabel = ` (${chosen.variant_name}: ${chosen.variant_value})`;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const branchName = branches.find(b => b.id === restockBranchId)?.name || '';
    const { error: txnError } = await supabase.from('stock_transactions').insert({
      transaction_type: 'stock_in',
      product_id: restockProduct.id,
      quantity: Number(restockQty),
      item_type: restockType,
      reference_type: 'restock',
      notes: `Restocked ${restockQty} ${restockProduct.unit}${variantLabel} | Supplier: ${restockSupplier.trim()} | Branch: ${branchName}`,
      created_by: user?.id,
    });
    if (txnError) {
      // Stock quantity above was already updated, but this record failed to
      // save — meaning it won't show up in "Total Received". Surface it
      // loudly instead of failing silently.
      toast.error(`Stock quantity updated, but restock record failed to save: ${txnError.message}`);
      setRestocking(false);
      return;
    }
    toast.success(`Added ${restockQty} to ${restockProduct.name}${variantLabel}`);
    logAudit('UPDATE', 'products', restockProduct.id, { restock: restockQty, type: restockType, variant: restockVariantId !== 'whole' ? restockVariantId : undefined, supplier: restockSupplier.trim(), branch_id: restockBranchId });

    setRestocking(false);
    setRestockOpen(false);
    setRestockProduct(null);
    setRestockQty(0);
    setRestockVariantId('whole');
    setRestockSupplier('');
    setRestockBranchId('');
    fetchData();
  };

  const handleScan = async () => {
    if (!scanBarcode.trim()) { toast.error('Enter or scan a barcode'); return; }
    setScanning(true);
    const { data: product } = await supabase.from('products').select('id, name, unit, current_stock_new, current_stock_donation, barcode').eq('barcode', scanBarcode.trim()).maybeSingle();
    let productId: string | null = null;
    let productName: string | null = null;
    let unit: string = 'Piece';
    let currentNew = 0;
    let currentDonation = 0;
    let variantId: string | null = null;
    let variantCurrentNew = 0;
    let variantLabel = '';

    if (product) {
      productId = product.id;
      productName = product.name;
      unit = product.unit;
      currentNew = product.current_stock_new;
      currentDonation = product.current_stock_donation;
    } else {
      const { data: variant } = await supabase.from('product_variants').select('id, product_id, variant_name, variant_value, current_stock_new, products(name, unit, current_stock_new, current_stock_donation)').eq('barcode', scanBarcode.trim()).maybeSingle();
      if (variant) {
        const v = variant as unknown as { id: string; product_id: string; variant_name: string; variant_value: string; current_stock_new: number; products: { name: string; unit: string; current_stock_new: number; current_stock_donation: number } };
        productId = v.product_id;
        productName = v.products.name;
        unit = v.products.unit;
        currentNew = v.products.current_stock_new;
        currentDonation = v.products.current_stock_donation;
        variantId = v.id;
        variantCurrentNew = v.current_stock_new || 0;
        variantLabel = ` (${v.variant_name}: ${v.variant_value})`;
      }
    }

    if (!productId || !productName) {
      toast.error('No product found with this barcode');
      setScanning(false);
      return;
    }

    const qty = Number(scanQty);
    if (scanMode === 'in') {
      const newQty = currentNew + qty;
      await supabase.from('products').update({ current_stock_new: newQty, updated_at: new Date().toISOString() }).eq('id', productId);
      if (variantId) {
        await supabase.from('product_variants').update({ current_stock_new: variantCurrentNew + qty }).eq('id', variantId);
      }
      await supabase.from('stock_transactions').insert({ transaction_type: 'stock_in', product_id: productId, quantity: qty, item_type: 'new', reference_type: 'barcode_scan', notes: `Barcode scan in: ${scanBarcode}${variantLabel}` });
      toast.success(`Stock IN: +${qty} ${unit} for ${productName}${variantLabel}`);
    } else {
      if (currentNew < qty) { toast.error(`Insufficient stock. Available: ${currentNew} ${unit}`); setScanning(false); return; }
      if (variantId && variantCurrentNew < qty) {
        toast.error(`Insufficient variant stock. Available: ${variantCurrentNew} ${unit}${variantLabel}`);
        setScanning(false);
        return;
      }
      const newQty = currentNew - qty;
      await supabase.from('products').update({ current_stock_new: newQty, updated_at: new Date().toISOString() }).eq('id', productId);
      if (variantId) {
        await supabase.from('product_variants').update({ current_stock_new: variantCurrentNew - qty }).eq('id', variantId);
      }
      await supabase.from('stock_transactions').insert({ transaction_type: 'stock_out', product_id: productId, quantity: qty, item_type: 'new', reference_type: 'barcode_scan', notes: `Barcode scan out: ${scanBarcode}${variantLabel}` });
      toast.success(`Stock OUT: -${qty} ${unit} for ${productName}${variantLabel}`);
    }
    logAudit('UPDATE', 'products', productId, { barcode_scan: scanBarcode, qty, mode: scanMode, variant: variantId || undefined });
    setScanning(false);
    setScanOpen(false);
    setScanBarcode('');
    setScanQty(1);
    fetchData();
  };

  const printBarcode = (p: Product) => {
    const code = p.barcode || p.product_code || p.sku || p.id.substring(0, 8);
    const html = `<html><head><title>Barcode - ${p.name}</title><style>body{font-family:monospace;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.label{width:300px;padding:20px;border:2px dashed #ccc;text-align:center}.label h3{margin:0 0 8px;font-size:14px}.label .code{font-size:28px;letter-spacing:2px;font-weight:bold;margin:8px 0}.label .meta{font-size:11px;color:#666;margin-top:4px}@media print{.label{border:none}}</style></head><body><div class="label"><h3>${p.name}</h3><div class="code">${code}</div><div class="meta">${p.unit} | ${p.barcode ? 'BARCODE' : 'CODE'}</div></div><script>window.onload=()=>{window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleExport = () => {
    exportToCSV(filtered.map(p => ({
      'Product Code': p.product_code || '',
      'Barcode': p.barcode || '',
      'SKU': p.sku || '',
      'Name': p.name,
      'Store': (p.stores as { name: string } | null)?.name || '',
      'Category': (p.categories as { name: string } | null)?.name || '',
      'Unit': p.unit,
      'Selling Price': p.selling_price || 0,
      'New Stock': p.current_stock_new,
      'Donation Stock': p.current_stock_donation,
      'Total Stock': p.current_stock_new + p.current_stock_donation,
      'Min Stock': p.min_stock,
      'Variants': (p.product_variants as ProductVariant[] | undefined)?.length || 0,
    })), 'stock-inventory');
    toast.success('Exported to CSV');
  };

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!p.is_active) return false;
      const q = search.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) ||
        (p.product_code || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q);
      const matchStore = storeFilter === 'all' || p.store_id === storeFilter;
      const matchCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
      const total = p.current_stock_new + p.current_stock_donation;
      const matchStock = stockFilter === 'all' ||
        (stockFilter === 'low' && total <= p.min_stock && p.min_stock > 0) ||
        (stockFilter === 'out' && total === 0);
      return matchSearch && matchStore && matchCategory && matchStock;
    });
  }, [products, search, storeFilter, categoryFilter, stockFilter]);

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const lowCount = products.filter(p => p.is_active && (p.current_stock_new + p.current_stock_donation) <= p.min_stock && p.min_stock > 0).length;

  // Received History table: PURCHASES ONLY (supplier + branch shown as their
  // own columns). Restocks do NOT appear here anymore — they only feed the
  // "Total Received" summary card above (via totalRestocked / totalIn).
  const purchaseRows: PurchaseRow[] = useMemo(() => {
    return purchaseHistory
      .map(ph => ({
        id: ph.id,
        date: ph.purchase_date,
        supplier: ph.supplier || '-',
        branch: (ph.branches as { name: string } | null)?.name || '-',
        variant: ph.product_variants ? `${ph.product_variants.variant_name}: ${ph.product_variants.variant_value}` : '-',
        quantity: ph.quantity,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [purchaseHistory]);

  // Totals for the currently open View sheet.
  // "Total Received" (top card) = Opening Stock + manual Restocks only.
  const totalPurchased = useMemo(() => purchaseRows.reduce((s, r) => s + (r.quantity || 0), 0), [purchaseRows]);
  const totalRestocked = useMemo(() => restockReceipts.reduce((s, r) => s + (r.quantity || 0), 0), [restockReceipts]);
  const totalIssued = useMemo(() => issueHistory.reduce((s, ih) => s + (ih.quantity || 0), 0), [issueHistory]);
  // issueHistory has one row per line item (e.g. per variant) — a single issue
  // slip issuing 3 sizes of the same product produces 3 rows here. Count
  // distinct slips, not rows, so "Across N issues" matches actual issue events.
  const distinctIssueSlips = useMemo(
    () => new Set(issueHistory.map(ih => ih.issue_slips?.issue_number).filter(Boolean)).size,
    [issueHistory]
  );
  const openingTotal = viewing ? viewing.opening_stock_new + viewing.opening_stock_donation : 0;
  const currentRemaining = viewing ? viewing.current_stock_new + viewing.current_stock_donation : 0;
  // Total Received = Opening Stock + logged Restocks only. This is the
  // honest, straightforward number of what actually came IN through this
  // system. It will NOT always equal Remaining + Issued — if it doesn't,
  // that means stock was changed somewhere outside the Restock button
  // (e.g. a direct "Current Stock" edit), which is useful to know rather
  // than being silently hidden by forcing the numbers to match.
  const totalIn = openingTotal + totalRestocked;

  // Grand total Rs value shown as a footer row under the Purchase History
  // table — sums purchase quantities valued at the product's selling price
  // (purchases don't store a per-entry price, so selling_price is used as
  // the common valuation).
  const purchaseTotalValue = useMemo(() => totalPurchased * (viewing?.selling_price || 0), [totalPurchased, viewing]);

  // Print / Export handlers for the Purchase History table inside the View sheet.
  const handlePrintPurchaseHistory = () => {
    if (!viewing) return;
    printTable(
      `Purchase History — ${viewing.name}`,
      ['Date', 'Supplier', 'Branch', 'Variant', 'Quantity'],
      purchaseRows.map(r => [
        new Date(r.date).toLocaleDateString(),
        r.supplier,
        r.branch,
        r.variant,
        String(r.quantity),
      ])
    );
  };

  const handleExportPurchaseHistory = () => {
    if (!viewing) return;
    if (purchaseRows.length === 0) { toast.error('No purchase records to export'); return; }
    exportToCSV(purchaseRows.map(r => ({
      'Date': r.date,
      'Supplier': r.supplier,
      'Branch': r.branch,
      'Variant': r.variant,
      'Quantity': r.quantity,
    })), `${viewing.name.replace(/\s+/g, '-')}-purchase-history`);
    toast.success('Exported to CSV');
  };

  // NOTE: Issue History shows Recipient (beneficiary only) and Branch as
  // two separate columns — Recipient no longer falls back to the branch name.
  const handlePrintIssueHistory = () => {
    if (!viewing) return;
    printTable(
      `Issue History — ${viewing.name}`,
      ['Date', 'Issue No', 'Recipient', 'Branch', 'Variant', 'Condition', 'Quantity'],
      issueHistory.map(ih => [
        ih.issue_slips?.issue_date ? new Date(ih.issue_slips.issue_date).toLocaleDateString() : '-',
        ih.issue_slips?.issue_number || '-',
        ih.issue_slips?.beneficiary_name || '-',
        ih.issue_slips?.branches?.name || '-',
        ih.product_variants ? `${ih.product_variants.variant_name}: ${ih.product_variants.variant_value}` : '-',
        ih.condition || '-',
        String(ih.quantity),
      ])
    );
  };

  const handleExportIssueHistory = () => {
    if (!viewing) return;
    if (issueHistory.length === 0) { toast.error('No issue records to export'); return; }
    exportToCSV(issueHistory.map(ih => ({
      'Date': ih.issue_slips?.issue_date || '',
      'Issue No': ih.issue_slips?.issue_number || '',
      'Recipient': ih.issue_slips?.beneficiary_name || '',
      'Branch': ih.issue_slips?.branches?.name || '',
      'Variant': ih.product_variants ? `${ih.product_variants.variant_name}: ${ih.product_variants.variant_value}` : '',
      'Condition': ih.condition || '',
      'Quantity': ih.quantity,
    })), `${viewing.name.replace(/\s+/g, '-')}-issue-history`);
    toast.success('Exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6" /> Stock
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage inventory items with barcodes, variants, and restocking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setScanMode('in'); setScanBarcode(''); setScanQty(1); setScanOpen(true); }}>
            <ScanLine className="w-4 h-4 mr-2" /> Scan
          </Button>
          <Button variant="outline" onClick={handleExport}>Export CSV</Button>
          {canManage && <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add Stock</Button>}
        </div>
      </div>

      {lowCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            <strong>{lowCount}</strong> items are at or below minimum stock levels.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, code, barcode, SKU..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
            </div>
            <Select value={storeFilter} onValueChange={v => { setStoreFilter(v); setCategoryFilter('all'); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All stores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {toolbarCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Tabs value={stockFilter} onValueChange={v => { setStockFilter(v); setPage(0); }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="low">Low Stock</TabsTrigger>
                <TabsTrigger value="out">Out of Stock</TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="secondary">{filtered.length} items</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code / Barcode</TableHead>
                  <TableHead>Stock Item</TableHead>
                  <TableHead>Store / Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Donation</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Variants</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      No stock items found. Click &quot;Add Stock&quot; to get started.
                    </TableCell>
                  </TableRow>
                ) : paginated.map(p => {
                  const total = p.current_stock_new + p.current_stock_donation;
                  const isLow = total <= p.min_stock && p.min_stock > 0;
                  const variantCount = (p.product_variants as ProductVariant[] | undefined)?.length || 0;
                  return (
                    <TableRow key={p.id} className={isLow ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs">{p.product_code || '-'}</span>
                          {p.barcode && <span className="font-mono text-xs text-blue-600 flex items-center gap-1"><Barcode className="w-3 h-3" />{p.barcode}</span>}
                          {p.sku && <span className="font-mono text-xs text-muted-foreground">SKU: {p.sku}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{(p.stores as { name: string } | null)?.name || '-'}</p>
                          <p className="text-xs text-muted-foreground">{(p.categories as { name: string } | null)?.name || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.unit}</Badge></TableCell>
                      <TableCell className="text-right text-sm">Rs {p.selling_price?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-right font-medium">{p.current_stock_new}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{p.current_stock_donation}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${isLow ? 'text-red-600' : 'text-foreground'}`}>{total}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {variantCount > 0 ? <Badge variant="secondary" className="text-xs">{variantCount} variants</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openView(p)} title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printBarcode(p)} title="Print Barcode">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && (
                            <>
                              <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => { setRestockProduct(p); setRestockQty(0); setRestockType('new'); setRestockVariantId('whole'); setRestockSupplier(''); setRestockBranchId(''); setRestockOpen(true); }} title="Add Stock">
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)} title="Remove">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} ({filtered.length} total)</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editing ? 'Edit Stock Item' : 'Add New Stock Item'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Stock Item Name *</Label>
                <Input className="mt-1" placeholder="Rice, Blanket, School Bag..." value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Product Code</Label>
                <Input className="mt-1" placeholder="AUTO-001" value={form.product_code}
                  onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))} />
              </div>
              <div>
                <Label>Barcode</Label>
                <Input className="mt-1" placeholder="Scan or enter barcode" value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
              </div>
              <div>
                <Label>SKU</Label>
                <Input className="mt-1" placeholder="SKU code" value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div>
                <Label>Selling Price (Rs)</Label>
                <Input className="mt-1" type="number" min="0" value={form.selling_price}
                  onChange={e => setForm(f => ({ ...f, selling_price: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Unit *</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Store *</Label>
                <Select value={form.store_id} onValueChange={v => setForm(f => ({ ...f, store_id: v, category_id: '' }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Opening Stock (New)</Label>
                <Input className="mt-1" type="number" min="0" value={form.opening_stock_new}
                  onChange={e => setForm(f => ({ ...f, opening_stock_new: Number(e.target.value), current_stock_new: editing ? f.current_stock_new : Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Opening Stock (Donation)</Label>
                <Input className="mt-1" type="number" min="0" value={form.opening_stock_donation}
                  onChange={e => setForm(f => ({ ...f, opening_stock_donation: Number(e.target.value), current_stock_donation: editing ? f.current_stock_donation : Number(e.target.value) }))} />
              </div>
              {editing && (
                <>
                  <div>
                    <Label>Current Stock (New)</Label>
                    <Input className="mt-1" type="number" min="0" value={form.current_stock_new}
                      onChange={e => setForm(f => ({ ...f, current_stock_new: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Current Stock (Donation)</Label>
                    <Input className="mt-1" type="number" min="0" value={form.current_stock_donation}
                      onChange={e => setForm(f => ({ ...f, current_stock_donation: Number(e.target.value) }))} />
                  </div>
                </>
              )}
              <div>
                <Label>Minimum Stock Alert</Label>
                <Input className="mt-1" type="number" min="0" value={form.min_stock}
                  onChange={e => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input className="mt-1" placeholder="Optional description" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div className="border-t pt-4 mt-4 pb-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-sm">Variants / Sub-categories</h4>
                  <p className="text-xs text-muted-foreground">e.g. Shirt - S/M/L, Toothpaste - 50g/75g/100g. Tip: type multiple values separated by commas (e.g. S, M, L) to add them all at once with the same name and stock — or add one at a time and click &quot;Add Variant&quot; again for each.</p>
                </div>
                {variants.length > 0 && <Badge variant="secondary">{variants.length} added</Badge>}
              </div>

              {variants.length > 0 && (
                <div className="space-y-2 mb-4">
                  {variants.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2.5 bg-muted rounded-lg flex-wrap">
                      <Badge variant="outline" className="text-xs whitespace-nowrap">{v.variant_name || 'Variant'}: {v.variant_value}</Badge>
                      {v.barcode && <span className="text-xs text-blue-600 flex items-center gap-1"><Barcode className="w-3 h-3" />{v.barcode}</span>}
                      {v.sku && <span className="text-xs text-muted-foreground">SKU: {v.sku}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">N: {v.current_stock_new} | D: {v.current_stock_donation}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeVariant(idx)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                <div>
                  <Label className="text-xs">Variant Name</Label>
                  <Input className="mt-1" placeholder="e.g. Size" value={newVariant.variant_name}
                    onChange={e => setNewVariant(v => ({ ...v, variant_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Variant Value</Label>
                  <Input className="mt-1" placeholder="e.g. Large, or S, M, L for multiple" value={newVariant.variant_value}
                    onChange={e => setNewVariant(v => ({ ...v, variant_value: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Barcode</Label>
                  <Input className="mt-1" placeholder="Optional" value={newVariant.barcode}
                    onChange={e => setNewVariant(v => ({ ...v, barcode: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">SKU</Label>
                  <Input className="mt-1" placeholder="Optional" value={newVariant.sku}
                    onChange={e => setNewVariant(v => ({ ...v, sku: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">New Stock</Label>
                  <Input className="mt-1" type="number" min="0" placeholder="0" value={newVariant.current_stock_new}
                    onChange={e => setNewVariant(v => ({ ...v, current_stock_new: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-xs">Donation Stock</Label>
                  <Input className="mt-1" type="number" min="0" placeholder="0" value={newVariant.current_stock_donation}
                    onChange={e => setNewVariant(v => ({ ...v, current_stock_donation: Number(e.target.value) }))} />
                </div>
                <Button type="button" variant="outline" onClick={addVariant} className="col-span-2 mt-1">
                  <Plus className="w-4 h-4 mr-1" /> Add Variant
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Stock Item'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5 text-green-600" /> Add Stock / Restock</DialogTitle>
          </DialogHeader>
          {restockProduct && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{restockProduct.name}</p>
                <p className="text-sm text-muted-foreground">Current: {restockProduct.current_stock_new} new, {restockProduct.current_stock_donation} donation ({restockProduct.unit})</p>
              </div>
              <div>
                <Label>Supplier Name *</Label>
                <Input className="mt-1" placeholder="e.g. ABC Traders" value={restockSupplier}
                  onChange={e => setRestockSupplier(e.target.value)} />
              </div>
              <div>
                <Label>Branch *</Label>
                <Select value={restockBranchId} onValueChange={setRestockBranchId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stock Type</Label>
                <Select value={restockType} onValueChange={v => setRestockType(v as 'new' | 'donation')}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New (Purchased)</SelectItem>
                    <SelectItem value="donation">Donation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {((restockProduct.product_variants as ProductVariant[] | undefined)?.length ?? 0) > 0 && (
                <div>
                  <Label>Apply To</Label>
                  <Select value={restockVariantId} onValueChange={setRestockVariantId}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whole">Whole Product (no specific variant)</SelectItem>
                      {(restockProduct.product_variants as ProductVariant[]).map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.variant_name}: {v.variant_value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Selecting a variant also updates that variant&apos;s own stock count.</p>
                </div>
              )}
              <div>
                <Label>Quantity to Add *</Label>
                <Input className="mt-1" type="number" min="0.01" step="0.01" value={restockQty}
                  onChange={e => setRestockQty(Number(e.target.value))} placeholder="e.g. 200" />
                <p className="text-xs text-muted-foreground mt-1">This will add to the existing stock. No duplicate items will be created.</p>
              </div>
              <Button onClick={handleRestock} disabled={restocking} className="w-full">
                {restocking ? 'Adding...' : `Add ${restockQty > 0 ? `+${restockQty} ${restockProduct.unit}` : 'Stock'}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" /> Barcode Scanner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Scan Mode</Label>
              <div className="flex gap-2 mt-1">
                <Button variant={scanMode === 'in' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('in')} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-1" /> Stock IN
                </Button>
                <Button variant={scanMode === 'out' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('out')} className="flex-1">
                  <ArrowRightLeft className="w-4 h-4 mr-1" /> Stock OUT
                </Button>
              </div>
            </div>
            <div>
              <Label>Barcode</Label>
              <Input className="mt-1" placeholder="Scan or type barcode..." value={scanBarcode}
                onChange={e => setScanBarcode(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" type="number" min="1" value={scanQty}
                onChange={e => setScanQty(Number(e.target.value))} />
            </div>
            <Button onClick={handleScan} disabled={scanning} className="w-full">
              {scanning ? 'Processing...' : `Confirm ${scanMode === 'in' ? 'Stock IN' : 'Stock OUT'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewing} onOpenChange={() => setViewing(null)}>
        <SheetContent className="w-screen sm:max-w-none h-screen flex flex-col p-0 gap-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-background dark:via-background dark:to-background">
          <SheetHeader className="px-6 py-4 shrink-0 border-b bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-950 dark:to-purple-950">
            <div className="flex items-center justify-between max-w-3xl mx-auto w-full">
              <div>
                <SheetTitle className="text-lg text-white">{viewing?.name || 'Stock Item Details'}</SheetTitle>
                <p className="text-xs text-blue-100 mt-0.5">{viewing?.product_code || 'No code'} · Full stock trace</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setViewing(null)} className="bg-white/20 text-white hover:bg-white/30 border-0">
                <X className="w-4 h-4 mr-1.5" /> Close
              </Button>
            </div>
          </SheetHeader>
          {viewing && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-5">

              {/* Total received / issued / remaining at a glance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-md text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-white/90">Total Received</p>
                  </div>
                  <p className="text-2xl font-bold mt-2">{totalIn.toLocaleString()}</p>
                  <p className="text-[11px] text-white/80 mt-1">Opening {openingTotal} + Restocks {totalRestocked}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-md text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-white/90">Total Issued</p>
                  </div>
                  <p className="text-2xl font-bold mt-2">{totalIssued.toLocaleString()}</p>
                  <p className="text-[11px] text-white/80 mt-1">Across {distinctIssueSlips} issue{distinctIssueSlips === 1 ? '' : 's'}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-white/90">Remaining Now</p>
                  </div>
                  <p className="text-2xl font-bold mt-2">{currentRemaining.toLocaleString()}</p>
                  <p className="text-[11px] text-white/80 mt-1">Live stock on hand</p>
                </div>
              </div>
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Item Details</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ['Store', (viewing.stores as { name: string } | null)?.name || '-'],
                    ['Category', (viewing.categories as { name: string } | null)?.name || '-'],
                    ['Unit', viewing.unit],
                    ['Selling Price', `Rs ${viewing.selling_price?.toLocaleString() || 0}`],
                    ['Barcode', viewing.barcode || '-'],
                    ['SKU', viewing.sku || '-'],
                    ['Min Stock', String(viewing.min_stock)],
                    ['New Stock', String(viewing.current_stock_new)],
                    ['Donation Stock', String(viewing.current_stock_donation)],
                    ['Opening (New)', String(viewing.opening_stock_new)],
                    ['Opening (Donation)', String(viewing.opening_stock_donation)],
                    ['Added', new Date(viewing.created_at).toLocaleDateString()],
                  ].map(([label, value]) => (
                    <div key={label} className="p-2.5 bg-gray-50 dark:bg-muted/40 border border-gray-100 dark:border-transparent rounded-lg">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {((viewing.product_variants as ProductVariant[] | undefined)?.length ?? 0) > 0 && (
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Variants ({(viewing.product_variants as ProductVariant[]).length})</p>
                  <div className="space-y-1.5">
                    {(viewing.product_variants as ProductVariant[]).map(v => (
                      <div key={v.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-muted/40 border border-gray-100 dark:border-transparent rounded-lg">
                        <span className="font-medium">{v.variant_name}: {v.variant_value}</span>
                        <span className="text-muted-foreground text-xs">N: {v.current_stock_new} | D: {v.current_stock_donation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewing.description && (
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
                  <p className="text-sm">{viewing.description}</p>
                </div>
              )}

              {/* Where it came from — PURCHASES ONLY. Restocks are excluded
                  from this table; they only affect the "Total Received" card above. */}
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-green-50 dark:bg-green-950/30">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-semibold">Purchase History</p>
                    {purchaseRows.length > 0 && <Badge variant="secondary" className="text-xs">{purchaseRows.length}</Badge>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handlePrintPurchaseHistory} disabled={purchaseRows.length === 0}>
                      <Printer className="w-3.5 h-3.5 mr-1" /> Print
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportPurchaseHistory} disabled={purchaseRows.length === 0}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Excel
                    </Button>
                  </div>
                </div>
                {historyLoading ? (
                  <p className="text-xs text-muted-foreground p-4">Loading...</p>
                ) : purchaseRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4">No purchase records for this item.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Branch</TableHead>
                          <TableHead className="text-xs">Variant</TableHead>
                          <TableHead className="text-xs text-right">Quantity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseRows.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{new Date(r.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-sm">{r.supplier}</TableCell>
                            <TableCell className="text-sm">{r.branch}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.variant}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">+{r.quantity}</TableCell>
                          </TableRow>
                        ))}
                        {/* Grand total Rs row — purchase quantity × selling price */}
                        <TableRow className="bg-green-50/60 dark:bg-green-950/20">
                          <TableCell colSpan={4} className="text-sm font-semibold text-right">Total Value</TableCell>
                          <TableCell className="text-right font-bold text-green-700 dark:text-green-400">
                            Rs {purchaseTotalValue.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Where it went */}
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-red-50 dark:bg-red-950/30">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-600" />
                    <p className="text-sm font-semibold">Issue History (Issued To)</p>
                    {issueHistory.length > 0 && <Badge variant="secondary" className="text-xs">{issueHistory.length}</Badge>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handlePrintIssueHistory} disabled={issueHistory.length === 0}>
                      <Printer className="w-3.5 h-3.5 mr-1" /> Print
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportIssueHistory} disabled={issueHistory.length === 0}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Excel
                    </Button>
                  </div>
                </div>
                {historyLoading ? (
                  <p className="text-xs text-muted-foreground p-4">Loading...</p>
                ) : issueHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4">This item has not been issued yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Issue No</TableHead>
                          <TableHead className="text-xs">Recipient</TableHead>
                          <TableHead className="text-xs">Branch</TableHead>
                          <TableHead className="text-xs">Variant</TableHead>
                          <TableHead className="text-xs">Condition</TableHead>
                          <TableHead className="text-xs text-right">Quantity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issueHistory.map(ih => (
                          <TableRow key={ih.id}>
                            <TableCell className="text-sm">{ih.issue_slips?.issue_date ? new Date(ih.issue_slips.issue_date).toLocaleDateString() : '-'}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{ih.issue_slips?.issue_number || '-'}</TableCell>
                            <TableCell className="text-sm">{ih.issue_slips?.beneficiary_name || '-'}</TableCell>
                            <TableCell className="text-sm">{ih.issue_slips?.branches?.name || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{ih.product_variants ? `${ih.product_variants.variant_name}: ${ih.product_variants.variant_value}` : '-'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{ih.condition || '-'}</Badge></TableCell>
                            <TableCell className="text-right font-semibold text-red-600">-{ih.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Stock Item?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the item. Historical records will be preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}