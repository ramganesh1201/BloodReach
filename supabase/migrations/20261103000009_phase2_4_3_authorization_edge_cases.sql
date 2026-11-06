-- ============================================================================
-- CARELOOP SCHEMA MIGRATION 9: PHASE 2.4.3 FINAL AUTHORIZATION & CONCURRENCY EDGE CASES
-- ============================================================================
-- 1. Notification RPC Authorization Hardening:
--    - Revoke EXECUTE on update_notification_delivery_status from authenticated, anon, PUBLIC
--    - Restrict delivery status mutation strictly to service_role / system dispatcher
--    - Disallow 'ACKNOWLEDGED' status via delivery status RPC (must use acknowledge_notification)
--    - Ensure anonymous callers cannot invoke create_notification
-- 2. Genuinely Atomic Concurrent Blood Centre Manager Authorization:
--    - Advisory locks on (centre_id, user_id) tuple to eliminate TOCTOU races under concurrency
--    - Exclusive row locks (SELECT ... FOR UPDATE) on target memberships before permission check
--    - Caller authorization over blood centre evaluated before target membership checks (no enumeration)
--    - Strict protection preventing managers from altering/suspending another manager under race conditions
-- 3. Default Privileges Hardening:
--    - Revoke routine EXECUTE from anon and PUBLIC for future functions created by postgres
-- ============================================================================

-- 1. NOTIFICATION RPC AUTHORIZATION HARDENING

-- 1a. Harden update_notification_delivery_status
CREATE OR REPLACE FUNCTION public.update_notification_delivery_status(
    p_notification_id UUID,
    p_status TEXT,
    p_error TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT := public.get_user_role();
    v_notif RECORD;
BEGIN
    -- Strict authorization check: Only service_role (backend worker/dispatcher) or coordinator/admin
    IF auth.role() <> 'service_role' AND v_caller_role NOT IN ('coordinator', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only system dispatcher or coordinators can update delivery status'
            USING ERRCODE = '42501';
    END IF;

    -- Allowed delivery statuses. Note: 'ACKNOWLEDGED' is strictly reserved for acknowledge_notification()
    IF p_status NOT IN ('PENDING', 'QUEUED', 'ATTEMPTED', 'SENT', 'DELIVERED', 'FAILED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Invalid notification status for delivery update. User acknowledgements must use acknowledge_notification.'
        );
    END IF;

    SELECT * INTO v_notif
    FROM public.notifications
    WHERE id = p_notification_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification not found.');
    END IF;

    UPDATE public.notifications
    SET status = p_status,
        metadata = CASE
            WHEN p_error IS NOT NULL THEN jsonb_set(metadata, '{delivery_error}', to_jsonb(p_error))
            ELSE metadata
        END
    WHERE id = p_notification_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', p_notification_id,
        'status', p_status
    );
END;
$$;

-- Revoke from all client roles; grant exclusively to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) TO service_role;

-- 1b. Harden create_notification with explicit authentication validation
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_channel TEXT,
    p_title TEXT,
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'::JSONB,
    p_idempotency_key TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_existing_id UUID;
    v_existing_status TEXT;
    v_notif_id UUID;
    v_initial_status TEXT;
BEGIN
    -- Explicit authentication guard: anonymous callers cannot create notifications
    IF auth.role() <> 'service_role' AND v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_channel NOT IN ('IN_APP', 'SMS', 'PUSH', 'EMAIL') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid notification channel.');
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification content is required.');
    END IF;

    -- Non-staff callers can only create notifications addressed to themselves
    IF v_caller_id IS NOT NULL AND v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Non-staff users cannot inject notifications for other accounts.');
        END IF;
    END IF;

    -- In-app notifications are immediately visible (DELIVERED).
    -- External carrier/push channels remain PENDING (carrier dispatch disabled).
    IF p_channel = 'IN_APP' THEN
        v_initial_status := 'DELIVERED';
    ELSE
        v_initial_status := 'PENDING';
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM public.notifications
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'notification_id', v_existing_id,
                'status', v_existing_status,
                'deduplicated', true
            );
        END IF;
    END IF;

    INSERT INTO public.notifications (
        user_id, channel, title, content, metadata, idempotency_key, status
    )
    VALUES (
        p_user_id, p_channel, p_title, p_content, p_metadata, p_idempotency_key, v_initial_status
    )
    RETURNING id INTO v_notif_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notif_id,
        'status', v_initial_status,
        'deduplicated', false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;

-- 1c. Ensure acknowledge RPCs have explicit grants
REVOKE EXECUTE ON FUNCTION public.acknowledge_notification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.acknowledge_all_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_all_notifications() TO authenticated, service_role;


-- 2. CONCURRENT MANAGER AUTHORIZATION HARDENING (TOCTOU RACE ELIMINATION)

-- 2a. Hardened add_centre_member_atomic with advisory lock + FOR UPDATE
CREATE OR REPLACE FUNCTION public.add_centre_member_atomic(
    p_centre_id UUID,
    p_user_id UUID,
    p_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_mem_id UUID;
    v_is_caller_manager BOOLEAN := false;
    v_existing_role TEXT;
    v_existing_status TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_role NOT IN ('manager', 'technician', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid membership role. Must be manager, technician, or staff.');
    END IF;

    -- STEP 1: Per-(centre, user) transaction advisory lock.
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_centre_id::text || ':' || p_user_id::text), 1, 16))::bit(64)::bigint);

    -- STEP 2: Caller authorization check over centre evaluated first
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = p_centre_id AND user_id = v_caller_id AND role = 'manager' AND status = 'active'
        ) OR EXISTS (
            SELECT 1 FROM public.blood_centres
            WHERE id = p_centre_id AND profile_id = v_caller_id
        ) INTO v_is_caller_manager;

        IF NOT v_is_caller_manager THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only centre managers, coordinators, or admins can manage staff.');
        END IF;

        IF p_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system coordinators or administrators can grant manager privileges.');
        END IF;

        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Cannot modify own membership role.');
        END IF;
    END IF;

    -- STEP 3: Row-level lock on existing membership if present
    SELECT role, status INTO v_existing_role, v_existing_status
    FROM public.blood_centre_memberships
    WHERE centre_id = p_centre_id AND user_id = p_user_id
    FOR UPDATE;

    -- STEP 4: Protection against modifying existing managers
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_existing_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only coordinators or admins can modify an existing manager.');
        END IF;
    END IF;

    INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
    VALUES (p_centre_id, p_user_id, p_role, 'active')
    ON CONFLICT (centre_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()
    RETURNING id INTO v_mem_id;

    RETURN jsonb_build_object(
        'success', true,
        'membership_id', v_mem_id,
        'centre_id', p_centre_id,
        'user_id', p_user_id,
        'role', p_role
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

-- 2b. Hardened set_centre_member_status_atomic with advisory lock + FOR UPDATE
CREATE OR REPLACE FUNCTION public.set_centre_member_status_atomic(
    p_centre_id UUID,
    p_user_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_target_role TEXT;
    v_target_status TEXT;
    v_is_caller_manager BOOLEAN := false;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_status NOT IN ('active', 'pending', 'suspended') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status. Must be active, pending, or suspended.');
    END IF;

    -- STEP 1: Per-(centre, user) transaction advisory lock.
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_centre_id::text || ':' || p_user_id::text), 1, 16))::bit(64)::bigint);

    -- STEP 2: Caller authorization check over centre evaluated first
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = p_centre_id AND user_id = v_caller_id AND role = 'manager' AND status = 'active'
        ) OR EXISTS (
            SELECT 1 FROM public.blood_centres
            WHERE id = p_centre_id AND profile_id = v_caller_id
        ) INTO v_is_caller_manager;

        IF NOT v_is_caller_manager THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only centre managers, coordinators, or admins can update member status.');
        END IF;

        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Self-suspension prohibited: Managers cannot suspend their own active account.');
        END IF;
    END IF;

    -- STEP 3: Exclusive row lock on target membership record
    SELECT role, status INTO v_target_role, v_target_status
    FROM public.blood_centre_memberships
    WHERE centre_id = p_centre_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Membership record not found.');
    END IF;

    -- STEP 4: Protection against modifying existing managers
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_target_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system coordinators or administrators can change manager status.');
        END IF;
    END IF;

    UPDATE public.blood_centre_memberships
    SET status = p_status, updated_at = NOW()
    WHERE centre_id = p_centre_id AND user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'centre_id', p_centre_id,
        'user_id', p_user_id,
        'status', p_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

-- 3. DEFAULT PRIVILEGES HARDENING
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;
