
BEGIN;

-- Remove dangerous non-DML privileges from client roles.
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- Apply the same restrictions to future tables created by postgres.
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
ON TABLES
FROM anon, authenticated;

-- Coordination events are written through trusted database functions.
REVOKE ALL PRIVILEGES
ON TABLE public.coordination_events
FROM anon, authenticated;

-- Remove obsolete client-facing policies.
DROP POLICY IF EXISTS "Participants read coordination events"
ON public.coordination_events;

DROP POLICY IF EXISTS "Participants insert coordination events"
ON public.coordination_events;

-- Restrict emergency-request direct access.
REVOKE DELETE
ON TABLE public.emergency_requests
FROM anon, authenticated;

REVOKE UPDATE
ON TABLE public.emergency_requests
FROM anon;

COMMIT;
