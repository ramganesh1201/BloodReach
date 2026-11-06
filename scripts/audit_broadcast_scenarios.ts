/**
 * CareLoop Phase 3.0.2 — Audit 3: Private Broadcast Channel Authorization
 * 
 * Verifies all 7 signaling authorization scenarios against realtime.messages
 * directly using PostgreSQL Row Level Security (RLS) enforcement.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';

interface TestResult {
  scenario: string;
  description: string;
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
  const lines = cleanPsqlLines(raw);
  return lines.join('\n');
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

async function runAudit3() {
  console.log('================================================================');
  console.log('CareLoop Phase 3.0.2 — Audit 3: Private Broadcast Authorization');
  console.log('================================================================\n');

  const results: TestResult[] = [];

  // 1. Fetch test users
  const usersRaw = psql(`SELECT id FROM auth.users ORDER BY created_at LIMIT 3;`);
  const userIds = usersRaw.split('\n').map(l => l.trim()).filter(Boolean);
  if (userIds.length < 3) {
    throw new Error(`Expected at least 3 users in auth.users, found ${userIds.length}`);
  }

  const callerId = userIds[0];
  const calleeId = userIds[1];
  const outsiderId = userIds[2];

  // Ensure initial active status for all 3
  psql(`UPDATE public.profiles SET status = 'ACTIVE' WHERE id IN ('${callerId}', '${calleeId}', '${outsiderId}');`);

  const activeCallId = crypto.randomUUID();
  const endedCallId = crypto.randomUUID();
  const convIdRaw = psql(`SELECT id FROM public.conversations LIMIT 1;`);
  const convId = convIdRaw.split('\n')[0].trim();

  // Create active and ended call sessions
  psql(`
    INSERT INTO public.call_sessions (id, caller_id, receiver_id, conversation_id, status)
    VALUES 
      ('${activeCallId}', '${callerId}', '${calleeId}', '${convId}', 'RINGING'),
      ('${endedCallId}', '${callerId}', '${calleeId}', '${convId}', 'ENDED');
  `);

  console.log(`Caller:   ${callerId}`);
  console.log(`Callee:   ${calleeId}`);
  console.log(`Outsider: ${outsiderId}`);
  console.log(`Active Call ID: ${activeCallId} (status: RINGING)`);
  console.log(`Ended Call ID:  ${endedCallId} (status: ENDED)\n`);

  // Helper to test SELECT (listen) on realtime.messages
  function testSelect(userId: string, topic: string): boolean {
    // Insert a test message for this topic as postgres
    const msgId = crypto.randomUUID();
    psql(`INSERT INTO realtime.messages (id, topic, extension, payload) VALUES ('${msgId}', '${topic}', 'broadcast', '{"test": true}'::jsonb);`);
    
    // Check if user can see this message
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
    
    // Cleanup test message
    psql(`DELETE FROM realtime.messages WHERE id = '${msgId}';`);
    return parseInt(res, 10) > 0;
  }

  // Helper to test INSERT (broadcast) on realtime.messages
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

  // Scenario 1: Valid caller joins own call channel
  {
    const canSelect = testSelect(callerId, `call:${activeCallId}`);
    const canInsert = testInsert(callerId, `call:${activeCallId}`);
    const allowed = canSelect && canInsert;
    results.push({
      scenario: 'Scenario 1',
      description: 'Valid caller joins own call channel (call:{callId})',
      expected: 'ALLOW',
      actual: allowed ? 'ALLOW' : 'DENY',
      passed: allowed,
      details: `Listen (SELECT): ${canSelect ? 'ALLOWED' : 'DENIED'}, Broadcast (INSERT): ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Scenario 2: Valid callee joins same call channel
  {
    const canSelect = testSelect(calleeId, `call:${activeCallId}`);
    const canInsert = testInsert(calleeId, `call:${activeCallId}`);
    const allowed = canSelect && canInsert;
    results.push({
      scenario: 'Scenario 2',
      description: 'Valid callee joins same call channel (call:{callId})',
      expected: 'ALLOW',
      actual: allowed ? 'ALLOW' : 'DENY',
      passed: allowed,
      details: `Listen (SELECT): ${canSelect ? 'ALLOWED' : 'DENIED'}, Broadcast (INSERT): ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Scenario 3: Unrelated user joins call channel
  {
    const canSelect = testSelect(outsiderId, `call:${activeCallId}`);
    const canInsert = testInsert(outsiderId, `call:${activeCallId}`);
    const denied = !canSelect && !canInsert;
    results.push({
      scenario: 'Scenario 3',
      description: 'Unrelated user joins call channel (call:{callId})',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen (SELECT): ${canSelect ? 'ALLOWED' : 'DENIED'}, Broadcast (INSERT): ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Scenario 4: Unrelated user subscribes to another user's alert channel
  {
    const canSelect = testSelect(outsiderId, `user-calls:${calleeId}`);
    const canSelectUser = testSelect(outsiderId, `user:${calleeId}`);
    const denied = !canSelect && !canSelectUser;
    results.push({
      scenario: 'Scenario 4',
      description: "Unrelated user subscribes to another user's alert channel (user-calls:{calleeId})",
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen user-calls: ${canSelect ? 'ALLOWED' : 'DENIED'}, Listen user: ${canSelectUser ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Scenario 5: Unauthorized user injects signaling message without ringing session
  {
    // Outsider attempts to broadcast to callee's inbox (no ringing call initiated by outsider)
    const canInsert = testInsert(outsiderId, `user-calls:${calleeId}`);
    const denied = !canInsert;
    results.push({
      scenario: 'Scenario 5',
      description: "Unauthorized user injects alert broadcast into another user's inbox",
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Broadcast (INSERT) into user-calls:${calleeId}: ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Scenario 6: Suspended participant loses access even with active session
  {
    psql(`UPDATE public.profiles SET status = 'SUSPENDED' WHERE id = '${callerId}';`);
    const canSelect = testSelect(callerId, `call:${activeCallId}`);
    const canInsert = testInsert(callerId, `call:${activeCallId}`);
    const denied = !canSelect && !canInsert;
    results.push({
      scenario: 'Scenario 6',
      description: 'Suspended caller loses listen and broadcast access to active call room',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen (SELECT): ${canSelect ? 'ALLOWED' : 'DENIED'}, Broadcast (INSERT): ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
    // Restore status to ACTIVE
    psql(`UPDATE public.profiles SET status = 'ACTIVE' WHERE id = '${callerId}';`);
  }

  // Scenario 7: Expired/ended call cannot be used to gain new signaling access
  {
    const canSelect = testSelect(callerId, `call:${endedCallId}`);
    const canInsert = testInsert(callerId, `call:${endedCallId}`);
    const denied = !canSelect && !canInsert;
    results.push({
      scenario: 'Scenario 7',
      description: 'Terminated call room (status: ENDED) locked against signaling access',
      expected: 'DENY',
      actual: denied ? 'DENY' : 'ALLOW',
      passed: denied,
      details: `Listen (SELECT): ${canSelect ? 'ALLOWED' : 'DENIED'}, Broadcast (INSERT): ${canInsert ? 'ALLOWED' : 'DENIED'}`
    });
  }

  // Cleanup test call sessions
  psql(`DELETE FROM public.call_sessions WHERE id IN ('${activeCallId}', '${endedCallId}');`);

  // Report results
  console.log('----------------------------------------------------------------');
  console.log('AUDIT 3 VERIFICATION MATRIX:');
  console.log('----------------------------------------------------------------');
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    if (!r.passed) allPassed = false;
    console.log(`${mark} [${r.scenario}] ${r.description}`);
    console.log(`       Expected: ${r.expected} | Actual: ${r.actual}`);
    console.log(`       Details:  ${r.details}\n`);
  }

  console.log('----------------------------------------------------------------');
  if (allPassed) {
    console.log('>>> ALL 7 BROADCAST AUTHORIZATION SCENARIOS PASSED <<<');
  } else {
    console.log('>>> ONE OR MORE SCENARIOS FAILED <<<');
    process.exit(1);
  }
}

runAudit3().catch((err) => {
  console.error('Audit 3 runner error:', err);
  process.exit(1);
});
