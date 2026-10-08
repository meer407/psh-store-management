'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Package, Heart, ArrowRightLeft, Undo2, Building2, User, FileText, Phone, CreditCard, TrendingUp, TrendingDown, Loader2, Store, Tag, X } from 'lucide-react';
import Link from 'next/link';

// Simple debounce implementation with cancel
function debounce<A extends unknown[]>(func: (...args: A) => void, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: A) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  return debounced as ((...args: A) => void) & { cancel: () => void };
}

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: React.ReactNode;
  description: string;
  href: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
}

export default function GlobalSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved).slice(0, 5));
    }
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = searchQuery.toLowerCase().trim();
    const searchResults: SearchResult[] = [];

    try {
      // Search Products
      const { data: products } = await supabase
        .from('products')
        .select('id, name, product_code, barcode, sku, stores(name), current_stock_new, current_stock_donation')
        .or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(10);

      ((products || []) as unknown as Array<{ id: string; name: string; product_code?: string; barcode?: string; sku?: string; stores?: { name: string } | { name: string }[]; current_stock_new: number; current_stock_donation: number }>).forEach(p => {
        const storeName = Array.isArray(p.stores) ? p.stores[0]?.name : p.stores?.name;
        searchResults.push({
          type: 'product',
          id: p.id,
          title: p.name,
          subtitle: p.product_code || p.barcode || p.sku || 'No code',
          description: `Store: ${storeName || 'Unknown'} | Stock: ${p.current_stock_new} new, ${p.current_stock_donation} used`,
          href: '/dashboard/products',
          badge: `${p.current_stock_new + p.current_stock_donation} in stock`,
          badgeColor: p.current_stock_new + p.current_stock_donation > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
          icon: <Package className="w-4 h-4 text-blue-600" />,
        });
      });

      // Search Categories
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name, stores(name), description')
        .ilike('name', `%${q}%`)
        .limit(5);

      ((categories || []) as unknown as Array<{ id: string; name: string; stores?: { name: string } | { name: string }[]; description?: string }>).forEach(c => {
        const storeName = Array.isArray(c.stores) ? c.stores[0]?.name : c.stores?.name;
        searchResults.push({
          type: 'category',
          id: c.id,
          title: c.name,
          subtitle: storeName || 'Unknown store',
          description: c.description || 'No description',
          href: '/dashboard/categories',
          badge: 'Category',
          badgeColor: 'bg-amber-100 text-amber-800',
          icon: <Tag className="w-4 h-4 text-amber-600" />,
        });
      });

      // Search Stores
      const { data: stores } = await supabase
        .from('stores')
        .select('id, name, description')
        .ilike('name', `%${q}%`)
        .limit(5);

      (stores || []).forEach((s: { id: string; name: string; description?: string }) => {
        searchResults.push({
          type: 'store',
          id: s.id,
          title: s.name,
          subtitle: 'Store',
          description: s.description || 'No description',
          href: '/dashboard/stores',
          badge: 'Store',
          badgeColor: 'bg-cyan-100 text-cyan-800',
          icon: <Store className="w-4 h-4 text-cyan-600" />,
        });
      });

      // Search Users (super_admin only sees this, but query is harmless)
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(5);

      (users || []).forEach((u: { id: string; full_name: string; email: string; role: string }) => {
        searchResults.push({
          type: 'user',
          id: u.id,
          title: u.full_name || 'User',
          subtitle: u.email,
          description: `Role: ${u.role}`,
          href: '/dashboard/settings',
          badge: u.role,
          badgeColor: 'bg-gray-100 text-gray-800',
          icon: <User className="w-4 h-4 text-gray-600" />,
        });
      });

      // Search Branches
      const { data: branches } = await supabase
        .from('branches')
        .select('id, name, address, status')
        .or(`name.ilike.%${q}%,address.ilike.%${q}%,incharge_name.ilike.%${q}%`)
        .limit(5);

      (branches || []).forEach((b: { id: string; name: string; address?: string; status: string }) => {
        searchResults.push({
          type: 'branch',
          id: b.id,
          title: b.name,
          subtitle: b.address || 'No address',
          description: `Status: ${b.status}`,
          href: '/dashboard/branches',
          badge: b.status,
          badgeColor: b.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800',
          icon: <Building2 className="w-4 h-4 text-purple-600" />,
        });
      });

      // Search Donations (by donor name, phone, cnic)
      const { data: donations } = await supabase
        .from('donations')
        .select('id, donor_name, phone_number, cnic, donation_date, products(name), quantity')
        .or(`donor_name.ilike.%${q}%,phone_number.ilike.%${q}%,cnic.ilike.%${q}%`)
        .order('donation_date', { ascending: false })
        .limit(10);

      ((donations || []) as unknown as Array<{ id: string; donor_name: string; phone_number?: string; cnic?: string; donation_date: string; products?: { name: string } | { name: string }[]; quantity: number }>).forEach(d => {
        const prodName = Array.isArray(d.products) ? d.products[0]?.name : d.products?.name;
        searchResults.push({
          type: 'donation',
          id: d.id,
          title: d.donor_name,
          subtitle: d.phone_number ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone_number}</span> : 'No phone',
          description: `${prodName || 'Unknown product'} - ${d.quantity} items on ${new Date(d.donation_date).toLocaleDateString()}`,
          href: '/dashboard/donations',
          badge: 'Donation',
          badgeColor: 'bg-green-100 text-green-800',
          icon: <Heart className="w-4 h-4 text-green-600" />,
        });
      });

      // Search Issue Slips
      const { data: issues } = await supabase
        .from('issue_slips')
        .select('id, issue_number, beneficiary_name, beneficiary_cnic, issue_date, branches(name), issued_by')
        .or(`issue_number.ilike.%${q}%,beneficiary_name.ilike.%${q}%,beneficiary_cnic.ilike.%${q}%,issued_by.ilike.%${q}%`)
        .order('issue_date', { ascending: false })
        .limit(10);

      ((issues || []) as unknown as Array<{ id: string; issue_number: string; beneficiary_name?: string; beneficiary_cnic?: string; issue_date: string; branches?: { name: string } | { name: string }[]; issued_by: string }>).forEach(i => {
        const branchName = Array.isArray(i.branches) ? i.branches[0]?.name : i.branches?.name;
        searchResults.push({
          type: 'issue',
          id: i.id,
          title: i.issue_number,
          subtitle: i.beneficiary_name || i.issued_by,
          description: `Branch: ${branchName || 'Unknown'} | ${new Date(i.issue_date).toLocaleDateString()}${i.beneficiary_cnic ? ` | CNIC: ${i.beneficiary_cnic}` : ''}`,
          href: '/dashboard/issues',
          badge: 'Issue',
          badgeColor: 'bg-blue-100 text-blue-800',
          icon: <ArrowRightLeft className="w-4 h-4 text-blue-600" />,
        });
      });

      // Search Returns
      const { data: returns } = await supabase
        .from('returns')
        .select('id, return_date, products(name), branches(name), quantity, returned_by')
        .or(`returned_by.ilike.%${q}%`)
        .order('return_date', { ascending: false })
        .limit(10);

      ((returns || []) as unknown as Array<{ id: string; return_date: string; products?: { name: string } | { name: string }[]; branches?: { name: string } | { name: string }[]; quantity: number; returned_by?: string }>).forEach(r => {
        const prodName = Array.isArray(r.products) ? r.products[0]?.name : r.products?.name;
        const branchName = Array.isArray(r.branches) ? r.branches[0]?.name : r.branches?.name;
        searchResults.push({
          type: 'return',
          id: r.id,
          title: r.returned_by ? `${r.returned_by}` : 'Return',
          subtitle: prodName || 'Unknown product',
          description: `${r.quantity} items to ${branchName || 'Unknown'} on ${new Date(r.return_date).toLocaleDateString()}`,
          href: '/dashboard/returns',
          badge: 'Return',
          badgeColor: 'bg-amber-100 text-amber-800',
          icon: <Undo2 className="w-4 h-4 text-amber-600" />,
        });
      });

      // Search Purchases (invoice number, supplier)
      const { data: purchases } = await supabase
        .from('purchases')
        .select('id, invoice_number, supplier, purchase_date, products(name), quantity, total_cost')
        .or(`invoice_number.ilike.%${q}%,supplier.ilike.%${q}%`)
        .order('purchase_date', { ascending: false })
        .limit(10);

      ((purchases || []) as unknown as Array<{ id: string; invoice_number?: string; supplier?: string; purchase_date: string; products?: { name: string } | { name: string }[]; quantity: number; total_cost: number }>).forEach(p => {
        const prodName = Array.isArray(p.products) ? p.products[0]?.name : p.products?.name;
        searchResults.push({
          type: 'purchase',
          id: p.id,
          title: p.invoice_number || `Purchase`,
          subtitle: p.supplier || 'Unknown supplier',
          description: `${prodName || 'Unknown'} - ${p.quantity} items | Rs. ${p.total_cost?.toLocaleString() || 0} | ${new Date(p.purchase_date).toLocaleDateString()}`,
          href: '/dashboard/purchases',
          badge: 'Purchase',
          badgeColor: 'bg-indigo-100 text-indigo-800',
          icon: <TrendingUp className="w-4 h-4 text-indigo-600" />,
        });
      });

      setResults(searchResults);

      // Save to recent searches (use functional update to avoid stale closure)
      if (searchQuery.trim()) {
        setRecentSearches(prev => {
          const updated = [searchQuery.trim(), ...prev.filter(s => s !== searchQuery.trim())].slice(0, 5);
          localStorage.setItem('recentSearches', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedSearch = useMemo(
    () => debounce(performSearch, 300),
    [performSearch]
  );

  useEffect(() => {
    if (query.trim().length >= 2) {
      debouncedSearch(query);
    } else {
      setResults([]);
    }
    return () => {
      debouncedSearch.cancel();
    };
  }, [query, debouncedSearch]);

  const filteredResults = useMemo(() => {
    if (activeTab === 'all') return results;
    return results.filter(r => r.type === activeTab);
  }, [results, activeTab]);

  const resultCounts = useMemo(() => {
    const counts: Record<string, number> = { all: results.length };
    results.forEach(r => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });
    return counts;
  }, [results]);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product: 'Products',
      branch: 'Branches',
      donation: 'Donations',
      issue: 'Issues',
      return: 'Returns',
      purchase: 'Purchases',
    };
    return labels[type] || type;
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setActiveTab('all');
    debouncedSearch.cancel();
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== term);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Search className="w-6 h-6 text-primary" /> Global Search
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Search across products, donations, issues, returns, purchases, and branches</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, phone, CNIC, invoice, issue number..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-12 pr-12 h-12 text-lg"
              autoFocus
            />
            {loading && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-muted-foreground" />
            )}
            {!loading && query && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {recentSearches.length > 0 && !query && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase">Recent Searches</p>
                <button
                  type="button"
                  onClick={clearAllRecentSearches}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map(s => (
                  <div
                    key={s}
                    className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-md border bg-background text-sm hover:bg-muted/50 transition-colors"
                  >
                    <button type="button" onClick={() => setQuery(s)} className="hover:underline">
                      {s}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecentSearch(s)}
                      aria-label={`Remove ${s} from recent searches`}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {query.length >= 2 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
              <TabsList>
                <TabsTrigger value="all">All ({resultCounts.all || 0})</TabsTrigger>
                <TabsTrigger value="product">Products ({resultCounts.product || 0})</TabsTrigger>
                <TabsTrigger value="donation">Donations ({resultCounts.donation || 0})</TabsTrigger>
                <TabsTrigger value="issue">Issues ({resultCounts.issue || 0})</TabsTrigger>
                <TabsTrigger value="purchase">Purchases ({resultCounts.purchase || 0})</TabsTrigger>
                <TabsTrigger value="return">Returns ({resultCounts.return || 0})</TabsTrigger>
                <TabsTrigger value="branch">Branches ({resultCounts.branch || 0})</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="sm" onClick={clearSearch} className="text-muted-foreground shrink-0">
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>

          <div className="grid gap-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted rounded animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredResults.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No results found</p>
                  <p className="text-sm mt-1">Try searching with different keywords</p>
                </CardContent>
              </Card>
            ) : (
              filteredResults.map(result => (
                <Link key={`${result.type}-${result.id}`} href={result.href}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-lg">{result.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium truncate">{result.title}</h3>
                            {result.badge && (
                              <Badge className={result.badgeColor || 'bg-muted'}>{result.badge}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {typeof result.subtitle === 'string' ? result.subtitle : result.subtitle}
                          </p>
                          <p className="text-sm text-muted-foreground truncate mt-1">{result.description}</p>
                        </div>
                        <div className="text-xs text-muted-foreground uppercase">{result.type}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </>
      )}

      {!query && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Search products by name, code, or store</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4 text-green-600" /> Donors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Find donations by donor name, phone, or CNIC</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600" /> Branches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Search branches by name or location</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" /> Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Find issue slips by number, beneficiary, or CNIC</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" /> Purchases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Search purchases by invoice or supplier</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-amber-600" /> Returns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Find returns by product, branch, or person</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}