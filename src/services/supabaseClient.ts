import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Environment Validation Mechanism
if (!supabaseUrl || !supabasePublishableKey) {
  if (import.meta.env.PROD) {
    console.error(
      'Missing Supabase configuration. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.'
    );
  } else {
    console.warn(
      'Supabase environment variables not set. Defaulting to local demo state. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env for live Supabase connectivity.'
    );
  }
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  supabaseUrl !== 'https://demo.supabase.co'
);

export const supabase = createClient(
  supabaseUrl || 'https://demo.supabase.co',
  supabasePublishableKey || 'demo-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
