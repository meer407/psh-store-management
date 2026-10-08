'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from "next/image";
import {
  
  LayoutDashboard,
  GitBranch,
  Store,
  Tag,
  Package,
  ShoppingCart,
  Heart,
  ArrowRightLeft,
  Undo2,
  BarChart3,
  ScrollText,
  Settings,
  Package2,
  ChevronLeft,
  ChevronRight,
  Search,
  BookOpen,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { hasPermission, isSuperAdmin, type Permission } from '@/lib/constants';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  superAdminOnly?: boolean;
  hideFromBranchUser?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, hideFromBranchUser: true },
  { label: 'Branches', href: '/dashboard/branches', icon: GitBranch, superAdminOnly: true },
  { label: 'Stores', href: '/dashboard/stores', icon: Store, superAdminOnly: true },
  { label: 'Categories', href: '/dashboard/categories', icon: Tag, superAdminOnly: true },
  { label: 'Stock', href: '/dashboard/products', icon: Package, permission: 'stock.view', hideFromBranchUser: true },
  { label: 'Purchases', href: '/dashboard/purchases', icon: ShoppingCart, permission: 'purchases.manage' },
  { label: 'Donations', href: '/dashboard/donations', icon: Heart, permission: 'donations.manage' },
  { label: 'Issues', href: '/dashboard/issues', icon: ArrowRightLeft, permission: 'issues.manage' },
  { label: 'Returns', href: '/dashboard/returns', icon: Undo2, permission: 'returns.manage' },
  { label: 'Stock Ledger', href: '/dashboard/ledger', icon: BookOpen, permission: 'stock.view' },
  { label: 'Reports', href: '/dashboard/reports', icon: BarChart3, permission: 'reports.view' },
  { label: 'Global Search', href: '/dashboard/search', icon: Search },
  { label: 'Audit Log', href: '/dashboard/audit-log', icon: ScrollText, permission: 'audit.view' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        setProfile(data as Profile | null);
      }
    });
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  const visibleItems = navItems.filter(item => {
    if (item.hideFromBranchUser && profile?.role === 'branch_user') return false;
    if (item.superAdminOnly) return isSuperAdmin(profile?.role);
    if (item.permission) return hasPermission(profile?.role, item.permission);
    return true;
  });

  const roleLabel = {
    super_admin: 'Super Admin',
    store_keeper: 'Store Keeper',
    branch_user: 'Branch User',
    viewer: 'Viewer',
  }[profile?.role ?? 'viewer'];

  const sidebarContent = (
    <>
      
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
      <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500 bg-white shadow-lg flex-shrink-0">
  <Image
    src="/logo.png"
    alt="PSH Logo"
    fill
    className="object-cover rounded-full"
    priority
  />
</div>

        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-semibold text-sm leading-tight">PSH Store</p>
            <p className="text-blue-400 text-xs">Management System</p>
          </div>
        )}
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="ml-auto lg:hidden text-white/70 hover:text-white p-1"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-0.5 px-2">
          {visibleItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'sidebar-text hover:bg-white/10 hover:text-white'
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="flex-shrink-0" style={{ width: 18, height: 18 }} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle - desktop only */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full items-center justify-center shadow-sm hover:bg-accent transition-colors z-10 hidden lg:flex"
        aria-label="Toggle sidebar"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-white/10">
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg', collapsed && 'justify-center')}>
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-white text-xs font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-blue-400 text-xs truncate">{roleLabel}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar - slide in drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col sidebar-bg border-r border-white/10 transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar - fixed collapsible */}
      <aside
        className={cn(
          'hidden lg:flex flex-col sidebar-bg border-r border-white/10 transition-all duration-300 relative flex-shrink-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}