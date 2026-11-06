import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const client = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  const email = `test-${Date.now()}@careloop-test.local`;
  const password = 'TestPassword123!#';

  console.log('Testing signUp with:', email);
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: 'Test Setup User'
      }
    }
  });

  if (error) {
    console.error('SignUp error:', error);
    process.exit(1);
  }

  console.log('User created:', data.user?.id, data.user?.email);
  console.log('Session access token present:', !!data.session?.access_token);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

