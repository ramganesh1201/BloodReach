SELECT
    p.oid::regprocedure AS function_name,
    r.rolname AS grantee,
    has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
    VALUES ('anon'::name), ('authenticated'::name), ('public'::name)
) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.proname = 'get_discoverable_emergency_requests'
ORDER BY r.rolname;