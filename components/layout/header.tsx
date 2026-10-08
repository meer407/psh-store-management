'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Moon, Sun, Bell, LogOut, User, Settings, ChevronDown, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        setProfile(data as Profile | null);
      }
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    router.replace('/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const roleLabel = {
    super_admin: 'Super Admin',
    store_keeper: 'Store Keeper',
    branch_user: 'Branch User',
    viewer: 'Viewer',
  }[profile?.role ?? 'viewer'];

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      {/* Mobile menu button + spacer */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden sm:block" />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="w-9 h-9 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium leading-tight">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground leading-tight">{roleLabel}</p>
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <p className="font-medium">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground font-normal">{profile?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              <User className="w-4 h-4 mr-2" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              <Settings className="w-4 h-4 mr-2" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
