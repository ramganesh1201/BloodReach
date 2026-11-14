import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://uzwtchnqmveapzehuafb.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_zBAqRhIEnx0_4OPm4GLttQ_U3ra_svx';

const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
const TEST_SUPABASE_URL = 'http://127.0.0.1:54321';
const TEST_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (isTestEnv ? TEST_SUPABASE_URL : DEFAULT_SUPABASE_URL);

const supabaseKey =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
  (isTestEnv ? TEST_ANON_KEY : DEFAULT_ANON_KEY);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl !== 'https://demo.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

// Connected to local Supabase instance
export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
