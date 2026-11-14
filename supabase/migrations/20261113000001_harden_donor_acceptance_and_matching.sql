-- ============================================================================
-- Migration: 20261113000001_harden_donor_acceptance_and_matching.sql
-- Description: Server-Authoritative Donor Matching, Anti-Self-Match & Clinical Compatibility
-- Non-destructive update to public.accept_request_and_create_conversation
-- ============================================================================

-- 1. Helper function: Server-side ABO/Rh & Component Clinical Compatibility
CREATE OR REPLACE FUNCTION public.is_blood_compatible(
    p_patient_group VARCHAR,
    p_donor_group VARCHAR,
    p_component VARCHAR DEFAULT 'Whole Blood'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Identical blood group is always compatible across all components
    IF p_patient_group = p_donor_group THEN
        RETURN TRUE;
    END IF;

    -- Whole blood transfusion strictly requires identical ABO/Rh
    IF p_component = 'Whole Blood' OR p_component IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Packed Red Blood Cells (RBC) Compatibility
    IF p_component = 'Packed RBC' THEN
        CASE p_patient_group
            WHEN 'O-' THEN RETURN p_donor_group IN ('O-');
            WHEN 'O+' THEN RETURN p_donor_group IN ('O+', 'O-');
            WHEN 'A-' THEN RETURN p_donor_group IN ('A-', 'O-');
            WHEN 'A+' THEN RETURN p_donor_group IN ('A+', 'A-', 'O+', 'O-');
            WHEN 'B-' THEN RETURN p_donor_group IN ('B-', 'O-');
            WHEN 'B+' THEN RETURN p_donor_group IN ('B+', 'B-', 'O+', 'O-');
            WHEN 'AB-' THEN RETURN p_donor_group IN ('AB-', 'A-', 'B-', 'O-');
            WHEN 'AB+' THEN RETURN TRUE; -- Universal Recipient
            ELSE RETURN FALSE;
        END CASE;
    END IF;

    -- Fresh Frozen Plasma (FFP) Compatibility (reversed from RBC)
    IF p_component = 'Plasma' THEN
        CASE p_patient_group
            WHEN 'O-' THEN RETURN TRUE; -- Universal Recipient for Plasma
            WHEN 'O+' THEN RETURN TRUE;
            WHEN 'A-' THEN RETURN p_donor_group IN ('A-', 'A+', 'AB-', 'AB+');
            WHEN 'A+' THEN RETURN p_donor_group IN ('A-', 'A+', 'AB-', 'AB+');
            WHEN 'B-' THEN RETURN p_donor_group IN ('B-', 'B+', 'AB-', 'AB+');
            WHEN 'B+' THEN RETURN p_donor_group IN ('B-', 'B+', 'AB-', 'AB+');
            WHEN 'AB-' THEN RETURN p_donor_group IN ('AB-', 'AB+');
            WHEN 'AB+' THEN RETURN p_donor_group IN ('AB-', 'AB+');
            ELSE RETURN FALSE;
        END CASE;
    END IF;

    -- Platelet Compatibility
    IF p_component = 'Platelets' THEN
        CASE p_patient_group
            WHEN 'O-' THEN RETURN p_donor_group IN ('O-', 'O+', 'A-', 'B-', 'AB-');
            WHEN 'O+' THEN RETURN p_donor_group IN ('O+', 'O-', 'A+', 'B+', 'AB+');
            WHEN 'A-' THEN RETURN p_donor_group IN ('A-', 'A+', 'AB-', 'O-');
            WHEN 'A+' THEN RETURN p_donor_group IN ('A+', 'A-', 'AB+', 'O+');
            WHEN 'B-' THEN RETURN p_donor_group IN ('B-', 'B+', 'AB-', 'O-');
            WHEN 'B+' THEN RETURN p_donor_group IN ('B+', 'B-', 'AB+', 'O+');
            WHEN 'AB-' THEN RETURN p_donor_group IN ('AB-', 'AB+', 'A-', 'B-');
            WHEN 'AB+' THEN RETURN p_donor_group IN ('AB+', 'AB-', 'A+', 'B+');
            ELSE RETURN FALSE;
        END CASE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 2. Hardened accept_request_and_create_conversation
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
        -- Allow service-role or Edge Functions if caller is service_role
        IF current_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
            v_caller_id := NULL; -- Service role invocation
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Authentication required to accept donation requests.');
        END IF;
    END IF;

    -- Check staff role
    IF v_caller_id IS NOT NULL THEN
        v_is_staff := (public.get_user_role() IN ('coordinator', 'admin'));
    ELSE
        v_is_staff := TRUE; -- Service role has elevated rights
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
        RETURN jsonb_build_object('success', false, 'message', 'Active donor profile not found for authenticated user.');
    END IF;

    -- 3. Medical Clearance & Deferral Verification
    IF v_donor.is_medically_cleared IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor profile has an unresolved medical clearance hold.');
    END IF;

    IF v_donor.deferral_until IS NOT NULL AND v_donor.deferral_until > NOW() THEN
        RETURN jsonb_build_object('success', false, 'message', format('Donor is under medical deferral until %s.', v_donor.deferral_until));
    END IF;

    IF NOT v_donor.is_available OR v_donor.availability_state = 'TEMPORARILY_UNAVAILABLE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor is currently marked as unavailable.');
    END IF;

    -- 4. Lock and verify emergency request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This emergency request is no longer active.');
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by;

    -- 5. ANTI-SELF-MATCH: Creator cannot accept their own emergency request
    IF v_requester_id IS NOT NULL AND v_donor_profile_id IS NOT NULL AND v_requester_id = v_donor_profile_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'ANTI_SELF_MATCH: Donors cannot accept emergency requests created by their own user account.');
    END IF;

    -- 6. Server-Authoritative ABO/Rh & Component Clinical Compatibility Check
    IF NOT public.is_blood_compatible(v_req.blood_group, v_donor.blood_group, COALESCE(v_req.component, 'Whole Blood')) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', format('CLINICAL_INCOMPATIBILITY: Donor %s is not compatible with patient requirement %s (%s).', v_donor.blood_group, v_req.blood_group, COALESCE(v_req.component, 'Whole Blood'))
        );
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
            'already_accepted', true
        );
    END IF;

    -- Check capacity constraint: cannot exceed required units
    IF v_req.units_coordinated >= v_req.units_required THEN
        RETURN jsonb_build_object('success', false, 'message', 'REQUEST_ALREADY_FULFILLED');
    END IF;

    -- 8. Record or update donor response to ACCEPTED
    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, v_donor.id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    -- 9. Provision Conversation idempotently
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

    -- 10. Record donor assignment (check for pre-existing assignment to avoid double counting)
    SELECT * INTO v_existing_assignment FROM public.donor_assignments
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    IF v_existing_assignment.id IS NULL THEN
        INSERT INTO public.donor_assignments (request_id, donor_id, units_assigned, status)
        VALUES (p_request_id, v_donor.id, 1, 'ASSIGNED')
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

    -- 11. Audit event on request timeline
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
        'conversation_id', v_conversation_id,
        'request_id', p_request_id,
        'donor_name', v_donor.full_name,
        'already_accepted', false
    );
END;
$$;

-- 3. Explicit permissions
GRANT EXECUTE ON FUNCTION public.is_blood_compatible(VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) TO authenticated, service_role;
