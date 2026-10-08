'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Store, GitBranch, Package, Tag, AlertTriangle, ArrowRightLeft,
  TrendingUp, Heart, ShoppingCart, Plus, Search, FileText, Undo2,
  Building2, DollarSign, Users, Calendar, Clock, BarChart3
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { Product, IssueSlip, Purchase, Donation } from '@/lib/types';

interface Stats {
  stores: number;
  branches: number;
  products: number;
  categories: number;
  lowStockItems: Product[];
  todayIssues: number;
  monthIssues: number;
  totalNewStock: number;
  totalDonationStock: number;
  recentProducts: Product[];
  monthlyIssueData: { name: string; count: number; qty: number }[];
  branchIssueData: { name: string; value: number }[];
  storeStockData: { name: string; newStock: number; donationStock: number }[];
  monthlyPurchaseData: { name: string; amount: number }[];
  monthlyDonationData: { name: string; count: number }[];
  totalMonthPurchases: number;
  totalMonthDonations: number;
  recentIssues: IssueSlip[];
  upcomingReturns: { count: number };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('role, branch_id').eq('id', user?.id || '').maybeSingle();
    const profData = prof as { role: string | null; branch_id: string | null } | null;
    // Dashboard is hidden from branch_user in the sidebar, but someone could
    // still type the URL directly — redirect them to a page they do have.
    if (profData?.role === 'branch_user') {
      router.replace('/dashboard/issues');
      return;
    }
    const userBranchId = profData?.branch_id || null;

    const issueFilter = userBranchId ? { branch_id: userBranchId } : {};
    const [
      { count: stores },
      { count: branches },
      { count: products },
      { count: categories },
      { data: productData },
      { count: todayIssues },
      { count: monthIssues },
      { data: recentProducts },
      { data: issueSlips },
      { data: purchases },
      { data: donations },
      { data: recentIssuesData },
    ] = await Promise.all([
      supabase.from('stores').select('*', { count: 'exact', head: true }),
      supabase.from('branches').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('categories').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*').eq('is_active', true),
      supabase.from('issue_slips').select('*', { count: 'exact', head: true })
        .gte('issue_date', new Date().toISOString().split('T')[0]).match(issueFilter),
      supabase.from('issue_slips').select('*', { count: 'exact', head: true })
        .gte('issue_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]).match(issueFilter),
      supabase.from('products').select('*, stores(name), categories(name)').eq('is_active', true)
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('issue_slips').select('issue_date, branches(name), issue_items(quantity)').order('issue_date').match(issueFilter),
      supabase.from('purchases').select('purchase_date, total_cost').order('purchase_date'),
      supabase.from('donations').select('donation_date, quantity').order('donation_date'),
      supabase.from('issue_slips').select('*, branches(name), stores(name)').order('created_at', { ascending: false }).limit(5).match(issueFilter),
    ]);

    const allProducts = (productData || []) as unknown as Product[];
    const lowStockItems = allProducts.filter(
      p => (p.current_stock_new + p.current_stock_donation) <= p.min_stock && p.min_stock > 0
    ).slice(0, 5);

    const totalNewStock = allProducts.reduce((s, p) => s + (p.current_stock_new || 0), 0);
    const totalDonationStock = allProducts.reduce((s, p) => s + (p.current_stock_donation || 0), 0);

    // Monthly issue data for last 6 months
    const monthlyMap: Record<string, { count: number; qty: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      monthlyMap[key] = { count: 0, qty: 0 };
    }
    const slipList = (issueSlips || []) as unknown as Array<{ issue_date: string; branches: { name: string } | null; issue_items?: Array<{ quantity: number }> }>;
    slipList.forEach(slip => {
      const d = new Date(slip.issue_date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (key in monthlyMap) {
        monthlyMap[key].count++;
        monthlyMap[key].qty += (slip.issue_items || []).reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);
      }
    });
    const monthlyIssueData = Object.entries(monthlyMap).map(([name, data]) => ({ name, count: data.count, qty: data.qty }));

    // Branch issue data
    const branchMap: Record<string, number> = {};
    slipList.forEach(slip => {
      const name = slip.branches?.name || 'Unknown';
      branchMap[name] = (branchMap[name] || 0) + 1;
    });
    const branchIssueData = Object.entries(branchMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    // Store stock distribution
    const storeMap: Record<string, { newStock: number; donationStock: number }> = {};
    allProducts.forEach(p => {
      const storeName = (p.stores as { name: string } | null)?.name || 'Unknown';
      if (!storeMap[storeName]) storeMap[storeName] = { newStock: 0, donationStock: 0 };
      storeMap[storeName].newStock += p.current_stock_new || 0;
      storeMap[storeName].donationStock += p.current_stock_donation || 0;
    });
    const storeStockData = Object.entries(storeMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => (b.newStock + b.donationStock) - (a.newStock + a.donationStock));

    // Monthly purchase data
    const purchaseMonthMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      purchaseMonthMap[key] = 0;
    }
    const purchaseList = (purchases || []) as unknown as Array<{ purchase_date: string; total_cost: number }>;
    purchaseList.forEach(p => {
      const d = new Date(p.purchase_date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (key in purchaseMonthMap) purchaseMonthMap[key] += p.total_cost || 0;
    });
    const monthlyPurchaseData = Object.entries(purchaseMonthMap).map(([name, amount]) => ({ name, amount }));

    // Monthly donation data
    const donationMonthMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      donationMonthMap[key] = 0;
    }
    const donationList = (donations || []) as unknown as Array<{ donation_date: string; quantity: number }>;
    donationList.forEach(d => {
      const date = new Date(d.donation_date);
      const key = date.toLocaleString('default', { month: 'short' });
      if (key in donationMonthMap) donationMonthMap[key] += d.quantity;
    });
    const monthlyDonationData = Object.entries(donationMonthMap).map(([name, count]) => ({ name, count }));

    // Calculate this month's totals
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const totalMonthPurchases = purchaseList
      .filter(p => p.purchase_date >= monthStart)
      .reduce((s, p) => s + (p.total_cost || 0), 0);
    const totalMonthDonations = donationList
      .filter(d => d.donation_date >= monthStart)
      .reduce((s, d) => s + d.quantity, 0);

    setStats({
      stores: stores || 0,
      branches: branches || 0,
      products: products || 0,
      categories: categories || 0,
      lowStockItems,
      todayIssues: todayIssues || 0,
      monthIssues: monthIssues || 0,
      totalNewStock,
      totalDonationStock,
      recentProducts: (recentProducts || []) as unknown as Product[],
      monthlyIssueData,
      branchIssueData,
      storeStockData,
      monthlyPurchaseData,
      monthlyDonationData,
      totalMonthPurchases,
      totalMonthDonations,
      recentIssues: (recentIssuesData || []) as unknown as IssueSlip[],
      upcomingReturns: { count: 0 },
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const lowStockCount = stats?.lowStockItems?.length ?? 0;
  const statCards = [
    { label: 'Total Stores', value: stats?.stores, icon: Store, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Active Branches', value: stats?.branches, icon: GitBranch, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950' },
    { label: 'Total Products', value: stats?.products, icon: Package, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Categories', value: stats?.categories, icon: Tag, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { label: 'Low Stock Items', value: lowStockCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950', alert: lowStockCount > 0 },
    { label: "Today's Issues", value: stats?.todayIssues, icon: ArrowRightLeft, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Month Issues', value: stats?.monthIssues, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Month Purchases', value: `Rs ${(stats?.totalMonthPurchases || 0).toLocaleString()}`, icon: DollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950', isText: true },
    { label: 'New Stock Units', value: Math.round(stats?.totalNewStock || 0), icon: ShoppingCart, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950' },
    { label: 'Donation Stock', value: Math.round(stats?.totalDonationStock || 0), icon: Heart, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Month Donations', value: stats?.totalMonthDonations, icon: Heart, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-950' },
    { label: 'Total Stock', value: Math.round((stats?.totalNewStock || 0) + (stats?.totalDonationStock || 0)), icon: Package, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            PSH Store Management &mdash; {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/search">
            <Button variant="outline" size="sm"><Search className="w-4 h-4 mr-2" />Search</Button>
          </Link>
          <Link href="/dashboard/products">
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Product</Button>
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg, alert, isText }) => (
          <Card key={label} className={`border shadow-sm hover:shadow-md transition-shadow ${alert ? 'border-red-200 dark:border-red-800' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${isText ? 'text-base' : ''}`}>{value ?? 0}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Monthly Activity Trends
            </CardTitle>
            <CardDescription>Issues, purchases, and donations over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats?.monthlyIssueData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Area type="monotone" dataKey="qty" stackId="1" stroke="#3b82f6" fill="#3b82f620" name="Items Issued" />
                <Line type="monotone" data={stats?.monthlyDonationData || []} dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Donations" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Branch Issue Distribution</CardTitle>
            <CardDescription>Top 5 branches by issue count</CardDescription>
          </CardHeader>
          <CardContent>
            {(stats?.branchIssueData || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={stats?.branchIssueData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {(stats?.branchIssueData || []).map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No issue data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stock by Store</CardTitle>
            <CardDescription>New vs Donation stock distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats?.storeStockData || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="newStock" fill="#3b82f6" name="New Stock" radius={[0, 4, 4, 0]} />
                <Bar dataKey="donationStock" fill="#10b981" name="Donation Stock" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Purchase Value</CardTitle>
            <CardDescription>Purchase spending trends (Rs.)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats?.monthlyPurchaseData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `Rs ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => `Rs ${value.toLocaleString()}`} />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Purchases" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Link href="/dashboard/purchases">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-blue-500">
            <CardContent className="p-4 flex items-center gap-3">
              <ShoppingCart className="w-8 h-8 text-blue-600" />
              <div>
                <p className="font-medium text-sm">Purchases</p>
                <p className="text-xs text-muted-foreground">Record purchase</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/donations">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-green-500">
            <CardContent className="p-4 flex items-center gap-3">
              <Heart className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-sm">Donations</p>
                <p className="text-xs text-muted-foreground">Record donation</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/issues">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-indigo-500">
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowRightLeft className="w-8 h-8 text-indigo-600" />
              <div>
                <p className="font-medium text-sm">Issues</p>
                <p className="text-xs text-muted-foreground">Issue items</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/returns">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex items-center gap-3">
              <Undo2 className="w-8 h-8 text-amber-600" />
              <div>
                <p className="font-medium text-sm">Returns</p>
                <p className="text-xs text-muted-foreground">Record return</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/ledger">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-purple-500">
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="w-8 h-8 text-purple-600" />
              <div>
                <p className="font-medium text-sm">Ledger</p>
                <p className="text-xs text-muted-foreground">View history</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/search">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-cyan-500">
            <CardContent className="p-4 flex items-center gap-3">
              <Search className="w-8 h-8 text-cyan-600" />
              <div>
                <p className="font-medium text-sm">Search</p>
                <p className="text-xs text-muted-foreground">Find records</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low stock */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Low Stock Alerts
              </CardTitle>
              <CardDescription>Items below minimum level</CardDescription>
            </div>
            <Link href="/dashboard/products" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {(stats?.lowStockItems || []).length === 0 ? (
              <div className="text-center py-6">
                <Package className="w-10 h-10 mx-auto text-green-600 opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">All items adequately stocked</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats?.lowStockItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.product_code || 'No code'}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="destructive" className="text-xs">
                        {item.current_stock_new + item.current_stock_donation} {item.unit}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">Min: {item.min_stock}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Issues */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Recent Issue Slips</CardTitle>
              <CardDescription>Latest item issuances</CardDescription>
            </div>
            <Link href="/dashboard/issues" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {(stats?.recentIssues || []).length === 0 ? (
              <div className="text-center py-6">
                <ArrowRightLeft className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">No issues recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats?.recentIssues.slice(0, 5).map(issue => (
                  <div key={issue.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div>
                      <p className="font-mono text-sm font-medium text-primary">{issue.issue_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {(issue.branches as { name: string } | null)?.name} | {new Date(issue.issue_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={issue.status === 'issued' ? 'default' : 'secondary'} className="text-xs">
                      {issue.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent products */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">New Products</CardTitle>
              <CardDescription>Recently added items</CardDescription>
            </div>
            <Link href="/dashboard/products" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {(stats?.recentProducts || []).length === 0 ? (
              <div className="text-center py-6">
                <Package className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">No products added yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats?.recentProducts.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{(item.stores as { name: string } | null)?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{item.current_stock_new + item.current_stock_donation}</p>
                      <p className="text-xs text-muted-foreground">{item.unit}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}