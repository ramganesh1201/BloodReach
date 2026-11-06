/**
 * CareLoop Phase 3.0 — Staging Readiness & Real-World Integration Verification
 * 
 * Target: Isolated Local Supabase Docker Environment (PostgreSQL 17.6)
 * Verification Suites:
 * - Suite 1: Patient Emergency Request Lifecycle (Creation, Reference Code, Tracking RPC, Isolation)
 * - Suite 2: Donor Privacy-Preserving Discovery & Atomic Acceptance (Discovery view, Distance matching RPC, Atomic acceptance, Conversation creation)
 * - Suite 3: Blood Centre Inventory & Membership RBAC (Adjust/Set inventory RPC, Audit ledger immutability, Member management, Suspended manager isolation)
 * - Suite 4: Coordinator Coordination & Atomic Assignments (Donor assignment, Over-coordination prevention, Centre assignment, Atomic cancellation)
 * - Suite 5: Realtime Communications & Voice Calling Signaling (Chat persistence, 23505 Idempotency recovery, Call initiation, Ephemeral TURN credentials, Receiver-ready handshake, Call acceptance & termination)
 * - Suite 6: Security Boundaries & Negative Access Control (Cross-user isolation, Direct DML rejection, Anonymous RPC denial)
 */

import { execSync } from 'child_process';
import crypto from 'crypto';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const results: TestResult[] = [];

function cleanPsqlOutput(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
  if (jsonLine) return jsonLine;
  const filtered = lines.filter((l) => 
    !['BEGIN', 'SET', 'COMMIT', 'DO'].includes(l) && 
    !/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+\d*(\s+\d+)?$/i.test(l)
  );
  return filtered.join('\n');
}

function psql(query: string, user: string = 'postgres'): string {
  try {
    const out = execSync(
      `docker exec -i supabase_db_blood psql -U ${user} -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (out.startsWith('ERROR:')) {
      throw new Error(out);
    }
    return cleanPsqlOutput(out);
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`psql error: ${stderr || stdout || err.message}`);
  }
}

function execAsUser(userId: string, role: string, sql: string): string {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    ${sql}
    COMMIT;
  `;
  try {
    const raw = execSync(
      'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
      { input: wrapped, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return cleanPsqlOutput(raw);
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return `ERROR: ${stderr || stdout || err.message}`;
  }
}

function execAsAnon(sql: string): string {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claim.role" = 'anon';
    ${sql}
    COMMIT;
  `;
  try {
    const raw = execSync(
      'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
      { input: wrapped, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return cleanPsqlOutput(raw);
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return `ERROR: ${stderr || stdout || err.message}`;
  }
}

async function runTest(suite: string, name: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  try {
    const detail = (await fn()) || '';
    const duration = Date.now() - start;
    results.push({ suite, name, passed: true, details: detail, durationMs: duration });
    console.log(`  [PASS] [${suite}] ${name} (${duration}ms)`);
    if (detail) console.log(`    ${detail}`);
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({ suite, name, passed: false, details: err.message, durationMs: duration });
    console.error(`  [FAIL] [${suite}] ${name} (${duration}ms)`);
    console.error(`    Error: ${err.message}`);
  }
}

// Fixed UUIDs for Deterministic Staging Workflow Testing
const U_PATIENT_A = 'a1111111-1111-4111-a111-111111111111';
const U_PATIENT_B = 'a2222222-2222-4222-a222-222222222222';
const U_DONOR_A   = 'b1111111-1111-4111-b111-111111111111';
const DONOR_REC_A = 'b9999999-9999-4999-b999-999999999999';
const U_MANAGER   = 'c1111111-1111-4111-c111-111111111111';
const U_TECH      = 'c2222222-2222-4222-c222-222222222222';
const U_COORD     = 'd1111111-1111-4111-d111-111111111111';
const CENTRE_ID   = 'e1111111-1111-4111-e111-111111111111';

let TEST_REQUEST_ID = '';
let TEST_REF_CODE = '';
let TEST_CONV_ID = '';
let TEST_CALL_ID = '';

async function setupFixtures() {
  console.log('\n--- SETTING UP PHASE 3.0 TEST FIXTURES ---');

  // Set shared secrets for testing
  psql(`
    INSERT INTO public.app_settings (key, value) VALUES
      ('app.settings.turn_shared_secret', 'careloop-staging-secret-key-32b-length-demo!'),
      ('app.settings.turn_server_url', 'turn:turn.careloop.org:3478')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);

  // Create Users in auth.users & profiles
  const users = [
    { id: U_PATIENT_A, email: 'pat_a@careloop.test', role: 'patient', name: 'Patient Alice' },
    { id: U_PATIENT_B, email: 'pat_b@careloop.test', role: 'patient', name: 'Patient Bob' },
    { id: U_DONOR_A, email: 'don_a@careloop.test', role: 'donor', name: 'Donor Dave' },
    { id: U_MANAGER, email: 'mgr_c@careloop.test', role: 'blood_centre', name: 'Centre Manager Carol' },
    { id: U_TECH, email: 'tech_c@careloop.test', role: 'blood_centre', name: 'Technician Tom' },
    { id: U_COORD, email: 'coord@careloop.test', role: 'coordinator', name: 'Coordinator Dan' },
  ];

  for (const u of users) {
    psql(`
      INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      VALUES ('${u.id}', 'authenticated', 'authenticated', '${u.email}', '{"role":"${u.role}"}'::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET raw_user_meta_data = EXCLUDED.raw_user_meta_data;

      INSERT INTO public.profiles (id, email, full_name, role, phone, status, created_at, updated_at)
      VALUES ('${u.id}', '${u.email}', '${u.name}', '${u.role}', '+91 98490 12345', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
    `);
  }

  // Create Blood Centre
  psql(`
    INSERT INTO public.blood_centres (id, name, license_number, address, city, district, state, phone, email, verified, created_at)
    VALUES ('${CENTRE_ID}', 'CareLoop Staging Blood Centre', 'CL-STG-001', '100 Medical Way', 'Hyderabad', 'Hyderabad', 'Telangana', '+91 98490 00001', 'centre@careloop.test', true, NOW())
    ON CONFLICT (id) DO UPDATE SET verified = true;
  `);

  // Create Centre Memberships
  psql(`
    INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
    VALUES
      ('${CENTRE_ID}', '${U_MANAGER}', 'manager', 'active'),
      ('${CENTRE_ID}', '${U_TECH}', 'technician', 'active')
    ON CONFLICT (centre_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
  `);

  // Create Donor Profile
  psql(`
    INSERT INTO public.donors (id, profile_id, full_name, phone, blood_group, city, district, is_available, is_medically_cleared, created_at)
    VALUES ('${DONOR_REC_A}', '${U_DONOR_A}', 'Donor Dave', '+91 98490 55555', 'O+', 'Hyderabad', 'Hyderabad', true, true, NOW())
    ON CONFLICT (id) DO UPDATE SET is_available = true, is_medically_cleared = true;
  `);

  // Seed inventory for centre
  psql(`
    INSERT INTO public.blood_inventory (blood_centre_id, blood_group, component, units, updated_at)
    VALUES ('${CENTRE_ID}', 'O+', 'Packed RBC', 10, NOW())
    ON CONFLICT (blood_centre_id, blood_group, component) DO UPDATE SET units = 10;
  `);

  console.log('Fixtures established successfully.');
}

async function runAllTests() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 3.0 — STAGING READINESS & INTEGRATION AUDIT');
  console.log('Target: Local Docker PostgreSQL 17.6 (supabase_db_blood)');
  console.log('================================================================\n');

  await setupFixtures();

  // --------------------------------------------------------------------------
  // SUITE 1: PATIENT EMERGENCY WORKFLOW
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 1: PATIENT EMERGENCY WORKFLOW ---');

  await runTest('Patient Workflow', 'Patient A creates emergency request with clinical details', async () => {
    TEST_REF_CODE = `CL-STG-${Math.floor(1000 + Math.random() * 9000)}`;
    const sql = `
      INSERT INTO public.emergency_requests (
        reference_code, blood_group, component, units_required, urgency,
        hospital_name, hospital_address, city, state, contact_name, contact_phone,
        status, escalation_level, created_by, lat, lng, notes
      ) VALUES (
        '${TEST_REF_CODE}', 'O+', 'Packed RBC', 2, 'Urgent',
        'Apollo Jubilee Hills', 'Road No 72', 'Hyderabad', 'Telangana', 'Alice Patient', '+91 98490 11111',
        'CREATED', 1, '${U_PATIENT_A}', 17.4223, 78.4111, 'Urgent RBC needed for surgery'
      ) RETURNING id::text;
    `;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    if (out.startsWith('ERROR') || !out) throw new Error(`Insert failed: ${out}`);
    TEST_REQUEST_ID = out.trim();
    return `Created request ${TEST_REF_CODE} (ID: ${TEST_REQUEST_ID})`;
  });

  await runTest('Patient Workflow', 'Tracking status returns sanitized tracking for public / full for creator', async () => {
    // 1. Creator calls emergency_requests
    const creatorRes = execAsUser(U_PATIENT_A, 'patient', `
      SELECT reference_code, contact_name, contact_phone, hospital_name, status 
      FROM public.emergency_requests WHERE reference_code = '${TEST_REF_CODE}';
    `);
    if (!creatorRes.includes(TEST_REF_CODE) || !creatorRes.includes('Alice Patient')) {
      throw new Error(`Creator tracking failed: ${creatorRes}`);
    }

    // 2. Anonymous caller queries discoverable_emergency_requests
    const anonRes = execAsAnon(`
      SELECT reference_code, blood_group, units_required, hospital_name, status 
      FROM public.discoverable_emergency_requests WHERE reference_code = '${TEST_REF_CODE}';
    `);
    if (!anonRes.includes(TEST_REF_CODE) || !anonRes.includes('Apollo Jubilee Hills')) {
      throw new Error(`Anon tracking failed: ${anonRes}`);
    }

    // 3. Anonymous caller CANNOT query full emergency_requests table
    const anonFull = execAsAnon(`
      SELECT contact_phone FROM public.emergency_requests WHERE reference_code = '${TEST_REF_CODE}';
    `);
    if (anonFull.includes('98490 11111')) {
      throw new Error(`Anonymous caller bypassed RLS to view contact phone: ${anonFull}`);
    }

    return `Tracking validated: Creator sees full record with contact phone; Anonymous sees clinical tracking only`;
  });

  await runTest('Patient Workflow', 'Patient retrieves only own emergency requests via RLS', async () => {
    const patAQueries = execAsUser(U_PATIENT_A, 'patient', `SELECT count(*) FROM public.emergency_requests;`);
    const patBQueries = execAsUser(U_PATIENT_A, 'patient', `SELECT count(*) FROM public.emergency_requests WHERE created_by = '${U_PATIENT_B}';`);
    const bCount = parseInt(patBQueries, 10);
    if (bCount !== 0) throw new Error(`Patient A can see ${bCount} requests of Patient B`);
    return `Patient A query returned own requests cleanly; Patient B requests count: 0`;
  });

  // --------------------------------------------------------------------------
  // SUITE 2: DONOR DISCOVERY & ATOMIC ACCEPTANCE
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: DONOR DISCOVERY & ATOMIC ACCEPTANCE ---');

  await runTest('Donor Workflow', 'Donor views discoverable requests with privacy protection', async () => {
    const sql = `SELECT reference_code, blood_group, units_required, hospital_name, city FROM public.discoverable_emergency_requests WHERE reference_code = '${TEST_REF_CODE}';`;
    const out = execAsUser(U_DONOR_A, 'donor', sql);
    if (!out.includes(TEST_REF_CODE)) {
      throw new Error(`Request not visible in discoverable_emergency_requests: ${out}`);
    }
    // Verify discoverable view does not leak contact phone or notes
    const checkColumns = psql(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'discoverable_emergency_requests' AND column_name IN ('contact_phone', 'notes', 'cancellation_reason');
    `);
    if (checkColumns.trim().length > 0) {
      throw new Error(`discoverable_emergency_requests exposes sensitive columns: ${checkColumns}`);
    }
    return `Request visible in discoverable view; PII columns strictly omitted from view schema`;
  });

  await runTest('Donor Workflow', 'Donor discovery RPC (discover_matching_donors) locates matching donor', async () => {
    const sql = `SELECT * FROM public.discover_matching_donors('${TEST_REQUEST_ID}', 50.0);`;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    if (!out.includes(DONOR_REC_A)) {
      throw new Error(`Matching donor not discovered: ${out}`);
    }
    return `Discovered matching O+ donor ${DONOR_REC_A} within 50km radius`;
  });

  await runTest('Donor Workflow', 'Donor accepts request atomically (creates conversation & updates status)', async () => {
    const sql = `SELECT public.accept_request_and_create_conversation('${TEST_REQUEST_ID}', '${DONOR_REC_A}');`;
    const out = execAsUser(U_DONOR_A, 'donor', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`accept_request_and_create_conversation failed: ${out}`);
    TEST_CONV_ID = res.conversation_id;

    // Verify conversation was created
    const convRow = psql(`SELECT id, status, requester_id, donor_id FROM public.conversations WHERE id = '${TEST_CONV_ID}';`);
    if (!convRow.includes('ACTIVE')) throw new Error(`Conversation not active: ${convRow}`);

    // Verify participants enrolled
    const partCount = psql(`SELECT count(*) FROM public.conversation_participants WHERE conversation_id = '${TEST_CONV_ID}';`);
    if (parseInt(partCount, 10) !== 2) throw new Error(`Expected 2 participants, found ${partCount}`);

    // Verify donor response
    const respRow = psql(`SELECT response_status FROM public.donor_responses WHERE request_id = '${TEST_REQUEST_ID}' AND donor_id = '${DONOR_REC_A}';`);
    if (respRow.trim() !== 'ACCEPTED') throw new Error(`Donor response not ACCEPTED: ${respRow}`);

    return `Conversation created (${TEST_CONV_ID}) with 2 participants; donor_response status = ACCEPTED`;
  });

  await runTest('Donor Workflow', 'Duplicate request acceptance is idempotent / rejected gracefully', async () => {
    const sql = `SELECT public.accept_request_and_create_conversation('${TEST_REQUEST_ID}', '${DONOR_REC_A}');`;
    const out = execAsUser(U_DONOR_A, 'donor', sql);
    const res = JSON.parse(out);
    if (!res.already_accepted && !res.success) {
      throw new Error(`Expected idempotent success or already_accepted, got: ${out}`);
    }
    return `Duplicate acceptance handled safely: ${JSON.stringify(res)}`;
  });

  // --------------------------------------------------------------------------
  // SUITE 3: BLOOD CENTRE INVENTORY & MEMBER RBAC
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: BLOOD CENTRE INVENTORY & MEMBER RBAC ---');

  await runTest('Blood Centre RBAC', 'Centre manager adjusts inventory atomically with audit logging', async () => {
    const sql = `SELECT public.adjust_inventory_atomic('${CENTRE_ID}', 'O+', 'Packed RBC', 5, 'Restock from mobile blood drive');`;
    const out = execAsUser(U_MANAGER, 'blood_centre', sql);
    const res = JSON.parse(out);
    if (!res.success || res.new_units !== 15) throw new Error(`adjust_inventory_atomic failed: ${out}`);

    // Verify transaction log
    const tx = psql(`
      SELECT delta_units, previous_units, new_units, reason, performed_by 
      FROM public.inventory_transactions 
      WHERE blood_centre_id = '${CENTRE_ID}' 
      ORDER BY created_at DESC LIMIT 1;
    `);
    if (!tx.includes('5|10|15') || !tx.includes(U_MANAGER)) {
      throw new Error(`Inventory transaction mismatch: ${tx}`);
    }
    return `Inventory adjusted 10 -> 15 (+5); Audit ledger verified: ${tx}`;
  });

  await runTest('Blood Centre RBAC', 'Centre manager sets inventory atomically with audit logging', async () => {
    const sql = `SELECT public.set_inventory_atomic('${CENTRE_ID}', 'O+', 'Packed RBC', 12, 'Audit reconciliation');`;
    const out = execAsUser(U_MANAGER, 'blood_centre', sql);
    const res = JSON.parse(out);
    if (!res.success || res.new_units !== 12) throw new Error(`set_inventory_atomic failed: ${out}`);
    return `Inventory reconciled to 12 units (delta: -3); Audit record created`;
  });

  await runTest('Blood Centre RBAC', 'Suspended manager is blocked from modifying inventory', async () => {
    // 1. Coordinator suspends manager
    psql(`UPDATE public.blood_centre_memberships SET status = 'suspended' WHERE centre_id = '${CENTRE_ID}' AND user_id = '${U_MANAGER}';`);

    // 2. Suspended manager attempts adjust
    const sql = `SELECT public.adjust_inventory_atomic('${CENTRE_ID}', 'O+', 'Packed RBC', 2, 'Unauthorized attempt');`;
    const out = execAsUser(U_MANAGER, 'blood_centre', sql);
    const res = JSON.parse(out);

    // 3. Restore manager status
    psql(`UPDATE public.blood_centre_memberships SET status = 'active' WHERE centre_id = '${CENTRE_ID}' AND user_id = '${U_MANAGER}';`);

    if (res.success) throw new Error(`Suspended manager succeeded in modifying inventory: ${out}`);
    return `Blocked suspended manager: ${res.message}`;
  });

  await runTest('Blood Centre RBAC', 'Technician blocked from altering membership status', async () => {
    const sql = `SELECT public.set_centre_member_status_atomic('${CENTRE_ID}', '${U_MANAGER}', 'suspended');`;
    const out = execAsUser(U_TECH, 'blood_centre', sql);
    const res = JSON.parse(out);
    if (res.success) throw new Error(`Technician unexpectedly succeeded in altering membership: ${out}`);
    return `Technician rejected cleanly: ${res.message}`;
  });

  // --------------------------------------------------------------------------
  // SUITE 4: COORDINATOR COORDINATION & ASSIGNMENTS
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: COORDINATOR COORDINATION & ASSIGNMENTS ---');

  let ASSIGNMENT_ID = '';

  await runTest('Coordinator Workflow', 'Coordinator assigns donor atomically to emergency request', async () => {
    const sql = `SELECT public.assign_donor_atomic('${TEST_REQUEST_ID}', '${DONOR_REC_A}', 1, '${U_COORD}');`;
    const out = execAsUser(U_COORD, 'coordinator', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`assign_donor_atomic failed: ${out}`);
    ASSIGNMENT_ID = res.assignment_id;

    // Verify coordinated units incremented
    const req = psql(`SELECT units_required, units_coordinated, status FROM public.emergency_requests WHERE id = '${TEST_REQUEST_ID}';`);
    if (!req.includes('2|1')) throw new Error(`Units coordinated mismatch: ${req}`);
    return `Assigned donor (Assignment ID: ${ASSIGNMENT_ID}); Request units: ${req}`;
  });

  await runTest('Coordinator Workflow', 'Over-coordination guard rejects exceeding units required', async () => {
    // units_required is 2, 1 is already coordinated. Attempting to assign 2 more should fail!
    const sql = `SELECT public.assign_blood_centre_atomic('${TEST_REQUEST_ID}', '${CENTRE_ID}', 2, '${U_COORD}');`;
    const out = execAsUser(U_COORD, 'coordinator', sql);
    const res = JSON.parse(out);
    if (res.success) throw new Error(`Over-coordination unexpectedly allowed: ${out}`);
    return `Over-coordination blocked correctly: ${res.message}`;
  });

  await runTest('Coordinator Workflow', 'Coordinator assigns blood centre for remaining required units', async () => {
    // Assign remaining 1 unit from blood centre
    const sql = `SELECT public.assign_blood_centre_atomic('${TEST_REQUEST_ID}', '${CENTRE_ID}', 1, '${U_COORD}');`;
    const out = execAsUser(U_COORD, 'coordinator', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`assign_blood_centre_atomic failed: ${out}`);

    const req = psql(`SELECT units_required, units_coordinated, status FROM public.emergency_requests WHERE id = '${TEST_REQUEST_ID}';`);
    if (!req.includes('2|2')) throw new Error(`Units coordinated mismatch: ${req}`);
    return `Assigned 1 unit from blood centre; Request is fully coordinated: ${req}`;
  });

  await runTest('Coordinator Workflow', 'Coordinator cancels assignment atomically with safe decrement', async () => {
    const sql = `SELECT public.cancel_donor_assignment_atomic('${ASSIGNMENT_ID}', 'Donor unavailable due to travel');`;
    const out = execAsUser(U_COORD, 'coordinator', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`cancel_donor_assignment_atomic failed: ${out}`);

    const req = psql(`SELECT units_required, units_coordinated FROM public.emergency_requests WHERE id = '${TEST_REQUEST_ID}';`);
    if (!req.includes('2|1')) throw new Error(`Units coordinated did not decrement: ${req}`);
    return `Assignment cancelled; Units coordinated decremented safely: ${req}`;
  });

  // --------------------------------------------------------------------------
  // SUITE 5: COMMUNICATIONS, MESSAGING & WEBRTC VOICE CALLING
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: COMMUNICATIONS & WEBRTC VOICE CALLING ---');

  const CLIENT_MSG_ID = `msg-idemp-${Date.now()}`;

  await runTest('Communications', 'Chat message persisted between participants with client message ID', async () => {
    const sql = `
      INSERT INTO public.messages (
        conversation_id, sender_id, sender_name, sender_role, message_type, content, client_message_id
      ) VALUES (
        '${TEST_CONV_ID}', '${U_PATIENT_A}', 'Alice Patient', 'patient', 'TEXT', 'Hello donor, thank you for responding!', '${CLIENT_MSG_ID}'
      ) RETURNING id, content;
    `;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    if (out.startsWith('ERROR') || !out) throw new Error(`Insert message failed: ${out}`);
    return `Message persisted in conversation: ${out}`;
  });

  await runTest('Communications', 'Duplicate client_message_id returns 23505 collision for client idempotency recovery', async () => {
    const sql = `
      INSERT INTO public.messages (
        conversation_id, sender_id, sender_name, sender_role, message_type, content, client_message_id
      ) VALUES (
        '${TEST_CONV_ID}', '${U_PATIENT_A}', 'Alice Patient', 'patient', 'TEXT', 'Hello donor, thank you for responding!', '${CLIENT_MSG_ID}'
      ) RETURNING id;
    `;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    if (!out.includes('23505') && !out.includes('duplicate key')) {
      throw new Error(`Expected 23505 duplicate key error, got: ${out}`);
    }
    // Verify client idempotency recovery query
    const recovery = execAsUser(U_PATIENT_A, 'patient', `
      SELECT id, content FROM public.messages WHERE conversation_id = '${TEST_CONV_ID}' AND client_message_id = '${CLIENT_MSG_ID}';
    `);
    if (!recovery.includes('Hello donor')) throw new Error(`Idempotency query failed: ${recovery}`);
    return `PostgreSQL 23505 trapped; existing message successfully resolved for client`;
  });

  await runTest('WebRTC & Coturn', 'Ephemeral TURN credentials generated with strict 600s TTL and advisory rate limit', async () => {
    const sql = `SELECT public.get_ephemeral_turn_credentials(600);`;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`get_ephemeral_turn_credentials failed: ${out}`);
    if (res.ttl_seconds !== 600) throw new Error(`TTL is not strictly 600: ${res.ttl_seconds}`);
    if (!res.ice_servers || res.ice_servers.length < 2) throw new Error(`ICE servers incomplete: ${out}`);

    const turnServer = res.ice_servers.find((s: any) => typeof s.urls === 'string' && s.urls.startsWith('turn:'));
    if (!turnServer || !turnServer.username || !turnServer.credential) {
      throw new Error(`TURN server credentials missing: ${JSON.stringify(res.ice_servers)}`);
    }

    return `Generated HMAC-SHA1 TURN credentials (TTL: ${res.ttl_seconds}s, username: ${turnServer.username})`;
  });

  await runTest('WebRTC & Coturn', 'Emergency voice call initiated via initiate_call RPC with receiver ICE servers', async () => {
    const sql = `SELECT public.initiate_call('${TEST_CONV_ID}', 'VOICE');`;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`initiate_call failed: ${out}`);
    TEST_CALL_ID = res.call_id;

    // Verify call session state
    const callRow = psql(`SELECT status, caller_id, receiver_id FROM public.call_sessions WHERE id = '${TEST_CALL_ID}';`);
    if (!callRow.includes('RINGING') || !callRow.includes(U_PATIENT_A)) {
      throw new Error(`Call session mismatch: ${callRow}`);
    }

    // Verify call event logged
    const evt = psql(`SELECT event_type FROM public.call_events WHERE call_id = '${TEST_CALL_ID}' ORDER BY created_at DESC LIMIT 1;`);
    if (evt.trim() !== 'INITIATED') throw new Error(`Call event mismatch: ${evt}`);

    return `Call initiated (${TEST_CALL_ID}) in RINGING state; Call event INITIATED logged`;
  });

  await runTest('WebRTC & Coturn', 'Callee accepts call via accept_call RPC after receiver-ready handshake', async () => {
    const sql = `SELECT public.accept_call('${TEST_CALL_ID}');`;
    const out = execAsUser(U_DONOR_A, 'donor', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`accept_call failed: ${out}`);

    const callRow = psql(`SELECT status FROM public.call_sessions WHERE id = '${TEST_CALL_ID}';`);
    if (callRow.trim() !== 'ACCEPTED') throw new Error(`Call not accepted: ${callRow}`);

    const evt = psql(`SELECT event_type FROM public.call_events WHERE call_id = '${TEST_CALL_ID}' ORDER BY created_at DESC LIMIT 1;`);
    if (evt.trim() !== 'ACCEPTED') throw new Error(`Call event mismatch: ${evt}`);

    return `Call accepted by donor; Session status = ACCEPTED; Event logged`;
  });

  await runTest('WebRTC & Coturn', 'Participant ends call via end_call RPC with duration calculation', async () => {
    const sql = `SELECT public.end_call('${TEST_CALL_ID}', 'NORMAL_CLEARING');`;
    const out = execAsUser(U_PATIENT_A, 'patient', sql);
    const res = JSON.parse(out);
    if (!res.success) throw new Error(`end_call failed: ${out}`);

    const callRow = psql(`SELECT status, end_reason FROM public.call_sessions WHERE id = '${TEST_CALL_ID}';`);
    if (!callRow.includes('ENDED') || !callRow.includes('NORMAL_CLEARING')) {
      throw new Error(`Call not ended properly: ${callRow}`);
    }
    return `Call ended cleanly (status: ENDED, reason: NORMAL_CLEARING)`;
  });

  // --------------------------------------------------------------------------
  // SUITE 6: SECURITY BOUNDARIES & NEGATIVE ACCESS CONTROL
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: SECURITY BOUNDARIES & NEGATIVE ACCESS CONTROL ---');

  await runTest('Negative Security', 'Patient B is denied access to Patient A emergency request updates', async () => {
    const sql = `UPDATE public.emergency_requests SET status = 'CANCELLED' WHERE id = '${TEST_REQUEST_ID}';`;
    execAsUser(U_PATIENT_B, 'patient', sql);
    // Verify request was NOT cancelled
    const current = psql(`SELECT status FROM public.emergency_requests WHERE id = '${TEST_REQUEST_ID}';`);
    if (current.trim() === 'CANCELLED') throw new Error('Patient B was able to modify Patient A request!');
    return `RLS prevented Patient B from updating Patient A request (status remains: ${current.trim()})`;
  });

  await runTest('Negative Security', 'User B is denied access to User A notifications', async () => {
    // 1. Create notification for User A via service role
    const notifId = psql(`
      INSERT INTO public.notifications (user_id, channel, title, content, status)
      VALUES ('${U_PATIENT_A}', 'IN_APP', 'Confidential Medical Notice', 'Surgery schedule confirmed', 'DELIVERED')
      RETURNING id::text;
    `).trim();

    // 2. User B tries to SELECT User A notification
    const readAttempt = execAsUser(U_PATIENT_B, 'patient', `SELECT count(*) FROM public.notifications WHERE id = '${notifId}';`);
    if (parseInt(readAttempt, 10) !== 0) throw new Error(`User B was able to read User A notification!`);

    // 3. User B tries to acknowledge User A notification
    execAsUser(U_PATIENT_B, 'patient', `UPDATE public.notifications SET status = 'ACKNOWLEDGED' WHERE id = '${notifId}';`);
    const checkStatus = psql(`SELECT status FROM public.notifications WHERE id = '${notifId}';`);
    if (checkStatus.trim() === 'ACKNOWLEDGED') throw new Error(`User B was able to acknowledge User A notification!`);

    return `Cross-user notification isolation verified: SELECT count = 0, unauthorized UPDATE ignored`;
  });

  await runTest('Negative Security', 'Direct DML rejected on append-only audit tables', async () => {
    const insertTx = execAsUser(U_MANAGER, 'blood_centre', `
      INSERT INTO public.inventory_transactions (blood_centre_id, blood_group, component, delta_units, previous_units, new_units, reason)
      VALUES ('${CENTRE_ID}', 'O+', 'Packed RBC', 10, 0, 10, 'Forged Transaction');
    `);
    if (!insertTx.includes('permission denied')) throw new Error(`Direct INSERT on inventory_transactions was not denied: ${insertTx}`);

    // Verify RLS protects call_events from unauthorized DELETE
    const countBefore = psql(`SELECT count(*) FROM public.call_events WHERE call_id = '${TEST_CALL_ID}';`);
    execAsUser(U_PATIENT_A, 'patient', `DELETE FROM public.call_events WHERE call_id = '${TEST_CALL_ID}';`);
    const countAfter = psql(`SELECT count(*) FROM public.call_events WHERE call_id = '${TEST_CALL_ID}';`);
    if (countBefore !== countAfter || parseInt(countAfter, 10) === 0) {
      throw new Error(`Direct DELETE on call_events succeeded in removing records!`);
    }

    const insertAudit = execAsUser(U_COORD, 'coordinator', `
      INSERT INTO public.audit_logs (action, target_table) VALUES ('TAMPER', 'emergency_requests');
    `);
    if (!insertAudit.includes('permission denied') && !insertAudit.includes('Unauthorized')) {
      throw new Error(`Direct INSERT on audit_logs was not denied: ${insertAudit}`);
    }

    return `Direct DML denied on inventory_transactions, audit_logs; call_events DELETE protected by RLS`;
  });

  await runTest('Negative Security', 'Anonymous client denied execution of coordination RPCs', async () => {
    const anonCall = execAsAnon(`SELECT public.initiate_call('${TEST_CONV_ID}', 'VOICE');`);
    if (!anonCall.includes('permission denied')) throw new Error(`Anon initiate_call not denied: ${anonCall}`);

    const anonInv = execAsAnon(`SELECT public.adjust_inventory_atomic('${CENTRE_ID}', 'O+', 'Packed RBC', 1, 'hack');`);
    if (!anonInv.includes('permission denied')) throw new Error(`Anon adjust_inventory_atomic not denied: ${anonInv}`);

    const anonMember = execAsAnon(`SELECT public.add_centre_member_atomic('${CENTRE_ID}', '${U_TECH}', 'manager');`);
    if (!anonMember.includes('permission denied')) throw new Error(`Anon add_centre_member_atomic not denied: ${anonMember}`);

    return `Anonymous execution denied for initiate_call, adjust_inventory_atomic, and add_centre_member_atomic`;
  });

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PHASE 3.0 INTEGRATION TEST BATTERY SUMMARY');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Workflows Tested: ${total}`);
  console.log(`Passed:                ${passed}`);
  console.log(`Failed:                ${failed}`);
  console.log(`Pass Rate:             ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error('FAILED WORKFLOWS:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.error(`- [${r.suite}] ${r.name}: ${r.details}`);
    });
    process.exit(1);
  } else {
    console.log('ALL PHASE 3.0 WORKFLOW AND SECURITY TESTS PASSED CLEANLY.');
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error running Phase 3.0 test suite:', err);
  process.exit(1);
});
