-- ============================================================================
-- CARELOOP SCHEMA MIGRATION 10: PHASE 2.4.4 AUTHORIZATION FRESHNESS & CONCURRENCY
-- ============================================================================
-- 1. Notification Delivery Status Alignment:
--    - Enforce strict service-role-only internal authorization check
--    - Remove contradictory coordinator/admin branches
--    - Retain strict rejection of 'ACKNOWLEDGED'
-- 2. Authorization Freshness Under Concurrency (TOCTOU on Privileges):
--    - In add_centre_member_atomic & set_centre_member_status_atomic:
--      * Acquire row lock (FOR SHARE) on caller's profile to serialize against concurrent demotions
--      * Acquire row lock (FOR SHARE) on caller's own membership to serialize against concurrent suspensions
--      * Use NULL-safe Boolean evaluations (COALESCE) to eliminate three-valued logic bypasses
--      * Retain per-(centre, user) transaction advisory locks and target row locks (FOR UPDATE)
-- ============================================================================

-- 1. NOTIFICATION DELIVERY STATUS STRICT SERVICE-ROLE EXECUTION
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
    v_notif RECORD;
BEGIN
    -- Strict service-role-only authorization check
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: Only service_role can update notification delivery status'
            USING ERRCODE = '42501';
    END IF;

    -- Allowed delivery statuses. 'ACKNOWLEDGED' is strictly reserved for acknowledge_notification()
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

REVOKE EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) TO service_role;


-- 2. ATOMIC MEMBERSHIP MUTATIONS WITH GUARANTEED AUTHORIZATION FRESHNESS

-- 2a. add_centre_member_atomic with Caller Profile & Membership FOR SHARE locks
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
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_caller_mem_role TEXT;
    v_caller_mem_status TEXT;
    v_is_centre_owner BOOLEAN := false;
    v_mem_id UUID;
    v_existing_role TEXT;
    v_existing_status TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_role NOT IN ('manager', 'technician', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid membership role. Must be manager, technician, or staff.');
    END IF;

    -- STEP 1: Verify Caller Authorization Freshness under row lock (FOR SHARE)
    -- Serializes against concurrent role revocation transactions (e.g. admin_set_user_role)
    SELECT role, status INTO v_caller_role, v_caller_status
    FROM public.profiles
    WHERE id = v_caller_id
    FOR SHARE;

    IF v_caller_status IS NULL OR v_caller_status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Caller account is not active.');
    END IF;

    -- STEP 2: Per-(centre, user) transaction advisory lock
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_centre_id::text || ':' || p_user_id::text), 1, 16))::bit(64)::bigint);

    -- STEP 3: Caller authorization checks evaluated with freshness guarantees & three-valued logic guards
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        -- Caller is claiming manager authority.
        -- Lock caller's own membership in this centre FOR SHARE to guarantee authorization freshness
        SELECT role, status INTO v_caller_mem_role, v_caller_mem_status
        FROM public.blood_centre_memberships
        WHERE centre_id = p_centre_id AND user_id = v_caller_id
        FOR SHARE;

        -- Check primary centre ownership FOR SHARE
        SELECT (profile_id = v_caller_id) INTO v_is_centre_owner
        FROM public.blood_centres
        WHERE id = p_centre_id
        FOR SHARE;

        IF NOT (
            (COALESCE(v_caller_mem_role, '') = 'manager' AND COALESCE(v_caller_mem_status, '') = 'active')
            OR (v_is_centre_owner IS TRUE)
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only active centre managers, coordinators, or admins can manage staff.');
        END IF;

        -- Strict Manager Escalation Guard: Centre managers CANNOT create or promote someone to 'manager'
        IF p_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system coordinators or administrators can grant manager privileges.');
        END IF;

        -- Prevent self-role modification
        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Cannot modify own membership role.');
        END IF;
    END IF;

    -- STEP 4: Row-level lock on existing target membership record (FOR UPDATE)
    SELECT role, status INTO v_existing_role, v_existing_status
    FROM public.blood_centre_memberships
    WHERE centre_id = p_centre_id AND user_id = p_user_id
    FOR UPDATE;

    -- STEP 5: Protection against modifying existing managers evaluated under row lock
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF COALESCE(v_existing_role, '') = 'manager' THEN
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

-- 2b. set_centre_member_status_atomic with Caller Profile & Membership FOR SHARE locks
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
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_caller_mem_role TEXT;
    v_caller_mem_status TEXT;
    v_is_centre_owner BOOLEAN := false;
    v_target_role TEXT;
    v_target_status TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_status NOT IN ('active', 'pending', 'suspended') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status. Must be active, pending, or suspended.');
    END IF;

    -- STEP 1: Verify Caller Authorization Freshness under row lock (FOR SHARE)
    SELECT role, status INTO v_caller_role, v_caller_status
    FROM public.profiles
    WHERE id = v_caller_id
    FOR SHARE;

    IF v_caller_status IS NULL OR v_caller_status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Caller account is not active.');
    END IF;

    -- STEP 2: Per-(centre, user) transaction advisory lock
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_centre_id::text || ':' || p_user_id::text), 1, 16))::bit(64)::bigint);

    -- STEP 3: Caller authorization checks evaluated with freshness guarantees & three-valued logic guards
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        SELECT role, status INTO v_caller_mem_role, v_caller_mem_status
        FROM public.blood_centre_memberships
        WHERE centre_id = p_centre_id AND user_id = v_caller_id
        FOR SHARE;

        SELECT (profile_id = v_caller_id) INTO v_is_centre_owner
        FROM public.blood_centres
        WHERE id = p_centre_id
        FOR SHARE;

        IF NOT (
            (COALESCE(v_caller_mem_role, '') = 'manager' AND COALESCE(v_caller_mem_status, '') = 'active')
            OR (v_is_centre_owner IS TRUE)
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only active centre managers, coordinators, or admins can update member status.');
        END IF;

        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Self-suspension prohibited: Managers cannot suspend their own active account.');
        END IF;
    END IF;

    -- STEP 4: Exclusive row lock on target membership record (FOR UPDATE)
    SELECT role, status INTO v_target_role, v_target_status
    FROM public.blood_centre_memberships
    WHERE centre_id = p_centre_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Membership record not found.');
    END IF;

    -- STEP 5: Protection against modifying existing managers evaluated under row lock
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF COALESCE(v_target_role, '') = 'manager' THEN
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
