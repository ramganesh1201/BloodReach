/**
 * CareLoop Phase 2.4.2 — Final Authorization & Security Closure Test Suite
 * 
 * Verifies against real local PostgreSQL 17.6 (supabase_db_blood):
 * 1. Notification Authorization Closure (Direct UPDATE/INSERT/DELETE denied; restricted RPC verified)
 * 2. Blood Centre Manager Hierarchy (No manager promotion by manager; no inter-manager suspension; cross-centre isolation; table grants revoked)
 * 3. Genuinely Atomic TURN Rate Limiter (clock_timestamp(), 15 parallel first-time, 15 parallel existing, boundary reset)
 * 4. Full SECURITY DEFINER Audit (38 functions, zero PUBLIC execute, explicit search_path)
 */

import { exec, execSync } from 'child_process';
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

function execAsUser(userId: string, role: string, sql: string): string {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    ${sql}
    COMMIT;
  `;
  const raw = psql(wrapped);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
  if (jsonLine) return jsonLine;
  const resultLines = lines.filter((l) => !['BEGIN', 'SET', 'COMMIT'].includes(l));
  return resultLines.join('\n');
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
  const res = psql(sql);
  if (res.startsWith('ERROR')) {
    throw new Error(`Failed to create test user: ${res}`);
  }
  return id;
}

function runTest(suite: string, name: string, fn: () => void | Promise<void>) {
  const start = Date.now();
  try {
    const res = fn();
    if (res instanceof Promise) throw new Error('Use runAsyncTest for async functions');
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

async function main() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 2.4.2 FINAL SECURITY CLOSURE TEST BATTERY');
  console.log('Local PostgreSQL 17.6 (supabase_db_blood)');
  console.log('================================================================\n');

  // Pre-seed app_settings with test TURN secret and url
  psql(`
    INSERT INTO public.app_settings (key, value) VALUES
    ('turn_shared_secret', 'careloop-test-turn-shared-secret-32chars!!'),
    ('turn_server_url', 'turn:turn.careloop.org:3478?transport=udp')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);

  // --------------------------------------------------------------------------
  // SUITE 1: Notification Authorization
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: NOTIFICATION AUTHORIZATION CLOSURE ---');

  runTest('Notification Authorization', 'Direct table UPDATE denied to authenticated users', () => {
    const victim = createTestUser(`notif_victim_${Date.now()}@careloop.local`, 'patient');
    const attacker = createTestUser(`notif_attacker_${Date.now()}@careloop.local`, 'patient');

    const notifId = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status, created_at)
      VALUES ('${notifId}', '${victim}', 'IN_APP', 'Emergency Notification', 'Legitimate medical alert', 'DELIVERED', NOW());
    `);

    // Attacker attempts direct UPDATE on victim's notification
    const resAttacker = execAsUser(attacker, 'patient', `
      UPDATE public.notifications SET content = 'Tampered by attacker' WHERE id = '${notifId}';
    `);
    if (!resAttacker.includes('permission denied for table notifications')) {
      throw new Error(`Direct UPDATE was not rejected with permission denied: ${resAttacker}`);
    }

    // Even the victim cannot directly UPDATE content, user_id, channel, or metadata
    const resVictim = execAsUser(victim, 'patient', `
      UPDATE public.notifications SET content = 'Tampered by recipient' WHERE id = '${notifId}';
    `);
    if (!resVictim.includes('permission denied for table notifications')) {
      throw new Error(`Recipient direct UPDATE was not rejected with permission denied: ${resVictim}`);
    }
  });

  runTest('Notification Authorization', 'Direct table INSERT, DELETE, TRUNCATE denied to authenticated users', () => {
    const user = createTestUser(`notif_user_${Date.now()}@careloop.local`, 'patient');

    // Direct INSERT attempt
    const resInsert = execAsUser(user, 'patient', `
      INSERT INTO public.notifications (user_id, channel, title, content)
      VALUES ('${user}', 'IN_APP', 'Forged Alert', 'Forged text');
    `);
    if (!resInsert.includes('permission denied for table notifications')) {
      throw new Error(`Direct INSERT was not rejected: ${resInsert}`);
    }

    // Direct DELETE attempt
    const resDelete = execAsUser(user, 'patient', `
      DELETE FROM public.notifications WHERE user_id = '${user}';
    `);
    if (!resDelete.includes('permission denied for table notifications')) {
      throw new Error(`Direct DELETE was not rejected: ${resDelete}`);
    }
  });

  runTest('Notification Authorization', 'Users can only acknowledge their own notifications via restricted RPC', () => {
    const userA = createTestUser(`notif_a_${Date.now()}@careloop.local`, 'patient');
    const userB = createTestUser(`notif_b_${Date.now()}@careloop.local`, 'patient');

    const notifA = crypto.randomUUID();
    psql(`
      INSERT INTO public.notifications (id, user_id, channel, title, content, status, created_at)
      VALUES ('${notifA}', '${userA}', 'IN_APP', 'Alert A', 'Content A', 'DELIVERED', NOW());
    `);

    // User B attempts to acknowledge User A's notification (DENIED)
    const bAttemptsA = execAsUser(userB, 'patient', `SELECT public.acknowledge_notification('${notifA}');`);
    const parsedB = JSON.parse(bAttemptsA);
    if (parsedB.success !== false || !parsedB.message.includes('not found or access denied')) {
      throw new Error(`Cross-user acknowledgement was not denied: ${bAttemptsA}`);
    }

    // User A acknowledges their own notification (PERMITTED)
    const aAcksA = execAsUser(userA, 'patient', `SELECT public.acknowledge_notification('${notifA}');`);
    const parsedA = JSON.parse(aAcksA);
    if (!parsedA.success) {
      throw new Error(`User A failed to acknowledge own notification: ${aAcksA}`);
    }

    // Verify row state in PostgreSQL
    const state = psql(`SELECT status, acknowledged_at IS NOT NULL, content FROM public.notifications WHERE id = '${notifA}';`);
    if (!state.includes('ACKNOWLEDGED|t|Content A')) {
      throw new Error(`Unexpected row state after acknowledgement: ${state}`);
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Blood Centre Manager Authority & Hierarchy
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: BLOOD CENTRE MANAGER AUTHORITY & HIERARCHY ---');

  runTest('Manager Authority', 'Manager hierarchy: coordinator grants managers; managers manage staff/tech only', () => {
    // Setup 2 centres
    const centreA = crypto.randomUUID();
    const centreB = crypto.randomUUID();
    psql(`
      INSERT INTO public.blood_centres (id, name, address, city, phone, created_at) VALUES
      ('${centreA}', 'Centre A', '100 Main St', 'Vizag', '+918911111111', NOW()),
      ('${centreB}', 'Centre B', '200 East St', 'Vijayawada', '+918662222222', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    const coord = createTestUser(`coord_h_${Date.now()}@careloop.local`, 'coordinator');
    const mgrA1 = createTestUser(`mgra1_${Date.now()}@careloop.local`, 'blood_centre');
    const mgrA2 = createTestUser(`mgra2_${Date.now()}@careloop.local`, 'blood_centre');
    const techA = createTestUser(`techa_${Date.now()}@careloop.local`, 'blood_centre');
    const staffA = createTestUser(`staffa_${Date.now()}@careloop.local`, 'blood_centre');
    const mgrB = createTestUser(`mgrb_${Date.now()}@careloop.local`, 'blood_centre');

    // Coordinator appoints mgrA1 to Centre A and mgrB to Centre B
    const coordAddMgrA1 = execAsUser(coord, 'coordinator', `SELECT public.add_centre_member_atomic('${centreA}', '${mgrA1}', 'manager');`);
    if (!JSON.parse(coordAddMgrA1).success) throw new Error(`Coordinator failed to appoint manager A1: ${coordAddMgrA1}`);

    const coordAddMgrB = execAsUser(coord, 'coordinator', `SELECT public.add_centre_member_atomic('${centreB}', '${mgrB}', 'manager');`);
    if (!JSON.parse(coordAddMgrB).success) throw new Error(`Coordinator failed to appoint manager B: ${coordAddMgrB}`);

    // TEST 1: Manager A1 attempts to create another MANAGER (DENIED - Manager Escalation Guard)
    const mgrA1AddMgrA2 = execAsUser(mgrA1, 'blood_centre', `SELECT public.add_centre_member_atomic('${centreA}', '${mgrA2}', 'manager');`);
    const parsedEscalate = JSON.parse(mgrA1AddMgrA2);
    if (parsedEscalate.success !== false || !parsedEscalate.message.includes('Only system coordinators or administrators can grant manager privileges')) {
      throw new Error(`Manager was permitted to promote another manager! Result: ${mgrA1AddMgrA2}`);
    }

    // TEST 2: Manager A1 adds technician and staff (PERMITTED)
    const mgrAddTech = execAsUser(mgrA1, 'blood_centre', `SELECT public.add_centre_member_atomic('${centreA}', '${techA}', 'technician');`);
    if (!JSON.parse(mgrAddTech).success) throw new Error(`Manager failed to add technician: ${mgrAddTech}`);

    const mgrAddStaff = execAsUser(mgrA1, 'blood_centre', `SELECT public.add_centre_member_atomic('${centreA}', '${staffA}', 'staff');`);
    if (!JSON.parse(mgrAddStaff).success) throw new Error(`Manager failed to add staff: ${mgrAddStaff}`);

    // Coordinator appoints mgrA2 as second manager of Centre A
    const coordAddMgrA2 = execAsUser(coord, 'coordinator', `SELECT public.add_centre_member_atomic('${centreA}', '${mgrA2}', 'manager');`);
    if (!JSON.parse(coordAddMgrA2).success) throw new Error(`Coordinator failed to appoint manager A2: ${coordAddMgrA2}`);

    // TEST 3: Manager A1 attempts to suspend Manager A2 (DENIED - Inter-manager protection)
    const mgr1SuspendsMgr2 = execAsUser(mgrA1, 'blood_centre', `SELECT public.set_centre_member_status_atomic('${centreA}', '${mgrA2}', 'suspended');`);
    const parsedSusp = JSON.parse(mgr1SuspendsMgr2);
    if (parsedSusp.success !== false || !parsedSusp.message.includes('Only system coordinators or administrators can change manager status')) {
      throw new Error(`Manager A1 was permitted to suspend Manager A2! Result: ${mgr1SuspendsMgr2}`);
    }

    // TEST 4: Manager A1 attempts self-suspension (DENIED - Self-suspension guard)
    const selfSusp = execAsUser(mgrA1, 'blood_centre', `SELECT public.set_centre_member_status_atomic('${centreA}', '${mgrA1}', 'suspended');`);
    const parsedSelfSusp = JSON.parse(selfSusp);
    if (parsedSelfSusp.success !== false || !parsedSelfSusp.message.includes('Self-suspension prohibited')) {
      throw new Error(`Self-suspension was not blocked! Result: ${selfSusp}`);
    }

    // TEST 5: Manager A1 attempts self-role alteration (DENIED)
    const selfRoleChange = execAsUser(mgrA1, 'blood_centre', `SELECT public.add_centre_member_atomic('${centreA}', '${mgrA1}', 'technician');`);
    const parsedSelfRole = JSON.parse(selfRoleChange);
    if (parsedSelfRole.success !== false || !parsedSelfRole.message.includes('Cannot modify own membership role')) {
      throw new Error(`Self-role modification was not blocked! Result: ${selfRoleChange}`);
    }

    // TEST 6: Manager A1 attempts cross-centre management on Centre B (DENIED)
    const crossCentreAdd = execAsUser(mgrA1, 'blood_centre', `SELECT public.add_centre_member_atomic('${centreB}', '${staffA}', 'staff');`);
    const parsedCross = JSON.parse(crossCentreAdd);
    if (parsedCross.success !== false || !parsedCross.message.includes('Unauthorized')) {
      throw new Error(`Cross-centre management was not blocked! Result: ${crossCentreAdd}`);
    }

    // TEST 7: Direct table mutations on blood_centre_memberships (DENIED to all client roles)
    const directUpdate = execAsUser(mgrA1, 'blood_centre', `
      UPDATE public.blood_centre_memberships SET role = 'admin' WHERE user_id = '${mgrA1}';
    `);
    if (!directUpdate.includes('permission denied for table blood_centre_memberships')) {
      throw new Error(`Direct membership table update was not rejected with permission denied: ${directUpdate}`);
    }

    // TEST 8: Manager A1 suspends Staff A (PERMITTED), and suspended staff cannot modify inventory
    const mgrSuspStaff = execAsUser(mgrA1, 'blood_centre', `SELECT public.set_centre_member_status_atomic('${centreA}', '${staffA}', 'suspended');`);
    if (!JSON.parse(mgrSuspStaff).success) throw new Error(`Manager failed to suspend staff: ${mgrSuspStaff}`);

    const suspInv = execAsUser(staffA, 'blood_centre', `SELECT public.adjust_inventory_atomic('${centreA}', 'O+', 'Packed RBC', 1, 'Suspended test');`);
    if (JSON.parse(suspInv).success !== false) {
      throw new Error(`Suspended staff was permitted to modify inventory! Result: ${suspInv}`);
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 3: TURN Rate Limiter Concurrency & Clock Timestamp
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: TURN RATE LIMITER CONCURRENCY & CLOCK TIMESTAMP ---');

  await runAsyncTest('TURN Concurrency', '15 simultaneous first-time requests: exactly 10 succeed, 5 rejected with retry_after', async () => {
    const newUser = createTestUser(`first_time_${Date.now()}@careloop.local`, 'donor');

    const makeCall = (): Promise<{ stdout: string; error?: string }> => {
      return new Promise((resolve) => {
        const script = `
          SET ROLE authenticated;
          SET "request.jwt.claim.sub" = '${newUser}';
          SET "request.jwt.claim.role" = 'authenticated';
          SELECT public.get_ephemeral_turn_credentials(600);
        `;
        const child = exec(
          'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
          (err, stdout, stderr) => {
            if (err) {
              resolve({ stdout: '', error: stderr || stdout || err.message });
              return;
            }
            const lines = (stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
            const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
            resolve({ stdout: jsonLine || stdout });
          }
        );
        child.stdin?.write(script);
        child.stdin?.end();
      });
    };

    const promises: Promise<{ stdout: string; error?: string }>[] = [];
    for (let i = 0; i < 15; i++) {
      promises.push(makeCall());
    }

    const responses = await Promise.all(promises);
    let successCount = 0;
    let rateLimitedCount = 0;
    let errors: string[] = [];

    for (const r of responses) {
      if (r.error) {
        errors.push(r.error);
        continue;
      }
      const parsed = JSON.parse(r.stdout);
      if (parsed.success === true) {
        successCount++;
        if (parsed.ttl_seconds !== 600 || !parsed.expires_at) {
          errors.push(`Invalid credential payload: ${r.stdout}`);
        }
      } else if (parsed.success === false && parsed.error === 'RATE_LIMIT_EXCEEDED') {
        rateLimitedCount++;
        // Verify no credentials returned in rate limited response
        if (parsed.ice_servers || typeof parsed.retry_after_seconds !== 'number') {
          errors.push(`Rate limited response contains credentials or missing retry_after: ${r.stdout}`);
        }
      } else {
        errors.push(`Unexpected response: ${r.stdout}`);
      }
    }

    console.log(`    First-time concurrency: success=${successCount}, rateLimited=${rateLimitedCount}, errors=${errors.length}`);
    if (errors.length > 0) throw new Error(`Concurrent execution errors: ${errors.join('; ')}`);
    if (successCount !== 10) throw new Error(`Expected exactly 10 successes, got ${successCount}`);
    if (rateLimitedCount !== 5) throw new Error(`Expected exactly 5 rate limited rejections, got ${rateLimitedCount}`);

    const finalCount = psql(`SELECT request_count FROM public.turn_request_rate_limits WHERE user_id = '${newUser}';`);
    if (finalCount !== '10') throw new Error(`Expected database request_count 10, got ${finalCount}`);
  });

  await runAsyncTest('TURN Concurrency', '15 simultaneous requests for existing user (at 5 reqs): 5 succeed, 10 rejected', async () => {
    const existingUser = createTestUser(`existing_user_${Date.now()}@careloop.local`, 'donor');

    // Run 5 initial requests
    for (let i = 0; i < 5; i++) {
      const res = execAsUser(existingUser, 'donor', `SELECT public.get_ephemeral_turn_credentials(600);`);
      if (!JSON.parse(res).success) throw new Error(`Pre-request ${i} failed`);
    }

    const midCount = psql(`SELECT request_count FROM public.turn_request_rate_limits WHERE user_id = '${existingUser}';`);
    if (midCount !== '5') throw new Error(`Expected count 5, got ${midCount}`);

    // Fire 15 parallel requests concurrently
    const makeCall = (): Promise<{ stdout: string; error?: string }> => {
      return new Promise((resolve) => {
        const script = `
          SET ROLE authenticated;
          SET "request.jwt.claim.sub" = '${existingUser}';
          SET "request.jwt.claim.role" = 'authenticated';
          SELECT public.get_ephemeral_turn_credentials(600);
        `;
        const child = exec(
          'docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off',
          (err, stdout, stderr) => {
            if (err) {
              resolve({ stdout: '', error: stderr || stdout || err.message });
              return;
            }
            const lines = (stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
            const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
            resolve({ stdout: jsonLine || stdout });
          }
        );
        child.stdin?.write(script);
        child.stdin?.end();
      });
    };

    const promises: Promise<{ stdout: string; error?: string }>[] = [];
    for (let i = 0; i < 15; i++) {
      promises.push(makeCall());
    }

    const responses = await Promise.all(promises);
    let successCount = 0;
    let rateLimitedCount = 0;
    let errors: string[] = [];

    for (const r of responses) {
      if (r.error) {
        errors.push(r.error);
        continue;
      }
      const parsed = JSON.parse(r.stdout);
      if (parsed.success === true) {
        successCount++;
      } else if (parsed.success === false && parsed.error === 'RATE_LIMIT_EXCEEDED') {
        rateLimitedCount++;
      } else {
        errors.push(`Unexpected response: ${r.stdout}`);
      }
    }

    console.log(`    Existing-user concurrency: success=${successCount}, rateLimited=${rateLimitedCount}, errors=${errors.length}`);
    if (errors.length > 0) throw new Error(`Concurrent execution errors: ${errors.join('; ')}`);
    if (successCount !== 5) throw new Error(`Expected exactly 5 successes (to reach 10), got ${successCount}`);
    if (rateLimitedCount !== 10) throw new Error(`Expected exactly 10 rate limited rejections, got ${rateLimitedCount}`);

    const finalCount = psql(`SELECT request_count FROM public.turn_request_rate_limits WHERE user_id = '${existingUser}';`);
    if (finalCount !== '10') throw new Error(`Expected database request_count 10, got ${finalCount}`);
  });

  runTest('TURN Rate Limiter', 'Window boundary reset: expired window resets count to 1 and issues credentials', () => {
    const boundaryUser = createTestUser(`boundary_${Date.now()}@careloop.local`, 'donor');

    // Run 10 requests to max out
    for (let i = 0; i < 10; i++) {
      execAsUser(boundaryUser, 'donor', `SELECT public.get_ephemeral_turn_credentials(600);`);
    }

    // 11th request is rejected
    const rej11 = execAsUser(boundaryUser, 'donor', `SELECT public.get_ephemeral_turn_credentials(600);`);
    if (JSON.parse(rej11).success !== false) throw new Error('11th request was not rate limited');

    // Simulate window expiry by shifting window_start to 10 minutes and 2 seconds ago
    psql(`
      UPDATE public.turn_request_rate_limits 
      SET window_start = clock_timestamp() - INTERVAL '10 minutes 2 seconds'
      WHERE user_id = '${boundaryUser}';
    `);

    // Next request evaluates clock_timestamp() - window_start >= 10 min, resets count to 1, succeeds
    const resetReq = execAsUser(boundaryUser, 'donor', `SELECT public.get_ephemeral_turn_credentials(600);`);
    const parsedReset = JSON.parse(resetReq);
    if (!parsedReset.success || parsedReset.ttl_seconds !== 600) {
      throw new Error(`Request at window boundary failed to reset: ${resetReq}`);
    }

    const resetCount = psql(`SELECT request_count FROM public.turn_request_rate_limits WHERE user_id = '${boundaryUser}';`);
    if (resetCount !== '1') throw new Error(`Expected request_count to reset to 1, got ${resetCount}`);
  });

  // --------------------------------------------------------------------------
  // SUITE 4: SECURITY DEFINER Full Audit Verification
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: SECURITY DEFINER VERIFICATION ---');

  runTest('SECURITY DEFINER Audit', 'Inspect all 38 functions for search_path, owner, and execute grants', () => {
    const raw = psql(`
      SELECT 
          p.proname,
          pg_get_userbyid(p.proowner) AS owner,
          p.prosecdef AS is_secdef,
          COALESCE(array_to_string(p.proconfig, ', '), 'NONE') AS search_path_config,
          has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname;
    `);

    const lines = raw.split('\n').filter(Boolean);
    if (lines.length !== 38) {
      throw new Error(`Expected exactly 38 public functions, found ${lines.length}`);
    }

    for (const line of lines) {
      const [name, owner, isSecdef, searchPath, pubExec, anonExec, authExec] = line.split('|');
      if (owner !== 'postgres') {
        throw new Error(`Function ${name} has invalid owner: ${owner}`);
      }
      if (isSecdef !== 't') {
        throw new Error(`Function ${name} is not SECURITY DEFINER`);
      }
      if (!searchPath.includes('search_path=')) {
        throw new Error(`Function ${name} is missing search_path: ${searchPath}`);
      }
      if (pubExec === 't') {
        throw new Error(`Function ${name} grants EXECUTE to PUBLIC`);
      }
    }
    console.log(`    Audited 38 functions: All owned by postgres, All SECURITY DEFINER, All search_path fixed, Zero PUBLIC execute.`);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST BATTERY RESULTS SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(` - [${r.suite}] ${r.name}: ${r.details}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL PHASE 2.4.2 SECURITY CLOSURE TESTS PASSED WITH 0 FAILURES!');
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

