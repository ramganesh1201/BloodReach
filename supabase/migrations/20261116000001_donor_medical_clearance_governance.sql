-- CareLoop — Donor Medical Clearance Review & Governance Schema
-- Migration: 20261116000001_donor_medical_clearance_governance.sql
-- 
-- Non-destructive, forward-only additive schema for medical clearance review:
-- 1. Adds medical_clearance_status and review audit metadata to public.donors.
-- 2. Creates public.donor_medical_clearance_reviews table with RLS.
-- 3. Creates public.review_donor_medical_clearance (clinical authorization RPC).
-- 4. Creates public.request_donor_medical_clearance_review (donor review request RPC).
-- 5. Creates public.get_pending_medical_clearances (authorized queue query RPC).
-- 6. Hardens public.accept_request_and_create_conversation to return structured error codes.

DO $$
BEGIN
    -- 1. Add clearance status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'donors' AND column_name = 'medical_clearance_status'
    ) THEN
        ALTER TABLE public.donors
            ADD COLUMN medical_clearance_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
            CHECK (medical_clearance_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED'));
    END IF;

    -- 2. Add review metadata columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'donors' AND column_name = 'medical_review_requested_at'
    ) THEN
        ALTER TABLE public.donors
            ADD COLUMN medical_review_requested_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN medical_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
            ADD COLUMN medical_reviewed_at TIMESTAMPTZ,
            ADD COLUMN medical_review_decision TEXT CHECK (medical_review_decision IN ('APPROVED', 'REJECTED', 'DEFERRED')),
            ADD COLUMN medical_review_reason TEXT,
            ADD COLUMN medical_review_notes TEXT;
    END IF;

    -- 3. Synchronize medical_clearance_status with existing is_medically_cleared
    UPDATE public.donors
    SET medical_clearance_status = CASE 
        WHEN is_medically_cleared = true THEN 'APPROVED' 
        ELSE 'PENDING_REVIEW' 
    END
    WHERE medical_clearance_status IS NULL OR (is_medically_cleared = true AND medical_clearance_status <> 'APPROVED');
END $$;

-- ----------------------------------------------------------------------------
-- 2. Medical Clearance Review Audit Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_medical_clearance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'DEFERRED')),
    reason TEXT NOT NULL,
    notes TEXT,
    deferral_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clearance_reviews_donor ON public.donor_medical_clearance_reviews(donor_id);
CREATE INDEX IF NOT EXISTS idx_clearance_reviews_reviewer ON public.donor_medical_clearance_reviews(reviewer_id);

ALTER TABLE public.donor_medical_clearance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Donors read own clearance reviews" ON public.donor_medical_clearance_reviews;
CREATE POLICY "Donors read own clearance reviews" ON public.donor_medical_clearance_reviews
    FOR SELECT
    TO authenticated
    USING (
        donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('admin', 'coordinator', 'blood_bank')
    );

DROP POLICY IF EXISTS "Staff insert clearance reviews" ON public.donor_medical_clearance_reviews;
CREATE POLICY "Staff insert clearance reviews" ON public.donor_medical_clearance_reviews
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_user_role() IN ('admin', 'coordinator', 'blood_bank')
    );

-- ----------------------------------------------------------------------------
-- 3. Clinical Authorization RPC: review_donor_medical_clearance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_donor_medical_clearance(
    p_donor_id UUID,
    p_decision TEXT,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL,
    p_deferral_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_donor RECORD;
    v_new_status TEXT;
BEGIN
    -- 1. Authentication check
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Authentication required.');
    END IF;

    v_caller_role := public.get_user_role();
    IF v_caller_role NOT IN ('admin', 'coordinator', 'blood_bank') THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Only authorized clinical staff or administrators can review medical clearances.');
    END IF;

    -- 2. Fetch target donor
    SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'DONOR_NOT_FOUND', 'message', 'Donor profile not found.');
    END IF;

    -- 3. Anti-self-clearance: Reviewer cannot clear their own profile
    IF v_donor.profile_id IS NOT NULL AND v_donor.profile_id = v_caller_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'ANTI_SELF_CLEARANCE', 'message', 'Reviewers cannot review or clear their own donor profile.');
    END IF;

    -- 4. Validate parameters
    IF p_decision NOT IN ('APPROVED', 'REJECTED', 'DEFERRED') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_DECISION', 'message', 'Decision must be APPROVED, REJECTED, or DEFERRED.');
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED', 'message', 'A documented clinical justification reason is required.');
    END IF;

    v_new_status := p_decision;

    -- 5. Decision-specific validation & state updates
    IF p_decision = 'APPROVED' THEN
        -- Enforce NBTC clinical eligibility: Age (18-65), Weight (>= 45kg)
        IF v_donor.age IS NOT NULL AND (v_donor.age < 18 OR v_donor.age > 65) THEN
            RETURN jsonb_build_object('success', false, 'code', 'AGE_INELIGIBLE', 'message', 'Cannot approve: Donor age is outside standard NBTC bounds (18-65).');
        END IF;

        IF v_donor.weight_kg IS NOT NULL AND v_donor.weight_kg < 45.0 THEN
            RETURN jsonb_build_object('success', false, 'code', 'WEIGHT_INELIGIBLE', 'message', 'Cannot approve: Donor weight is below NBTC minimum safety threshold (45kg).');
        END IF;

        UPDATE public.donors
        SET 
            is_medically_cleared = true,
            medical_clearance_status = 'APPROVED',
            deferral_until = NULL,
            medical_reviewed_by = v_caller_id,
            medical_reviewed_at = NOW(),
            medical_review_decision = 'APPROVED',
            medical_review_reason = TRIM(p_reason),
            medical_review_notes = TRIM(p_notes)
        WHERE id = p_donor_id;

    ELSIF p_decision = 'REJECTED' THEN
        UPDATE public.donors
        SET 
            is_medically_cleared = false,
            medical_clearance_status = 'REJECTED',
            medical_reviewed_by = v_caller_id,
            medical_reviewed_at = NOW(),
            medical_review_decision = 'REJECTED',
            medical_review_reason = TRIM(p_reason),
            medical_review_notes = TRIM(p_notes)
        WHERE id = p_donor_id;

    ELSIF p_decision = 'DEFERRED' THEN
        UPDATE public.donors
        SET 
            is_medically_cleared = false,
            medical_clearance_status = 'DEFERRED',
            deferral_until = COALESCE(p_deferral_until, NOW() + INTERVAL '30 days'),
            medical_reviewed_by = v_caller_id,
            medical_reviewed_at = NOW(),
            medical_review_decision = 'DEFERRED',
            medical_review_reason = TRIM(p_reason),
            medical_review_notes = TRIM(p_notes)
        WHERE id = p_donor_id;
    END IF;

    -- 6. Insert audit record into donor_medical_clearance_reviews
    INSERT INTO public.donor_medical_clearance_reviews (
        donor_id,
        reviewer_id,
        decision,
        reason,
        notes,
        deferral_until
    ) VALUES (
        p_donor_id,
        v_caller_id,
        p_decision,
        TRIM(p_reason),
        TRIM(p_notes),
        CASE WHEN p_decision = 'DEFERRED' THEN COALESCE(p_deferral_until, NOW() + INTERVAL '30 days') ELSE NULL END
    );

    -- 7. Global audit log
    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (
        v_caller_id,
        'REVIEW_DONOR_MEDICAL_CLEARANCE',
        'donors',
        p_donor_id::TEXT,
        jsonb_build_object(
            'decision', p_decision,
            'reason', TRIM(p_reason),
            'donor_id', p_donor_id,
            'donor_name', v_donor.full_name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'donor_id', p_donor_id,
        'decision', p_decision,
        'medical_clearance_status', v_new_status,
        'message', format('Donor medical clearance successfully updated to %s.', v_new_status)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_donor_medical_clearance(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_donor_medical_clearance(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Donor Review Request RPC: request_donor_medical_clearance_review
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_donor_medical_clearance_review(
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_donor RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_donor FROM public.donors WHERE profile_id = v_caller_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'DONOR_NOT_FOUND', 'message', 'Donor profile not found for current user.');
    END IF;

    IF v_donor.is_medically_cleared IS TRUE THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_CLEARED', 'message', 'Your donor profile is already medically cleared.');
    END IF;

    UPDATE public.donors
    SET 
        medical_clearance_status = 'PENDING_REVIEW',
        medical_review_requested_at = NOW(),
        medical_review_notes = COALESCE(TRIM(p_notes), medical_review_notes)
    WHERE id = v_donor.id;

    -- Global audit log
    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (
        v_caller_id,
        'REQUEST_MEDICAL_CLEARANCE_REVIEW',
        'donors',
        v_donor.id::TEXT,
        jsonb_build_object('notes', p_notes)
    );

    RETURN jsonb_build_object(
        'success', true,
        'code', 'REVIEW_REQUESTED',
        'message', 'Medical clearance review requested. An authorized clinical coordinator will review your profile.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.request_donor_medical_clearance_review(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_donor_medical_clearance_review(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Authorized Queue Query RPC: get_pending_medical_clearances
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_medical_clearances()
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    full_name TEXT,
    phone TEXT,
    blood_group TEXT,
    city TEXT,
    district TEXT,
    weight_kg NUMERIC,
    age INTEGER,
    gender TEXT,
    is_available BOOLEAN,
    is_medically_cleared BOOLEAN,
    medical_clearance_status TEXT,
    medical_review_requested_at TIMESTAMPTZ,
    medical_review_notes TEXT,
    medical_review_reason TEXT,
    deferral_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_role TEXT := public.get_user_role();
BEGIN
    IF v_caller_role NOT IN ('admin', 'coordinator', 'blood_bank') THEN
        RAISE EXCEPTION 'Access denied. Administrative role required.';
    END IF;

    RETURN QUERY
    SELECT 
        d.id,
        d.profile_id,
        d.full_name,
        d.phone,
        d.blood_group,
        d.city,
        d.district,
        d.weight_kg,
        d.age,
        d.gender,
        d.is_available,
        d.is_medically_cleared,
        d.medical_clearance_status,
        d.medical_review_requested_at,
        d.medical_review_notes,
        d.medical_review_reason,
        d.deferral_until,
        d.created_at
    FROM public.donors d
    ORDER BY 
        CASE WHEN d.medical_clearance_status = 'PENDING_REVIEW' THEN 0 ELSE 1 END,
        d.medical_review_requested_at DESC NULLS LAST,
        d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_medical_clearances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_medical_clearances() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Hardened accept_request_and_create_conversation with structured codes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_request_and_create_conversation(
    p_request_id UUID,
    p_donor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_req RECORD;
    v_donor RECORD;
    v_existing_resp RECORD;
    v_existing_conv RECORD;
    v_existing_assignment RECORD;
    v_conversation_id UUID;
    v_donor_profile_id UUID;
    v_requester_id UUID;
    v_is_staff BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication check
    IF v_caller_id IS NULL THEN
        IF current_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
            v_caller_id := NULL;
        ELSE
            RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Authentication required to accept donation requests.');
        END IF;
    END IF;

    IF v_caller_id IS NOT NULL THEN
        v_is_staff := (public.get_user_role() IN ('coordinator', 'admin'));
    ELSE
        v_is_staff := TRUE;
    END IF;

    -- 2. Derive donor identity
    IF v_is_staff AND p_donor_id IS NOT NULL THEN
        SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT * INTO v_donor FROM public.donors WHERE profile_id = v_caller_id FOR UPDATE;
    ELSIF p_donor_id IS NOT NULL THEN
        SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    END IF;

    IF NOT FOUND OR v_donor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DONOR_NOT_FOUND', 'message', 'Active donor profile not found for authenticated user.');
    END IF;

    -- 3. Medical Clearance & Deferral Verification
    IF v_donor.is_medically_cleared IS FALSE THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MEDICAL_CLEARANCE_HOLD',
            'clearance_status', COALESCE(v_donor.medical_clearance_status, 'PENDING_REVIEW'),
            'message', 'Donor profile has an unresolved medical clearance hold.'
        );
    END IF;

    IF v_donor.deferral_until IS NOT NULL AND v_donor.deferral_until > NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ACTIVE_DEFERRAL',
            'deferral_until', v_donor.deferral_until,
            'message', format('Donor is under medical deferral until %s.', v_donor.deferral_until)
        );
    END IF;

    IF NOT v_donor.is_available OR v_donor.availability_state = 'TEMPORARILY_UNAVAILABLE' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DONOR_UNAVAILABLE',
            'message', 'Donor is currently marked as unavailable.'
        );
    END IF;

    -- 4. Lock and verify emergency request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'REQUEST_NOT_FOUND', 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'code', 'REQUEST_INACTIVE', 'message', 'This emergency request is no longer active.');
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by;

    -- 5. ANTI-SELF-MATCH: Creator cannot accept their own emergency request
    IF v_requester_id IS NOT NULL AND v_donor_profile_id IS NOT NULL AND v_requester_id = v_donor_profile_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'ANTI_SELF_MATCH', 'message', 'ANTI_SELF_MATCH: Donors cannot accept emergency requests created by their own user account.');
    END IF;

    -- 6. Server-Authoritative ABO/Rh & Component Clinical Compatibility Check
    IF v_req.blood_group <> v_donor.blood_group THEN
        IF v_req.component = 'Whole Blood' THEN
            RETURN jsonb_build_object('success', false, 'code', 'INCOMPATIBLE_BLOOD_GROUP', 'message', format('Incompatible blood group: Whole blood transfusion strictly requires exact match (%s vs donor %s).', v_req.blood_group, v_donor.blood_group));
        ELSIF v_req.component = 'Packed RBC' THEN
            IF NOT (
                (v_req.blood_group = 'O+' AND v_donor.blood_group IN ('O+', 'O-')) OR
                (v_req.blood_group = 'A+' AND v_donor.blood_group IN ('A+', 'A-', 'O+', 'O-')) OR
                (v_req.blood_group = 'B+' AND v_donor.blood_group IN ('B+', 'B-', 'O+', 'O-')) OR
                (v_req.blood_group = 'AB+') OR
                (v_req.blood_group = 'O-' AND v_donor.blood_group = 'O-') OR
                (v_req.blood_group = 'A-' AND v_donor.blood_group IN ('A-', 'O-')) OR
                (v_req.blood_group = 'B-' AND v_donor.blood_group IN ('B-', 'O-')) OR
                (v_req.blood_group = 'AB-' AND v_donor.blood_group IN ('AB-', 'A-', 'B-', 'O-'))
            ) THEN
                RETURN jsonb_build_object('success', false, 'code', 'INCOMPATIBLE_BLOOD_GROUP', 'message', format('Incompatible blood group for Packed RBC (%s vs donor %s).', v_req.blood_group, v_donor.blood_group));
            END IF;
        END IF;
    END IF;

    -- 7. Idempotency Check: Return existing conversation if already accepted
    SELECT * INTO v_existing_resp FROM public.donor_responses
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    SELECT * INTO v_existing_conv FROM public.conversations
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    IF v_existing_resp.response_status = 'ACCEPTED' AND v_existing_conv.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'conversation_id', v_existing_conv.id,
            'request_id', p_request_id,
            'donor_name', v_donor.full_name,
            'status', 'ACCEPTED',
            'already_accepted', true,
            'message', 'You have already accepted this emergency request.'
        );
    END IF;

    -- 8. Capacity check
    IF v_req.units_coordinated >= v_req.units_required THEN
        RETURN jsonb_build_object('success', false, 'code', 'CAPACITY_REACHED', 'message', 'This emergency request has already reached required coordination capacity.');
    END IF;

    -- 9. Record donor acceptance
    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, v_donor.id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    -- 10. Provision Conversation idempotently
    IF v_existing_conv.id IS NOT NULL THEN
        v_conversation_id := v_existing_conv.id;
    ELSE
        INSERT INTO public.conversations (request_id, donor_id, requester_id, status)
        VALUES (p_request_id, v_donor.id, v_requester_id, 'ACTIVE')
        ON CONFLICT (request_id, donor_id) DO UPDATE
        SET status = 'ACTIVE', updated_at = NOW()
        RETURNING id INTO v_conversation_id;

        -- Add participants
        IF v_requester_id IS NOT NULL THEN
            INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
            VALUES (v_conversation_id, v_requester_id, 'requester')
            ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_active = true;
        END IF;

        IF v_donor_profile_id IS NOT NULL THEN
            INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
            VALUES (v_conversation_id, v_donor_profile_id, 'donor')
            ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_active = true;
        END IF;

        -- Automated system greeting
        PERFORM set_config('careloop.system_message_allowed', 'true', true);
        INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
        VALUES (
            v_conversation_id,
            COALESCE(v_donor_profile_id, v_caller_id),
            'CareLoop System',
            'system',
            'SYSTEM',
            format('Private coordination channel activated for Request #%s. Donor %s accepted the call.', v_req.reference_code, v_donor.full_name)
        );
        PERFORM set_config('careloop.system_message_allowed', 'false', true);

        -- Milestone coordination event
        INSERT INTO public.coordination_events (request_id, conversation_id, actor_id, actor_role, event_type, event_data)
        VALUES (
            p_request_id,
            v_conversation_id,
            COALESCE(v_donor_profile_id, v_caller_id),
            'Donor',
            'CONFIRMED_AVAILABILITY',
            jsonb_build_object('donor_name', v_donor.full_name, 'blood_group', v_donor.blood_group)
        );
    END IF;

    -- 11. Record donor assignment (check for pre-existing assignment to avoid double counting)
    SELECT * INTO v_existing_assignment FROM public.donor_assignments
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    IF v_existing_assignment.id IS NULL THEN
        INSERT INTO public.donor_assignments (request_id, donor_id, units_assigned, status, coordinator_id, notes)
        VALUES (p_request_id, v_donor.id, 1, 'ASSIGNED', COALESCE(v_caller_id, v_donor_profile_id), 'Direct donor acceptance via CareLoop Connect')
        ON CONFLICT (request_id, donor_id) DO NOTHING;

        -- Update request status and increment units_coordinated
        UPDATE public.emergency_requests
        SET units_coordinated = units_coordinated + 1,
            status = CASE 
                WHEN units_coordinated + 1 >= units_required THEN 'RESPONDER_FOUND'
                ELSE 'COORDINATION_IN_PROGRESS'
            END,
            updated_at = NOW()
        WHERE id = p_request_id;
    END IF;

    -- 12. Audit event on request timeline
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'RESPONDER_ACCEPTED',
        format('Donor %s accepted emergency request. Private coordination channel #%s opened.', v_donor.full_name, v_conversation_id),
        'donor',
        jsonb_build_object('donor_id', v_donor.id, 'conversation_id', v_conversation_id, 'channel', 'WEB')
    );

    RETURN jsonb_build_object(
        'success', true,
        'already_accepted', false,
        'request_id', p_request_id,
        'conversation_id', v_conversation_id,
        'donor_name', v_donor.full_name,
        'status', 'ACCEPTED',
        'message', 'Emergency request accepted successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) TO authenticated, service_role;
