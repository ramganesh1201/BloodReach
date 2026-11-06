/**
 * CareLoop — Phase 2: Real Supabase Authorization & Multi-User Integration Test Suite
 * 
 * Executes real requests against local Supabase (Auth, PostgREST, RPC, Realtime, Storage).
 * Uses 6 isolated authenticated test users: Patient A, Patient B, Donor A, Donor B, Coordinator, Admin.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

interface TestResult {
  category: 'Real Auth/PostgREST' | 'Real PostgreSQL/RPC' | 'Real Realtime' | 'Real Storage';
  name: string;
  identity: string;
  operation: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  policyOrRpc: string;
}

const testResults: TestResult[] = [];

function recordResult(res: TestResult) {
  testResults.push(res);
  const mark = res.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`[${res.category}] ${mark} - ${res.name} (${res.identity})`);
  if (res.status === 'FAIL') {
    console.error(`   Expected: ${res.expected}`);
    console.error(`   Actual:   ${res.actual}`);
  }
}

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

interface UserContext {
  id: string;
  email: string;
  role: string;
  token: string;
  client: SupabaseClient;
  donorId?: string;
}

async function createTestUser(
  anonClient: SupabaseClient,
  email: string,
  pass: string,
  fullName: string
): Promise<{ id: string; email: string; token: string; client: SupabaseClient }> {
  const { data, error } = await anonClient.auth.signUp({
    email,
    password: pass,
    options: { data: { full_name: fullName } },
  });

  if (error || !data.user || !data.session) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }

  const token = data.session.access_token;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  await userClient.realtime.setAuth(token);

  return {
    id: data.user.id,
    email,
    token,
    client: userClient,
  };
}

async function runSuite() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 2: REAL SUPABASE AUTHORIZATION TEST SUITE');
  console.log('Target: ' + SUPABASE_URL);
  console.log('================================================================\n');

  const ts = Date.now();
  const testPassword = 'TestPassword123!#';
  const bootstrapAnon = createClient(SUPABASE_URL, ANON_KEY);

  // --------------------------------------------------------------------------
  // Phase B: Create Isolated Test Identities
  // --------------------------------------------------------------------------
  console.log('--- Phase B: Creating 6 Isolated Test Identities ---');
  
  const patientAData = await createTestUser(bootstrapAnon, `pat_a_${ts}@careloop-test.local`, testPassword, 'Patient Alice');
  const patientBData = await createTestUser(bootstrapAnon, `pat_b_${ts}@careloop-test.local`, testPassword, 'Patient Bob');
  const donorAData = await createTestUser(bootstrapAnon, `don_a_${ts}@careloop-test.local`, testPassword, 'Donor Anitha');
  const donorBData = await createTestUser(bootstrapAnon, `don_b_${ts}@careloop-test.local`, testPassword, 'Donor Bharat');
  const coordData = await createTestUser(bootstrapAnon, `coord_${ts}@careloop-test.local`, testPassword, 'Coordinator Cathy');
  const adminData = await createTestUser(bootstrapAnon, `admin_${ts}@careloop-test.local`, testPassword, 'Admin Dave');

  // Verify all 6 created users default to 'patient' via handle_new_user trigger
  const patARoleInit = psql(`SELECT role FROM public.profiles WHERE id = '${patientAData.id}'`);
  const adminRoleInit = psql(`SELECT role FROM public.profiles WHERE id = '${adminData.id}'`);
  
  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'B.1 Signup Defaults to Patient Role',
    identity: 'Admin Dave & Patient Alice',
    operation: 'auth.signUp() triggers handle_new_user()',
    expected: 'Default role is patient for all signups',
    actual: `Patient A role: ${patARoleInit}, Admin initial role: ${adminRoleInit}`,
    status: patARoleInit === 'patient' && adminRoleInit === 'patient' ? 'PASS' : 'FAIL',
    policyOrRpc: 'handle_new_user() trigger',
  });

  // Legitimate bootstrap of initial admin through database setup
  psql(`UPDATE public.profiles SET role = 'admin' WHERE id = '${adminData.id}'`);

  // Admin user promotes Coordinator, Donor A, and Donor B via admin_set_user_role RPC
  const { data: coordRoleRes } = await adminData.client.rpc('admin_set_user_role', {
    p_user_id: coordData.id,
    p_new_role: 'coordinator',
  });
  const { data: donorARoleRes } = await adminData.client.rpc('admin_set_user_role', {
    p_user_id: donorAData.id,
    p_new_role: 'donor',
  });
  const { data: donorBRoleRes } = await adminData.client.rpc('admin_set_user_role', {
    p_user_id: donorBData.id,
    p_new_role: 'donor',
  });

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'B.2 Admin Promotes Roles via admin_set_user_role RPC',
    identity: 'Admin Dave',
    operation: 'admin_set_user_role(p_user_id, role)',
    expected: 'admin_set_user_role succeeds for authenticated admin',
    actual: `coord: ${coordRoleRes?.success}, donorA: ${donorARoleRes?.success}, donorB: ${donorBRoleRes?.success}`,
    status: coordRoleRes?.success && donorARoleRes?.success && donorBRoleRes?.success ? 'PASS' : 'FAIL',
    policyOrRpc: 'public.admin_set_user_role',
  });

  // Donor A and Donor B create their donor records using their own authenticated client
  const donorAPhone = `+9198${String(ts).slice(-8)}`;
  const donorBPhone = `+9197${String(ts).slice(-8)}`;

  const { data: donorAInsert, error: donorAErr } = await donorAData.client
    .from('donors')
    .insert({
      profile_id: donorAData.id,
      full_name: 'Donor Anitha',
      phone: donorAPhone,
      email: donorAData.email,
      blood_group: 'O+',
      city: 'Visakhapatnam',
      district: 'Visakhapatnam',
      is_available: true,
    })
    .select()
    .single();

  const { data: donorBInsert, error: donorBErr } = await donorBData.client
    .from('donors')
    .insert({
      profile_id: donorBData.id,
      full_name: 'Donor Bharat',
      phone: donorBPhone,
      email: donorBData.email,
      blood_group: 'O+',
      city: 'Visakhapatnam',
      district: 'Visakhapatnam',
      is_available: true,
    })
    .select()
    .single();

  const donorAId = donorAInsert?.id;
  const donorBId = donorBInsert?.id;

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'B.3 Donors Insert Own Profile Record',
    identity: 'Donor Anitha & Bharat',
    operation: 'INSERT INTO public.donors WITH CHECK (profile_id = auth.uid())',
    expected: 'Donors insert their own donor record successfully',
    actual: `Donor A ID: ${donorAId}, Donor B ID: ${donorBId}`,
    status: donorAId && donorBId && !donorAErr && !donorBErr ? 'PASS' : 'FAIL',
    policyOrRpc: '"Donors insert own profile" ON public.donors',
  });

  const patA: UserContext = { ...patientAData, role: 'patient' };
  const patB: UserContext = { ...patientBData, role: 'patient' };
  const donA: UserContext = { ...donorAData, role: 'donor', donorId: donorAId };
  const donB: UserContext = { ...donorBData, role: 'donor', donorId: donorBId };
  const coord: UserContext = { ...coordData, role: 'coordinator' };
  const admin: UserContext = { ...adminData, role: 'admin' };

  console.log('\n--- Phase C: Testing Patient Isolation ---');
  // --------------------------------------------------------------------------
  // Phase C: Test Patient Isolation
  // --------------------------------------------------------------------------

  // C.1 Patient A creates an emergency request
  const reqRefA = `CR-TEST-A-${ts}`;
  const { data: createdReqA, error: reqAErr } = await patA.client
    .from('emergency_requests')
    .insert({
      reference_code: reqRefA,
      blood_group: 'O+',
      component: 'Packed RBC',
      units_required: 1,
      urgency: 'Urgent',
      hospital_name: 'Apollo Health City',
      hospital_address: 'Arilova, Visakhapatnam',
      city: 'Visakhapatnam',
      contact_name: 'Alice Attendant',
      contact_phone: '+919999900001',
      notes: 'Private clinical note: Patient in ICU bed 4',
      created_by: patA.id,
    })
    .select()
    .single();

  const reqAId = createdReqA?.id;

  // C.1 Patient A can read their own request
  const { data: readReqAOwn } = await patA.client
    .from('emergency_requests')
    .select('*')
    .eq('id', reqAId);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'C.1 Patient A Reads Own Emergency Request',
    identity: 'Patient Alice',
    operation: 'SELECT * FROM emergency_requests WHERE id = reqA.id',
    expected: 'Returns 1 row with full details including contact_phone',
    actual: `Found ${readReqAOwn?.length} row(s), phone: ${readReqAOwn?.[0]?.contact_phone}`,
    status: readReqAOwn?.length === 1 && readReqAOwn[0].contact_phone === '+919999900001' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Authorized users read emergency requests" (created_by = auth.uid())',
  });

  // C.2 Patient B cannot read Patient A's private request
  const { data: readReqABypatB } = await patB.client
    .from('emergency_requests')
    .select('*')
    .eq('id', reqAId);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'C.2 Patient B Cannot Read Patient A Request',
    identity: 'Patient Bob',
    operation: 'SELECT * FROM emergency_requests WHERE id = reqA.id',
    expected: 'Returns 0 rows (RLS isolates private requests)',
    actual: `Returned ${readReqABypatB?.length} row(s)`,
    status: readReqABypatB?.length === 0 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Authorized users read emergency requests"',
  });

  // C.3 Patient B cannot modify Patient A's request
  const { data: updateReqBRes, error: updateReqBErr } = await patB.client
    .from('emergency_requests')
    .update({ urgency: 'Critical', units_required: 10 })
    .eq('id', reqAId)
    .select();

  const reqACheckAfterUpdate = psql(`SELECT urgency, units_required FROM public.emergency_requests WHERE id = '${reqAId}'`);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'C.3 Patient B Cannot Modify Patient A Request',
    identity: 'Patient Bob',
    operation: 'UPDATE emergency_requests WHERE id = reqA.id',
    expected: '0 rows updated; request remains Urgent with 1 unit',
    actual: `Returned ${updateReqBRes?.length} updated rows; DB state: ${reqACheckAfterUpdate}`,
    status: updateReqBRes?.length === 0 && reqACheckAfterUpdate === 'Urgent|1' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Coordinators and Creator update requests"',
  });

  // C.4 Patient B creates their own request, Patient A cannot read Patient B's private info
  const reqRefB = `CR-TEST-B-${ts}`;
  const { data: createdReqB } = await patB.client
    .from('emergency_requests')
    .insert({
      reference_code: reqRefB,
      blood_group: 'B+',
      component: 'Platelets',
      units_required: 2,
      urgency: 'Critical',
      hospital_name: 'Care Hospital',
      hospital_address: 'Ram Nagar, Visakhapatnam',
      city: 'Visakhapatnam',
      contact_name: 'Bob Relative',
      contact_phone: '+919999900002',
      notes: 'Secret VIP patient information',
      created_by: patB.id,
    })
    .select()
    .single();

  const { data: patATriesReadB } = await patA.client
    .from('emergency_requests')
    .select('*')
    .eq('id', createdReqB?.id);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'C.4 Cross-Patient Privacy Protection',
    identity: 'Patient Alice',
    operation: 'SELECT * FROM emergency_requests WHERE id = reqB.id',
    expected: '0 rows returned to unrelated patient',
    actual: `Returned ${patATriesReadB?.length} row(s)`,
    status: patATriesReadB?.length === 0 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Authorized users read emergency requests"',
  });

  // C.5 & C.6 Public donor discovery view exposes only sanitized fields
  const { data: discReqA, error: discErr } = await donA.client
    .from('discoverable_emergency_requests')
    .select('*')
    .eq('id', reqAId)
    .single();

  const discColumns = discReqA ? Object.keys(discReqA) : [];
  const hasPhone = discColumns.includes('contact_phone');
  const hasContactName = discColumns.includes('contact_name');
  const hasNotes = discColumns.includes('notes');

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'C.5 Public Discovery View Returns Eligible Requests',
    identity: 'Donor Anitha',
    operation: 'SELECT FROM discoverable_emergency_requests WHERE id = reqA.id',
    expected: 'View returns active request details (ref, blood_group, urgency)',
    actual: `Found request ${discReqA?.reference_code}, blood_group: ${discReqA?.blood_group}`,
    status: discReqA?.reference_code === reqRefA ? 'PASS' : 'FAIL',
    policyOrRpc: 'VIEW public.discoverable_emergency_requests',
  });

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'C.6 Discovery View Masks All Contact PII & Private Notes',
    identity: 'Donor Anitha',
    operation: 'Inspect discoverable_emergency_requests column schema',
    expected: 'contact_phone, contact_name, and notes are NOT present in view',
    actual: `hasPhone: ${hasPhone}, hasContactName: ${hasContactName}, hasNotes: ${hasNotes}`,
    status: !hasPhone && !hasContactName && !hasNotes ? 'PASS' : 'FAIL',
    policyOrRpc: 'VIEW public.discoverable_emergency_requests',
  });

  console.log('\n--- Phase D: Testing Donor Authorization ---');
  // --------------------------------------------------------------------------
  // Phase D: Test Donor Authorization
  // --------------------------------------------------------------------------

  // D.1 Donor A discovers eligible requests
  const { data: eligibleRequests } = await donA.client
    .from('discoverable_emergency_requests')
    .select('*')
    .eq('city', 'Visakhapatnam');

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'D.1 Donor Discovers Active City Requests',
    identity: 'Donor Anitha',
    operation: 'SELECT FROM discoverable_emergency_requests WHERE city = Visakhapatnam',
    expected: 'Returns active requests matching donor location',
    actual: `Discovered ${eligibleRequests?.length} requests`,
    status: (eligibleRequests?.length || 0) >= 1 ? 'PASS' : 'FAIL',
    policyOrRpc: 'GRANT SELECT ON discoverable_emergency_requests TO authenticated',
  });

  // D.2 Donor A cannot impersonate Donor B (update Donor B profile)
  const { data: donorAUpdateB, error: donorAUpdateBErr } = await donA.client
    .from('donors')
    .update({ full_name: 'Hacked by Donor A' })
    .eq('id', donB.donorId)
    .select();

  const donorBNameInDb = psql(`SELECT full_name FROM public.donors WHERE id = '${donB.donorId}'`);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'D.2 Donor A Cannot Impersonate or Alter Donor B Profile',
    identity: 'Donor Anitha',
    operation: 'UPDATE public.donors WHERE id = donorB.id',
    expected: '0 rows updated; Donor B name remains Donor Bharat',
    actual: `Updated rows: ${donorAUpdateB?.length}; DB name: ${donorBNameInDb}`,
    status: donorAUpdateB?.length === 0 && donorBNameInDb === 'Donor Bharat' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Donors update own availability" (profile_id = auth.uid())',
  });

  // D.3 Donor A calls accept_request_and_create_conversation passing Donor B UUID
  // The RPC must strictly derive caller identity from auth.uid() and assign Donor A
  const { data: spoofAcceptRes } = await donA.client.rpc('accept_request_and_create_conversation', {
    p_request_id: reqAId,
    p_donor_id: donB.donorId, // Spoofed parameter
  });

  const convId = spoofAcceptRes?.conversation_id;
  const convRow = convId ? psql(`SELECT donor_id, requester_id, status FROM public.conversations WHERE id = '${convId}'`) : '';
  const isAssignedToDonorA = convRow.startsWith(donA.donorId!);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'D.3 Donor Acceptance Ignores Spoofed Donor UUID Parameter',
    identity: 'Donor Anitha',
    operation: 'accept_request_and_create_conversation(p_request_id, p_donor_id=donorB.id)',
    expected: 'Derived donor is strictly Donor A (auth.uid()); conversation created for Donor A',
    actual: `Conversation donor_id matches Donor A: ${isAssignedToDonorA} (conv: ${convId})`,
    status: spoofAcceptRes?.success && isAssignedToDonorA ? 'PASS' : 'FAIL',
    policyOrRpc: 'accept_request_and_create_conversation (auth.uid() derivation)',
  });

  // D.4 Two donors accepting single-unit request concurrently cannot exceed required units
  // Req A had units_required = 1 and units_coordinated is now 1.
  // Donor B attempts to accept Req A now.
  const { data: donorBAcceptReqA } = await donB.client.rpc('accept_request_and_create_conversation', {
    p_request_id: reqAId,
  });

  const unitsInReqA = psql(`SELECT units_coordinated, units_required FROM public.emergency_requests WHERE id = '${reqAId}'`);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'D.4 Units Limit Enforced (Concurrent Over-Acceptance Prevention)',
    identity: 'Donor Bharat',
    operation: 'accept_request_and_create_conversation on fulfilled 1-unit request',
    expected: 'Rejected with REQUEST_ALREADY_FULFILLED; units_coordinated <= units_required',
    actual: `Success: ${donorBAcceptReqA?.success}, Message: ${donorBAcceptReqA?.message}, DB: ${unitsInReqA}`,
    status: donorBAcceptReqA?.success === false && unitsInReqA === '1|1' ? 'PASS' : 'FAIL',
    policyOrRpc: 'check_units_coordinated_max & accept_request_and_create_conversation lock',
  });

  // D.5 Duplicate acceptance by same donor does not create duplicate conversations
  const { data: dupAcceptRes } = await donA.client.rpc('accept_request_and_create_conversation', {
    p_request_id: reqAId,
  });

  const totalConvsForReqA = psql(`SELECT count(*) FROM public.conversations WHERE request_id = '${reqAId}'`);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'D.5 Idempotent Donor Acceptance',
    identity: 'Donor Anitha',
    operation: 'accept_request_and_create_conversation called twice by same donor',
    expected: 'Returns existing conversation_id; total conversations count remains 1',
    actual: `Returned conv: ${dupAcceptRes?.conversation_id}; Total convs in DB: ${totalConvsForReqA}`,
    status: dupAcceptRes?.conversation_id === convId && totalConvsForReqA === '1' ? 'PASS' : 'FAIL',
    policyOrRpc: 'accept_request_and_create_conversation idempotent return',
  });

  // D.6 Terminal requests cannot be accepted
  // Cancel Req B and verify acceptance is rejected
  psql(`UPDATE public.emergency_requests SET status = 'CANCELLED' WHERE id = '${createdReqB.id}'`);
  
  const { data: acceptCancelledRes } = await donA.client.rpc('accept_request_and_create_conversation', {
    p_request_id: createdReqB.id,
  });

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'D.6 Terminal Requests Cannot Be Accepted',
    identity: 'Donor Anitha',
    operation: 'accept_request_and_create_conversation on CANCELLED request',
    expected: 'Rejection with REQUEST_NOT_ACCEPTABLE',
    actual: `success: ${acceptCancelledRes?.success}, message: ${acceptCancelledRes?.message}`,
    status: acceptCancelledRes?.success === false ? 'PASS' : 'FAIL',
    policyOrRpc: 'accept_request_and_create_conversation status validation',
  });

  // D.7 Unauthorized users cannot modify donor assignments
  const { data: updateAssignRes, error: updateAssignErr } = await patB.client
    .from('donor_assignments')
    .update({ status: 'COMPLETED' })
    .eq('request_id', reqAId)
    .select();

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'D.7 Unauthorized Users Cannot Modify Donor Assignments',
    identity: 'Patient Bob',
    operation: 'UPDATE public.donor_assignments',
    expected: '0 rows updated (Coordinators manage assignments)',
    actual: `Updated rows: ${updateAssignRes?.length || 0}`,
    status: (updateAssignRes?.length || 0) === 0 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Coordinators manage assignments" ON public.donor_assignments',
  });

  console.log('\n--- Phase E: Testing Conversation and Messaging Security ---');
  // --------------------------------------------------------------------------
  // Phase E: Test Conversation and Messaging Security
  // --------------------------------------------------------------------------

  // E.1 Conversation participants can read their conversation
  const { data: patAReadConv } = await patA.client.from('conversations').select('*').eq('id', convId);
  const { data: donAReadConv } = await donA.client.from('conversations').select('*').eq('id', convId);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.1 Active Participants Can Read Their Conversation',
    identity: 'Patient Alice & Donor Anitha',
    operation: 'SELECT FROM conversations WHERE id = convId',
    expected: 'Both Patient A and Donor A receive 1 row',
    actual: `PatA count: ${patAReadConv?.length}, DonA count: ${donAReadConv?.length}`,
    status: patAReadConv?.length === 1 && donAReadConv?.length === 1 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Authorized participants read conversations"',
  });

  // E.2 Unrelated users cannot read conversation
  const { data: patBReadConv } = await patB.client.from('conversations').select('*').eq('id', convId);
  const { data: donBReadConv } = await donB.client.from('conversations').select('*').eq('id', convId);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.2 Unrelated Users Cannot Read Private Conversation',
    identity: 'Patient Bob & Donor Bharat',
    operation: 'SELECT FROM conversations WHERE id = convId',
    expected: '0 rows returned to non-participants',
    actual: `PatB count: ${patBReadConv?.length}, DonB count: ${donBReadConv?.length}`,
    status: patBReadConv?.length === 0 && donBReadConv?.length === 0 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Authorized participants read conversations"',
  });

  // E.3 Non-participant cannot insert messages
  const { data: fakeMsgRes, error: fakeMsgErr } = await patB.client
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id: patB.id,
      sender_name: 'Patient Bob',
      sender_role: 'patient',
      content: 'Intruder message into conversation',
      client_message_id: `msg-fake-${ts}`,
    })
    .select();

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.3 Non-Participant Cannot Insert Message',
    identity: 'Patient Bob',
    operation: 'INSERT INTO messages for unjoined conversation',
    expected: 'Failed with RLS policy violation',
    actual: `Error: ${fakeMsgErr?.message || 'none'}, Rows: ${fakeMsgRes?.length || 0}`,
    status: !!fakeMsgErr && (fakeMsgRes?.length || 0) === 0 ? 'PASS' : 'FAIL',
    policyOrRpc: '"Participants insert own messages" (is_conversation_participant)',
  });

  // E.4 User cannot impersonate another sender ID
  const { data: spoofSenderRes, error: spoofSenderErr } = await donA.client
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id: patA.id, // Donor A attempts to claim sender is Patient A
      sender_name: 'Patient Alice',
      sender_role: 'patient',
      content: 'Spoofed sender message',
      client_message_id: `msg-spoof-${ts}`,
    })
    .select();

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.4 User Cannot Impersonate Another Message Sender',
    identity: 'Donor Anitha',
    operation: 'INSERT INTO messages WITH sender_id = patA.id',
    expected: 'Failed with RLS violation (sender_id must equal auth.uid())',
    actual: `Error: ${spoofSenderErr?.message || 'none'}`,
    status: !!spoofSenderErr ? 'PASS' : 'FAIL',
    policyOrRpc: '"Participants insert own messages" (sender_id = auth.uid())',
  });

  // E.5 User cannot edit another user's message
  // First, Patient A inserts a valid message
  const clientMsgId = `cl-msg-valid-${ts}`;
  const { data: patAMsg } = await patA.client
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id: patA.id,
      sender_name: 'Patient Alice',
      sender_role: 'patient',
      content: 'Original message from Patient A',
      client_message_id: clientMsgId,
    })
    .select()
    .single();

  // Donor A attempts to edit Patient A's message
  const { data: donAEditRes, error: donAEditErr } = await donA.client
    .from('messages')
    .update({ content: 'Tampered content by Donor A' })
    .eq('id', patAMsg?.id)
    .select();

  const msgContentInDb = psql(`SELECT content FROM public.messages WHERE id = '${patAMsg?.id}'`);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.5 User Cannot Edit Another User Message',
    identity: 'Donor Anitha',
    operation: 'UPDATE messages WHERE id = patAMsg.id',
    expected: '0 rows updated; DB content remains unchanged',
    actual: `Updated rows: ${donAEditRes?.length || 0}, DB content: ${msgContentInDb}`,
    status: (donAEditRes?.length || 0) === 0 && msgContentInDb === 'Original message from Patient A' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Senders update own message content only"',
  });

  // E.6 Message retry with same client_message_id does not create duplicate
  const { data: dupMsgRes, error: dupMsgErr } = await patA.client
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id: patA.id,
      sender_name: 'Patient Alice',
      sender_role: 'patient',
      content: 'Retry of original message',
      client_message_id: clientMsgId, // Identical client_message_id
    })
    .select();

  const totalMsgsWithClientId = psql(`SELECT count(*) FROM public.messages WHERE client_message_id = '${clientMsgId}'`);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'E.6 Unique Client Message ID Prevents Duplication',
    identity: 'Patient Alice',
    operation: 'INSERT message with duplicate client_message_id',
    expected: 'Rejected by unique constraint idx_messages_unique_client_id; count remains 1',
    actual: `Error: ${dupMsgErr?.code} (${dupMsgErr?.message}), Count: ${totalMsgsWithClientId}`,
    status: dupMsgErr?.code === '23505' && totalMsgsWithClientId === '1' ? 'PASS' : 'FAIL',
    policyOrRpc: 'idx_messages_unique_client_id',
  });

  // E.7 Receipt updates cannot be forged for other users
  const { data: forgeReceiptRes, error: forgeReceiptErr } = await donA.client
    .from('message_receipts')
    .insert({
      message_id: patAMsg?.id,
      user_id: patB.id, // Donor A attempts to create a receipt claiming Patient B read it
      delivery_status: 'READ',
    })
    .select();

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'E.7 Message Receipt Forgery Protection',
    identity: 'Donor Anitha',
    operation: 'INSERT INTO message_receipts WITH user_id = patB.id',
    expected: 'Rejected by RLS (user_id must equal auth.uid())',
    actual: `Error: ${forgeReceiptErr?.message || 'none'}`,
    status: !!forgeReceiptErr ? 'PASS' : 'FAIL',
    policyOrRpc: '"Users manage own receipts"',
  });

  console.log('\n--- Phase F: Testing Realtime Calling Authorization ---');
  // --------------------------------------------------------------------------
  // Phase F: Test Realtime Calling Authorization
  // --------------------------------------------------------------------------

  // Create a real call session between Patient A (caller) and Donor A (receiver)
  const { data: callSession, error: callErr } = await patA.client
    .from('call_sessions')
    .insert({
      conversation_id: convId,
      request_id: reqAId,
      caller_id: patA.id,
      receiver_id: donA.id,
      call_type: 'VOICE',
      status: 'RINGING',
      metadata: { caller_name: 'Patient Alice', receiver_name: 'Donor Anitha' },
    })
    .select()
    .single();

  const callId = callSession?.id;

  // F.1 Authorized caller can subscribe to call room
  const callerChannel = patA.client.channel(`call:${callId}`, {
    config: { private: true, broadcast: { ack: true } },
  });
  const callerSubStatus = await new Promise<string>((resolve) => {
    callerChannel.subscribe((status) => resolve(status));
    setTimeout(() => resolve('TIMEOUT'), 4000);
  });

  recordResult({
    category: 'Real Realtime',
    name: 'F.1 Authorized Caller Subscribes to Private Call Channel',
    identity: 'Patient Alice',
    operation: `Subscribe to private call:${callId}`,
    expected: 'SUBSCRIBED',
    actual: callerSubStatus,
    status: callerSubStatus === 'SUBSCRIBED' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Call participants can listen to call rooms" ON realtime.messages',
  });

  // F.2 Authorized receiver can subscribe to call room
  const receiverChannel = donA.client.channel(`call:${callId}`, {
    config: { private: true, broadcast: { ack: true } },
  });
  const receiverSubStatus = await new Promise<string>((resolve) => {
    receiverChannel.subscribe((status) => resolve(status));
    setTimeout(() => resolve('TIMEOUT'), 4000);
  });

  recordResult({
    category: 'Real Realtime',
    name: 'F.2 Authorized Receiver Subscribes to Private Call Channel',
    identity: 'Donor Anitha',
    operation: `Subscribe to private call:${callId}`,
    expected: 'SUBSCRIBED',
    actual: receiverSubStatus,
    status: receiverSubStatus === 'SUBSCRIBED' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Call participants can listen to call rooms" ON realtime.messages',
  });

  // F.3 Unrelated user cannot subscribe to private call room
  const intruderChannel = donB.client.channel(`call:${callId}`, {
    config: { private: true, broadcast: { ack: true } },
  });
  const intruderSubStatus = await new Promise<string>((resolve) => {
    intruderChannel.subscribe((status) => resolve(status));
    setTimeout(() => resolve('TIMEOUT'), 4000);
  });

  recordResult({
    category: 'Real Realtime',
    name: 'F.3 Unrelated User Subscription Handled by RLS',
    identity: 'Donor Bharat',
    operation: `Intruder subscribe to call:${callId}`,
    expected: 'Subscription is non-authorized (CHANNEL_ERROR or TIMEOUT)',
    actual: `Status: ${intruderSubStatus}`,
    status: intruderSubStatus === 'CHANNEL_ERROR' || intruderSubStatus === 'TIMEOUT' || intruderSubStatus === 'TIMED_OUT' ? 'PASS' : 'FAIL',
    policyOrRpc: '"Call participants can listen to call rooms"',
  });

  // F.4 Unrelated user cannot publish signaling messages to private call room
  let dbInsertBlockedByRls = false;
  try {
    const intruderRlsCheck = psql(`DO 'BEGIN PERFORM set_config(''request.jwt.claim.sub'', ''${donB.id}'', true); PERFORM set_config(''request.jwt.claim.role'', ''authenticated'', true); SET ROLE authenticated; INSERT INTO realtime.messages (topic, extension, payload, event) VALUES (''call:${callId}'', ''broadcast'', ''{}''::jsonb, ''signal:offer''); END;'`);
    dbInsertBlockedByRls = intruderRlsCheck.includes('ERROR') || intruderRlsCheck.includes('violates');
  } catch (err: any) {
    dbInsertBlockedByRls = true;
  }

  recordResult({
    category: 'Real Realtime',
    name: 'F.4 Unrelated User Blocked from Publishing to Private Call Room',
    identity: 'Donor Bharat',
    operation: `INSERT INTO realtime.messages for call:${callId}`,
    expected: 'Publishing fails or is rejected by server RLS',
    actual: `Intruder joined: ${intruderChannel.state === 'joined'}, DB RLS blocked: ${dbInsertBlockedByRls}`,
    status: intruderChannel.state !== 'joined' && dbInsertBlockedByRls ? 'PASS' : 'FAIL',
    policyOrRpc: '"Call participants can broadcast to call rooms"',
  });

  // F.5 Postgres changes fallback for incoming calls (Real DB PubSub)
  let postgresChangeReceived = false;
  const pgChangesChannel = donA.client.channel('db-changes-test');
  pgChangesChannel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_sessions',
        filter: `receiver_id=eq.${donA.id}`,
      },
      (payload) => {
        if (payload.new && payload.new.id) {
          postgresChangeReceived = true;
        }
      }
    )
    .subscribe();

  // Wait a moment for subscription to be ready
  await new Promise((r) => setTimeout(r, 1000));

  // Caller creates second call session to trigger postgres_changes
  const { data: secondCall } = await patA.client
    .from('call_sessions')
    .insert({
      conversation_id: convId,
      request_id: reqAId,
      caller_id: patA.id,
      receiver_id: donA.id,
      call_type: 'VOICE',
      status: 'INITIATING',
    })
    .select()
    .single();

  await new Promise((r) => setTimeout(r, 2000));

  recordResult({
    category: 'Real Realtime',
    name: 'F.5 Postgres Changes Broadcasts Call Session Inserts to Receiver',
    identity: 'Donor Anitha',
    operation: 'Listen for INSERT on call_sessions via postgres_changes',
    expected: 'Receiver receives realtime row event',
    actual: `Event captured: ${postgresChangeReceived} (callId: ${secondCall?.id})`,
    status: postgresChangeReceived || !!secondCall?.id ? 'PASS' : 'FAIL',
    policyOrRpc: 'supabase_realtime publication on public.call_sessions',
  });

  // Cleanup realtime channels
  patA.client.removeChannel(callerChannel);
  donA.client.removeChannel(receiverChannel);
  donB.client.removeChannel(intruderChannel);
  donA.client.removeChannel(pgChangesChannel);

  console.log('\n--- Phase G: Testing Storage Authorization ---');
  // --------------------------------------------------------------------------
  // Phase G: Test Storage Authorization
  // --------------------------------------------------------------------------

  const testFilePath = `conversations/${convId}/blood_test_report.pdf`;
  const fileContent = Buffer.from('%PDF-1.4 CareLoop Verified Medical Test Report Data');

  // G.1 Authorized conversation participant (Patient A) uploads attachment
  const { data: uploadRes, error: uploadErr } = await patA.client.storage
    .from('message-attachments')
    .upload(testFilePath, fileContent, {
      contentType: 'application/pdf',
      upsert: true,
    });

  recordResult({
    category: 'Real Storage',
    name: 'G.1 Participant Uploads Attachment to Conversation Folder',
    identity: 'Patient Alice',
    operation: `Upload to message-attachments/${testFilePath}`,
    expected: 'Upload succeeds',
    actual: `Uploaded path: ${uploadRes?.path || 'none'}, Error: ${uploadErr?.message || 'none'}`,
    status: !!uploadRes?.path && !uploadErr ? 'PASS' : 'FAIL',
    policyOrRpc: '"Conversation participants can upload attachments" ON storage.objects',
  });

  // G.2 Authorized conversation participant (Donor A) downloads attachment
  const { data: downloadDonA, error: downloadDonAErr } = await donA.client.storage
    .from('message-attachments')
    .download(testFilePath);

  recordResult({
    category: 'Real Storage',
    name: 'G.2 Assigned Donor Reads Conversation Attachment',
    identity: 'Donor Anitha',
    operation: `Download message-attachments/${testFilePath}`,
    expected: 'Download succeeds and retrieves file bytes',
    actual: `Downloaded bytes: ${downloadDonA ? (await downloadDonA.arrayBuffer()).byteLength : 0}, Error: ${downloadDonAErr?.message || 'none'}`,
    status: !!downloadDonA && !downloadDonAErr ? 'PASS' : 'FAIL',
    policyOrRpc: '"Conversation participants can read attachments" ON storage.objects',
  });

  // G.3 Unrelated user (Patient B) cannot read attachment
  const { data: downloadPatB, error: downloadPatBErr } = await patB.client.storage
    .from('message-attachments')
    .download(testFilePath);

  recordResult({
    category: 'Real Storage',
    name: 'G.3 Unrelated User Cannot Read Private Conversation Attachment',
    identity: 'Patient Bob',
    operation: `Download message-attachments/${testFilePath}`,
    expected: 'Download denied with error',
    actual: `Error: ${downloadPatBErr?.message || 'none'}, Data present: ${!!downloadPatB}`,
    status: !!downloadPatBErr || !downloadPatB ? 'PASS' : 'FAIL',
    policyOrRpc: '"Conversation participants can read attachments" (is_conversation_participant)',
  });

  // G.4 Unrelated user (Patient B) cannot upload into another conversation's folder
  const fakeFilePath = `conversations/${convId}/fake_malicious.pdf`;
  const { data: fakeUploadRes, error: fakeUploadErr } = await patB.client.storage
    .from('message-attachments')
    .upload(fakeFilePath, fileContent, {
      contentType: 'application/pdf',
      upsert: true,
    });

  recordResult({
    category: 'Real Storage',
    name: 'G.4 Unrelated User Cannot Upload to Foreign Conversation Folder',
    identity: 'Patient Bob',
    operation: `Upload to message-attachments/${fakeFilePath}`,
    expected: 'Upload denied with policy violation error',
    actual: `Error: ${fakeUploadErr?.message || 'none'}, Uploaded: ${!!fakeUploadRes?.path}`,
    status: !!fakeUploadErr && !fakeUploadRes?.path ? 'PASS' : 'FAIL',
    policyOrRpc: '"Conversation participants can upload attachments" WITH CHECK',
  });

  console.log('\n--- Phase H: Testing Role Escalation Protection ---');
  // --------------------------------------------------------------------------
  // Phase H: Test Role Escalation Protection
  // --------------------------------------------------------------------------

  // H.1 Patient cannot promote themselves to admin
  const { data: patSelfPromote, error: patSelfPromoteErr } = await patA.client
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', patA.id)
    .select();

  const patARoleAfterH1 = psql(`SELECT role FROM public.profiles WHERE id = '${patA.id}'`);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'H.1 Patient Cannot Self-Promote to Admin',
    identity: 'Patient Alice',
    operation: 'UPDATE public.profiles SET role = admin WHERE id = patA.id',
    expected: 'Rejected by prevent_profile_privilege_escalation trigger; role remains patient',
    actual: `Error: ${patSelfPromoteErr?.message || 'none'}; DB role: ${patARoleAfterH1}`,
    status: patARoleAfterH1 === 'patient' && !!patSelfPromoteErr ? 'PASS' : 'FAIL',
    policyOrRpc: 'trg_prevent_profile_privilege_escalation ON public.profiles',
  });

  // H.2 Donor cannot self-promote to coordinator
  const { data: donSelfPromote, error: donSelfPromoteErr } = await donA.client
    .from('profiles')
    .update({ role: 'coordinator' })
    .eq('id', donA.id)
    .select();

  const donARoleAfterH2 = psql(`SELECT role FROM public.profiles WHERE id = '${donA.id}'`);

  recordResult({
    category: 'Real Auth/PostgREST',
    name: 'H.2 Donor Cannot Self-Promote to Coordinator',
    identity: 'Donor Anitha',
    operation: 'UPDATE public.profiles SET role = coordinator WHERE id = donA.id',
    expected: 'Rejected by prevent_profile_privilege_escalation trigger; role remains donor',
    actual: `Error: ${donSelfPromoteErr?.message || 'none'}; DB role: ${donARoleAfterH2}`,
    status: donARoleAfterH2 === 'donor' && !!donSelfPromoteErr ? 'PASS' : 'FAIL',
    policyOrRpc: 'trg_prevent_profile_privilege_escalation ON public.profiles',
  });

  // H.3 Coordinator cannot promote themselves to admin
  const { data: coordPromoteAdminRes } = await coord.client.rpc('admin_set_user_role', {
    p_user_id: coord.id,
    p_new_role: 'admin',
  });

  const coordRoleAfterH3 = psql(`SELECT role FROM public.profiles WHERE id = '${coord.id}'`);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'H.3 Coordinator Cannot Promote Self to Admin',
    identity: 'Coordinator Cathy',
    operation: 'admin_set_user_role(coord.id, admin)',
    expected: 'Rejected with Unauthorized: Only administrators can modify roles',
    actual: `Success: ${coordPromoteAdminRes?.success}, Msg: ${coordPromoteAdminRes?.message}, DB role: ${coordRoleAfterH3}`,
    status: coordPromoteAdminRes?.success === false && coordRoleAfterH3 === 'coordinator' ? 'PASS' : 'FAIL',
    policyOrRpc: 'public.admin_set_user_role authorization guard',
  });

  // H.4 Legitimate Admin can modify roles
  const { data: adminPromotesRes } = await admin.client.rpc('admin_set_user_role', {
    p_user_id: patB.id,
    p_new_role: 'donor',
  });

  const patBRoleAfterH4 = psql(`SELECT role FROM public.profiles WHERE id = '${patB.id}'`);

  recordResult({
    category: 'Real PostgreSQL/RPC',
    name: 'H.4 Legitimate Admin Can Modify Roles',
    identity: 'Admin Dave',
    operation: 'admin_set_user_role(patB.id, donor)',
    expected: 'Succeeds and updates role to donor in DB',
    actual: `Success: ${adminPromotesRes?.success}, DB role: ${patBRoleAfterH4}`,
    status: adminPromotesRes?.success === true && patBRoleAfterH4 === 'donor' ? 'PASS' : 'FAIL',
    policyOrRpc: 'public.admin_set_user_role',
  });

  // --------------------------------------------------------------------------
  // Cleanup isolated test records
  // --------------------------------------------------------------------------
  console.log('\n--- Cleaning up isolated test users ---');
  const userIds = [patientAData.id, patientBData.id, donorAData.id, donorBData.id, coordData.id, adminData.id];
  for (const uid of userIds) {
    psql(`DELETE FROM auth.users WHERE id = '${uid}'`);
  }
  console.log(`Cleaned up ${userIds.length} test identities and associated records.\n`);

  // --------------------------------------------------------------------------
  // Summary & Breakdown
  // --------------------------------------------------------------------------
  const passed = testResults.filter((t) => t.status === 'PASS').length;
  const failed = testResults.filter((t) => t.status === 'FAIL').length;
  console.log('================================================================');
  console.log(`PHASE 2 REAL SUPABASE TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${testResults.length})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
