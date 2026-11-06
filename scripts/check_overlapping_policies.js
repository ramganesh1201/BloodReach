import { execSync } from 'child_process';

function psql(query) {
  return execSync(
    'docker exec -i supabase_db_blood psql -U postgres -d postgres -P pager=off',
    { input: query, encoding: 'utf8' }
  ).trim();
}

const res = psql(`
SELECT tablename, cmd, count(*) AS policy_count, string_agg(policyname, ' | ') AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY tablename, cmd;
`);

console.log('=== OVERLAPPING POLICIES IN PUBLIC SCHEMA ===');
console.log(res);

