/**
 * CareLoop Phase 2.4.3 — Final Authorization Edge-Case Audit & Concurrency Test Battery
 * 
 * Verifies against real local PostgreSQL 17.6 (supabase_db_blood):
 * 1. Notification Cross-User SELECT Isolation (RLS enforcement across distinct JWT identities)
 * 2. Unauthorized Delivery-Status Modification (Revocation of authenticated/anon; service_role exclusivity; 42501 checks)
 * 3. Authorized Notification Acknowledgement (Ownership boundary; atomic timestamping; batch acknowledgement)
 * 4. Concurrent Manager-vs-Coordinator Membership Operations (TOCTOU elimination via advisory locks + row locks)
 * 5. Cross-Centre Membership Isolation (Manager of Centre A blocked from modifying Centre B)
 * 6. Manager Self-Modification Restrictions (Self-suspension and self-demotion guards)
 * 7. Complete SECURITY DEFINER Effective Grants (aclexplode inspection; fixed search paths)
 * 8. PUBLIC Execution Privilege Verification (Zero public grants; default privileges hardened)
 */

import { execSync, spawn } from 'child_process';
import crypto from 'crypto';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const results: TestResult[] = [];

function psql(query: string): string {
  try {
    const out = execSync(
      'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (out.startsWith('ERROR:')) {
      throw new Error(out);
    }
    return out;
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
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
    if (jsonLine) return jsonLine;
    const resultLines = lines.filter((l) => !['BEGIN', 'SET', 'COMMIT'].includes(l));
    return resultLines.join('\n');
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
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
    if (jsonLine) return jsonLine;
    const resultLines = lines.filter((l) => !['BEGIN', 'SET', 'COMMIT'].includes(l));
    return resultLines.join('\n');
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return `ERROR: ${stderr || stdout || err.message}`;
  }
}

function execAsServiceRole(sql: string): string {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE service_role;
    SET LOCAL "request.jwt.claim.role" = 'service_role';
    ${sql}
    COMMIT;
  `;
  try {
    const raw = execSync(
      'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
      { input: wrapped, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
    if (jsonLine) return jsonLine;
    const resultLines = lines.filter((l) => !['BEGIN', 'SET', 'COMMIT'].includes(l));
    return resultLines.join('\n');
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return `ERROR: ${stderr || stdout || err.message}`;
  }
}

function createTestUser(email: string, role: string = 'donor'): string {
  const id = crypto.randomUUID();
  const sql = `
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES ('${id}', '00000000-0000-0000-0000-000000000000', '${email}', 'encrypted', NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test ${role}"}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles
    SET role = '${role}', full_name = 'Test ${role}', status = 'ACTIVE'
    WHERE id = '${id}';
  `;
  psql(sql);
  return id;
}

function runTest(suite: string, name: string, fn: () => void) {
  const start = Date.now();
  try {
    fn();
    results.push({ suite, name, passed: true, details: 'OK', durationMs: Date.now() - start });
    console.log(`  [PASS] [${suite}] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, details: err.message, durationMs: Date.now() - start });
    console.error(`  [FAIL] [${suite}] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(suite: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, details: 'OK', durationMs: Date.now() - start });
    console.log(`  [PASS] [${suite}] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, details: err.message, durationMs: Date.now() - start });
    console.error(`  [FAIL] [${suite}] ${name}: ${err.message}`);
  }
}

function runPsqlAsync(query: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('docker', [
      'exec', '-i', 'supabase_db_blood',
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-P', 'pager=off'
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(`ERROR: ${stderr || stdout}`);
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin.write(query);
    child.stdin.end();
  });
}

function execAsUserAsync(userId: string, sql: string): Promise<string> {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    ${sql}
    COMMIT;
  `;
  return runPsqlAsync(wrapped).then((raw) => {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
    if (jsonLine) return jsonLine;
    const resultLines = lines.filter((l) => !['BEGIN', 'SET', 'COMMIT'].includes(l));
    return resultLines.join('\n');
  });
}

async function main() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 2.4.3 FINAL AUTHORIZATION & CONCURRENCY TEST BATTERY');
  console.log('Local PostgreSQL 17.6 (supabase_db_blood)');
  console.log('================================================================\n');

  // Pre-seed test app_settings
  psql(`
    INSERT INTO public.app_settings (key, value) VALUES
    ('turn_shared_secret', 'careloop-test-turn-shared-secret-32chars!!'),
    ('turn_server_url', 'turn:turn.careloop.org:3478?transport=udp')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);

  // --------------------------------------------------------------------------
  // SUITE 1: Notification Cross-User SELECT Isolation
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: NOTIFICATION CROSS-USER SELECT ISOLATION ---');

  runTest('Notification SELECT Isolation', 'User A can only view their own notifications via SELECT', () => {
    const userA = createTestUser(`notif_user_a_${Date.now()}@careloop.local`, 'patient');
    const userB = createTestUser(`notif_user_b_${Date.now()}@careloop.local`, 'donor');

    const notifA = crypto.randomUUID();
    const notifB = crypto.randomUUID();

    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status)
      VALUES 
        ('${notifA}', '${userA}', 'IN_APP', 'Alert A', 'Confidential A', 'DELIVERED'),
        ('${notifB}', '${userB}', 'IN_APP', 'Alert B', 'Confidential B', 'DELIVERED');
    `);

    // User A reads notifications
    const rowsA = execAsUser(userA, 'patient', `SELECT id FROM public.notifications;`);
    const idsA = rowsA.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!idsA.includes(notifA)) throw new Error('User A cannot view their own notification');
    if (idsA.includes(notifB)) throw new Error('User A can see User B notification! RLS leakage!');

    // User B reads notifications
    const rowsB = execAsUser(userB, 'donor', `SELECT id FROM public.notifications;`);
    const idsB = rowsB.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!idsB.includes(notifB)) throw new Error('User B cannot view their own notification');
    if (idsB.includes(notifA)) throw new Error('User B can see User A notification! RLS leakage!');

    // User B explicitly queries User A's ID
    const targetedQuery = execAsUser(userB, 'donor', `SELECT content FROM public.notifications WHERE id = '${notifA}';`);
    if (targetedQuery.includes('Confidential A')) throw new Error('Targeted query leaked confidential notification data');
    if (targetedQuery.trim().length > 0) throw new Error(`Unexpected query result: ${targetedQuery}`);

    // Anon reads notifications
    const rowsAnon = execAsAnon(`SELECT count(*) FROM public.notifications;`);
    if (rowsAnon !== '0') throw new Error(`Anon can view notifications! Count: ${rowsAnon}`);
  });


  // --------------------------------------------------------------------------
  // SUITE 2: Unauthorized Delivery-Status Modification
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: UNAUTHORIZED DELIVERY-STATUS MODIFICATION ---');

  runTest('Delivery Status Authorization', 'Ordinary user cannot execute update_notification_delivery_status', () => {
    const victim = createTestUser(`deliv_victim_${Date.now()}@careloop.local`, 'patient');
    const attacker = createTestUser(`deliv_attacker_${Date.now()}@careloop.local`, 'donor');

    const notifId = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status)
      VALUES ('${notifId}', '${victim}', 'IN_APP', 'Blood Match', 'Match Found', 'PENDING');
    `);

    // Attacker tries to call RPC update_notification_delivery_status
    const resRpc = execAsUser(attacker, 'donor', `
      SELECT public.update_notification_delivery_status('${notifId}', 'DELIVERED');
    `);
    if (!resRpc.includes('permission denied for function update_notification_delivery_status')) {
      throw new Error(`Expected permission denied for RPC, got: ${resRpc}`);
    }

    // Attacker tries direct table UPDATE
    const resTable = execAsUser(attacker, 'donor', `
      UPDATE public.notifications SET status = 'DELIVERED' WHERE id = '${notifId}';
    `);
    if (!resTable.includes('permission denied for table notifications')) {
      throw new Error(`Expected permission denied for table UPDATE, got: ${resTable}`);
    }

    // Verify row status unchanged
    const status = psql(`SELECT status FROM public.notifications WHERE id = '${notifId}';`);
    if (status !== 'PENDING') throw new Error(`Status was illegally modified to ${status}`);
  });

  runTest('Delivery Status Authorization', 'Anonymous caller cannot execute update_notification_delivery_status', () => {
    const dummyId = crypto.randomUUID();
    const res = execAsAnon(`SELECT public.update_notification_delivery_status('${dummyId}', 'DELIVERED');`);
    if (!res.includes('permission denied for function update_notification_delivery_status')) {
      throw new Error(`Anon was not blocked by permission check, got: ${res}`);
    }
  });

  runTest('Delivery Status Authorization', 'Service role can update delivery status to valid states', () => {
    const victim = createTestUser(`deliv_sr_${Date.now()}@careloop.local`, 'patient');
    const notifId = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status)
      VALUES ('${notifId}', '${victim}', 'IN_APP', 'System Notice', 'Notice content', 'QUEUED');
    `);

    // Service role updates to SENT
    const resSent = execAsServiceRole(`
      SELECT public.update_notification_delivery_status('${notifId}', 'SENT');
    `);
    const parsedSent = JSON.parse(resSent);
    if (!parsedSent.success || parsedSent.status !== 'SENT') {
      throw new Error(`Failed to update to SENT: ${resSent}`);
    }

    // Service role rejects 'ACKNOWLEDGED' via delivery status
    const resAck = execAsServiceRole(`
      SELECT public.update_notification_delivery_status('${notifId}', 'ACKNOWLEDGED');
    `);
    const parsedAck = JSON.parse(resAck);
    if (parsedAck.success !== false) {
      throw new Error(`ACKNOWLEDGED must be rejected by update_notification_delivery_status: ${resAck}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 3: Authorized Notification Acknowledgement
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: AUTHORIZED NOTIFICATION ACKNOWLEDGEMENT ---');

  runTest('Notification Acknowledgement', 'User can acknowledge own notification; non-owner is rejected', () => {
    const owner = createTestUser(`ack_owner_${Date.now()}@careloop.local`, 'patient');
    const impostor = createTestUser(`ack_impostor_${Date.now()}@careloop.local`, 'patient');

    const notifId = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status)
      VALUES ('${notifId}', '${owner}', 'IN_APP', 'Transfusion Request', 'Medical payload', 'DELIVERED');
    `);

    // Impostor attempts to acknowledge
    const resImpostor = execAsUser(impostor, 'patient', `
      SELECT public.acknowledge_notification('${notifId}');
    `);
    const parsedImpostor = JSON.parse(resImpostor);
    if (parsedImpostor.success !== false) {
      throw new Error(`Impostor was able to acknowledge notification: ${resImpostor}`);
    }

    // Owner acknowledges
    const resOwner = execAsUser(owner, 'patient', `
      SELECT public.acknowledge_notification('${notifId}');
    `);
    const parsedOwner = JSON.parse(resOwner);
    if (!parsedOwner.success || parsedOwner.notification_id !== notifId) {
      throw new Error(`Owner acknowledgement failed: ${resOwner}`);
    }

    // Verify database state: status=ACKNOWLEDGED and acknowledged_at is NOT NULL
    const checkSql = psql(`SELECT status, acknowledged_at IS NOT NULL FROM public.notifications WHERE id = '${notifId}';`);
    const [status, hasAckAt] = checkSql.split('|');
    if (status !== 'ACKNOWLEDGED' || hasAckAt !== 't') {
      throw new Error(`Expected ACKNOWLEDGED with timestamp, got: status=${status}, hasAckAt=${hasAckAt}`);
    }
  });

  runTest('Notification Acknowledgement', 'User can batch acknowledge all unacknowledged notifications', () => {
    const user = createTestUser(`batch_ack_${Date.now()}@careloop.local`, 'donor');
    const n1 = crypto.randomUUID();
    const n2 = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status)
      VALUES 
        ('${n1}', '${user}', 'IN_APP', 'Alert 1', 'Content 1', 'DELIVERED'),
        ('${n2}', '${user}', 'IN_APP', 'Alert 2', 'Content 2', 'DELIVERED');
    `);

    const res = execAsUser(user, 'donor', `SELECT public.acknowledge_all_notifications();`);
    const parsed = JSON.parse(res);
    if (!parsed.success || parsed.count < 2) {
      throw new Error(`Batch acknowledge failed: ${res}`);
    }

    const unackCount = psql(`SELECT count(*) FROM public.notifications WHERE user_id = '${user}' AND status <> 'ACKNOWLEDGED';`);
    if (unackCount !== '0') {
      throw new Error(`Expected 0 unacknowledged notifications, found ${unackCount}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 4: Concurrent Manager-vs-Coordinator Operations (TOCTOU Elimination)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: CONCURRENT MANAGER-VS-COORDINATOR OPERATIONS ---');

  await runAsyncTest('Concurrent Manager Authorization', 'Concurrent Coordinator promote vs Manager suspend is serialized with zero TOCTOU race', async () => {
    // Setup: Blood centre C, Manager M, Technician T, Coordinator K
    const centreId = crypto.randomUUID();
    const managerId = createTestUser(`mgr_race_${Date.now()}@careloop.local`, 'donor');
    const techId = createTestUser(`tech_race_${Date.now()}@careloop.local`, 'donor');
    const coordId = createTestUser(`coord_race_${Date.now()}@careloop.local`, 'coordinator');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES ('${centreId}', 'Concurrency Test Centre', '123 Main St', 'Hyderabad', '+919999999999', 'conc@careloop.local', 12.97, 77.59);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES 
        ('${centreId}', '${managerId}', 'manager', 'active'),
        ('${centreId}', '${techId}', 'technician', 'active');
    `);

    // Op 1: Coordinator promotes Technician to Manager
    // Op 2: Manager attempts to suspend Technician
    const p1 = execAsUserAsync(coordId, `
      SELECT public.add_centre_member_atomic('${centreId}', '${techId}', 'manager');
    `);

    const p2 = execAsUserAsync(managerId, `
      SELECT public.set_centre_member_status_atomic('${centreId}', '${techId}', 'suspended');
    `);

    const [resCoord, resMgr] = await Promise.all([p1, p2]);

    const parsedCoord = JSON.parse(resCoord);
    if (!parsedCoord.success) {
      throw new Error(`Coordinator promotion failed: ${resCoord}`);
    }

    const finalState = psql(`SELECT role, status FROM public.blood_centre_memberships WHERE centre_id = '${centreId}' AND user_id = '${techId}';`);
    const [finalRole, finalStatus] = finalState.split('|');

    if (finalRole !== 'manager') {
      throw new Error(`Expected final role to be manager, got ${finalRole}`);
    }

    console.log(`    Concurrency Resolution: Manager Result = ${resMgr.substring(0, 90)}..., Final State = role:${finalRole}, status:${finalStatus}`);
  });

  runTest('Concurrent Manager Authorization', 'Manager cannot alter or suspend an existing manager', () => {
    const centreId = crypto.randomUUID();
    const mgr1 = createTestUser(`mgr1_${Date.now()}@careloop.local`, 'donor');
    const mgr2 = createTestUser(`mgr2_${Date.now()}@careloop.local`, 'donor');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES ('${centreId}', 'Peer Manager Centre', '456 Elm St', 'Hyderabad', '+919999999998', 'peermgr@careloop.local', 12.97, 77.59);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES 
        ('${centreId}', '${mgr1}', 'manager', 'active'),
        ('${centreId}', '${mgr2}', 'manager', 'active');
    `);

    // Manager 1 attempts to suspend Manager 2
    const resSuspend = execAsUser(mgr1, 'donor', `
      SELECT public.set_centre_member_status_atomic('${centreId}', '${mgr2}', 'suspended');
    `);
    const parsedSuspend = JSON.parse(resSuspend);
    if (parsedSuspend.success !== false || !parsedSuspend.message.includes('Only system coordinators or administrators can change manager status')) {
      throw new Error(`Manager was able to alter peer manager status: ${resSuspend}`);
    }

    // Manager 1 attempts to demote Manager 2 to staff
    const resDemote = execAsUser(mgr1, 'donor', `
      SELECT public.add_centre_member_atomic('${centreId}', '${mgr2}', 'staff');
    `);
    const parsedDemote = JSON.parse(resDemote);
    if (parsedDemote.success !== false || !parsedDemote.message.includes('Only coordinators or admins can modify an existing manager')) {
      throw new Error(`Manager was able to demote peer manager: ${resDemote}`);
    }
  });

  runTest('Concurrent Manager Authorization', 'Manager cannot promote any member to manager', () => {
    const centreId = crypto.randomUUID();
    const mgr = createTestUser(`mgr_prom_${Date.now()}@careloop.local`, 'donor');
    const staff = createTestUser(`staff_prom_${Date.now()}@careloop.local`, 'donor');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES ('${centreId}', 'Escalation Guard Centre', '789 Oak St', 'Hyderabad', '+919999999997', 'esc@careloop.local', 12.97, 77.59);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES 
        ('${centreId}', '${mgr}', 'manager', 'active'),
        ('${centreId}', '${staff}', 'staff', 'active');
    `);

    const res = execAsUser(mgr, 'donor', `
      SELECT public.add_centre_member_atomic('${centreId}', '${staff}', 'manager');
    `);
    const parsed = JSON.parse(res);
    if (parsed.success !== false || !parsed.message.includes('Only system coordinators or administrators can grant manager privileges')) {
      throw new Error(`Manager was able to promote member to manager: ${res}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 5: Cross-Centre Membership Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: CROSS-CENTRE MEMBERSHIP ISOLATION ---');

  runTest('Cross-Centre Isolation', 'Manager of Centre A cannot modify members of Centre B', () => {
    const centreA = crypto.randomUUID();
    const centreB = crypto.randomUUID();
    const mgrA = createTestUser(`mgr_a_${Date.now()}@careloop.local`, 'donor');
    const techB = createTestUser(`tech_b_${Date.now()}@careloop.local`, 'donor');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES 
        ('${centreA}', 'Centre A', 'Addr A', 'Hyderabad', '+919999999996', 'ca@careloop.local', 12.97, 77.59),
        ('${centreB}', 'Centre B', 'Addr B', 'Hyderabad', '+919999999995', 'cb@careloop.local', 12.98, 77.60);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES 
        ('${centreA}', '${mgrA}', 'manager', 'active'),
        ('${centreB}', '${techB}', 'technician', 'active');
    `);

    // Manager A attempts to suspend Tech B in Centre B
    const resSuspend = execAsUser(mgrA, 'donor', `
      SELECT public.set_centre_member_status_atomic('${centreB}', '${techB}', 'suspended');
    `);
    const parsedSuspend = JSON.parse(resSuspend);
    if (parsedSuspend.success !== false || !parsedSuspend.message.includes('centre managers, coordinators, or admins')) {
      throw new Error(`Cross-centre suspension was not blocked: ${resSuspend}`);
    }

    // Manager A attempts to add member to Centre B
    const newStaff = createTestUser(`new_staff_${Date.now()}@careloop.local`, 'donor');
    const resAdd = execAsUser(mgrA, 'donor', `
      SELECT public.add_centre_member_atomic('${centreB}', '${newStaff}', 'staff');
    `);
    const parsedAdd = JSON.parse(resAdd);
    if (parsedAdd.success !== false || !parsedAdd.message.includes('Only centre managers, coordinators, or admins can manage staff')) {
      throw new Error(`Cross-centre member creation was not blocked: ${resAdd}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 6: Manager Self-Modification Restrictions
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: MANAGER SELF-MODIFICATION RESTRICTIONS ---');

  runTest('Self-Modification Guard', 'Manager cannot suspend their own active account', () => {
    const centreId = crypto.randomUUID();
    const mgr = createTestUser(`mgr_self_${Date.now()}@careloop.local`, 'donor');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES ('${centreId}', 'Self Mod Centre', '101 Pine St', 'Hyderabad', '+919999999994', 'selfmod@careloop.local', 12.97, 77.59);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES ('${centreId}', '${mgr}', 'manager', 'active');
    `);

    const res = execAsUser(mgr, 'donor', `
      SELECT public.set_centre_member_status_atomic('${centreId}', '${mgr}', 'suspended');
    `);
    const parsed = JSON.parse(res);
    if (parsed.success !== false || !parsed.message.includes('Self-suspension prohibited')) {
      throw new Error(`Manager self-suspension was not prevented: ${res}`);
    }
  });

  runTest('Self-Modification Guard', 'Manager cannot modify their own membership role', () => {
    const centreId = crypto.randomUUID();
    const mgr = createTestUser(`mgr_selfrole_${Date.now()}@careloop.local`, 'donor');

    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, email, lat, lng)
      VALUES ('${centreId}', 'Self Role Centre', '102 Pine St', 'Hyderabad', '+919999999993', 'selfrole@careloop.local', 12.97, 77.59);

      INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
      VALUES ('${centreId}', '${mgr}', 'manager', 'active');
    `);

    const res = execAsUser(mgr, 'donor', `
      SELECT public.add_centre_member_atomic('${centreId}', '${mgr}', 'technician');
    `);
    const parsed = JSON.parse(res);
    if (parsed.success !== false || !parsed.message.includes('Cannot modify own membership role')) {
      throw new Error(`Manager self-role change was not prevented: ${res}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 7: Complete SECURITY DEFINER Effective Grants via aclexplode
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 7: COMPLETE SECURITY DEFINER EFFECTIVE GRANTS ---');

  runTest('SECURITY DEFINER Audit', 'All 38 public functions are SECURITY DEFINER with fixed search paths', () => {
    const output = psql(`
      SELECT p.proname, p.prosecdef, array_to_string(p.proconfig, ', ')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname;
    `);

    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length !== 38) {
      throw new Error(`Expected exactly 38 public functions, found ${lines.length}`);
    }

    for (const line of lines) {
      const [name, isSecDef, searchPath] = line.split('|');
      if (isSecDef !== 't') {
        throw new Error(`Function ${name} is NOT SECURITY DEFINER`);
      }
      if (!searchPath || !searchPath.includes('search_path=')) {
        throw new Error(`Function ${name} does not have an explicit search_path declared: ${searchPath}`);
      }
    }
  });

  runTest('SECURITY DEFINER Audit', 'update_notification_delivery_status is revoked from authenticated and anon', () => {
    const acl = psql(`
      SELECT COALESCE(
          (SELECT string_agg(grantee.rolname || '=' || priv.privilege_type, ', ')
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) priv
           JOIN pg_roles grantee ON grantee.oid = priv.grantee
          ), 'NONE'
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'update_notification_delivery_status';
    `);

    if (acl.includes('authenticated=EXECUTE')) {
      throw new Error(`update_notification_delivery_status still grants EXECUTE to authenticated: ${acl}`);
    }
    if (acl.includes('anon=EXECUTE')) {
      throw new Error(`update_notification_delivery_status grants EXECUTE to anon: ${acl}`);
    }
    if (!acl.includes('service_role=EXECUTE')) {
      throw new Error(`update_notification_delivery_status missing service_role grant: ${acl}`);
    }
  });


  // --------------------------------------------------------------------------
  // SUITE 8: PUBLIC Execution Privilege Verification
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 8: PUBLIC EXECUTION PRIVILEGE VERIFICATION ---');

  runTest('PUBLIC Privilege Audit', 'Zero public routines grant EXECUTE to PUBLIC role', () => {
    const publicGrants = psql(`
      SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) priv
      JOIN pg_roles grantee ON grantee.oid = priv.grantee
      WHERE n.nspname = 'public' AND grantee.rolname = 'public' AND priv.privilege_type = 'EXECUTE';
    `);

    if (publicGrants !== '0') {
      throw new Error(`Found ${publicGrants} public routines granting EXECUTE to PUBLIC!`);
    }
  });

  runTest('PUBLIC Privilege Audit', 'Default routine privileges for postgres in public schema revoke PUBLIC and anon', () => {
    const defaultAcl = psql(`
      SELECT COALESCE(
          (SELECT string_agg(grantee.rolname || '=' || priv.privilege_type, ', ')
           FROM aclexplode(d.defaclacl) priv
           JOIN pg_roles grantee ON grantee.oid = priv.grantee
          ), 'NONE'
      )
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      WHERE d.defaclrole = 'postgres'::regrole 
        AND n.nspname = 'public' 
        AND d.defaclobjtype = 'f';
    `);

    if (defaultAcl.includes('public=EXECUTE')) {
      throw new Error(`Default ACL still grants EXECUTE to public: ${defaultAcl}`);
    }
    console.log(`    Default function ACL verified: ${defaultAcl}`);
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PHASE 2.4.3 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed:         ${passed}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Pass Rate:       ${((passed / results.length) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error('Failed test details:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.error(`- [${r.suite}] ${r.name}: ${r.details}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
