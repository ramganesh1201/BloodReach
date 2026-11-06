import { execSync } from 'child_process';

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

async function audit() {
  console.log('================================================================');
  console.log('CARELOOP DATABASE SECURITY COMPREHENSIVE AUDIT');
  console.log('================================================================\n');

  // 1. Table Grants for anon and authenticated
  console.log('--- 1. Public Table Privileges for "anon" and "authenticated" ---');
  const tablePrivs = psql(`
    SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee;
  `);
  console.log(tablePrivs);

  // 2. Security Definer Functions & search_path
  console.log('\n--- 2. Security Definer Functions & search_path Audit ---');
  const secDefFuncs = psql(`
    SELECT 
      p.proname,
      pg_get_userbyid(p.proowner) as owner,
      p.prosecdef as is_sec_definer,
      array_to_string(p.proconfig, ', ') as proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
    ORDER BY p.proname;
  `);
  console.log(secDefFuncs);

  // 3. RPC Execute Grants
  console.log('\n--- 3. RPC Execute Grants for "anon" and "authenticated" ---');
  const rpcGrants = psql(`
    SELECT 
      routine_name,
      grantee,
      privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
    ORDER BY routine_name, grantee;
  `);
  console.log(rpcGrants);

  // 4. Overlapping Permissive Policies
  console.log('\n--- 4. Check for Overlapping Permissive Policies ---');
  const policyOverlap = psql(`
    SELECT 
      tablename,
      cmd,
      count(*) as policy_count,
      string_agg(policyname, ' | ') as policy_names
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd
    HAVING count(*) > 1
    ORDER BY tablename, cmd;
  `);
  if (!policyOverlap) {
    console.log('✅ ZERO overlapping permissive policies found in public schema!');
  } else {
    console.log('Found overlapping permissive policies:', policyOverlap);
  }

  // 5. Views and Underlying Data Access
  console.log('\n--- 5. Security Barrier View Definition & Security Check ---');
  const viewDef = psql(`
    SELECT 
      v.table_name,
      v.view_definition,
      c.reloptions
    FROM information_schema.views v
    JOIN pg_class c ON c.relname = v.table_name
    WHERE v.table_schema = 'public';
  `);
  console.log(viewDef);

  // 6. Storage Bucket Configuration
  console.log('\n--- 6. Storage Bucket Configuration & Policies ---');
  const buckets = psql(`
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets;
  `);
  console.log('Buckets:', buckets);

  const storagePolicies = psql(`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects';
  `);
  console.log('Storage Policies:', storagePolicies);

  // 7. Realtime Policies
  console.log('\n--- 7. Realtime Messages Table Policies ---');
  const realtimePolicies = psql(`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages';
  `);
  console.log('Realtime Policies:', realtimePolicies);

  process.exit(0);
}

audit().catch(console.error);

