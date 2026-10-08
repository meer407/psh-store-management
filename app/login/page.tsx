'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Package, Eye, EyeOff, ShieldCheck } from 'lucide-react';
 import Image from "next/image";
export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ full_name: '', email: '', password: '', confirm: '' });

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  console.log("Trying Login...");
  console.log("Email:", loginForm.email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginForm.email,
    password: loginForm.password,
  });

  console.log("DATA:", data);
  console.log("ERROR:", error);

  if (error) {
    toast.error(error.message);
  } else {
    toast.success("Signed in successfully");
    router.replace("/dashboard");
  }

  setLoading(false);
};
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupForm.password !== signupForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (signupForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signupForm.email,
      password: signupForm.password,
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      toast.success('Account created! Signing you in...');
      router.replace('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
    
{/* Logo - Responsive */}
<div className="flex flex-col items-center mb-8">
  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-4 ring-4 ring-blue-500/20 p-2">
    <Image
      src="/logo.png"
      alt="PSH Logo"
      width={80}
      height={80}
      className="object-contain"
      priority
    />
  </div>

  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight text-center">
    PSH Store Management
  </h1>

  <p className="text-blue-300 text-sm mt-1 text-center">
    Pakistan Sweet Home
  </p>
</div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to manage your inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">Create Account</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@psh.org"
                      value={loginForm.email}
                      onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      placeholder="Ahmed Khan"
                      value={signupForm.full_name}
                      onChange={e => setSignupForm(f => ({ ...f, full_name: e.target.value }))}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup_email">Email</Label>
                    <Input
                      id="signup_email"
                      type="email"
                      placeholder="ahmed@psh.org"
                      value={signupForm.email}
                      onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup_password">Password</Label>
                    <Input
                      id="signup_password"
                      type="password"
                      placeholder="••••••••"
                      value={signupForm.password}
                      onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm">Confirm Password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      placeholder="••••••••"
                      value={signupForm.confirm}
                      onChange={e => setSignupForm(f => ({ ...f, confirm: e.target.value }))}
                      required
                      className="mt-1"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center mt-6 gap-2 text-blue-400 text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Secured with role-based access control</span>
        </div>
      </div>
    </div>
  );
}