import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function psql(query: string): string {
  return execSync(
    `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
}

async function testPostgresChanges() {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const email = `test_notif_${Date.now()}@careloop.local`;
  const { data } = await anonClient.auth.signUp({
    email,
    password: 'Password123!Secure#',
  });
  const userId = data.user!.id;
  const token = data.session!.access_token;

  psql(`
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES ('${userId}', '${email}', 'Test Recipient', 'donor', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET email = '${email}', role = 'donor', status = 'ACTIVE';
  `);

  console.log(`Created user ${userId}`);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  console.log('Calling realtime.setAuth...');
  await userClient.realtime.setAuth(token);
  console.log('realtime.setAuth finished');

  let receivedEvent = false;

  const ch = userClient.channel(`user-notifs-${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      console.log('>>> RECEIVED NOTIFICATION EVENT VIA REALTIME:', payload);
      receivedEvent = true;
    });

  await new Promise<void>((res) => ch.subscribe((s) => {
    console.log('Subscription status:', s);
    if (s === 'SUBSCRIBED') res();
  }));

  console.log('Inserting notification via psql...');
  psql(`
    INSERT INTO public.notifications (user_id, channel, title, content, status)
    VALUES ('${userId}', 'IN_APP', 'Realtime Alert', 'Testing Realtime Delivery', 'QUEUED');
  `);

  const start = Date.now();
  while (!receivedEvent && Date.now() - start < 6000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log('Result: receivedEvent =', receivedEvent);
  await userClient.removeChannel(ch);
  process.exit(receivedEvent ? 0 : 1);
}

testPostgresChanges().catch((err) => {
  console.error(err);
  process.exit(1);
});
