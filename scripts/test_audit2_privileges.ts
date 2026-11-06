/**
 * CareLoop Phase 3.0.2 — Audit 2: Function Privileges Deep Inspection
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function cleanPsqlOutput(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
  if (jsonLine) return jsonLine;
  const filtered = lines.filter((l) => 
    !['BEGIN', 'SET', 'COMMIT', 'DO'].includes(l) && 
    !/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REVOKE|GRANT)\s+\d*(\s+\d+)?$/i.test(l)
  );
  return filtered.join('\n');
}

function psql(query: string): string {
  const raw = execSync(
    `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
  return cleanPsqlOutput(raw);
}

async function runAudit2() {
  console.log('================================================================');
  console.log('CARELOOP PHASE 3.0.2 — AUDIT 2: FUNCTION PRIVILEGES INSPECTION');
  console.log('================================================================\n');

  // 1. Definition and Security Attributes
  const defInfo = psql(`
    SELECT jsonb_build_object(
      'proname', p.proname,
      'is_security_definer', p.prosecdef,
      'search_path', p.proconfig,
      'volatility', p.provolatile,
      'argtypes', pg_get_function_arguments(p.oid)
    )
    FROM pg_proc p
    WHERE p.proname = 'is_conversation_participant';
  `);
  const parsedDef = JSON.parse(defInfo);
  console.log('1. Function Definition & Attributes:');
  console.log(`   - Function: ${parsedDef.proname}(${parsedDef.argtypes})`);
  console.log(`   - Security: ${parsedDef.is_security_definer ? 'SECURITY DEFINER' : 'SECURITY INVOKER'}`);
  console.log(`   - Search Path: ${JSON.stringify(parsedDef.search_path)}`);
  console.log(`   - Volatility: ${parsedDef.volatility === 's' ? 'STABLE' : parsedDef.volatility === 'i' ? 'IMMUTABLE' : 'VOLATILE'}\n`);

  // 2. Privilege Matrix using has_function_privilege()
  const roles = ['anon', 'authenticated', 'service_role', 'postgres', 'supabase_realtime_admin'];
  console.log('2. Effective Privileges via has_function_privilege():');
  for (const r of roles) {
    const priv = psql(`SELECT has_function_privilege('${r}', 'public.is_conversation_participant(UUID)', 'EXECUTE');`);
    console.log(`   - Role ${r.padEnd(25)}: EXECUTE = ${priv}`);
  }

  // 3. Oracle Information Leakage Test
  console.log('\n3. Information Oracle Test:');
  const oracleTest = psql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    -- Test as user X checking conversation of user Y
    SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
    SELECT jsonb_build_object(
      'non_existent_conv', public.is_conversation_participant('00000000-0000-0000-0000-000000000000'),
      'other_users_conv', public.is_conversation_participant((SELECT id FROM public.conversations LIMIT 1))
    );
    COMMIT;
  `);
  const parsedOracle = JSON.parse(oracleTest);
  console.log(`   - Non-existent conversation: ${parsedOracle.non_existent_conv} (Expected: false)`);
  console.log(`   - Other user's conversation: ${parsedOracle.other_users_conv} (Expected: false)`);
  console.log(`   -> Information Oracle Exploitable: ${parsedOracle.non_existent_conv || parsedOracle.other_users_conv ? 'YES (VULNERABILITY)' : 'NO (SECURE)'}\n`);

  // 4. Test what happens if EXECUTE is revoked from anon
  console.log('4. Testing Least Privilege: Revoke anon execute and test authenticated CDC:');
  psql(`REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID) FROM anon;`);

  const anonPrivAfter = psql(`SELECT has_function_privilege('anon', 'public.is_conversation_participant(UUID)', 'EXECUTE');`);
  const realtimePrivAfter = psql(`SELECT has_function_privilege('supabase_realtime_admin', 'public.is_conversation_participant(UUID)', 'EXECUTE');`);
  console.log(`   - anon EXECUTE: ${anonPrivAfter}`);
  console.log(`   - supabase_realtime_admin EXECUTE: ${realtimePrivAfter}`);

  // Test if authenticated chat delivery still works when anon has NO execute
  console.log('   - Executing quick CDC replication test with anon revoked...');
  const testScript = execSync('npx tsx scripts/verify_phase3_realtime_multisession.ts', { encoding: 'utf8' });
  const cdcPassed = testScript.includes('TOTAL: 11 | PASSED: 11');
  console.log(`   - Multi-session Realtime Suite Result with anon revoked: ${cdcPassed ? 'PASS (11/11)' : 'FAIL'}`);

  if (cdcPassed) {
    console.log('   -> CONCLUSION: anon does NOT need EXECUTE on is_conversation_participant. Granting to authenticated, service_role, and supabase_realtime_admin is sufficient and strictly adheres to least privilege.');
  } else {
    console.log('   -> CONCLUSION: anon IS required for CDC replication pipeline when anonymous subscriptions evaluate.');
    // Restore grant if needed
    psql(`GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO anon;`);
  }

  console.log('\n================================================================');
}

runAudit2().catch((err) => {
  console.error(err);
  process.exit(1);
});
