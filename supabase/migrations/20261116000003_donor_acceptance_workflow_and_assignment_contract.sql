-- CareLoop — Atomic Donor Acceptance Workflow & Contract Migration
-- Migration: 20261116000003_donor_acceptance_workflow_and_assignment_contract.sql
-- Applied to: uzwtchnqmveapzehuafb

-- ----------------------------------------------------------------------------
-- 1. Expand messages_sender_role_check & conversation_participants_participant_role_check
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_role_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_role_check
    CHECK (sender_role = ANY (ARRAY['patient'::text, 'donor'::text, 'coordinator'::text, 'blood_centre'::text, 'hospital'::text, 'admin'::text, 'system'::text]));

ALTER TABLE public.conversation_participants DROP CONSTRAINT IF EXISTS conversation_participants_participant_role_check;
ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_participant_role_check
    CHECK (participant_role = ANY (ARRAY['requester'::text, 'patient'::text, 'donor'::text, 'coordinator'::text, 'admin'::text]));

-- ----------------------------------------------------------------------------
-- 2. Enhanced accept_request_and_create_conversation with assignment_id return
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
    v_new_assignment RECORD;
    v_conversation_id UUID;
    v_assignment_id UUID;
    v_donor_profile_id UUID;
    v_requester_id UUID;
    v_is_staff BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication check
    IF v_caller_id IS NULL THEN
        IF current_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
            v_caller_id := NULL;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'code', 'UNAUTHORIZED',
                'message', 'Authentication required to accept donation requests.'
            );
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
        -- First try to match caller profile_id
        SELECT * INTO v_donor FROM public.donors WHERE profile_id = v_caller_id FOR UPDATE;
        -- If caller has no donor by profile_id, but p_donor_id was provided, check if it belongs to caller
        IF NOT FOUND AND p_donor_id IS NOT NULL THEN
            SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id AND (profile_id = v_caller_id OR profile_id IS NULL) FOR UPDATE;
        END IF;
    ELSIF p_donor_id IS NOT NULL THEN
        SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    END IF;

    IF NOT FOUND OR v_donor.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DONOR_NOT_FOUND',
            'message', 'Active donor profile not found for authenticated user.'
        );
    END IF;

    -- 3. Medical Clearance & Deferral Verification (Authoritative Rule)
    -- Both is_medically_cleared and medical_clearance_status must be genuinely approved
    IF v_donor.is_medically_cleared IS NOT TRUE OR v_donor.medical_clearance_status <> 'APPROVED' THEN
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
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REQUEST_NOT_FOUND',
            'message', 'Emergency request not found.'
        );
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REQUEST_INACTIVE',
            'message', 'This emergency request is no longer active.'
        );
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by;

    -- 5. ANTI-SELF-MATCH: Creator cannot accept their own emergency request
    IF v_requester_id IS NOT NULL AND v_donor_profile_id IS NOT NULL AND v_requester_id = v_donor_profile_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ANTI_SELF_MATCH',
            'message', 'ANTI_SELF_MATCH: Donors cannot accept emergency requests created by their own user account.'
        );
    END IF;

    -- 6. Server-Authoritative ABO/Rh & Component Clinical Compatibility Check
    IF v_req.blood_group <> v_donor.blood_group THEN
        IF v_req.component = 'Whole Blood' THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INCOMPATIBLE_BLOOD_GROUP',
                'message', format('Incompatible blood group: Whole blood transfusion strictly requires exact match (%s vs donor %s).', v_req.blood_group, v_donor.blood_group)
            );
        ELSIF v_req.component = 'Packed RBC' THEN
            IF NOT (
                (v_req.blood_group = 'AB+' AND v_donor.blood_group IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')) OR
                (v_req.blood_group = 'AB-' AND v_donor.blood_group IN ('O-','A-','B-','AB-')) OR
                (v_req.blood_group = 'A+'  AND v_donor.blood_group IN ('O-','O+','A-','A+')) OR
                (v_req.blood_group = 'A-'  AND v_donor.blood_group IN ('O-','A-')) OR
                (v_req.blood_group = 'B+'  AND v_donor.blood_group IN ('O-','O+','B-','B+')) OR
                (v_req.blood_group = 'B-'  AND v_donor.blood_group IN ('O-','B-')) OR
                (v_req.blood_group = 'O+'  AND v_donor.blood_group IN ('O-','O+')) OR
                (v_req.blood_group = 'O-'  AND v_donor.blood_group = 'O-')
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INCOMPATIBLE_BLOOD_GROUP',
                    'message', format('Incompatible blood group for Packed RBC: %s cannot receive %s.', v_req.blood_group, v_donor.blood_group)
                );
            END IF;
        ELSIF v_req.component = 'Platelets' THEN
            IF NOT (
                (v_req.blood_group = 'O-'  AND v_donor.blood_group IN ('O-','O+','A-','B-','AB-')) OR
                (v_req.blood_group = 'O+'  AND v_donor.blood_group IN ('O+','O-','A+','B+','AB+')) OR
                (v_req.blood_group = 'A-'  AND v_donor.blood_group IN ('A-','A+','AB-','O-')) OR
                (v_req.blood_group = 'A+'  AND v_donor.blood_group IN ('A+','A-','AB+','O+')) OR
                (v_req.blood_group = 'B-'  AND v_donor.blood_group IN ('B-','B+','AB-','O-')) OR
                (v_req.blood_group = 'B+'  AND v_donor.blood_group IN ('B+','B-','AB+','O+')) OR
                (v_req.blood_group = 'AB-' AND v_donor.blood_group IN ('AB-','AB+','A-','B-')) OR
                (v_req.blood_group = 'AB+' AND v_donor.blood_group IN ('AB+','AB-','A+','B+'))
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INCOMPATIBLE_BLOOD_GROUP',
                    'message', format('Incompatible blood group for Platelets: %s cannot receive %s.', v_req.blood_group, v_donor.blood_group)
                );
            END IF;
        ELSIF v_req.component = 'Plasma' THEN
            IF NOT (
                (v_req.blood_group = 'O-'  AND v_donor.blood_group IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')) OR
                (v_req.blood_group = 'O+'  AND v_donor.blood_group IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')) OR
                (v_req.blood_group = 'A-'  AND v_donor.blood_group IN ('A-','A+','AB-','AB+')) OR
                (v_req.blood_group = 'A+'  AND v_donor.blood_group IN ('A-','A+','AB-','AB+')) OR
                (v_req.blood_group = 'B-'  AND v_donor.blood_group IN ('B-','B+','AB-','AB+')) OR
                (v_req.blood_group = 'B+'  AND v_donor.blood_group IN ('B-','B+','AB-','AB+')) OR
                (v_req.blood_group = 'AB-' AND v_donor.blood_group IN ('AB-','AB+')) OR
                (v_req.blood_group = 'AB+' AND v_donor.blood_group IN ('AB-','AB+'))
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INCOMPATIBLE_BLOOD_GROUP',
                    'message', format('Incompatible blood group for Plasma: %s cannot receive %s.', v_req.blood_group, v_donor.blood_group)
                );
            END IF;
        END IF;
    END IF;

    -- 7. Check if already responded or accepted (Idempotency)
    SELECT * INTO v_existing_resp FROM public.donor_responses
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    SELECT * INTO v_existing_conv FROM public.conversations
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    SELECT * INTO v_existing_assignment FROM public.donor_assignments
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    IF v_existing_resp.id IS NOT NULL AND v_existing_resp.response_status = 'ACCEPTED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_accepted', true,
            'request_id', p_request_id,
            'assignment_id', v_existing_assignment.id,
            'conversation_id', v_existing_conv.id,
            'donor_name', v_donor.full_name,
            'status', 'ACCEPTED',
            'message', 'You have already accepted this emergency request.'
        );
    END IF;

    -- 8. Capacity check: do not exceed required units
    IF v_req.units_coordinated >= v_req.units_required THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAPACITY_REACHED',
            'message', 'This emergency request has already reached required coordination capacity.'
        );
    END IF;

    -- 9. Record donor response to ACCEPTED
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

    -- 11. Record donor assignment
    IF v_existing_assignment.id IS NOT NULL THEN
        v_assignment_id := v_existing_assignment.id;
    ELSE
        INSERT INTO public.donor_assignments (request_id, donor_id, units_assigned, status, coordinator_id, notes)
        VALUES (p_request_id, v_donor.id, 1, 'ASSIGNED', COALESCE(v_caller_id, v_donor_profile_id), 'Direct donor acceptance via CareLoop Connect')
        ON CONFLICT (request_id, donor_id) DO UPDATE SET updated_at = NOW()
        RETURNING id INTO v_assignment_id;

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
        jsonb_build_object('donor_id', v_donor.id, 'conversation_id', v_conversation_id, 'assignment_id', v_assignment_id, 'channel', 'WEB')
    );

    RETURN jsonb_build_object(
        'success', true,
        'already_accepted', false,
        'request_id', p_request_id,
        'assignment_id', v_assignment_id,
        'conversation_id', v_conversation_id,
        'donor_name', v_donor.full_name,
        'status', 'ACCEPTED',
        'message', 'Emergency request accepted successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) TO authenticated, service_role;
