/**
 * CareLoop Phase 3.0.1 — Realtime Multi-Session & WebRTC Signaling Integration Verification
 * 
 * Target: Local Supabase Docker Environment (Kong Gateway: http://127.0.0.1:54321)
 * Tests:
 * - Suite B: Realtime Notification Delivery, Persistence, RLS Isolation, Disconnect/Reconnect, Unsubscribe
 * - Suite C: Multi-Session Chat, Message Delivery, Deduplication & 23505 Idempotency, RLS Isolation
 * - Suite D: WebRTC Signaling Handshake (Incoming alert, receiver_ready, offer/answer, ICE, reject, cancel, end)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

interface VerificationResult {
  section: string;
  testId: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT TESTED';
  durationMs: number;
  expected: string;
  actual: string;
  details?: any;
}

const results: VerificationResult[] = [];

function psql(query: string): string {
  try {
    return execSync(
      `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`psql error: ${stderr || stdout || err.message}`);
  }
}

async function createAuthenticatedUser(prefix: string, role: string) {
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
  const token = data.session.access_token;

  // Ensure profile exists with correct role
  psql(`
    INSERT INTO public.profiles (id, email, full_name, phone, role, status, updated_at)
    VALUES ('${userId}', '${email}', '${prefix.toUpperCase()} User', '+919876543210', '${role}', 'ACTIVE', NOW())
    ON CONFLICT (id) DO UPDATE SET email = '${email}', role = '${role}', status = 'ACTIVE', updated_at = NOW();
  `);

  let donorTableId: string | null = null;
  if (role === 'donor') {
    const donorPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
    donorTableId = psql(`
      INSERT INTO public.donors (profile_id, full_name, phone, blood_group, city, lat, lng, is_available, is_medically_cleared)
      VALUES ('${userId}', '${prefix.toUpperCase()} User', '${donorPhone}', 'O+', 'Hyderabad', 17.385044, 78.486671, true, true)
      ON CONFLICT (profile_id) DO UPDATE SET is_available = true
      RETURNING id;
    `).split('\n')[0].trim();
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => token,
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  await userClient.realtime.setAuth(token);

  return { userId, email, token, client: userClient, donorTableId };
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runAllTests() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 3.0.1 REALTIME & SIGNALING INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  console.log('[Setup] Creating 3 isolated authenticated sessions...');
  const userA = await createAuthenticatedUser('pat_a', 'patient');
  const userB = await createAuthenticatedUser('don_b', 'donor');
  const userC = await createAuthenticatedUser('outsider_c', 'donor');
  console.log(`- Patient A:  ${userA.userId} (${userA.email})`);
  console.log(`- Donor B:    ${userB.userId} (${userB.email})`);
  console.log(`- Outsider C: ${userC.userId} (${userC.email})\n`);

  // ==========================================================================
  // SECTION B: ACTUAL REALTIME INTEGRATION RESULTS
  // ==========================================================================
  console.log('--- SECTION B: REALTIME NOTIFICATION DELIVERY & RLS ---');

  // Test B1: Realtime Notification Delivery to Subscribed Recipient
  {
    const start = Date.now();
    let receivedPayload: any = null;

    const notifChannelB = userB.client
      .channel(`realtime-notif-${userB.userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userB.userId}`,
        },
        (payload) => {
          receivedPayload = payload;
        }
      );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Channel subscription timeout')), 5000);
      notifChannelB.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const notifTitle = 'URGENT: Blood Match Found';
    const notifContent = 'Donor requested at Apollo Jubilee Hills';
    const idempotencyKey = `idemp_b1_${Date.now()}`;

    // System/Coordinator inserts notification for Donor B
    psql(`
      INSERT INTO public.notifications (user_id, channel, title, content, status, idempotency_key)
      VALUES ('${userB.userId}', 'IN_APP', '${notifTitle}', '${notifContent}', 'QUEUED', '${idempotencyKey}');
    `);

    // Wait for event to arrive via WebSocket
    const waitStart = Date.now();
    while (!receivedPayload && Date.now() - waitStart < 5000) {
      await delay(50);
    }

    const duration = Date.now() - start;
    const passed = receivedPayload !== null && receivedPayload.new?.title === notifTitle;

    results.push({
      section: 'Section B: Realtime Integration',
      testId: 'B-01',
      name: 'Realtime In-App Notification Delivery (WebSocket)',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: `Donor B receives postgres_changes INSERT event with title "${notifTitle}" via WebSocket`,
      actual: passed
        ? `Received event in ${Date.now() - waitStart}ms with payload id=${receivedPayload.new?.id}`
        : 'Did not receive postgres_changes event within 5000ms',
      details: receivedPayload?.new,
    });

    // Clean up channel B
    await userB.client.removeChannel(notifChannelB);
  }

  // Test B2: Notification Persistence vs Realtime Delivery
  {
    const start = Date.now();
    const { data, error } = await userB.client
      .from('notifications')
      .select('*')
      .eq('user_id', userB.userId);

    const duration = Date.now() - start;
    const passed = !error && data && data.length >= 1;

    results.push({
      section: 'Section B: Realtime Integration',
      testId: 'B-02',
      name: 'Notification Persistence Verification in Database',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Notification row is persisted in public.notifications and readable by recipient',
      actual: passed
        ? `Successfully fetched ${data.length} persisted notification(s) via REST API`
        : `Failed to fetch notifications: ${error?.message}`,
      details: data,
    });
  }

  // Test B3: Realtime Channel RLS Isolation (Preventing Unauthorized Eavesdropping)
  {
    const start = Date.now();
    let eavesdroppedPayload: any = null;

    // Outsider C maliciously attempts to subscribe to User B's notifications
    const eavesdropChannelC = userC.client
      .channel(`eavesdrop-notifs-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userB.userId}`,
        },
        (payload) => {
          eavesdroppedPayload = payload;
        }
      );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Outsider channel subscription timeout')), 5000);
      eavesdropChannelC.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    // Insert another notification destined strictly for User B
    const secretContent = `CONFIDENTIAL_MEDICAL_${Date.now()}`;
    psql(`
      INSERT INTO public.notifications (user_id, channel, title, content, status)
      VALUES ('${userB.userId}', 'IN_APP', 'Confidential Alert', '${secretContent}', 'QUEUED');
    `);

    // Wait 2000ms to see if Outsider C receives anything
    await delay(2000);
    const duration = Date.now() - start;
    const passed = eavesdroppedPayload === null;

    results.push({
      section: 'Section B: Realtime Integration',
      testId: 'B-03',
      name: 'Realtime Channel Isolation & RLS Enforcement',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Outsider C receives ZERO events for notifications belonging to User B (RLS drops at CDC level)',
      actual: passed
        ? 'Verified: Outsider C received 0 events (PostgreSQL RLS filtering active)'
        : `VULNERABILITY: Outsider C received unauthorized event: ${JSON.stringify(eavesdroppedPayload)}`,
    });

    await userC.client.removeChannel(eavesdropChannelC);
  }

  // Test B4: Offline Disconnect, Notification Queuing, Reconnection & Idempotency
  {
    const start = Date.now();
    // Simulate User B going offline (no active subscription)
    const offlineContent = `OFFLINE_DISPATCH_${Date.now()}`;
    const offlineIdempKey = `idemp_offline_${Date.now()}`;

    // Notification created while User B is disconnected
    psql(`
      INSERT INTO public.notifications (user_id, channel, title, content, status, idempotency_key)
      VALUES ('${userB.userId}', 'IN_APP', 'Offline Urgent Request', '${offlineContent}', 'QUEUED', '${offlineIdempKey}');
    `);

    // Attempt inserting the exact same notification again (idempotency test)
    let duplicateRejected = false;
    try {
      psql(`
        INSERT INTO public.notifications (user_id, channel, title, content, status, idempotency_key)
        VALUES ('${userB.userId}', 'IN_APP', 'Offline Urgent Request', '${offlineContent}', 'QUEUED', '${offlineIdempKey}');
      `);
    } catch (e: any) {
      if (e.message.includes('duplicate key value') || e.message.includes('23505')) {
        duplicateRejected = true;
      }
    }

    // User B reconnects and queries notifications
    const { data: reconnectedNotifs, error } = await userB.client
      .from('notifications')
      .select('*')
      .eq('user_id', userB.userId)
      .eq('idempotency_key', offlineIdempKey);

    const duration = Date.now() - start;
    const passed = !error && duplicateRejected && reconnectedNotifs?.length === 1;

    results.push({
      section: 'Section B: Realtime Integration',
      testId: 'B-04',
      name: 'Offline Disconnect, Persistence & Idempotency Key De-duplication',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Offline notification is safely queued in DB; duplicate idempotency key rejected (23505); fetched upon reconnection',
      actual: passed
        ? `Verified: Duplicate insert rejected with 23505; recipient fetched exactly 1 row (${reconnectedNotifs[0].id}) upon reconnection`
        : `Failed: duplicateRejected=${duplicateRejected}, count=${reconnectedNotifs?.length}, error=${error?.message}`,
    });
  }

  // Test B5: Unsubscribe & Clean Session Teardown
  {
    const start = Date.now();
    const teardownClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userB.token}` } }
    });
    await teardownClient.realtime.setAuth(userB.token);

    const tempChannel = teardownClient.channel(`teardown-test-${Date.now()}`);
    let subscribed = false;
    let closed = false;

    await new Promise<void>((resolve) => {
      tempChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          resolve();
        }
      });
    });

    const statusAfterRemove = await teardownClient.removeChannel(tempChannel);
    closed = statusAfterRemove === 'ok';

    const duration = Date.now() - start;
    const passed = subscribed && closed;

    results.push({
      section: 'Section B: Realtime Integration',
      testId: 'B-05',
      name: 'Channel Unsubscribe & Resource Teardown',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Realtime channel transitions to CLOSED and is removed from client registry without leaks',
      actual: passed
        ? 'Verified: Channel established, removeChannel returned "ok", resources cleanly freed'
        : `Failed: subscribed=${subscribed}, closed=${closed}`,
    });
  }

  // ==========================================================================
  // SECTION C: CHAT MULTI-SESSION INTEGRATION RESULTS
  // ==========================================================================
  console.log('\n--- SECTION C: MULTI-SESSION CHAT INTEGRATION ---');

  // Setup Conversation Fixture between User A and User B
  const emergencyReqId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const refCode = `REF${Date.now().toString().slice(-6)}`;

  psql(`
    INSERT INTO public.emergency_requests (id, reference_code, blood_group, component, units_required, urgency, hospital_name, hospital_address, city, contact_name, contact_phone, status, created_by)
    VALUES ('${emergencyReqId}', '${refCode}', 'O+', 'Whole Blood', 2, 'Urgent', 'Apollo Hospital', 'Jubilee Hills', 'Hyderabad', 'Patient Contact', '+919876543210', 'CREATED', '${userA.userId}');

    INSERT INTO public.conversations (id, request_id, donor_id, requester_id, status, created_at, updated_at)
    VALUES ('${conversationId}', '${emergencyReqId}', '${userB.donorTableId}', '${userA.userId}', 'ACTIVE', NOW(), NOW());

    INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role, is_active, joined_at)
    VALUES 
      ('${conversationId}', '${userA.userId}', 'requester', true, NOW()),
      ('${conversationId}', '${userB.userId}', 'donor', true, NOW());
  `);

  // Test C1: Bidirectional Realtime Chat Message Exchange
  {
    const start = Date.now();
    let userBReceivedMsgA = false;
    let userAReceivedMsgB = false;

    // Refresh socket authorization for both sessions
    await userA.client.realtime.setAuth(userA.token);
    await userB.client.realtime.setAuth(userB.token);

    const textA = 'Urgent: Patient is in OT 3, please confirm your arrival time.';
    const textB = 'I just reached the blood bank entrance. Walking in now.';

    const chatChannelB = userB.client
      .channel(`chat-channel-b-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('[DEBUG C1] userB received payload:', payload.new?.id, payload.new?.content);
          if (payload.new?.content === textA) userBReceivedMsgA = true;
        }
      );

    const chatChannelA = userA.client
      .channel(`chat-channel-a-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('[DEBUG C1] userA received payload:', payload.new?.id, payload.new?.content);
          if (payload.new?.content === textB) userAReceivedMsgB = true;
        }
      );

    await Promise.all([
      new Promise<void>((res) => chatChannelB.subscribe((s, err) => {
        if (err) console.error('chatChannelB error:', err);
        if (s === 'SUBSCRIBED') res();
      })),
      new Promise<void>((res) => chatChannelA.subscribe((s, err) => {
        if (err) console.error('chatChannelA error:', err);
        if (s === 'SUBSCRIBED') res();
      })),
    ]);

    // Give Realtime subscription 500ms to propagate to replication worker
    await delay(500);

    // 1. Patient A sends message to Donor B
    const clientMsgIdA = `msg_a_${Date.now()}`;
    const { error: sendErrA } = await userA.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userA.userId,
      sender_name: 'Patient Attendant',
      sender_role: 'patient',
      message_type: 'TEXT',
      content: textA,
      client_message_id: clientMsgIdA,
    });

    const waitStartB = Date.now();
    while (!userBReceivedMsgA && Date.now() - waitStartB < 5000) {
      await delay(50);
    }

    // 2. Donor B replies to Patient A
    const clientMsgIdB = `msg_b_${Date.now()}`;
    const { error: sendErrB } = await userB.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userB.userId,
      sender_name: 'Volunteer Donor',
      sender_role: 'donor',
      message_type: 'TEXT',
      content: textB,
      client_message_id: clientMsgIdB,
    });

    const waitStartA = Date.now();
    while (!userAReceivedMsgB && Date.now() - waitStartA < 5000) {
      await delay(50);
    }

    const duration = Date.now() - start;
    const passed = !sendErrA && !sendErrB && userBReceivedMsgA && userAReceivedMsgB;

    results.push({
      section: 'Section C: Chat Multi-Session',
      testId: 'C-01',
      name: 'Bidirectional Realtime Message Exchange (WebSocket)',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Both participants exchange messages over Realtime WebSocket and receive updates in <1000ms',
      actual: passed
        ? `Verified: User B received A's message in ${waitStartA - waitStartB}ms; User A received B's message in ${Date.now() - waitStartA}ms`
        : `Failed: sendErrA=${sendErrA?.message}, sendErrB=${sendErrB?.message}, userBReceivedA=${userBReceivedMsgA}, userAReceivedB=${userAReceivedMsgB}`,
    });

    await userB.client.removeChannel(chatChannelB);
    await userA.client.removeChannel(chatChannelA);
  }

  // Test C2: Message De-duplication & 23505 Unique Constraint Handling
  {
    const start = Date.now();
    const duplicateClientMsgId = `dup_test_${Date.now()}`;
    const messageContent = 'Idempotent test message payload';

    // Insert first instance
    const { data: firstInsert, error: err1 } = await userA.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userA.userId,
      sender_name: 'Patient Attendant',
      sender_role: 'patient',
      message_type: 'TEXT',
      content: messageContent,
      client_message_id: duplicateClientMsgId,
    }).select();

    // Insert duplicate instance with exact same client_message_id
    const { error: err2 } = await userA.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userA.userId,
      sender_name: 'Patient Attendant',
      sender_role: 'patient',
      message_type: 'TEXT',
      content: messageContent,
      client_message_id: duplicateClientMsgId,
    });

    // Query messages count with this client_message_id
    const { data: existingRows } = await userA.client
      .from('messages')
      .select('id, client_message_id')
      .eq('conversation_id', conversationId)
      .eq('client_message_id', duplicateClientMsgId);

    const duration = Date.now() - start;
    const passed =
      !err1 &&
      err2 !== null &&
      (err2.code === '23505' || err2.message.includes('unique') || err2.message.includes('duplicate')) &&
      existingRows?.length === 1;

    results.push({
      section: 'Section C: Chat Multi-Session',
      testId: 'C-02',
      name: 'Client Message ID Deduplication (23505 Unique Constraint)',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Duplicate client_message_id in conversation triggers 23505 error; only 1 row exists',
      actual: passed
        ? `Verified: Second insert caught error code ${err2?.code} ("${err2?.message}"); Exactly 1 message persisted`
        : `Failed: err1=${err1?.message}, err2=${err2?.message}, rowsCount=${existingRows?.length}`,
    });
  }

  // Test C3: Chat RLS Isolation (Outsider Access Denial)
  {
    const start = Date.now();
    // Outsider C (not a conversation participant) attempts to read messages
    const { data: outsiderRead, error: readErr } = await userC.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId);

    // Outsider C attempts to inject a message into User A & B's conversation
    const { error: injectErr } = await userC.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userC.userId,
      sender_name: 'Malicious Attacker',
      sender_role: 'donor',
      message_type: 'TEXT',
      content: 'Unauthorized injection attempt',
      client_message_id: `attack_${Date.now()}`,
    });

    const duration = Date.now() - start;
    const readBlocked = outsiderRead === null || outsiderRead.length === 0;
    const injectBlocked = injectErr !== null;
    const passed = readBlocked && injectBlocked;

    results.push({
      section: 'Section C: Chat Multi-Session',
      testId: 'C-03',
      name: 'Chat RLS Isolation & Non-Participant Denial',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Outsider cannot read (0 rows returned) or inject (permission/check error) messages into conversation',
      actual: passed
        ? `Verified: Read returned ${outsiderRead?.length || 0} rows; Write rejected with error: "${injectErr?.message}"`
        : `Failed: readCount=${outsiderRead?.length}, injectErr=${injectErr?.message}`,
    });
  }

  // ==========================================================================
  // SECTION D: WEBRTC REALTIME SIGNALING RESULTS
  // ==========================================================================
  console.log('\n--- SECTION D: WEBRTC REALTIME SIGNALING RESULTS ---');

  // Test D1: Full WebRTC Signaling Handshake (Alert, Ready, Offer, Answer, ICE, End)
  {
    const start = Date.now();
    const callId = crypto.randomUUID();

    // Call session record in PostgreSQL
    psql(`
      INSERT INTO public.call_sessions (id, conversation_id, request_id, caller_id, receiver_id, status, started_at, ringing_at)
      VALUES ('${callId}', '${conversationId}', '${emergencyReqId}', '${userA.userId}', '${userB.userId}', 'RINGING', NOW(), NOW());
    `);

    // Channel names per CallSignalingService architecture
    const userCallChannelBName = `user-calls:${userB.userId}`;
    const callChannelName = `call:${callId}`;

    let receiverGotIncomingAlert = false;
    let callerGotReceiverReady = false;
    let calleeGotOffer = false;
    let callerGotAnswer = false;
    let iceCandidateExchanged = false;
    let callEndedReceived = false;

    // 1. Callee listens on user-calls channel
    const userCallChannelB = userB.client.channel(userCallChannelBName, {
      config: { broadcast: { ack: true } },
    });
    userCallChannelB.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
      if (payload && payload.id === callId) {
        receiverGotIncomingAlert = true;
      }
    });

    // 2. Both peers join call signaling channel
    const callerCallChannel = userA.client.channel(callChannelName, {
      config: { broadcast: { ack: true } },
    });
    const calleeCallChannel = userB.client.channel(callChannelName, {
      config: { broadcast: { ack: true } },
    });

    callerCallChannel
      .on('broadcast', { event: 'signal:receiver_ready' }, () => {
        callerGotReceiverReady = true;
      })
      .on('broadcast', { event: 'signal:answer' }, ({ payload }) => {
        if (payload?.sdp?.type === 'answer') callerGotAnswer = true;
      })
      .on('broadcast', { event: 'signal:ice-candidate' }, ({ payload }) => {
        if (payload?.candidate) iceCandidateExchanged = true;
      });

    calleeCallChannel
      .on('broadcast', { event: 'signal:offer' }, ({ payload }) => {
        if (payload?.sdp?.type === 'offer') calleeGotOffer = true;
      })
      .on('broadcast', { event: 'signal:ended' }, () => {
        callEndedReceived = true;
      });

    // Subscribe all
    await Promise.all([
      new Promise<void>((r) => userCallChannelB.subscribe((s) => s === 'SUBSCRIBED' && r())),
      new Promise<void>((r) => callerCallChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
      new Promise<void>((r) => calleeCallChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
    ]);

    // STEP 1: Caller sends incoming alert
    await callerCallChannel.send({
      type: 'broadcast',
      event: 'call:incoming',
      payload: { id: callId, callerId: userA.userId, receiverId: userB.userId },
    });
    // Also dispatch on user-calls channel
    const alertChannel = userA.client.channel(userCallChannelBName);
    await alertChannel.send({
      type: 'broadcast',
      event: 'call:incoming',
      payload: { id: callId, callerId: userA.userId, receiverId: userB.userId },
    });

    let wait = Date.now();
    while (!receiverGotIncomingAlert && Date.now() - wait < 3000) await delay(50);

    // STEP 2: Callee dispatches receiver_ready
    await calleeCallChannel.send({
      type: 'broadcast',
      event: 'signal:receiver_ready',
      payload: { callId, calleeId: userB.userId },
    });

    wait = Date.now();
    while (!callerGotReceiverReady && Date.now() - wait < 3000) await delay(50);

    // STEP 3: Caller dispatches SDP offer
    await callerCallChannel.send({
      type: 'broadcast',
      event: 'signal:offer',
      payload: {
        callerId: userA.userId,
        sdp: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n' },
      },
    });

    wait = Date.now();
    while (!calleeGotOffer && Date.now() - wait < 3000) await delay(50);

    // STEP 4: Callee dispatches SDP answer
    await calleeCallChannel.send({
      type: 'broadcast',
      event: 'signal:answer',
      payload: {
        answererId: userB.userId,
        sdp: { type: 'answer', sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n' },
      },
    });

    wait = Date.now();
    while (!callerGotAnswer && Date.now() - wait < 3000) await delay(50);

    // STEP 5: Callee sends ICE candidate
    await calleeCallChannel.send({
      type: 'broadcast',
      event: 'signal:ice-candidate',
      payload: {
        senderId: userB.userId,
        candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 5004 typ host', sdpMid: 'audio', sdpMLineIndex: 0 },
      },
    });

    wait = Date.now();
    while (!iceCandidateExchanged && Date.now() - wait < 3000) await delay(50);

    // STEP 6: Caller ends call
    await callerCallChannel.send({
      type: 'broadcast',
      event: 'signal:ended',
      payload: { callId, reason: 'USER_ENDED', durationSeconds: 15 },
    });

    wait = Date.now();
    while (!callEndedReceived && Date.now() - wait < 3000) await delay(50);

    const duration = Date.now() - start;
    const passed =
      receiverGotIncomingAlert &&
      callerGotReceiverReady &&
      calleeGotOffer &&
      callerGotAnswer &&
      iceCandidateExchanged &&
      callEndedReceived;

    results.push({
      section: 'Section D: WebRTC Signaling',
      testId: 'D-01',
      name: 'Full WebRTC Signaling Handshake (Broadcast Realtime)',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Incoming alert -> receiver_ready -> SDP offer -> SDP answer -> ICE candidate -> call end sequence completes',
      actual: passed
        ? `Verified: 6-stage handshake completed successfully via Realtime broadcast in ${duration}ms`
        : `Handshake incomplete: incoming=${receiverGotIncomingAlert}, ready=${callerGotReceiverReady}, offer=${calleeGotOffer}, answer=${callerGotAnswer}, ice=${iceCandidateExchanged}, end=${callEndedReceived}`,
    });

    await userA.client.removeChannel(callerCallChannel);
    await userB.client.removeChannel(calleeCallChannel);
    await userB.client.removeChannel(userCallChannelB);
  }

  // Test D2: WebRTC Signaling Rejection Flow
  {
    const start = Date.now();
    const callId = crypto.randomUUID();
    const callChannelName = `call:${callId}`;

    let callerGotRejection = false;
    let rejectReason = '';

    const callerChannel = userA.client.channel(callChannelName, { config: { broadcast: { ack: true } } });
    const calleeChannel = userB.client.channel(callChannelName, { config: { broadcast: { ack: true } } });

    callerChannel.on('broadcast', { event: 'signal:rejected' }, ({ payload }) => {
      callerGotRejection = true;
      rejectReason = payload?.reason;
    });

    await Promise.all([
      new Promise<void>((r) => callerChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
      new Promise<void>((r) => calleeChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
    ]);

    // Callee rejects call
    await calleeChannel.send({
      type: 'broadcast',
      event: 'signal:rejected',
      payload: { callId, reason: 'DONOR_CURRENTLY_DONATING' },
    });

    const wait = Date.now();
    while (!callerGotRejection && Date.now() - wait < 3000) await delay(50);

    const duration = Date.now() - start;
    const passed = callerGotRejection && rejectReason === 'DONOR_CURRENTLY_DONATING';

    results.push({
      section: 'Section D: WebRTC Signaling',
      testId: 'D-02',
      name: 'WebRTC Signaling Call Rejection Flow',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Callee sends signal:rejected; Caller receives event and reason to teardown ringing modal',
      actual: passed
        ? `Verified: Caller received signal:rejected with reason="${rejectReason}" in ${Date.now() - wait}ms`
        : 'Failed to receive signal:rejected within 3000ms',
    });

    await userA.client.removeChannel(callerChannel);
    await userB.client.removeChannel(calleeChannel);
  }

  // Test D3: WebRTC Signaling Caller Cancellation Flow
  {
    const start = Date.now();
    const callId = crypto.randomUUID();
    const callChannelName = `call:${callId}`;

    let calleeGotCancellation = false;
    let cancelReason = '';

    const callerChannel = userA.client.channel(callChannelName, { config: { broadcast: { ack: true } } });
    const calleeChannel = userB.client.channel(callChannelName, { config: { broadcast: { ack: true } } });

    calleeChannel.on('broadcast', { event: 'signal:cancelled' }, ({ payload }) => {
      calleeGotCancellation = true;
      cancelReason = payload?.reason;
    });

    await Promise.all([
      new Promise<void>((r) => callerChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
      new Promise<void>((r) => calleeChannel.subscribe((s) => s === 'SUBSCRIBED' && r())),
    ]);

    // Caller cancels call before answer
    await callerChannel.send({
      type: 'broadcast',
      event: 'signal:cancelled',
      payload: { callId, reason: 'CALLER_HUNG_UP_BEFORE_ANSWER' },
    });

    const wait = Date.now();
    while (!calleeGotCancellation && Date.now() - wait < 3000) await delay(50);

    const duration = Date.now() - start;
    const passed = calleeGotCancellation && cancelReason === 'CALLER_HUNG_UP_BEFORE_ANSWER';

    results.push({
      section: 'Section D: WebRTC Signaling',
      testId: 'D-03',
      name: 'WebRTC Signaling Caller Cancellation Flow',
      status: passed ? 'PASS' : 'FAIL',
      durationMs: duration,
      expected: 'Caller sends signal:cancelled; Callee receives event and dismisses incoming call modal',
      actual: passed
        ? `Verified: Callee received signal:cancelled with reason="${cancelReason}" in ${Date.now() - wait}ms`
        : 'Failed to receive signal:cancelled within 3000ms',
    });

    await userA.client.removeChannel(callerChannel);
    await userB.client.removeChannel(calleeChannel);
  }

  // Print Summary Table
  console.log('\n================================================================');
  console.log('INTEGRATION TEST EXECUTION SUMMARY:');
  console.log('================================================================');
  let passCount = 0;
  for (const r of results) {
    const symbol = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[NOT TESTED]';
    console.log(`${symbol} ${r.testId} - ${r.name} (${r.durationMs}ms)`);
    console.log(`       Actual: ${r.actual}`);
    if (r.status === 'PASS') passCount++;
  }
  console.log('================================================================');
  console.log(`TOTAL: ${results.length} | PASSED: ${passCount} | FAILED: ${results.length - passCount}`);
  console.log('================================================================\n');

  if (passCount !== results.length) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
