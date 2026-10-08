import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL=https://tlifdnvhmodrdvgtljsk.supabase.co');
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaWZkbnZobW9kcmR2Z3RsanNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjkyMDAsImV4cCI6MjA5ODc0NTIwMH0.fvu982xCPEJHFAVa-JuONKa-wdIIHK8OZtrQtGmIcx0');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);