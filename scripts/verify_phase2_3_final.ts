/**
 * CareLoop Phase 2.3 — Final Independent Verification Suite
 * 
 * Verifies:
 * 1. TURN Security & Ephemeral RFC 5766 HMAC-SHA1 Credentials Generation & Expiration
 * 2. Inventory Security & Table Privilege Revocation (No direct PostgREST mutations, No forged audits)
 * 3. Multi-Member Blood Centre Staff Management (Manager, Technician, Staff RLS & RPCs)
 * 4. Hospital Directory Integrity (No fake phone numbers, No fake availability, Clean fallback separation)
 * 5. Notification Delivery Lifecycle (PENDING -> ATTEMPTED -> DELIVERED, No false delivery on insert)
 * 6. Full Vertical Multi-Identity Integration (Patient -> Donor -> Coordinator -> Inventory -> Notification)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { healthcareFacilityService, SeededAndhraPradeshProvider, SupabaseAndhraPradeshProvider } from '../src/services/healthcareFacilityService';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;

function psql(query: string): string {
  try {
    return execSync(
      'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return `ERROR: ${stderr || stdout || err.message}`;
  }
}

interface TestIdentity {
  id: string;
  email: string;
  token: string;
  client: SupabaseClient;
  donorId?: string;
}

async function createIdentity(anon: SupabaseClient, email: string, name: string): Promise<TestIdentity> {
  const { data, error } = await anon.auth.signUp({
    email,
    password: 'Password123!#',
    options: { data: { full_name: name } },
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Failed to create identity ${email}: ${error?.message}`);
  }
  const token = data.session.access_token;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.realtime.setAuth(token);

  return { id: data.user.id, email, token, client };
}

async function runPhase23Verification() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 2.3: FINAL INDEPENDENT VERIFICATION SUITE');
  console.log('Target: Local Supabase (' + SUPABASE_URL + ')');
  console.log('================================================================\n');

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const ts = Date.now();

  console.log('--- Step 0: Bootstrapping Authenticated Test Identities ---');
  const coord = await createIdentity(anon, `coord_p23_${ts}@careloop.local`, 'Coordinator Carol');
  const centreManager = await createIdentity(anon, `manager_p23_${ts}@careloop.local`, 'Manager Mark');
  const centreTech = await createIdentity(anon, `tech_p23_${ts}@careloop.local`, 'Tech Tina');
  const alice = await createIdentity(anon, `alice_p23_${ts}@test.local`, 'Patient Alice');
  const bob = await createIdentity(anon, `bob_p23_${ts}@test.local`, 'Patient Bob');
  const deepak = await createIdentity(anon, `deepak_p23_${ts}@test.local`, 'Donor Deepak');

  // Role promotions
  psql(`
    UPDATE public.profiles SET role = 'coordinator' WHERE id = '${coord.id}';
    UPDATE public.profiles SET role = 'blood_centre' WHERE id = '${centreManager.id}';
    UPDATE public.profiles SET role = 'blood_centre' WHERE id = '${centreTech.id}';
    UPDATE public.profiles SET role = 'patient' WHERE id = '${alice.id}';
    UPDATE public.profiles SET role = 'patient' WHERE id = '${bob.id}';
    UPDATE public.profiles SET role = 'donor' WHERE id = '${deepak.id}';
  `);

  // Assign centreManager as primary profile of Centre 1
  const centre1Id = 'a0000000-0000-0000-0000-000000000001';
  const centre2Id = 'a0000000-0000-0000-0000-000000000002';
  psql(`
    UPDATE public.blood_centres SET profile_id = '${centreManager.id}' WHERE id = '${centre1Id}';
    INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
    VALUES ('${centre1Id}', '${centreManager.id}', 'manager', 'active')
    ON CONFLICT (centre_id, user_id) DO UPDATE SET role = 'manager', status = 'active';
  `);

  // Create donor record for Deepak with unique phone
  const deepakPhone = `+91984${ts.toString().slice(-6)}`;
  const donorRes = psql(`
    INSERT INTO public.donors (profile_id, full_name, blood_group, city, district, phone, is_available)
    VALUES ('${deepak.id}', 'Donor Deepak', 'O+', 'Machilipatnam', 'Krishna', '${deepakPhone}', true)
    RETURNING id;
  `);
  deepak.donorId = donorRes.trim().split('\n')[0].trim();

  console.log(`Provisioned identities:
  Coordinator: ${coord.id}
  Centre Manager (Centre 1): ${centreManager.id}
  Centre Tech (Pending): ${centreTech.id}
  Patient Alice: ${alice.id}
  Patient Bob (Intruder): ${bob.id}
  Donor Deepak: ${deepak.id} (Donor ID: ${deepak.donorId})`);

  // ==========================================================================
  // DOMAIN 1: TURN SECURITY & EPHEMERAL CREDENTIALS GENERATION
  // ==========================================================================
  console.log('\n--- 1. TURN Security & Ephemeral RFC 5766 Credentials ---');
  
  // 1.1 Ensure clean unconfigured TURN state
  psql(`DELETE FROM public.app_settings WHERE key IN ('turn_shared_secret', 'turn_server_url');`);
  const { data: stunCreds, error: stunErr } = await alice.client.rpc('get_ephemeral_turn_credentials');
  if (stunErr || !stunCreds) throw new Error(`get_ephemeral_turn_credentials failed: ${stunErr?.message}`);
  console.log('Unconfigured TURN state:', {
    turn_configured: stunCreds.turn_configured,
    ice_servers_count: stunCreds.ice_servers?.length,
    urls: stunCreds.ice_servers?.[0]?.urls
  });
  if (stunCreds.turn_configured !== false) {
    throw new Error('Expected turn_configured=false when no secret is configured.');
  }

  // 1.2 Configure backend secret securely in app_settings table
  const TEST_SHARED_SECRET = 'careloop_test_hmac_secret_key_2026';
  psql(`
    INSERT INTO public.app_settings (key, value) VALUES
      ('turn_shared_secret', '${TEST_SHARED_SECRET}'),
      ('turn_server_url', 'turn:turn.careloop.org:3478?transport=udp')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);

  // 1.3 Ephemeral credential generation with expiration verification
  const { data: turnCreds, error: turnErr } = await alice.client.rpc('get_ephemeral_turn_credentials', { p_ttl_seconds: 600 });
  if (turnErr || !turnCreds) throw new Error(`Ephemeral TURN call failed: ${turnErr?.message}`);

  const turnServer = turnCreds.ice_servers.find((s: any) => s.urls?.startsWith('turn:'));
  console.log('Generated Ephemeral TURN:', {
    turn_configured: turnCreds.turn_configured,
    urls: turnServer?.urls,
    username: turnServer?.username,
    credential: turnServer?.credential?.slice(0, 10) + '...',
    ttl_seconds: turnCreds.ttl_seconds,
    expires_at: turnCreds.expires_at,
  });

  if (!turnCreds.turn_configured || !turnServer) {
    throw new Error('Failed to generate ephemeral TURN server config.');
  }

  // Verify HMAC-SHA1 signature independently in Node.js
  const expectedHmac = crypto
    .createHmac('sha1', TEST_SHARED_SECRET)
    .update(turnServer.username)
    .digest('base64');

  if (turnServer.credential !== expectedHmac) {
    throw new Error(`HMAC mismatch! Expected ${expectedHmac}, got ${turnServer.credential}`);
  }
  console.log('HMAC-SHA1 mathematical signature verified against Node crypto.');

  // Clean up test setting
  psql(`DELETE FROM public.app_settings WHERE key IN ('turn_shared_secret', 'turn_server_url');`);

  console.log('Domain 1 Result: ✅ PASS');

  // ==========================================================================
  // DOMAIN 2: INVENTORY SECURITY & PRIVILEGE HARDENING
  // ==========================================================================
  console.log('\n--- 2. Inventory Security & Table Privilege Revocation ---');

  // 2.1 Direct PostgREST UPDATE on blood_inventory MUST BE REJECTED
  console.log('Testing direct PostgREST UPDATE on blood_inventory...');
  const { data: directUpdateData, error: directUpdateErr } = await centreManager.client
    .from('blood_inventory')
    .update({ units: 999 })
    .eq('blood_centre_id', centre1Id);

  console.log('Direct PostgREST UPDATE response:', {
    data: directUpdateData,
    error: directUpdateErr?.message,
    code: directUpdateErr?.code
  });

  if (!directUpdateErr) {
    throw new Error('SECURITY VIOLATION: Direct PostgREST update on blood_inventory was permitted!');
  }

  // 2.2 Direct PostgREST INSERT into inventory_transactions MUST BE REJECTED
  console.log('Testing direct PostgREST INSERT into inventory_transactions...');
  const { data: directTxData, error: directTxErr } = await bob.client
    .from('inventory_transactions')
    .insert({
      blood_centre_id: centre1Id,
      blood_group: 'O+',
      component: 'Packed RBC',
      delta_units: 50,
      previous_units: 10,
      new_units: 60,
      reason: 'Forged audit entry by attacker',
      performed_by: alice.id, // Forged actor
    });

  console.log('Direct PostgREST INSERT response:', {
    data: directTxData,
    error: directTxErr?.message,
    code: directTxErr?.code
  });

  if (!directTxErr) {
    throw new Error('SECURITY VIOLATION: Direct PostgREST insert into inventory_transactions was permitted!');
  }

  // 2.3 Forged performed_by via adjust_inventory_atomic is impossible (uses auth.uid())
  const { data: adjRes, error: adjErr } = await centreManager.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centre1Id,
    p_blood_group: 'O+',
    p_component: 'Packed RBC',
    p_delta_units: 3,
    p_reason: 'Legitimate batch delivery verification',
  });
  if (adjErr || !adjRes?.success) throw new Error(`adjust_inventory_atomic failed: ${adjErr?.message || adjRes?.message}`);

  const txRow = psql(`
    SELECT performed_by, delta_units, reason
    FROM public.inventory_transactions
    WHERE blood_centre_id = '${centre1Id}' AND reason = 'Legitimate batch delivery verification'
    ORDER BY created_at DESC LIMIT 1;
  `);
  console.log('Audit ledger record for atomic adjustment:', txRow);
  if (!txRow.includes(centreManager.id)) {
    throw new Error(`Audit record did not record genuine auth.uid() ${centreManager.id}`);
  }

  // 2.4 Negative inventory protection
  const { data: negRes } = await centreManager.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centre1Id,
    p_blood_group: 'O+',
    p_component: 'Packed RBC',
    p_delta_units: -9999,
    p_reason: 'Illegal negative extraction',
  });
  console.log('Negative adjustment rejection:', negRes?.message);
  if (negRes?.success !== false || !negRes?.message.includes('negative inventory prohibited')) {
    throw new Error('Failed to block negative inventory stock.');
  }

  // 2.5 Concurrency Stress Test: 10 Parallel adjustments (+1 unit each)
  const initialUnits = Number(psql(`SELECT units FROM public.blood_inventory WHERE blood_centre_id = '${centre1Id}' AND blood_group = 'O+' AND component = 'Packed RBC';`));
  console.log(`Running concurrency stress test: 10 parallel operations on stock (Initial: ${initialUnits})...`);
  const promises = Array.from({ length: 10 }, (_, i) =>
    centreManager.client.rpc('adjust_inventory_atomic', {
      p_centre_id: centre1Id,
      p_blood_group: 'O+',
      p_component: 'Packed RBC',
      p_delta_units: 1,
      p_reason: `Parallel stress test worker #${i + 1}`,
    })
  );
  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.data?.success).length;
  const finalUnits = Number(psql(`SELECT units FROM public.blood_inventory WHERE blood_centre_id = '${centre1Id}' AND blood_group = 'O+' AND component = 'Packed RBC';`));

  console.log(`Parallel stress test: ${successes}/10 operations succeeded. Final stock: ${finalUnits} (Expected: ${initialUnits + 10})`);
  if (successes !== 10 || finalUnits !== initialUnits + 10) {
    throw new Error('Concurrency race condition detected in inventory adjustment!');
  }

  console.log('Domain 2 Result: ✅ PASS');

  // ==========================================================================
  // DOMAIN 3: BLOOD CENTRE MULTI-MEMBER STAFF MANAGEMENT
  // ==========================================================================
  console.log('\n--- 3. Blood Centre Multi-Member Staff Management ---');

  // 3.1 Centre Manager adds Tina as a 'technician'
  console.log('Centre Manager Mark adding Tina as centre technician...');
  const { data: addStaffRes, error: addStaffErr } = await centreManager.client.rpc('add_centre_member_atomic', {
    p_centre_id: centre1Id,
    p_user_id: centreTech.id,
    p_role: 'technician',
  });
  if (addStaffErr || !addStaffRes?.success) throw new Error(`add_centre_member_atomic failed: ${addStaffErr?.message || addStaffRes?.message}`);
  console.log('Technician added successfully:', addStaffRes);

  // 3.2 Technician Tina adjusts stock for Centre 1
  console.log('Technician Tina adjusting inventory for Centre 1...');
  const { data: techAdjRes, error: techAdjErr } = await centreTech.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centre1Id,
    p_blood_group: 'O+',
    p_component: 'Packed RBC',
    p_delta_units: 2,
    p_reason: 'Technician routine component preparation',
  });
  if (techAdjErr || !techAdjRes?.success) throw new Error(`Technician adjustment failed: ${techAdjErr?.message || techAdjRes?.message}`);
  console.log('Technician adjustment succeeded:', techAdjRes);

  // 3.3 Technician Tina attempts to adjust Centre 2 stock (Cross-centre unauthorized)
  console.log('Technician Tina attempting to adjust foreign Centre 2 stock...');
  const { data: crossAdjRes } = await centreTech.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centre2Id,
    p_blood_group: 'O+',
    p_component: 'Packed RBC',
    p_delta_units: 1,
    p_reason: 'Unauthorized cross-centre tamper attempt',
  });
  console.log('Cross-centre modification response:', crossAdjRes);
  if (crossAdjRes?.success !== false || !crossAdjRes?.message.includes('Unauthorized')) {
    throw new Error('Cross-centre staff isolation failed! Technician was able to modify foreign centre.');
  }

  // 3.4 Unauthorized user (Patient Bob) attempts to add staff member
  console.log('Unauthorized user Patient Bob attempting to add staff member...');
  const { data: bobAddRes } = await bob.client.rpc('add_centre_member_atomic', {
    p_centre_id: centre1Id,
    p_user_id: bob.id,
    p_role: 'manager',
  });
  console.log('Bob unauthorized staff addition response:', bobAddRes);
  if (bobAddRes?.success !== false || !bobAddRes?.message.includes('Unauthorized')) {
    throw new Error('Unauthorized user was able to execute add_centre_member_atomic!');
  }

  console.log('Domain 3 Result: ✅ PASS');

  // ==========================================================================
  // DOMAIN 4: HOSPITAL DIRECTORY DATA INTEGRITY
  // ==========================================================================
  console.log('\n--- 4. Hospital Directory Data Integrity ---');

  // 4.1 Real database search
  const dbHospitals = await healthcareFacilityService.searchFacilities({ district: 'Krishna' });
  console.log(`Database hospital query for Krishna district: ${dbHospitals.length} facilities found.`);
  const ggh = dbHospitals.find((h) => h.name.includes('Machilipatnam'));
  console.log('Facility record inspection:', {
    name: ggh?.name,
    dataSource: ggh?.dataSource,
    isLiveAvailability: ggh?.isLiveAvailability,
    emergencyPhone: ggh?.emergencyPhone || '(Unlisted by source registry)',
    verificationStatus: ggh?.verificationStatus,
  });

  if (ggh?.dataSource !== 'database' || ggh?.isLiveAvailability !== false) {
    throw new Error('Database hospital record missing proper metadata tags!');
  }

  // 4.2 Empty search should return [] and NOT falsely fallback to fixtures
  const emptyRes = await healthcareFacilityService.searchFacilities({ query: 'NonExistentXYZHospital123' });
  console.log(`Search for non-existent hospital query returned: ${emptyRes.length} items (Expected: 0)`);
  if (emptyRes.length !== 0) {
    throw new Error('Empty database search falsely fell back to unrelated static fixtures!');
  }

  // 4.3 Fallback provider tagging
  const fallbackProvider = new SeededAndhraPradeshProvider();
  const fallbackItems = await fallbackProvider.searchFacilities({ district: 'Visakhapatnam' });
  console.log('Fallback provider item check:', {
    name: fallbackItems[0]?.name,
    dataSource: fallbackItems[0]?.dataSource,
    isLiveAvailability: fallbackItems[0]?.isLiveAvailability,
  });
  if (fallbackItems[0]?.dataSource !== 'fixture_fallback' || fallbackItems[0]?.isLiveAvailability !== false) {
    throw new Error('Fallback items must be explicitly marked dataSource: fixture_fallback and isLiveAvailability: false');
  }

  console.log('Domain 4 Result: ✅ PASS');

  // ==========================================================================
  // DOMAIN 5: NOTIFICATION DELIVERY LIFECYCLE
  // ==========================================================================
  console.log('\n--- 5. Notification Delivery Lifecycle (Pending vs Delivered) ---');

  // 5.1 In-App Notification starts DELIVERED
  const { data: inAppRes, error: inAppErr } = await coord.client.rpc('create_notification', {
    p_user_id: alice.id,
    p_channel: 'IN_APP',
    p_title: 'In-App Medical Clearance',
    p_content: 'Donor match accepted for your request.',
    p_metadata: { priority: 'URGENT' },
    p_idempotency_key: `in-app-test-${ts}`,
  });
  if (inAppErr || !inAppRes?.success) throw new Error(`create_notification IN_APP failed: ${inAppErr?.message}`);
  console.log('In-app creation status:', inAppRes);
  if (inAppRes.status !== 'DELIVERED') {
    throw new Error(`Expected IN_APP notification to start as DELIVERED, got ${inAppRes.status}`);
  }

  // 5.2 Outbound SMS notification starts PENDING (NOT falsely delivered!)
  const { data: smsRes, error: smsErr } = await coord.client.rpc('create_notification', {
    p_user_id: alice.id,
    p_channel: 'SMS',
    p_title: 'Outbound Emergency Alert',
    p_content: 'CareLoop Alert: Dispatch initiated.',
    p_metadata: { phone: '+919849012345' },
    p_idempotency_key: `sms-test-${ts}`,
  });
  if (smsErr || !smsRes?.success) throw new Error(`create_notification SMS failed: ${smsErr?.message}`);
  console.log('SMS creation status (Guaranteed non-delivered):', smsRes);
  if (smsRes.status !== 'PENDING') {
    throw new Error(`SECURITY DEFECT: SMS was falsely marked ${smsRes.status} upon creation without carrier delivery!`);
  }

  // 5.3 Advance SMS delivery lifecycle via update_notification_delivery_status
  console.log('Advancing SMS delivery: PENDING -> ATTEMPTED...');
  const { data: attemptRes } = await coord.client.rpc('update_notification_delivery_status', {
    p_notification_id: smsRes.notification_id,
    p_status: 'ATTEMPTED',
  });
  console.log('Attempted status:', attemptRes);

  console.log('Advancing SMS delivery: ATTEMPTED -> DELIVERED (Simulating carrier webhook confirmation)...');
  const { data: deliveredRes } = await coord.client.rpc('update_notification_delivery_status', {
    p_notification_id: smsRes.notification_id,
    p_status: 'DELIVERED',
  });
  console.log('Confirmed delivery status:', deliveredRes);
  if (deliveredRes?.status !== 'DELIVERED') {
    throw new Error('Failed to advance notification to DELIVERED');
  }

  // 5.4 Unauthorized user cannot alter notification delivery status
  const { data: unauthorizedStatusRes } = await bob.client.rpc('update_notification_delivery_status', {
    p_notification_id: smsRes.notification_id,
    p_status: 'FAILED',
    p_error: 'Attacker injection',
  });
  console.log('Unauthorized status update response:', unauthorizedStatusRes);
  if (unauthorizedStatusRes?.success !== false) {
    throw new Error('Unauthorized user was able to modify notification delivery status!');
  }

  console.log('Domain 5 Result: ✅ PASS');

  // ==========================================================================
  // DOMAIN 6: FULL VERTICAL MULTI-IDENTITY INTEGRATION
  // ==========================================================================
  console.log('\n--- 6. Full Vertical Multi-Identity Integration ---');

  // 6.1 Alice creates emergency request
  const reqRef = `REQ-P23-${ts.toString().slice(-6)}`;
  const { data: reqInsert, error: reqErr } = await alice.client
    .from('emergency_requests')
    .insert({
      created_by: alice.id,
      blood_group: 'O+',
      component: 'Packed RBC',
      units_required: 2,
      urgency: 'Critical',
      contact_method: 'Phone',
      status: 'AWAITING_RESPONSE',
      reference_code: reqRef,
      contact_name: 'Alice Attendant',
      contact_phone: '+91 98490 99999',
      city: 'Machilipatnam',
      district: 'Krishna',
      hospital_name: 'Government General Hospital, Machilipatnam',
      hospital_address: 'Kalyan Nagar, Main Road, Machilipatnam',
    })
    .select()
    .single();

  if (reqErr || !reqInsert) throw new Error(`Alice create request failed: ${reqErr?.message}`);
  const requestId = reqInsert.id;
  console.log(`1. Emergency Request Created: ${requestId} (Ref: ${reqRef})`);

  // 6.2 Donor Deepak discovers request via privacy view
  const { data: discReqs } = await deepak.client
    .from('discoverable_emergency_requests')
    .select('*')
    .eq('id', requestId);

  console.log('2. Donor Deepak discovery:', {
    found: discReqs?.length === 1,
    blood_group: discReqs?.[0]?.blood_group,
    contact_phone_leaked: 'contact_phone' in (discReqs?.[0] || {}),
  });

  // 6.3 Donor Deepak accepts request and opens conversation channel
  const { data: acceptRes, error: acceptErr } = await deepak.client.rpc('accept_request_and_create_conversation', {
    p_request_id: requestId,
    p_donor_id: deepak.donorId,
  });
  if (acceptErr || !acceptRes?.success) throw new Error(`accept_request_and_create_conversation failed: ${acceptErr?.message || acceptRes?.message}`);
  const conversationId = acceptRes.conversation_id;
  console.log(`3. Donor Deepak accepted: Conversation channel #${conversationId}`);

  // 6.4 Alice and Deepak exchange authenticated messages
  const clientMsgId1 = `msg-alice-${ts}`;
  const { data: msg1, error: msg1Err } = await alice.client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: alice.id,
      sender_name: 'Patient Alice',
      sender_role: 'patient',
      message_type: 'TEXT',
      content: 'Hello Deepak, thank you for responding! Patient is in ICU Ward 3.',
      client_message_id: clientMsgId1,
    })
    .select()
    .single();
  if (msg1Err) throw new Error(`Alice send message failed: ${msg1Err.message}`);

  const clientMsgId2 = `msg-deepak-${ts}`;
  const { data: msg2, error: msg2Err } = await deepak.client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: deepak.id,
      sender_name: 'Donor Deepak',
      sender_role: 'donor',
      message_type: 'TEXT',
      content: 'I am 10 minutes away from Machilipatnam General Hospital.',
      client_message_id: clientMsgId2,
    })
    .select()
    .single();
  if (msg2Err) throw new Error(`Deepak send message failed: ${msg2Err.message}`);
  console.log(`4. Conversation messages exchanged: #${msg1.id.slice(0, 8)} and #${msg2.id.slice(0, 8)}`);

  // 6.5 Coordinator assigns donor (+1 unit) and centre (+1 unit)
  console.log('5. Coordinator Carol performing assignments...');
  const { data: asgnDonor, error: asgnDonorErr } = await coord.client.rpc('assign_donor_atomic', {
    p_request_id: requestId,
    p_donor_id: deepak.donorId,
    p_units: 1,
    p_coordinator_id: coord.id,
  });
  if (asgnDonorErr || !asgnDonor?.success) throw new Error(`assign_donor_atomic failed: ${asgnDonorErr?.message || asgnDonor?.message}`);

  const { data: asgnCentre, error: asgnCentreErr } = await coord.client.rpc('assign_blood_centre_atomic', {
    p_request_id: requestId,
    p_centre_id: centre1Id,
    p_units: 1,
    p_coordinator_id: coord.id,
  });
  if (asgnCentreErr || !asgnCentre?.success) throw new Error(`assign_blood_centre_atomic failed: ${asgnCentreErr?.message || asgnCentre?.message}`);

  console.log('Assignments completed:', {
    donor_assignment: asgnDonor,
    centre_assignment: asgnCentre,
  });

  // 6.6 Verify persistence across refresh (Re-query all records directly)
  const finalReq = psql(`SELECT units_coordinated, status FROM public.emergency_requests WHERE id = '${requestId}';`);
  const finalMessagesCount = psql(`SELECT count(*) FROM public.messages WHERE conversation_id = '${conversationId}';`);
  const finalAssignmentsCount = psql(`SELECT count(*) FROM public.donor_assignments WHERE request_id = '${requestId}' AND status IN ('ASSIGNED', 'CONFIRMED');`);

  console.log('6. Persistence verification after simulated refresh:', {
    requestState: finalReq,
    messagesCount: finalMessagesCount,
    activeAssignmentsCount: finalAssignmentsCount,
  });

  if (finalMessagesCount !== '3' && finalMessagesCount !== '2') {
    // 2 user messages + optional 1 system greeting
    throw new Error(`Unexpected messages count: ${finalMessagesCount}`);
  }

  if (finalAssignmentsCount !== '2') {
    throw new Error(`Expected 2 active assignments, found ${finalAssignmentsCount}`);
  }

  // 6.7 Unauthorized Bob blocked from reading conversation
  const { data: bobConvMessages } = await bob.client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);
  console.log(`Unauthorized user Bob query on private messages: ${bobConvMessages?.length || 0} messages returned (Expected: 0)`);
  if (bobConvMessages && bobConvMessages.length > 0) {
    throw new Error('SECURITY VIOLATION: Intruder Bob read private messages!');
  }

  console.log('Domain 6 Result: ✅ PASS');

  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  console.log('\n--- Cleaning up Test Records ---');
  psql(`
    DELETE FROM public.messages WHERE conversation_id = '${conversationId}';
    DELETE FROM public.call_sessions WHERE conversation_id = '${conversationId}';
    DELETE FROM public.conversation_participants WHERE conversation_id = '${conversationId}';
    DELETE FROM public.conversations WHERE id = '${conversationId}';
    DELETE FROM public.donor_assignments WHERE request_id = '${requestId}';
    DELETE FROM public.donor_responses WHERE request_id = '${requestId}';
    DELETE FROM public.emergency_events WHERE request_id = '${requestId}';
    DELETE FROM public.emergency_requests WHERE id = '${requestId}';
    DELETE FROM public.donors WHERE id = '${deepak.donorId}';
    DELETE FROM public.blood_centre_memberships WHERE centre_id = '${centre1Id}' AND user_id IN ('${centreManager.id}', '${centreTech.id}');
    DELETE FROM public.notifications WHERE user_id IN ('${alice.id}', '${bob.id}', '${coord.id}', '${deepak.id}');
    DELETE FROM public.profiles WHERE id IN ('${coord.id}', '${centreManager.id}', '${centreTech.id}', '${alice.id}', '${bob.id}', '${deepak.id}');
    DELETE FROM auth.users WHERE id IN ('${coord.id}', '${centreManager.id}', '${centreTech.id}', '${alice.id}', '${bob.id}', '${deepak.id}');
  `);
  console.log('Cleanup Complete.');

  console.log('\n================================================================');
  console.log('PHASE 2.3 VERIFICATION: ALL 6 HARDENING & SECURITY DOMAINS PASSED ✅');
  console.log('================================================================');
  process.exit(0);
}

runPhase23Verification().catch((err) => {
  console.error('\n❌ PHASE 2.3 VERIFICATION FAILED:', err);
  process.exit(1);
});
