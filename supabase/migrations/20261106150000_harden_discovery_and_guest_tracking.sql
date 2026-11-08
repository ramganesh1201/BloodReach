-- Migration: 20261106150000_harden_discovery_and_guest_tracking.sql
-- Description: Harden public discovery projection, establish opaque unique 128-bit tracking authorization token,
--              provide concurrency-safe atomic guest emergency submission RPC with idempotency,
--              and implement multi-tier tracking authorization.

BEGIN;

--------------------------------------------------------------------------------
-- 1. SCHEMA UPGRADE: OPAQUE HIGH-ENTROPY UNIQUE TRACKING TOKEN
--
-- SECURITY MANDATE:
-- 1. Separates the public entity identifier (er.id UUID) from tracking authorization.
--    Because er.id is broadcast in public donor discovery feeds, it MUST NOT be used
--    as a capability token for private tracking.
-- 2. tracking_token is an unguessable 128-bit UUID (2^122 cryptographic entropy).
-- 3. tracking_token is UNIQUE across all emergency requests.
-- 4. tracking_token is NEVER exposed in discoverable_emergency_requests view,
--    NEVER returned in get_discoverable_emergency_requests RPC, and NEVER shared with donors.
-- 5. tracking_token is returned ONLY to the submitter via submit_guest_emergency_request RPC.
--------------------------------------------------------------------------------

-- Ensure the tracking_token column exists
ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS tracking_token UUID;

-- 1. Backfill any existing rows with NULL tracking tokens with fresh UUIDs
UPDATE public.emergency_requests
SET tracking_token = gen_random_uuid()
WHERE tracking_token IS NULL;

-- 2. Resolve any existing duplicate tracking tokens (preserving one per cluster)
-- Partition by tracking_token, order deterministically by id ASC.
-- Preserves rn = 1; regenerates fresh UUIDs for all duplicate rows (rn > 1).
UPDATE public.emergency_requests er
SET tracking_token = gen_random_uuid()
FROM (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY tracking_token
               ORDER BY id ASC
           ) AS rn
    FROM public.emergency_requests
    WHERE tracking_token IS NOT NULL
) ranked
WHERE er.id = ranked.id
  AND ranked.rn > 1;

-- 3. Pre-constraint verification: verify zero NULLs and zero duplicates remain
DO $$
DECLARE
    v_dup_count INTEGER;
    v_null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_null_count
    FROM public.emergency_requests
    WHERE tracking_token IS NULL;

    IF v_null_count > 0 THEN
        RAISE EXCEPTION 'Pre-constraint verification failed: % NULL tracking_token rows remain.', v_null_count;
    END IF;

    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT tracking_token
        FROM public.emergency_requests
        GROUP BY tracking_token
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION 'Pre-constraint verification failed: % duplicate tracking_token groups remain.', v_dup_count;
    END IF;
END $$;

-- 4. Explicitly enforce the UUID default and NOT NULL constraint
ALTER TABLE public.emergency_requests
ALTER COLUMN tracking_token SET DEFAULT gen_random_uuid();

ALTER TABLE public.emergency_requests
ALTER COLUMN tracking_token SET NOT NULL;

-- 5. Strengthened unique constraint verification and enforcement
-- Verifies conrelid, conname, and contype = 'u', and confirms conkey covers tracking_token's attnum.
-- If an unexpected constraint exists with that name, aborts safely with an exception.
DO $$
DECLARE
    v_attnum int2;
    v_con RECORD;
    v_constraint_valid BOOLEAN := FALSE;
BEGIN
    -- 5.1 Locate tracking_token column attribute number on public.emergency_requests
    SELECT attnum INTO v_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.emergency_requests'::regclass
      AND attname = 'tracking_token'
      AND NOT attisdropped;

    IF v_attnum IS NULL THEN
        RAISE EXCEPTION 'Column tracking_token does not exist on public.emergency_requests';
    END IF;

    -- 5.2 Inspect if constraint uq_emergency_requests_tracking_token exists on public.emergency_requests
    SELECT conname, contype, conkey INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.emergency_requests'::regclass
      AND conname = 'uq_emergency_requests_tracking_token';

    IF FOUND THEN
        -- If constraint exists, verify it is UNIQUE (contype = 'u') and covers exactly tracking_token
        IF v_con.contype = 'u' AND v_con.conkey = ARRAY[v_attnum] THEN
            v_constraint_valid := TRUE;
        ELSE
            RAISE EXCEPTION 'Constraint uq_emergency_requests_tracking_token exists on public.emergency_requests with unexpected type (%) or keys (%), expected contype = ''u'' and conkey = [%]',
                v_con.contype, v_con.conkey, v_attnum;
        END IF;
    END IF;

    -- 5.3 If valid unique constraint does not already exist, add it
    IF NOT v_constraint_valid THEN
        ALTER TABLE public.emergency_requests
        ADD CONSTRAINT uq_emergency_requests_tracking_token UNIQUE (tracking_token);
    END IF;
END $$;

-- 6. Drop redundant ordinary non-unique index if present (unique constraint automatically creates unique index)
DROP INDEX IF EXISTS public.idx_requests_tracking_token;

-- 7. Ensure untrusted client roles cannot create objects in public schema to shadow RPC resolution
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- 2. PUBLIC DISCOVERY VIEW HARDENING: discoverable_emergency_requests
--
-- SECURITY MANDATE:
-- 1. Excludes internal foreign keys (hospital_id), unused metadata (postal_code),
--    and crucially excludes tracking_token.
-- 2. Never exposes requester contact details (contact_name, contact_phone, contact_method),
--    submitter identity (created_by), cancellation_reason, or private clinical notes.
-- 3. Obfuscates public geographic coordinates by rounding to 3 decimal places (~110m precision),
--    preserving NULL coordinates safely.
-- 4. Retains active-only lifecycle filter: only emergency requests requiring donor response
--    are discoverable in the public feed.
-- 5. Enables security_barrier=true to prevent leaky user-defined operators/functions.
-- 6. Dropped and recreated WITHOUT CASCADE: PostgreSQL requires view recreation because
--    columns (hospital_id, postal_code) are removed from the projection. Verification confirms
--    no downstream views or database relations depend on discoverable_emergency_requests.
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.discoverable_emergency_requests;

CREATE VIEW public.discoverable_emergency_requests
WITH (security_barrier = true) AS
SELECT
    er.id,
    er.reference_code,
    er.blood_group,
    er.component,
    er.units_required,
    er.units_coordinated,
    er.urgency,
    er.hospital_name,
    er.hospital_address,
    er.city,
    er.district,
    er.state,
    CASE
        WHEN er.lat IS NOT NULL THEN ROUND(er.lat::numeric, 3)
        ELSE NULL
    END AS lat,
    CASE
        WHEN er.lng IS NOT NULL THEN ROUND(er.lng::numeric, 3)
        ELSE NULL
    END AS lng,
    er.status,
    er.escalation_level,
    er.created_at,
    er.updated_at
FROM public.emergency_requests er
WHERE er.status IN ('CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED');

ALTER VIEW public.discoverable_emergency_requests OWNER TO postgres;

REVOKE ALL PRIVILEGES ON public.discoverable_emergency_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.discoverable_emergency_requests TO anon, authenticated;

COMMENT ON VIEW public.discoverable_emergency_requests IS
'Sanitized public discovery projection of active emergency blood requests. Intentionally excludes personal contact data, private notes, tracking tokens, and exact coordinates. Restricted to active requests.';

--------------------------------------------------------------------------------
-- 3. ATOMIC GUEST EMERGENCY REQUEST SUBMISSION RPC: submit_guest_emergency_request
--
-- SECURITY & RELIABILITY MANDATE:
-- 1. Executes inside PostgreSQL with SECURITY DEFINER to atomically insert guest requests.
-- 2. Eliminates PostgREST PGRST116 ambiguity: returns structured JSONB directly so
--    the client never has to guess or synthesize success from an error state.
-- 3. Requires client-generated p_id and p_tracking_token for reliable idempotency.
-- 4. Concurrency-safe idempotency: retried requests return success ONLY when the
--    supplied tracking token matches the stored token.
-- 5. Enforces comprehensive server-side input validation on clinical fields,
--    coordinate bounds, and mandatory text lengths.
-- 6. Disambiguates unique violations via PostgreSQL diagnostics to trigger client
--    retry ONLY for actual reference code collisions.
-- 7. Eliminates database error leakage: never returns raw internal error messages to callers.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_guest_emergency_request(
    p_id UUID,
    p_reference_code TEXT,
    p_blood_group TEXT,
    p_component TEXT,
    p_units_required INTEGER,
    p_urgency TEXT,
    p_hospital_name TEXT,
    p_hospital_address TEXT,
    p_city TEXT,
    p_district TEXT DEFAULT NULL,
    p_state TEXT DEFAULT 'Andhra Pradesh',
    p_postal_code TEXT DEFAULT NULL,
    p_lat NUMERIC DEFAULT NULL,
    p_lng NUMERIC DEFAULT NULL,
    p_contact_name TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_contact_method TEXT DEFAULT 'Phone',
    p_notes TEXT DEFAULT NULL,
    p_tracking_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_id UUID;
    v_ref TEXT;
    v_tracking_token UUID;
    v_contact_method TEXT;
    v_existing_id UUID;
    v_existing_ref TEXT;
    v_existing_token UUID;
    v_existing_status TEXT;
    v_constraint_name TEXT;
BEGIN
    -- 1. Input sanitization & validation
    IF p_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client request ID is required for guest submission');
    END IF;

    IF p_tracking_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tracking token is required for guest submission');
    END IF;

    IF p_reference_code IS NULL OR TRIM(p_reference_code) = '' OR LENGTH(TRIM(p_reference_code)) > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid emergency reference code is required');
    END IF;

    IF p_blood_group IS NULL OR p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid blood group specified');
    END IF;

    IF p_component IS NULL OR p_component NOT IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid blood component specified');
    END IF;

    IF p_urgency IS NULL OR p_urgency NOT IN ('Today', 'Urgent', 'Critical') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid urgency level specified');
    END IF;

    IF p_units_required IS NULL OR p_units_required <= 0 OR p_units_required > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Units required must be between 1 and 50 units');
    END IF;

    IF p_hospital_name IS NULL OR TRIM(p_hospital_name) = '' OR LENGTH(TRIM(p_hospital_name)) > 255 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hospital name is required (max 255 characters)');
    END IF;

    IF p_hospital_address IS NULL OR TRIM(p_hospital_address) = '' OR LENGTH(TRIM(p_hospital_address)) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hospital address is required (max 500 characters)');
    END IF;

    IF p_city IS NULL OR TRIM(p_city) = '' OR LENGTH(TRIM(p_city)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'City is required (max 100 characters)');
    END IF;

    IF p_contact_name IS NULL OR TRIM(p_contact_name) = '' OR LENGTH(TRIM(p_contact_name)) > 150 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact name is required (max 150 characters)');
    END IF;

    IF p_contact_phone IS NULL OR TRIM(p_contact_phone) = '' OR LENGTH(TRIM(p_contact_phone)) < 7 OR LENGTH(TRIM(p_contact_phone)) > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid contact phone number is required (7-50 characters)');
    END IF;

    -- Contact method: explicitly normalize NULL / whitespace to 'Phone' to match frontend & column default; reject invalid methods
    v_contact_method := COALESCE(NULLIF(TRIM(p_contact_method), ''), 'Phone');
    IF v_contact_method NOT IN ('Phone', 'SMS', 'WhatsApp') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact method must be Phone, SMS, or WhatsApp');
    END IF;

    IF p_lat IS NOT NULL AND (p_lat < -90 OR p_lat > 90) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Latitude must be between -90 and 90 degrees');
    END IF;

    IF p_lng IS NOT NULL AND (p_lng < -180 OR p_lng > 180) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Longitude must be between -180 and 180 degrees');
    END IF;

    IF p_district IS NOT NULL AND LENGTH(TRIM(p_district)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'District must not exceed 100 characters');
    END IF;

    IF p_state IS NOT NULL AND LENGTH(TRIM(p_state)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'State must not exceed 100 characters');
    END IF;

    IF p_postal_code IS NOT NULL AND LENGTH(TRIM(p_postal_code)) > 20 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Postal code must not exceed 20 characters');
    END IF;

    IF p_notes IS NOT NULL AND LENGTH(TRIM(p_notes)) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notes must not exceed 2000 characters');
    END IF;

    v_new_id := p_id;
    v_ref := UPPER(TRIM(p_reference_code));
    v_tracking_token := p_tracking_token;

    -- 2. Concurrency-safe idempotency verification
    -- Only a legitimate retry supplying the EXACT matching tracking_token can retrieve committed confirmation.
    SELECT id INTO v_existing_id FROM public.emergency_requests WHERE id = v_new_id;

    IF v_existing_id IS NOT NULL THEN
        SELECT reference_code, tracking_token, status
        INTO v_existing_ref, v_existing_token, v_existing_status
        FROM public.emergency_requests
        WHERE id = v_new_id;

        IF v_existing_token = v_tracking_token THEN
            -- Legitimate retry by original submitter holding matching secret tracking token
            RETURN jsonb_build_object(
                'success', true,
                'id', v_existing_id,
                'reference_code', v_existing_ref,
                'tracking_token', v_existing_token,
                'status', v_existing_status,
                'idempotent', true
            );
        ELSE
            -- Unauthorized attempt or colliding client UUID: refuse token exposure
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Request ID already exists with different authorization credentials.'
            );
        END IF;
    END IF;

    -- 3. Insert record atomically
    INSERT INTO public.emergency_requests (
        id,
        reference_code,
        blood_group,
        component,
        units_required,
        units_coordinated,
        urgency,
        hospital_name,
        hospital_address,
        city,
        district,
        state,
        postal_code,
        lat,
        lng,
        contact_name,
        contact_phone,
        contact_method,
        status,
        escalation_level,
        created_by,
        notes,
        tracking_token
    ) VALUES (
        v_new_id,
        v_ref,
        p_blood_group,
        p_component,
        p_units_required,
        0,
        p_urgency,
        TRIM(p_hospital_name),
        TRIM(p_hospital_address),
        TRIM(p_city),
        NULLIF(TRIM(p_district), ''),
        COALESCE(NULLIF(TRIM(p_state), ''), 'Andhra Pradesh'),
        NULLIF(TRIM(p_postal_code), ''),
        p_lat,
        p_lng,
        TRIM(p_contact_name),
        TRIM(p_contact_phone),
        v_contact_method,
        'CREATED',
        1,
        NULL, -- Explicitly NULL for guest submissions
        NULLIF(TRIM(p_notes), ''),
        v_tracking_token
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_id,
        'reference_code', v_ref,
        'tracking_token', v_tracking_token,
        'status', 'CREATED'
    );
EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        -- Collision on reference_code triggers client automatic retry with fresh code
        IF v_constraint_name = 'emergency_requests_reference_code_key' OR v_constraint_name = 'idx_requests_ref' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Reference code collision. Please retry submission.',
                'collision', true
            );
        END IF;

        -- Primary key collision from concurrent simultaneous submission
        IF v_constraint_name = 'emergency_requests_pkey' THEN
            SELECT id INTO v_existing_id FROM public.emergency_requests WHERE id = v_new_id;

            IF v_existing_id IS NOT NULL THEN
                SELECT reference_code, tracking_token, status
                INTO v_existing_ref, v_existing_token, v_existing_status
                FROM public.emergency_requests
                WHERE id = v_new_id;

                IF v_existing_token = v_tracking_token THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'id', v_existing_id,
                        'reference_code', v_existing_ref,
                        'tracking_token', v_existing_token,
                        'status', v_existing_status,
                        'idempotent', true
                    );
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'Request submission conflict. Request ID already in use.'
            );
        END IF;

        -- Tracking token collision guard (unique constraint)
        IF v_constraint_name = 'uq_emergency_requests_tracking_token' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Tracking authorization conflict. Please regenerate credentials.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'A record with duplicate unique fields already exists.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An internal database error occurred while recording the emergency request.'
        );
END;
$$;

ALTER FUNCTION public.submit_guest_emergency_request(
    UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.submit_guest_emergency_request(
    UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_guest_emergency_request(
    UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 4. SECURE ACCESS-CONTROLLED TRACKING RPC: track_emergency_request
--
-- AUTHORIZATION & SEPARATION OF PRIVILEGE MATRIX:
-- 1. Anonymous Guests:
--    - MUST supply p_tracking_token (the secret 128-bit capability token).
--    - Supplying public request_id (entity UUID) or reference_code as an anonymous
--      caller is STRICTLY REJECTED (returns 0 rows).
--    - This guarantees that an anonymous donor or scraper holding public entity UUIDs
--      obtained from discovery feeds cannot access private tracking lifecycle details.
-- 2. Authenticated Request Owner:
--    - Can query by request_id or reference_code where er.created_by = auth.uid().
-- 3. Authenticated Clinical Roles:
--    - Coordinators, admins, and blood centres can query by request_id or reference_code.
-- 4. Architectural Note on Rate Limiting & Abuse Protection:
--    - In-database rate limiting based on client-controlled HTTP headers (e.g., X-Forwarded-For)
--      is omitted because such headers can be spoofed by attackers to bypass limits or cause DoS.
--    - Neither Supabase PostgREST nor PostgreSQL provides native IP rate limiting for direct RPC calls.
--    - UNRESOLVED PRODUCTION BLOCKER: Until trusted upstream reverse-proxy throttling (e.g., Cloudflare
--      Turnstile / WAF, Supabase Edge Functions, or API Gateway) is deployed in front of the PostgREST
--      endpoint, public execution of submit_guest_emergency_request and track_emergency_request is
--      susceptible to automated volumetric flooding. Public submission is NOT abuse-protected at the database layer.
-- 5. Existing Guest Requests Limitation:
--    - Pre-existing guest requests (created before Migration 17) were not issued tracking tokens.
--      Anonymous tracking requires secret tracking_token; thus pre-migration guest requests cannot
--      be tracked anonymously through this RPC. Coordinators or staff must assist via reference_code.
-- 6. Function Volatility:
--    - Declared VOLATILE for consistency and to avoid stale snapshot read anomalies.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_emergency_request(
    p_tracking_token UUID DEFAULT NULL,
    p_request_id UUID DEFAULT NULL,
    p_reference_code TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    reference_code TEXT,
    blood_group TEXT,
    component TEXT,
    units_required INTEGER,
    units_coordinated INTEGER,
    urgency TEXT,
    hospital_name TEXT,
    hospital_address TEXT,
    city TEXT,
    district TEXT,
    state TEXT,
    status TEXT,
    escalation_level INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_uid := auth.uid();
    v_caller_role := public.get_user_role();

    -- Path 1: Anonymous Guest presenting secret 128-bit tracking_token
    IF p_tracking_token IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            er.id, er.reference_code, er.blood_group, er.component, er.units_required,
            er.units_coordinated, er.urgency, er.hospital_name, er.hospital_address,
            er.city, er.district, er.state, er.status, er.escalation_level, er.created_at, er.updated_at
        FROM public.emergency_requests er
        WHERE er.tracking_token = p_tracking_token
        LIMIT 1;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Path 2: Authenticated request owner (created_by = auth.uid())
    IF v_caller_uid IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            er.id, er.reference_code, er.blood_group, er.component, er.units_required,
            er.units_coordinated, er.urgency, er.hospital_name, er.hospital_address,
            er.city, er.district, er.state, er.status, er.escalation_level, er.created_at, er.updated_at
        FROM public.emergency_requests er
        WHERE er.created_by = v_caller_uid
          AND (
              (p_request_id IS NOT NULL AND er.id = p_request_id)
              OR (p_reference_code IS NOT NULL AND UPPER(er.reference_code) = UPPER(TRIM(p_reference_code)))
          )
        LIMIT 1;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Path 3: Authenticated clinical staff (coordinators, admins, blood centres)
    IF v_caller_role IN ('coordinator', 'admin', 'blood_centre') THEN
        RETURN QUERY
        SELECT 
            er.id, er.reference_code, er.blood_group, er.component, er.units_required,
            er.units_coordinated, er.urgency, er.hospital_name, er.hospital_address,
            er.city, er.district, er.state, er.status, er.escalation_level, er.created_at, er.updated_at
        FROM public.emergency_requests er
        WHERE (p_request_id IS NOT NULL AND er.id = p_request_id)
           OR (p_reference_code IS NOT NULL AND UPPER(er.reference_code) = UPPER(TRIM(p_reference_code)))
        LIMIT 1;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Path 4: Lookup failed or unauthorized attempt without valid tracking credentials
    -- Explicitly returns empty table (0 rows). Anonymous callers supplying only public UUID
    -- or reference code without matching tracking_token are denied here.
    RETURN;
END;
$$;

ALTER FUNCTION public.track_emergency_request(UUID, UUID, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.track_emergency_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_emergency_request(UUID, UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.track_emergency_request(UUID, UUID, TEXT) IS 
'High-security tracking RPC. Declared VOLATILE. Anonymous tracking requires secret tracking_token. Public discovery IDs and reference codes cannot be used by anonymous callers.';

COMMIT;
