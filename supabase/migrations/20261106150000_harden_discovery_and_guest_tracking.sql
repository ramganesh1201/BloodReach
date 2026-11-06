-- Migration: 20261106150000_harden_discovery_and_guest_tracking.sql
-- Description: Harden public discovery projection, establish opaque 128-bit tracking authorization token,
--              provide atomic guest emergency submission RPC, and implement multi-tier tracking authorization.

BEGIN;

--------------------------------------------------------------------------------
-- 1. SCHEMA UPGRADE: OPAQUE HIGH-ENTROPY TRACKING TOKEN
--
-- SECURITY MANDATE:
-- 1. Separates the public entity identifier (er.id UUID) from tracking authorization.
--    Because er.id is broadcast in public donor discovery feeds, it MUST NOT be used
--    as a capability token for private tracking.
-- 2. tracking_token is an unguessable 128-bit UUID (2^122 cryptographic entropy).
-- 3. tracking_token is NEVER exposed in discoverable_emergency_requests view,
--    NEVER returned in get_discoverable_emergency_requests RPC, and NEVER shared with donors.
-- 4. tracking_token is returned ONLY to the submitter via submit_guest_emergency_request RPC.
--------------------------------------------------------------------------------

ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS tracking_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_requests_tracking_token 
ON public.emergency_requests(tracking_token);

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
-- 3. Generates or accepts a client-provided tracking_token and returns it securely to submitter.
-- 4. Enforces server-side validation on clinical blood groups, components, and urgencies.
-- 5. Provides idempotency: retried requests with the same client UUID do not duplicate records.
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_id UUID;
    v_ref TEXT;
    v_tracking_token UUID;
    v_existing_id UUID;
BEGIN
    -- 1. Input sanitization & validation
    IF p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid blood group specified');
    END IF;

    IF p_component NOT IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid blood component specified');
    END IF;

    IF p_urgency NOT IN ('Today', 'Urgent', 'Critical') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid urgency level specified');
    END IF;

    IF p_units_required IS NULL OR p_units_required <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Units required must be greater than zero');
    END IF;

    IF p_hospital_name IS NULL OR TRIM(p_hospital_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hospital name is required');
    END IF;

    IF p_contact_name IS NULL OR TRIM(p_contact_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact name is required');
    END IF;

    IF p_contact_phone IS NULL OR TRIM(p_contact_phone) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact phone is required');
    END IF;

    v_new_id := COALESCE(p_id, gen_random_uuid());
    v_ref := UPPER(TRIM(p_reference_code));
    v_tracking_token := COALESCE(p_tracking_token, gen_random_uuid());

    -- Idempotency check: if p_id already exists, return the existing committed record
    SELECT id INTO v_existing_id FROM public.emergency_requests WHERE id = v_new_id;
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'id', v_existing_id,
            'reference_code', v_ref,
            'tracking_token', v_tracking_token,
            'status', 'CREATED',
            'idempotent', true
        );
    END IF;

    -- 2. Insert record atomically
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
        COALESCE(p_contact_method, 'Phone'),
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
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reference code collision. Please retry submission.',
            'collision', true
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
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
-- 4. Architectural Note on Volatility & Abuse Protection:
--    - Declared VOLATILE for consistency and to avoid snapshot caching side-effects.
--    - In-database rate limiting based on untrusted X-Forwarded-For or shared anonymous keys
--      is intentionally omitted to prevent global denial-of-service vulnerabilities.
--    - Robust IP-based rate limiting and abuse prevention must be enforced upstream at
--      the API Gateway / Supabase Edge Functions where trusted client IP headers are verified.
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
