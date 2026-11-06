/**
 * CareLoop Phase 3.0.3 — Task 1: Broadcast Topic Binding & Attack Test
 * 
 * Tests:
 * 1. call:{callId} is bound to the actual call session UUID.
 * 2. Only actual caller and callee can access the call room (outsider denied).
 * 3. user-calls:{calleeId} INSERT binds topic suffix to actual cs.receiver_id.
 * 4. SELECT authorization binds topic suffix strictly to auth.uid().
 * 5. Suspended users and terminated calls are denied.
 * 6. Legitimate caller cannot send alerts to arbitrary users' channels.
 * 7. EXPLICIT ATTACK TEST: Caller A has valid ringing call to User B; Caller A attempts 
 *    to broadcast to User C's user-calls topic -> MUST BE DENIED.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';

interface TestResult {
  testId: string;
  name: string;
  expected: 'ALLOW' | 'DENY';
  actual: 'ALLOW' | 'DENY';
  passed: boolean;
  details: string;
}

function cleanPsqlLines(raw: string): string[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => 
    !['BEGIN', 'SET', 'COMMIT', 'ROLLBACK', 'DO'].includes(l) && 
    !/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REVOKE|GRANT)\s+\d*(\s+\d+)?$/i.test(l)
  );
}

function psql(query: string): string {
  const raw = execSync(
    `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
  return cleanPsqlLines(raw).join('\n');
}

function psqlLastVal(query: string): string {
  const raw = execSync(
    `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
  const lines = cleanPsqlLines(raw);
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

function tryPsql(query: string): { success: boolean; output: string } {
  try {
    const raw = execSync(
      `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return { success: true, output: cleanPsqlLines(raw).join('\n') };
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    return { success: false, output: stderr };
  }
}

async function runTopicBindingTests() {
  console.log('================================================================');
  console.log('CareLoop Phase 3.0.3 — Task 1: Broadcast Topic Binding Suite');
  console.log('================================================================\n');

  const results: TestResult[] = [];

  // Fetch 3 existing users for Caller A, Callee B, and Outsider/Target C
  const usersRaw = psql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 3;`);
  const userIds = usersRaw.split('\n').map(l => l.trim()).filter(Boolean);
  if (userIds.length < 3) {
    throw new Error(`Expected at least 3 users in auth.users, found ${userIds.length}`);
  }

  const callerA = userIds[0];
  const calleeB = userIds[1];
  const userC = userIds[2];

  // Set all 3 to ACTIVE
  psql(`UPDATE public.profiles SET status = 'ACTIVE' WHERE id IN ('${callerA}', '${calleeB}', '${userC}');`);

  const activeCallAB = crypto.randomUUID();
  const endedCallAB = crypto.randomUUID();
  const convId = psql(`SELECT id FROM public.conversations LIMIT 1;`).split('\n')[0].trim();

  // Create call session: Caller A calling Callee B
  psql(`
    INSERT INTO public.call_sessions (id, caller_id, receiver_id, conversation_id, status)
    VALUES 
      ('${activeCallAB}', '${callerA}', '${calleeB}', '${convId}', 'RINGING'),
      ('${endedCallAB}', '${callerA}', '${calleeB}', '${convId}', 'ENDED');
  `);

  console.log(`Caller A:       ${callerA}`);
  console.log(`Callee B:       ${calleeB}`);
  console.log(`User C (Other): ${userC}`);
  console.log(`Call A->B (RINGING): ${activeCallAB}`);
  console.log(`Call A->B (ENDED):   ${endedCallAB}\n`);

  // Helper to test SELECT (listen)
  function testSelect(userId: string, topic: string): boolean {
    const msgId = crypto.randomUUID();
    psql(`INSERT INTO realtime.messages (id, topic, extension, payload) VALUES ('${msgId}', '${topic}', 'broadcast', '{"test": true}'::jsonb);`);
    
    const checkQuery = `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userId}', true);
      SELECT set_config('request.jwt.claim.role', 'authenticated', true);
      SELECT set_config('realtime.topic', '${topic}', true);
      SELECT COUNT(*) FROM realtime.messages WHERE id = '${msgId}';
      COMMIT;
    `;
    const res = psqlLastVal(checkQuery);
    psql(`DELETE FROM realtime.messages WHERE id = '${msgId}';`);
    return parseInt(res, 10) > 0;
  }

  // Helper to test INSERT (broadcast)
  function testInsert(userId: string, topic: string): boolean {
    const insertQuery = `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userId}', true);
      SELECT set_config('request.jwt.claim.role', 'authenticated', true);
      SELECT set_config('realtime.topic', '${topic}', true);
      INSERT INTO realtime.messages (topic, extension, payload) VALUES ('${topic}', 'broadcast', '{"test": true}'::jsonb);
      ROLLBACK;
    `;
    const res = tryPsql(insertQuery);
    return res.success;
  }

  // Test 1: call:{callId} bound to actual session UUID - Caller A allowed
  {
    const canSelect = testSelect(callerA, `call:${activeCallAB}`);
    const canInsert = testInsert(callerA, `call:${activeCallAB}`);
    const allowed = canSelect && canInsert;
    results.push({
      testId: 'TB-01',
      name: 'Caller A can access active call room call:{activeCallAB}',
      expected: 'ALLOW',
      actual: allowed ? 'ALLOW' : 'DENY',
      passed: allowed,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}, Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 2: call:{callId} - Callee B allowed
  {
    const canSelect = testSelect(calleeB, `call:${activeCallAB}`);
    const canInsert = testInsert(calleeB, `call:${activeCallAB}`);
    const allowed = canSelect && canInsert;
    results.push({
      testId: 'TB-02',
      name: 'Callee B can access active call room call:{activeCallAB}',
      expected: 'ALLOW',
      actual: allowed ? 'ALLOW' : 'DENY',
      passed: allowed,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}, Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 3: call:{callId} - User C (outsider) strictly denied
  {
    const canSelect = testSelect(userC, `call:${activeCallAB}`);
    const canInsert = testInsert(userC, `call:${activeCallAB}`);
    const denied = !canSelect && !canInsert;
    results.push({
      testId: 'TB-03',
      name: 'User C (outsider) strictly denied access to call:{activeCallAB}',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}, Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 4: Legitimate alert broadcast: Caller A broadcasts to Callee B's user-calls:{calleeB}
  {
    const canInsert = testInsert(callerA, `user-calls:${calleeB}`);
    results.push({
      testId: 'TB-04',
      name: 'Caller A broadcasts alert to Callee B user-calls:{calleeB} during RINGING',
      expected: 'ALLOW',
      actual: canInsert ? 'ALLOW' : 'DENY',
      passed: canInsert,
      details: `Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 5: EXPLICIT ATTACK TEST: Caller A attempts to broadcast to User C's user-calls:{userC}
  // Caller A has a valid ringing call to B, but NOT to C!
  {
    const canInsert = testInsert(callerA, `user-calls:${userC}`);
    const denied = !canInsert;
    results.push({
      testId: 'TB-05 (ATTACK TEST)',
      name: 'ATTACK TEST: Caller A attempts alert broadcast to arbitrary User C (user-calls:{userC})',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Broadcast: ${canInsert ? 'ALLOWED (VULNERABILITY!)' : 'DENIED (SECURE)'}`
    });
  }

  // Test 6: SELECT authorization binds user-calls strictly to auth.uid()
  // Callee B can listen to own user-calls:{calleeB}
  {
    const canSelect = testSelect(calleeB, `user-calls:${calleeB}`);
    results.push({
      testId: 'TB-06',
      name: 'Callee B can listen to own alert inbox user-calls:{calleeB}',
      expected: 'ALLOW',
      actual: canSelect ? 'ALLOW' : 'DENY',
      passed: canSelect,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 7: SELECT authorization: User C cannot listen to Callee B's inbox user-calls:{calleeB}
  {
    const canSelect = testSelect(userC, `user-calls:${calleeB}`);
    const denied = !canSelect;
    results.push({
      testId: 'TB-07',
      name: 'User C cannot eavesdrop on Callee B inbox user-calls:{calleeB}',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen: ${canSelect ? 'ALLOWED (VULNERABILITY!)' : 'DENIED (SECURE)'}`
    });
  }

  // Test 8: Terminated call denied: Caller A cannot broadcast or listen to call:{endedCallAB}
  {
    const canSelect = testSelect(callerA, `call:${endedCallAB}`);
    const canInsert = testInsert(callerA, `call:${endedCallAB}`);
    const denied = !canSelect && !canInsert;
    results.push({
      testId: 'TB-08',
      name: 'Caller A cannot access terminated call room call:{endedCallAB} (status: ENDED)',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}, Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
  }

  // Test 9: Suspended user denied: Caller A suspended loses access to active call room
  {
    psql(`UPDATE public.profiles SET status = 'SUSPENDED' WHERE id = '${callerA}';`);
    const canSelect = testSelect(callerA, `call:${activeCallAB}`);
    const canInsert = testInsert(callerA, `call:${activeCallAB}`);
    const denied = !canSelect && !canInsert;
    results.push({
      testId: 'TB-09',
      name: 'Suspended Caller A loses access to active call room call:{activeCallAB}',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen: ${canSelect ? 'ALLOW' : 'DENY'}, Broadcast: ${canInsert ? 'ALLOW' : 'DENY'}`
    });
    // Restore Caller A to ACTIVE
    psql(`UPDATE public.profiles SET status = 'ACTIVE' WHERE id = '${callerA}';`);
  }

  // Cleanup test call sessions
  psql(`DELETE FROM public.call_sessions WHERE id IN ('${activeCallAB}', '${endedCallAB}');`);

  // Report results
  console.log('----------------------------------------------------------------');
  console.log('TASK 1 VERIFICATION & ATTACK TEST RESULTS:');
  console.log('----------------------------------------------------------------');
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    if (!r.passed) allPassed = false;
    console.log(`${mark} [${r.testId}] ${r.name}`);
    console.log(`       Expected: ${r.expected} | Actual: ${r.actual}`);
    console.log(`       Details:  ${r.details}\n`);
  }

  console.log('----------------------------------------------------------------');
  if (allPassed) {
    console.log('>>> TASK 1 VERDICT: ALL BROADCAST TOPIC BINDING & ATTACK TESTS PASSED <<<');
  } else {
    console.log('>>> TASK 1 VERDICT: ONE OR MORE TESTS FAILED <<<');
    process.exit(1);
  }
}

runTopicBindingTests().catch((err) => {
  console.error('Task 1 runner error:', err);
  process.exit(1);
});

