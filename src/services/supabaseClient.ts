import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl !== 'https://demo.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

// Fallback to safe sandbox mock URL if not configured
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://uzwtchnqmveapzehuafb.supabase.co',
  isSupabaseConfigured ? supabaseKey : 'sb_publishable_demo_fallback_key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
