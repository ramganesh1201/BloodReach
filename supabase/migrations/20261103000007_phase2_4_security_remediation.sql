-- ============================================================================
-- CARELOOP SCHEMA MIGRATION 7: PHASE 2.4 SECURITY FINDINGS REMEDIATION
-- ============================================================================
-- 1. Ephemeral TURN Request Rate Limiting Table (with strict PostgREST revocation)
-- 2. Genuinely Atomic Rate Limiter (pg_advisory_xact_lock + INSERT ON CONFLICT DO NOTHING + FOR UPDATE)
-- 3. Strict 600-Second (10-minute) TTL Enforcement on get_ephemeral_turn_credentials
-- 4. Fixed-Window Algorithm (10-minute window anchored at window_start)
-- 5. Dedicated Member Status Procedure (set_centre_member_status_atomic)
-- ============================================================================

-- 1. Ephemeral TURN Request Rate Limiting Table
CREATE TABLE IF NOT EXISTS public.turn_request_rate_limits (
    user_id UUID PRIMARY KEY,
    request_count INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protect rate limit table completely from PostgREST client roles
ALTER TABLE public.turn_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turn_request_rate_limits FROM PUBLIC, anon, authenticated;

-- 2. Genuinely Atomic Ephemeral TURN Generator with Strict 600s TTL and Fixed-Window Rate Limiting
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
    -- Step 3a: Acquire a per-user transaction advisory lock to eliminate first-request race conditions
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(v_user_id::text), 1, 16))::bit(64)::bigint);

    -- Step 3b: Atomically ensure that a row exists for the user (initialized with 0 requests)
    INSERT INTO public.turn_request_rate_limits (user_id, request_count, window_start, updated_at)
    VALUES (v_user_id, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    -- Step 3c: Acquire an exclusive row lock on the user's rate limit entry
    SELECT request_count, window_start
    INTO v_rate_count, v_rate_window_start
    FROM public.turn_request_rate_limits
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Step 3d: Check fixed-window expiration (anchored at window_start for 10 minutes)
    IF NOW() - v_rate_window_start >= INTERVAL '10 minutes' THEN
        -- Window expired: Reset counter and anchor a new 10-minute window
        v_rate_count := 0;
        v_rate_window_start := NOW();
    END IF;

    -- Step 3e: Enforce maximum of 10 requests per 10-minute window
    IF v_rate_count >= 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RATE_LIMIT_EXCEEDED',
            'message', 'Rate limit exceeded: Maximum 10 TURN credential requests per 10-minute window.',
            'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate_window_start + INTERVAL '10 minutes' - NOW())))::INT)
        );
    END IF;

    -- Step 3f: Atomically increment request counter for this window
    UPDATE public.turn_request_rate_limits
    SET request_count = v_rate_count + 1,
        window_start = v_rate_window_start,
        updated_at = NOW()
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

    -- 5. Calculate RFC 5766 Ephemeral Username & HMAC-SHA1 Credential (Fixed 600s TTL)
    v_expiry_epoch := (extract(epoch from now())::bigint) + v_ttl;
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

-- 3. Procedure to change centre member status (active / pending / suspended)
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
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_status NOT IN ('active', 'pending', 'suspended') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status. Must be active, pending, or suspended.');
    END IF;

    -- Caller must be coordinator, admin, or active manager of the target centre
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = p_centre_id AND user_id = v_caller_id AND role = 'manager' AND status = 'active'
        ) AND NOT EXISTS (
            SELECT 1 FROM public.blood_centres
            WHERE id = p_centre_id AND profile_id = v_caller_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only centre managers, coordinators, or admins can update member status.');
        END IF;
    END IF;

    -- Prevent self-suspension of the calling manager
    IF v_caller_id = p_user_id AND p_status = 'suspended' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Self-suspension prohibited: Managers cannot suspend their own active account.');
    END IF;

    UPDATE public.blood_centre_memberships
    SET status = p_status, updated_at = NOW()
    WHERE centre_id = p_centre_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Membership record not found.');
    END IF;

    RETURN jsonb_build_object('success', true, 'centre_id', p_centre_id, 'user_id', p_user_id, 'status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_centre_member_status_atomic(UUID, UUID, TEXT) TO authenticated;
