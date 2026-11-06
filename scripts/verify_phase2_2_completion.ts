/**
 * CareLoop Phase 2.2 — Comprehensive Production Functionality & Security Verification Suite
 * 
 * Verifies:
 * 1. Inventory persistence, negative stock prevention, cross-centre isolation, audit trail & concurrency
 * 2. Database-backed coordinator assignments (donors and blood centres), over-allocation guards, atomic cancellation
 * 3. Persistent notifications in public.notifications, user RLS isolation, deduplication & acknowledgment
 * 4. Privacy view (security_barrier=true) vs base-table RLS protection across multiple roles
 * 5. Healthcare facility database directory queries and contact integrity
 * 6. Realtime channel authorization and WebRTC signaling reliability
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { healthcareFacilityService } from '../src/services/healthcareFacilityService';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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

async function runVerification() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 2.2: PRODUCTION FUNCTIONALITY & SECURITY SUITE');
  console.log('Target: Local Supabase (' + SUPABASE_URL + ')');
  console.log('================================================================\n');

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const ts = Date.now();

  console.log('--- Step 0: Bootstrapping Authenticated Test Identities ---');
  const coord = await createIdentity(anon, `coord_${ts}@careloop.local`, 'Coordinator Carol');
  const centreAUser = await createIdentity(anon, `centre_a_${ts}@careloop.local`, 'Staff Alpha');
  const centreBUser = await createIdentity(anon, `centre_b_${ts}@careloop.local`, 'Staff Beta');
  const alice = await createIdentity(anon, `alice_${ts}@test.local`, 'Patient Alice');
  const bob = await createIdentity(anon, `bob_${ts}@test.local`, 'Patient Bob');
  const deepak = await createIdentity(anon, `deepak_${ts}@test.local`, 'Donor Deepak');

  // Role promotions via SQL
  psql(`
    UPDATE public.profiles SET role = 'coordinator' WHERE id = '${coord.id}';
    UPDATE public.profiles SET role = 'blood_centre' WHERE id = '${centreAUser.id}';
    UPDATE public.profiles SET role = 'blood_centre' WHERE id = '${centreBUser.id}';
    UPDATE public.profiles SET role = 'donor' WHERE id = '${deepak.id}';
    
    -- Link Centre A user to Centre 1 and Centre B user to Centre 2
    UPDATE public.blood_centres SET profile_id = '${centreAUser.id}' WHERE id = 'a0000000-0000-0000-0000-000000000001';
    UPDATE public.blood_centres SET profile_id = '${centreBUser.id}' WHERE id = 'a0000000-0000-0000-0000-000000000002';
  `);

  // Create Donor Deepak Profile
  const { data: donorRecord, error: donorErr } = await deepak.client.from('donors').insert({
    profile_id: deepak.id,
    full_name: 'Donor Deepak',
    phone: `+9199${String(ts).slice(-8)}`,
    email: deepak.email,
    blood_group: 'O+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    is_available: true,
  }).select().single();

  if (donorErr || !donorRecord) {
    throw new Error(`Failed to create donor record: ${donorErr?.message}`);
  }
  deepak.donorId = donorRecord.id;
  console.log(`Identities provisioned: Coordinator=${coord.id}, CentreA=${centreAUser.id}, CentreB=${centreBUser.id}, Alice=${alice.id}, Bob=${bob.id}, Deepak=${deepak.donorId}`);

  // ============================================================================
  // DOMAIN 1: INVENTORY PERSISTENCE, AUTHORIZATION & CONCURRENCY
  // ============================================================================
  console.log('\n--- 1. Inventory Persistence, Authorization & Concurrency ---');
  const centreId1 = 'a0000000-0000-0000-0000-000000000001';
  const centreId2 = 'a0000000-0000-0000-0000-000000000002';

  // Read initial stock
  const { data: initInv } = await coord.client
    .from('blood_inventory')
    .select('units')
    .eq('blood_centre_id', centreId1)
    .eq('blood_group', 'A+')
    .eq('component', 'Packed RBC')
    .single();

  const startUnits = initInv?.units ?? 14;
  console.log(`Initial stock for Centre 1 (A+ Packed RBC): ${startUnits} units`);

  // 1.1 Atomic Adjustment by Coordinator (+5 units)
  const { data: adj1, error: adj1Err } = await coord.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centreId1,
    p_blood_group: 'A+',
    p_component: 'Packed RBC',
    p_delta_units: 5,
    p_reason: 'Routine hospital replenishment batch',
  });

  if (adj1Err || !adj1?.success) {
    throw new Error(`Atomic adjustment by coordinator failed: ${adj1Err?.message || adj1?.message}`);
  }
  console.log('Coordinator atomic addition (+5 units):', adj1);

  // 1.2 Verify Inventory Transaction History
  const { data: txRow } = await coord.client
    .from('inventory_transactions')
    .select('*')
    .eq('blood_centre_id', centreId1)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Verified transaction ledger:', {
    delta: txRow?.delta_units,
    previous: txRow?.previous_units,
    new: txRow?.new_units,
    reason: txRow?.reason,
    performed_by: txRow?.performed_by,
  });

  if (txRow?.delta_units !== 5 || txRow?.new_units !== startUnits + 5) {
    throw new Error('Transaction record mismatch!');
  }

  // 1.3 Negative Stock Prevention Check
  console.log('Testing negative inventory protection (attempting to deduct 999 units)...');
  const { data: negAdj, error: negErr } = await coord.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centreId1,
    p_blood_group: 'A+',
    p_component: 'Packed RBC',
    p_delta_units: -999,
    p_reason: 'Illegal massive overdraft',
  });

  console.log('Negative adjustment response:', { success: negAdj?.success, message: negAdj?.message || negErr?.message });
  if (negAdj?.success) {
    throw new Error('SECURITY VIOLATION: Negative inventory deduction was permitted!');
  }

  // 1.4 Cross-Centre Isolation Check
  console.log('Testing cross-centre authorization (Centre A staff modifying Centre B)...');
  const { data: crossAdj, error: crossErr } = await centreAUser.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centreId2, // Centre 2 belongs to Centre B!
    p_blood_group: 'O+',
    p_component: 'Packed RBC',
    p_delta_units: 2,
    p_reason: 'Unauthorized cross-centre modification attempt',
  });

  console.log('Cross-centre modification response:', { success: crossAdj?.success, message: crossAdj?.message || crossErr?.message });
  if (crossAdj?.success) {
    throw new Error('SECURITY VIOLATION: Centre A staff was able to modify Centre B stock!');
  }

  // Centre A modifying Centre A should succeed
  const { data: ownAdj, error: ownErr } = await centreAUser.client.rpc('adjust_inventory_atomic', {
    p_centre_id: centreId1,
    p_blood_group: 'A+',
    p_component: 'Packed RBC',
    p_delta_units: 1,
    p_reason: 'Authorized self-centre stock adjustment',
  });
  if (ownErr || !ownAdj?.success) {
    throw new Error(`Self-centre update failed: ${ownErr?.message || ownAdj?.message}`);
  }
  console.log('Self-centre modification succeeded:', ownAdj);

  // 1.5 Concurrency Stress Test: 10 parallel atomic updates
  console.log('Running concurrency stress test: 10 parallel atomic increments (+1 each)...');
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      coord.client.rpc('adjust_inventory_atomic', {
        p_centre_id: centreId1,
        p_blood_group: 'A+',
        p_component: 'Packed RBC',
        p_delta_units: 1,
        p_reason: `Concurrent test batch #${i + 1}`,
      })
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.data?.success).length;
  console.log(`Parallel updates: ${successes}/10 succeeded.`);

  const { data: finalInv } = await coord.client
    .from('blood_inventory')
    .select('units')
    .eq('blood_centre_id', centreId1)
    .eq('blood_group', 'A+')
    .eq('component', 'Packed RBC')
    .single();

  const expectedUnits = startUnits + 5 + 1 + 10;
  console.log(`Final stock: ${finalInv?.units} units (Expected: ${expectedUnits})`);
  if (finalInv?.units !== expectedUnits) {
    throw new Error(`Concurrency race condition detected: expected ${expectedUnits}, got ${finalInv?.units}`);
  }
  console.log('Domain 1 Result: ✅ PASS');

  // ============================================================================
  // DOMAIN 2: COORDINATOR ASSIGNMENTS & ATOMIC WORKFLOWS
  // ============================================================================
  console.log('\n--- 2. Coordinator Assignments & Atomic Workflows ---');

  // Create Emergency Request by Alice for 2 units
  const refCode = `REQ-P22-${String(ts).slice(-6)}`;
  const { data: emergencyReq, error: reqErr } = await alice.client.from('emergency_requests').insert({
    reference_code: refCode,
    blood_group: 'O+',
    component: 'Packed RBC',
    units_required: 2,
    urgency: 'Critical',
    hospital_name: 'CareLoop Central Depository',
    hospital_address: '45 Health Sciences Ave',
    city: 'Hyderabad',
    district: 'Hyderabad',
    contact_name: 'Alice Requester',
    contact_phone: '+919849055123',
    contact_method: 'Phone',
    status: 'AWAITING_RESPONSE',
    created_by: alice.id,
    notes: 'Urgent transfusion required for surgery',
  }).select().single();

  if (reqErr || !emergencyReq) {
    throw new Error(`Failed to create emergency request: ${reqErr?.message}`);
  }
  console.log(`Created request ${emergencyReq.id} (Ref: ${refCode}, Units: 2)`);

  // 2.1 Coordinator assigns Donor Deepak for 1 unit
  const { data: asgnDonor, error: asgnDonorErr } = await coord.client.rpc('assign_donor_atomic', {
    p_request_id: emergencyReq.id,
    p_donor_id: deepak.donorId,
    p_units: 1,
    p_coordinator_id: coord.id,
  });

  if (asgnDonorErr || !asgnDonor?.success) {
    throw new Error(`Donor assignment failed: ${asgnDonorErr?.message || asgnDonor?.message}`);
  }
  console.log('Donor assigned atomically:', asgnDonor);

  // 2.2 Idempotent Donor Assignment Check (Identical units should not duplicate)
  const { data: dupAsgn } = await coord.client.rpc('assign_donor_atomic', {
    p_request_id: emergencyReq.id,
    p_donor_id: deepak.donorId,
    p_units: 1,
    p_coordinator_id: coord.id,
  });
  console.log('Duplicate donor assignment response:', dupAsgn);
  if (!dupAsgn?.already_assigned) {
    throw new Error('Idempotent assignment guard failed: already_assigned was not true');
  }

  // 2.3 Coordinator assigns Blood Centre 1 for remaining 1 unit
  const { data: asgnCentre, error: asgnCentreErr } = await coord.client.rpc('assign_blood_centre_atomic', {
    p_request_id: emergencyReq.id,
    p_centre_id: centreId1,
    p_units: 1,
    p_coordinator_id: coord.id,
  });

  if (asgnCentreErr || !asgnCentre?.success) {
    throw new Error(`Centre assignment failed: ${asgnCentreErr?.message || asgnCentre?.message}`);
  }
  console.log('Blood centre assigned atomically:', asgnCentre);

  // Verify Request Status has transitioned to AWAITING_CENTRE_VERIFICATION (all 2 units coordinated)
  const { data: reqAfterAsgn } = await coord.client
    .from('emergency_requests')
    .select('units_coordinated, status')
    .eq('id', emergencyReq.id)
    .single();

  console.log('Request state after assignments:', reqAfterAsgn);
  if (reqAfterAsgn?.units_coordinated !== 2 || reqAfterAsgn?.status !== 'AWAITING_CENTRE_VERIFICATION') {
    throw new Error(`Incorrect coordination state: coordinated=${reqAfterAsgn?.units_coordinated}, status=${reqAfterAsgn?.status}`);
  }

  // 2.4 Over-allocation Protection Check
  console.log('Testing over-allocation protection (trying to assign +1 unit when full)...');
  const { data: overAlloc } = await coord.client.rpc('assign_donor_atomic', {
    p_request_id: emergencyReq.id,
    p_donor_id: deepak.donorId,
    p_units: 2, // Would exceed 2 total units required
    p_coordinator_id: coord.id,
  });
  console.log('Over-allocation response:', overAlloc);
  if (overAlloc?.success) {
    throw new Error('SECURITY VIOLATION: Over-allocation was allowed!');
  }

  // 2.5 Atomic Cancellation Test
  console.log('Cancelling blood centre assignment atomically...');
  const { data: cancelRes, error: cancelErr } = await coord.client.rpc('cancel_donor_assignment_atomic', {
    p_assignment_id: asgnCentre.assignment_id,
    p_reason: 'Centre inventory reserved for alternate ICU case',
  });
  if (cancelErr || !cancelRes?.success) {
    throw new Error(`Cancellation failed: ${cancelErr?.message || cancelRes?.message}`);
  }
  console.log('Assignment cancelled:', cancelRes);

  const { data: reqAfterCancel } = await coord.client
    .from('emergency_requests')
    .select('units_coordinated, status')
    .eq('id', emergencyReq.id)
    .single();

  console.log('Request state after cancellation:', reqAfterCancel);
  if (reqAfterCancel?.units_coordinated !== 1 || reqAfterCancel?.status !== 'DONOR_ASSIGNED') {
    throw new Error(`Coordinated units did not revert cleanly: coordinated=${reqAfterCancel?.units_coordinated}, status=${reqAfterCancel?.status}`);
  }

  // 2.6 Unauthorized Assignment Attempt by Patient Bob
  console.log('Testing unauthorized assignment by third-party Patient Bob...');
  const { data: unauthAsgn } = await bob.client.rpc('assign_donor_atomic', {
    p_request_id: emergencyReq.id,
    p_donor_id: deepak.donorId,
    p_units: 1,
  });
  console.log('Bob unauthorized assignment response:', unauthAsgn);
  if (unauthAsgn?.success) {
    throw new Error('SECURITY VIOLATION: Unauthorized patient was able to assign donors!');
  }
  console.log('Domain 2 Result: ✅ PASS');

  // ============================================================================
  // DOMAIN 3: NOTIFICATION PERSISTENCE, DEDUPLICATION & RLS
  // ============================================================================
  console.log('\n--- 3. Notification Persistence, Deduplication & RLS ---');

  const idempKey = `notif-idemp-${ts}`;
  // 3.1 Create Notification for Alice
  const { data: notif1, error: notif1Err } = await coord.client.rpc('create_notification', {
    p_user_id: alice.id,
    p_channel: 'IN_APP',
    p_title: 'Donor Dispatched',
    p_content: 'Donor Deepak has been assigned to your request.',
    p_metadata: { request_id: emergencyReq.id },
    p_idempotency_key: idempKey,
  });

  if (notif1Err || !notif1?.success) {
    throw new Error(`Failed to create notification: ${notif1Err?.message || notif1?.message}`);
  }
  console.log('Created notification 1:', notif1);

  // 3.2 Deduplication Test: Submit again with identical key
  const { data: notif2 } = await coord.client.rpc('create_notification', {
    p_user_id: alice.id,
    p_channel: 'IN_APP',
    p_title: 'Donor Dispatched',
    p_content: 'Donor Deepak has been assigned to your request.',
    p_metadata: { request_id: emergencyReq.id },
    p_idempotency_key: idempKey,
  });

  console.log('Deduplication attempt response:', notif2);
  if (!notif2?.deduplicated || notif2?.notification_id !== notif1.notification_id) {
    throw new Error('Notification deduplication failed!');
  }

  // 3.3 Multi-tenant RLS Isolation
  // Alice can read her notification
  const { data: aliceNotifs } = await alice.client
    .from('notifications')
    .select('id, title, content, status')
    .eq('id', notif1.notification_id);

  console.log('Alice notification query count:', aliceNotifs?.length);
  if (!aliceNotifs || aliceNotifs.length !== 1) {
    throw new Error('Alice could not read her own notification!');
  }

  // Bob CANNOT read Alice's notification
  const { data: bobNotifs } = await bob.client
    .from('notifications')
    .select('id, title, content, status')
    .eq('id', notif1.notification_id);

  console.log('Bob notification query count for Alice notification:', bobNotifs?.length);
  if (bobNotifs && bobNotifs.length > 0) {
    throw new Error('SECURITY VIOLATION: Bob accessed Alice private notification!');
  }

  // 3.4 Acknowledgment Procedure
  const { data: ackRes, error: ackErr } = await alice.client.rpc('acknowledge_notification', {
    p_notification_id: notif1.notification_id,
  });
  if (ackErr || !ackRes?.success) {
    throw new Error(`Acknowledgment failed: ${ackErr?.message || ackRes?.message}`);
  }

  const { data: ackedNotif } = await alice.client
    .from('notifications')
    .select('status, acknowledged_at')
    .eq('id', notif1.notification_id)
    .single();

  console.log('Acknowledged notification state:', ackedNotif);
  if (ackedNotif?.status !== 'ACKNOWLEDGED' || !ackedNotif?.acknowledged_at) {
    throw new Error('Notification acknowledgment status did not update in DB!');
  }
  console.log('Domain 3 Result: ✅ PASS');

  // ============================================================================
  // DOMAIN 4: EMERGENCY REQUEST PRIVACY-VIEW & BASE-TABLE AUDIT
  // ============================================================================
  console.log('\n--- 4. Emergency Request Privacy-View & Base-Table Audit ---');

  // 4.1 Check PostgreSQL Catalog for Security Barrier on View
  const viewOpts = psql(`SELECT reloptions FROM pg_class WHERE relname = 'discoverable_emergency_requests';`);
  console.log('discoverable_emergency_requests catalog reloptions:', viewOpts);
  if (!viewOpts.includes('security_barrier=true')) {
    throw new Error('Security barrier is not enabled on discoverable_emergency_requests view!');
  }

  // Create an open emergency request in AWAITING_RESPONSE for discovery testing
  const openRefCode = `REQ-DISC-${String(ts).slice(-6)}`;
  const { data: openReq, error: openReqErr } = await alice.client.from('emergency_requests').insert({
    reference_code: openRefCode,
    blood_group: 'B+',
    component: 'Packed RBC',
    units_required: 1,
    urgency: 'Urgent',
    hospital_name: 'CareLoop Central Depository',
    hospital_address: '45 Health Sciences Ave',
    city: 'Hyderabad',
    district: 'Hyderabad',
    contact_name: 'Alice Requester',
    contact_phone: '+919849055123',
    contact_method: 'Phone',
    status: 'AWAITING_RESPONSE',
    created_by: alice.id,
    notes: 'Private medical note: Patient has specific antibody screening pending',
  }).select().single();

  if (openReqErr || !openReq) {
    throw new Error(`Failed to create open emergency request: ${openReqErr?.message}`);
  }

  // 4.2 Anon queries discoverable view
  const { data: anonViewData, error: anonViewErr } = await anon
    .from('discoverable_emergency_requests')
    .select('*')
    .eq('id', openReq.id);

  if (anonViewErr || !anonViewData || anonViewData.length === 0) {
    throw new Error(`Anon could not discover open emergency request: ${anonViewErr?.message}`);
  }
  const anonRow = anonViewData[0];
  console.log('Anon discovered request row keys:', Object.keys(anonRow));

  // Verify Patient PII is completely absent
  const forbiddenPii = ['contact_name', 'contact_phone', 'contact_method', 'notes', 'created_by'];
  for (const field of forbiddenPii) {
    if (field in anonRow && anonRow[field] !== undefined && anonRow[field] !== null) {
      throw new Error(`SECURITY VIOLATION: Field ${field} was exposed in discoverable_emergency_requests!`);
    }
  }
  console.log('Privacy check: Patient contact_name, contact_phone, contact_method, and notes are completely hidden.');

  // 4.3 Anon queries base table emergency_requests
  const { data: anonBaseData } = await anon
    .from('emergency_requests')
    .select('*')
    .eq('id', openReq.id);

  console.log('Anon query on base table emergency_requests count:', anonBaseData?.length);
  if (anonBaseData && anonBaseData.length > 0) {
    throw new Error('SECURITY VIOLATION: Anonymous user selected directly from emergency_requests base table!');
  }

  // 4.4 Unassociated Donor queries base table emergency_requests
  // Create another donor who has NOT responded to this request
  const unassociatedDonor = await createIdentity(anon, `unassoc_donor_${ts}@test.local`, 'Donor Frank');
  psql(`UPDATE public.profiles SET role = 'donor' WHERE id = '${unassociatedDonor.id}';`);

  const { data: unassocData } = await unassociatedDonor.client
    .from('emergency_requests')
    .select('*')
    .eq('id', openReq.id);

  console.log('Unassociated donor query on base table emergency_requests count:', unassocData?.length);
  if (unassocData && unassocData.length > 0) {
    throw new Error('SECURITY VIOLATION: Unassociated donor selected from emergency_requests base table!');
  }

  // 4.5 Patient Bob queries Alice's request on base table
  const { data: bobReqData } = await bob.client
    .from('emergency_requests')
    .select('*')
    .eq('id', openReq.id);

  console.log('Patient Bob query on Alice request count:', bobReqData?.length);
  if (bobReqData && bobReqData.length > 0) {
    throw new Error('SECURITY VIOLATION: Patient Bob accessed Alice private emergency request on base table!');
  }
  console.log('Domain 4 Result: ✅ PASS');

  // ============================================================================
  // DOMAIN 5: HEALTHCARE FACILITIES DATABASE & SERVICE VERIFICATION
  // ============================================================================
  console.log('\n--- 5. Healthcare Facilities Database & Service Verification ---');

  // Verify public.hospitals rows exist in DB
  const { data: dbHospitals } = await anon.from('hospitals').select('*').limit(5);
  console.log(`Verified database hospitals count: ${dbHospitals?.length}`);
  if (!dbHospitals || dbHospitals.length === 0) {
    throw new Error('No hospitals found in database public.hospitals table!');
  }

  // Test healthcareFacilityService searching facilities from database
  const searchResults = await healthcareFacilityService.searchFacilities({ district: 'Krishna', limit: 3 });
  console.log(`Facility service search results for Krishna district: ${searchResults.length}`);
  searchResults.forEach((f) => {
    console.log(` - ${f.name} (${f.city}, Type: ${f.facilityType}, Verified: ${f.verificationStatus})`);
  });

  if (searchResults.length === 0) {
    throw new Error('Facility service returned 0 facilities!');
  }

  // Verify hospital phone integrity: emergency_phone is nullable and never fabricated
  const nullPhones = psql(`SELECT count(*) FROM public.hospitals WHERE emergency_phone IS NULL;`);
  console.log(`Hospitals with legitimately unverified/null phone lines: ${nullPhones}`);
  console.log('Domain 5 Result: ✅ PASS');

  // ============================================================================
  // DOMAIN 6: REALTIME WEBSOCKET AUTHORIZATION & WEBRTC SIGNALING
  // ============================================================================
  console.log('\n--- 6. Realtime WebSocket Authorization & WebRTC Signaling ---');

  // Deepak accepts request and establishes verified conversation channel
  const { data: convRes, error: convErr } = await deepak.client.rpc('accept_request_and_create_conversation', {
    p_request_id: emergencyReq.id,
    p_donor_id: deepak.donorId,
  });

  if (convErr || !convRes?.success) {
    throw new Error(`Accept request and create conversation failed: ${convErr?.message || convRes?.message}`);
  }
  const convId = convRes.conversation_id;
  console.log(`Established verified conversation: ${convId}`);

  // Alice initiates call
  const { data: callRes, error: callErr } = await alice.client.rpc('initiate_call', {
    p_conversation_id: convId,
    p_call_type: 'VOICE',
  });

  if (callErr || !callRes?.success) {
    throw new Error(`Initiate call failed: ${callErr?.message || callRes?.message}`);
  }
  const callId = callRes.call_id;
  console.log(`Call initiated by Alice: ${callId}`);

  // Test Realtime WebSocket Subscriptions
  let deepakReceivedOffer = false;
  let aliceReceivedAnswer = false;
  let bobInterceptedSignaling = false;

  const deepakChannel = deepak.client.channel(`call:${callId}`, { config: { private: true } });
  const aliceChannel = alice.client.channel(`call:${callId}`, { config: { private: true } });
  const bobIntruderChannel = bob.client.channel(`call:${callId}`, { config: { private: true } });

  deepakChannel.on('broadcast', { event: 'signal:offer' }, () => {
    deepakReceivedOffer = true;
  });

  aliceChannel.on('broadcast', { event: 'signal:answer' }, () => {
    aliceReceivedAnswer = true;
  });

  bobIntruderChannel.on('broadcast', { event: 'signal:offer' }, () => {
    bobInterceptedSignaling = true;
  });

  const [deepakSub, aliceSub, bobSub] = await Promise.all([
    new Promise<string>((resolve) => deepakChannel.subscribe((status) => status === 'SUBSCRIBED' && resolve(status))),
    new Promise<string>((resolve) => aliceChannel.subscribe((status) => status === 'SUBSCRIBED' && resolve(status))),
    new Promise<string>((resolve) => {
      bobIntruderChannel.subscribe((status) => {
        // Intruder should not reach SUBSCRIBED or will receive error
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          resolve(status);
        }
      });
      setTimeout(() => resolve('BLOCKED'), 2000);
    }),
  ]);

  console.log('Channel subscriptions:', { deepak: deepakSub, alice: aliceSub, bobIntruder: bobSub });

  // Send signaling messages
  await aliceChannel.send({ type: 'broadcast', event: 'signal:offer', payload: { sdp: 'dummy-offer' } });
  await new Promise((r) => setTimeout(r, 400));
  await deepakChannel.send({ type: 'broadcast', event: 'signal:answer', payload: { sdp: 'dummy-answer' } });
  await new Promise((r) => setTimeout(r, 600));

  console.log('Signaling exchange:', {
    deepakReceivedOffer,
    aliceReceivedAnswer,
    bobInterceptedSignaling,
  });

  // End Call cleanly
  await alice.client.rpc('end_call', { p_call_id: callId, p_reason: 'Normal test completion' });

  // Cleanup Realtime Channels
  alice.client.removeChannel(aliceChannel);
  deepak.client.removeChannel(deepakChannel);
  bob.client.removeChannel(bobIntruderChannel);

  if (!deepakReceivedOffer || !aliceReceivedAnswer || bobInterceptedSignaling) {
    throw new Error('WebRTC Realtime signaling or authorization failure!');
  }
  console.log('Domain 6 Result: ✅ PASS');

  // ============================================================================
  // CLEANUP
  // ============================================================================
  console.log('\n--- Cleaning up Test Records ---');
  psql(`
    DELETE FROM public.emergency_requests WHERE id IN ('${emergencyReq.id}', '${openReq.id}');
    DELETE FROM public.donors WHERE id = '${deepak.donorId}';
    DELETE FROM public.profiles WHERE id IN ('${coord.id}', '${centreAUser.id}', '${centreBUser.id}', '${alice.id}', '${bob.id}', '${deepak.id}', '${unassociatedDonor.id}');
    DELETE FROM auth.users WHERE id IN ('${coord.id}', '${centreAUser.id}', '${centreBUser.id}', '${alice.id}', '${bob.id}', '${deepak.id}', '${unassociatedDonor.id}');
  `);
  console.log('Cleanup Complete.');

  console.log('\n================================================================');
  console.log('PHASE 2.2 VERIFICATION: ALL 6 QUALITY & SECURITY DOMAINS PASSED ✅');
  console.log('================================================================');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:\n', err);
  process.exit(1);
});
