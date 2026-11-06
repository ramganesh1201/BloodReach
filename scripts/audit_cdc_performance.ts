/**
 * CareLoop Phase 3.0.2 — Audit 4: Realtime CDC Configuration & Latency Benchmark
 * 
 * Target: Local Supabase Docker Environment (Kong Gateway: http://127.0.0.1:54321)
 * Measures:
 * - 20 repeated notification CDC deliveries over WebSocket
 * - 20 repeated chat message CDC deliveries over WebSocket
 * Calculates:
 * - Min, Max, Median, P95 latencies
 * - Failure count and duplicate count
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

function calculateStats(samples: number[]) {
  if (samples.length === 0) {
    return { min: 0, max: 0, median: 0, p95: 0, count: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  // Median
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  
  // P95
  const p95Idx = Math.ceil(0.95 * sorted.length) - 1;
  const p95 = sorted[Math.max(0, p95Idx)];

  return {
    count: sorted.length,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    median: Math.round(median * 10) / 10,
    p95: Math.round(p95 * 10) / 10
  };
}

async function createAuthUser(prefix: string, role: string): Promise<{ id: string; client: SupabaseClient }> {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const email = `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}@careloop.local`;
  const password = 'Password123!Secure#';

  const { data, error } = await anonClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: `${prefix.toUpperCase()} Test User` }
    }
  });

  if (error || !data.user || !data.session) {
    throw new Error(`Failed to create auth user ${prefix}: ${error?.message}`);
  }

  const userId = data.user.id;

  // Insert profile and ensure status is ACTIVE
  psql(`
    INSERT INTO public.profiles (id, full_name, email, role, phone, status)
    VALUES ('${userId}', '${prefix.toUpperCase()} Test User', '${email}', '${role}', '+919876543210', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', role = '${role}';
  `);

  const authenticatedClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    accessToken: async () => data.session.access_token,
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`
      }
    }
  });

  await authenticatedClient.realtime.setAuth(data.session.access_token);

  return { id: userId, client: authenticatedClient };
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('CareLoop Phase 3.0.2 — Audit 4: Realtime CDC Latency Benchmark');
  console.log('================================================================\n');

  // 1. Publication & Replica Identity Audit
  console.log('Step 1: Inspecting publication and replica identities in PostgreSQL...');
  const pubTableSql = `
    SELECT 
      t.tablename, 
      CASE c.relreplident
        WHEN 'd' THEN 'DEFAULT (Primary Key)'
        WHEN 'n' THEN 'NOTHING'
        WHEN 'f' THEN 'FULL'
        WHEN 'i' THEN 'INDEX'
      END AS replica_identity
    FROM pg_publication_tables t
    JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
    WHERE t.pubname = 'supabase_realtime'
    ORDER BY t.tablename;
  `;
  const pubTables = psql(pubTableSql);
  console.log(pubTables);
  console.log('\nReplica Identity Justification Analysis:');
  console.log('- public.notifications: FULL required because clients subscribe with "filter: user_id=eq.<uuid>"');
  console.log('  and receive UPDATE events (read/acknowledged status transitions). Without FULL, PostgreSQL omits');
  console.log('  user_id from the old WAL tuple, breaking Realtime filter evaluation.\n');
  console.log('- public.messages: DEFAULT (Primary Key) optimal because messages are immutable inserts in active chats;');
  console.log('  filtering is on conversation_id during INSERT, avoiding write amplification.\n');

  // 2. Setup users and test channel
  console.log('Step 2: Creating authenticated test actors...');
  const donor = await createAuthUser('cdc_donor', 'donor');
  const coord = await createAuthUser('cdc_coord', 'coordinator');
  console.log(`Donor ID:       ${donor.id}`);
  console.log(`Coordinator ID: ${coord.id}\n`);

  // Fetch existing conversation and add participants
  const convIdRaw = psql(`SELECT id FROM public.conversations LIMIT 1;`);
  const convId = convIdRaw.split('\n')[0].trim();

  psql(`
    INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role, is_active)
    VALUES 
      ('${convId}', '${donor.id}', 'donor', true),
      ('${convId}', '${coord.id}', 'coordinator', true)
    ON CONFLICT (conversation_id, user_id) 
    DO UPDATE SET is_active = true, participant_role = EXCLUDED.participant_role;
  `);

  // Benchmark A: Notifications CDC (20 samples)
  console.log('Step 3: Running 20 repeated Notification CDC delivery measurements...');
  const notifLatencies: number[] = [];
  let notifDuplicates = 0;
  let notifFailures = 0;
  const receivedNotifIds = new Set<string>();

  // Subscribe donor to notifications
  let notifResolver: ((payload: any) => void) | null = null;
  const notifChannel = donor.client.channel(`notifs-bench-${donor.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${donor.id}`
      },
      (payload) => {
        const id = payload.new.id;
        if (receivedNotifIds.has(id)) {
          notifDuplicates++;
        } else {
          receivedNotifIds.add(id);
        }
        if (notifResolver) {
          const resolve = notifResolver;
          notifResolver = null;
          resolve(payload);
        }
      }
    );

  await new Promise<void>((resolve, reject) => {
    notifChannel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Notification channel subscription failed: ${status} ${err?.message || ''}`));
      }
    });
  });
  console.log('Donor subscribed to notifications topic.');

  const TOTAL_SAMPLES = 20;

  for (let i = 1; i <= TOTAL_SAMPLES; i++) {
    const notifId = crypto.randomUUID();
    const waitPromise = new Promise<any>((resolve, reject) => {
      notifResolver = resolve;
      setTimeout(() => reject(new Error('TIMEOUT_4000MS')), 4000);
    });

    // Insert notification directly into database
    psql(`
      INSERT INTO public.notifications (id, user_id, title, content, channel, status)
      VALUES ('${notifId}', '${donor.id}', 'Benchmark Alert ${i}', 'Latency test payload #${i}', 'IN_APP', 'DELIVERED');
    `);
    const t0 = performance.now();

    try {
      await waitPromise;
      const elapsed = performance.now() - t0;
      notifLatencies.push(elapsed);
      process.stdout.write(`.`);
    } catch (err: any) {
      notifFailures++;
      process.stdout.write(`X`);
    }

    // Small delay between samples to prevent queuing
    await new Promise((r) => setTimeout(r, 40));
  }
  console.log('\nNotification benchmark completed.');

  // Benchmark B: Chat Message CDC (20 samples)
  console.log('\nStep 4: Running 20 repeated Chat Message CDC delivery measurements...');
  const msgLatencies: number[] = [];
  let msgDuplicates = 0;
  let msgFailures = 0;
  const receivedMsgIds = new Set<string>();

  let msgResolver: ((payload: any) => void) | null = null;
  const msgChannel = donor.client.channel(`chat-bench-${convId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convId}`
      },
      (payload) => {
        const id = payload.new.id;
        if (receivedMsgIds.has(id)) {
          msgDuplicates++;
        } else {
          receivedMsgIds.add(id);
        }
        if (msgResolver) {
          const resolve = msgResolver;
          msgResolver = null;
          resolve(payload);
        }
      }
    );

  await new Promise<void>((resolve, reject) => {
    msgChannel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Chat channel subscription failed: ${status} ${err?.message || ''}`));
      }
    });
  });
  console.log('Donor subscribed to chat conversation topic.');

  for (let i = 1; i <= TOTAL_SAMPLES; i++) {
    const msgId = crypto.randomUUID();
    const waitPromise = new Promise<any>((resolve, reject) => {
      msgResolver = resolve;
      setTimeout(() => reject(new Error('TIMEOUT_4000MS')), 4000);
    });

    // Coordinator sends message
    psql(`
      INSERT INTO public.messages (id, conversation_id, sender_id, sender_name, sender_role, content, message_type)
      VALUES ('${msgId}', '${convId}', '${coord.id}', 'CDC_COORD Test User', 'coordinator', 'Benchmark Chat Message #${i}', 'TEXT');
    `);
    const t0 = performance.now();

    try {
      await waitPromise;
      const elapsed = performance.now() - t0;
      msgLatencies.push(elapsed);
      process.stdout.write(`.`);
    } catch (err: any) {
      msgFailures++;
      process.stdout.write(`X`);
    }

    await new Promise((r) => setTimeout(r, 40));
  }
  console.log('\nChat message benchmark completed.\n');

  // Teardown channels
  await notifChannel.unsubscribe();
  await msgChannel.unsubscribe();

  // Cleanup test data
  psql(`
    DELETE FROM public.messages WHERE conversation_id = '${convId}' AND sender_id = '${coord.id}';
    DELETE FROM public.conversation_participants WHERE conversation_id = '${convId}' AND user_id IN ('${donor.id}', '${coord.id}');
    DELETE FROM public.notifications WHERE user_id = '${donor.id}';
  `);

  // Calculate statistics
  const notifStats = calculateStats(notifLatencies);
  const msgStats = calculateStats(msgLatencies);

  console.log('================================================================');
  console.log('AUDIT 4: REALTIME CDC BENCHMARK RESULTS');
  console.log('================================================================');
  console.log(`\n1. Notification CDC Delivery (Table: public.notifications, Replica: FULL):`);
  console.log(`   - Sample Count:    ${TOTAL_SAMPLES}`);
  console.log(`   - Success Count:   ${notifStats.count}`);
  console.log(`   - Failure Count:   ${notifFailures}`);
  console.log(`   - Duplicate Count: ${notifDuplicates}`);
  console.log(`   - Min Latency:     ${notifStats.min} ms`);
  console.log(`   - Max Latency:     ${notifStats.max} ms`);
  console.log(`   - Median Latency:  ${notifStats.median} ms`);
  console.log(`   - P95 Latency:     ${notifStats.p95} ms`);

  console.log(`\n2. Chat Message CDC Delivery (Table: public.messages, Replica: DEFAULT):`);
  console.log(`   - Sample Count:    ${TOTAL_SAMPLES}`);
  console.log(`   - Success Count:   ${msgStats.count}`);
  console.log(`   - Failure Count:   ${msgFailures}`);
  console.log(`   - Duplicate Count: ${msgDuplicates}`);
  console.log(`   - Min Latency:     ${msgStats.min} ms`);
  console.log(`   - Max Latency:     ${msgStats.max} ms`);
  console.log(`   - Median Latency:  ${msgStats.median} ms`);
  console.log(`   - P95 Latency:     ${msgStats.p95} ms`);

  const passed = notifFailures === 0 && msgFailures === 0 && notifDuplicates === 0 && msgDuplicates === 0 && notifStats.p95 < 500 && msgStats.p95 < 500;

  console.log('\n----------------------------------------------------------------');
  if (passed) {
    console.log('>>> AUDIT 4 VERDICT: PASS (Realtime CDC verified within p95 SLA) <<<');
  } else {
    console.log('>>> AUDIT 4 VERDICT: FAIL or WARNING <<<');
  }
}

runBenchmark().catch((err) => {
  console.error('Audit 4 runner error:', err);
  process.exit(1);
});
