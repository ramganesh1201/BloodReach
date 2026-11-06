-- ============================================================================
-- CARELOOP SCHEMA MIGRATION 8: PHASE 2.4.2 FINAL AUTHORIZATION & SECURITY CLOSURE
-- ============================================================================
-- 1. Notification Authorization Closure:
--    - Revoke table-level direct UPDATE, INSERT, DELETE from client roles
--    - Drop permissive UPDATE policy; force acknowledgement through restricted RPCs
--    - Prevent authenticated users from modifying content, status, user_id, metadata
-- 2. Blood Centre Manager Hierarchy Enforcement:
--    - Coordinators/admins: Exclusive authority to grant/revoke/suspend manager status
--    - Managers: Can add, activate, suspend technicians and staff only
--    - Strict guard preventing manager escalation, lateral coups, or self-modification
--    - Revoke direct table mutations on blood_centre_memberships from client roles
-- 3. TURN Rate Limiter Clock Timestamp Hardening:
--    - Acquire advisory lock first, then sample clock_timestamp() for exact wall-clock time
--    - Fixed 10-minute window anchored at window_start
-- ============================================================================

-- 1. NOTIFICATION AUTHORIZATION CLOSURE
-- Drop permissive table-level UPDATE policy
DROP POLICY IF EXISTS "Users acknowledge own notifications" ON public.notifications;

-- Revoke direct mutation privileges completely from PostgREST client roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notifications FROM PUBLIC, anon, authenticated;

-- Ensure SELECT is permitted only for the recipient
GRANT SELECT ON public.notifications TO authenticated;

-- Grant EXECUTE on restricted acknowledgement RPCs
GRANT EXECUTE ON FUNCTION public.acknowledge_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_all_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) TO authenticated;

-- 2. BLOOD CENTRE MANAGER HIERARCHY & MEMBERSHIP TABLE SECURITY
-- Revoke direct table mutations on blood_centre_memberships from client roles
DROP POLICY IF EXISTS "Centre managers and admins modify memberships" ON public.blood_centre_memberships;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.blood_centre_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blood_centre_memberships TO authenticated;

-- Replace self-referential SELECT policy with non-recursive SECURITY DEFINER helper to prevent infinite recursion
DROP POLICY IF EXISTS "Members and admins read centre memberships" ON public.blood_centre_memberships;
CREATE POLICY "Members and admins read centre memberships" ON public.blood_centre_memberships
FOR SELECT USING (
    (get_user_role() = ANY (ARRAY['coordinator', 'admin']))
    OR (user_id = auth.uid())
    OR (public.is_centre_member(centre_id, auth.uid()))
);

-- Hardened add_centre_member_atomic with Manager Escalation Guard
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
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_role NOT IN ('manager', 'technician', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid membership role. Must be manager, technician, or staff.');
    END IF;

    -- Verify caller authorization
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

        -- Strict Manager Escalation Guard: Centre managers CANNOT create or promote someone to 'manager'
        -- Only coordinators and admins can grant manager privileges.
        IF p_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system coordinators or administrators can grant manager privileges.');
        END IF;

        -- Prevent self-role modification
        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Cannot modify own membership role.');
        END IF;

        -- Managers cannot alter or demote an existing manager
        IF EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = p_centre_id AND user_id = p_user_id AND role = 'manager'
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only coordinators or admins can modify an existing manager.');
        END IF;
    END IF;

    INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
    VALUES (p_centre_id, p_user_id, p_role, 'active')
    ON CONFLICT (centre_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()
    RETURNING id INTO v_mem_id;

    RETURN jsonb_build_object('success', true, 'membership_id', v_mem_id, 'centre_id', p_centre_id, 'user_id', p_user_id, 'role', p_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) TO authenticated;

-- Hardened set_centre_member_status_atomic with Manager Inter-protection
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
    v_is_caller_manager BOOLEAN := false;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_status NOT IN ('active', 'pending', 'suspended') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status. Must be active, pending, or suspended.');
    END IF;

    -- Verify target membership exists and fetch its role
    SELECT role INTO v_target_role
    FROM public.blood_centre_memberships
    WHERE centre_id = p_centre_id AND user_id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Membership record not found.');
    END IF;

    -- Caller must be coordinator, admin, or active manager of the target centre
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

        -- Prevent self-suspension of the calling manager
        IF v_caller_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Self-suspension prohibited: Managers cannot suspend their own active account.');
        END IF;

        -- Manager cannot alter the status of another manager! Only coordinators and admins can suspend or activate managers.
        IF v_target_role = 'manager' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system coordinators or administrators can change manager status.');
        END IF;
    END IF;

    UPDATE public.blood_centre_memberships
    SET status = p_status, updated_at = NOW()
    WHERE centre_id = p_centre_id AND user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'centre_id', p_centre_id, 'user_id', p_user_id, 'status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) TO authenticated;

-- 3. GENUINELY ATOMIC TURN RATE LIMITER WITH CLOCK_TIMESTAMP()
CREATE OR REPLACE FUNCTION public.get_ephemeral_turn_credentials(p_ttl_seconds INT DEFAULT 600)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_turn_secret TEXT;
    v_turn_url TEXT;
    v_expiry_epoch BIGINT;
    v_turn_username TEXT;
    v_turn_credential TEXT;
    v_ttl INT := 600; -- Strictly 600 seconds (10 minutes)
    v_rate_count INT;
    v_rate_window_start TIMESTAMPTZ;
    v_now TIMESTAMPTZ;
BEGIN
    -- 1. Authentication Check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'AUTH_REQUIRED',
            'message', 'Authentication required to obtain TURN credentials.'
        );
    END IF;

    -- 2. Strict TTL Validation: Reject attempts to request a lifetime > 600 seconds or <= 0
    IF p_ttl_seconds IS NOT NULL AND (p_ttl_seconds > 600 OR p_ttl_seconds <= 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TTL_EXCEEDED',
            'message', 'Invalid TTL: Ephemeral TURN credential lifetime is strictly 600 seconds (10 minutes).'
        );
    END IF;

    -- 3. Genuinely Atomic Fixed-Window Rate Limiter (Max 10 requests per user per 10-minute window)
    -- Step 3a: Acquire a per-user transaction advisory lock to serialize all concurrent requests for this user
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(v_user_id::text), 1, 16))::bit(64)::bigint);

    -- Step 3b: Sample wall-clock timestamp AFTER lock acquisition
    v_now := clock_timestamp();

    -- Step 3c: Atomically ensure that a row exists for the user (initialized with 0 requests)
    INSERT INTO public.turn_request_rate_limits (user_id, request_count, window_start, updated_at)
    VALUES (v_user_id, 0, v_now, v_now)
    ON CONFLICT (user_id) DO NOTHING;

    -- Step 3d: Acquire an exclusive row lock on the user's rate limit entry
    SELECT request_count, window_start
    INTO v_rate_count, v_rate_window_start
    FROM public.turn_request_rate_limits
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Step 3e: Check fixed-window expiration (anchored at window_start for 10 minutes)
    IF v_now - v_rate_window_start >= INTERVAL '10 minutes' THEN
        -- Window expired: Reset counter and anchor a new 10-minute window
        v_rate_count := 0;
        v_rate_window_start := v_now;
    END IF;

    -- Step 3f: Enforce maximum of 10 requests per 10-minute window
    IF v_rate_count >= 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RATE_LIMIT_EXCEEDED',
            'message', 'Rate limit exceeded: Maximum 10 TURN credential requests per 10-minute window.',
            'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate_window_start + INTERVAL '10 minutes' - v_now)))::INT)
        );
    END IF;

    -- Step 3g: Atomically increment request counter for this window
    UPDATE public.turn_request_rate_limits
    SET request_count = v_rate_count + 1,
        window_start = v_rate_window_start,
        updated_at = v_now
    WHERE user_id = v_user_id;

    -- 4. Retrieve Secret and Server URL from app_settings
    SELECT value INTO v_turn_secret FROM public.app_settings WHERE key = 'turn_shared_secret';
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

    -- If secret is not configured, return STUN fallback
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        RETURN jsonb_build_object(
            'success', true,
            'turn_configured', false,
            'ice_servers', jsonb_build_array(
                jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
                jsonb_build_object('urls', 'stun:stun1.l.google.com:19302')
            ),
            'message', 'TURN server not configured on backend. STUN fallback returned.'
        );
    END IF;

    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := 'turn:turn.careloop.org:3478?transport=udp';
    END IF;

    -- 5. Calculate Ephemeral Username & HMAC-SHA1 Credential (Fixed 600s TTL per draft-uberti-behave-turn-rest-00)
    v_expiry_epoch := (extract(epoch from v_now)::bigint) + v_ttl;
    v_turn_username := format('%s:%s', v_expiry_epoch, v_user_id);
    v_turn_credential := encode(extensions.hmac(v_turn_username::bytea, v_turn_secret::bytea, 'sha1'), 'base64');

    RETURN jsonb_build_object(
        'success', true,
        'turn_configured', true,
        'ice_servers', jsonb_build_array(
            jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
            jsonb_build_object(
                'urls', v_turn_url,
                'username', v_turn_username,
                'credential', v_turn_credential
            )
        ),
        'expires_at', to_timestamp(v_expiry_epoch),
        'ttl_seconds', v_ttl
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) TO authenticated;
