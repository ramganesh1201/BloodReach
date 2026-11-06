-- ============================================================================
-- CareLoop Phase 3.1.5 — Diagnostic Issuance Timestamp & Rounding Alignment
-- Migration: 20261103000015_phase3_1_5_diagnostic_issuance.sql
--
-- Objective:
-- 1. Support test-only diagnostic return path for exact internal issuance timestamp.
-- 2. Prevent reliance on evaluation order between separate outer SQL expressions.
-- 3. Preserve canonical expiration algorithm: (extract(epoch from v_now)::bigint) + v_ttl.
-- 4. Default p_diagnostic=false preserves 100% production response format.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_ephemeral_turn_credentials(INT);

CREATE OR REPLACE FUNCTION public.get_ephemeral_turn_credentials(
    p_ttl_seconds INT DEFAULT 600,
    p_diagnostic BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_turn_secret TEXT;
    v_turn_url TEXT;
    v_expiry_epoch BIGINT;
    v_turn_username TEXT;
    v_turn_credential TEXT;
    v_ttl INT;
    v_rate_count INT;
    v_rate_window_start TIMESTAMPTZ;
    v_now TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    -- 1. Authentication Check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'AUTH_REQUIRED',
            'message', 'Authentication required to obtain TURN credentials.'
        );
    END IF;

    -- 2. Strict TTL Validation:
    -- Explicitly reject non-positive TTL values (<= 0)
    IF p_ttl_seconds IS NOT NULL AND p_ttl_seconds <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TTL',
            'message', 'Invalid TTL: Ephemeral TURN credential lifetime must be a positive integer.'
        );
    END IF;

    -- Default to 600s if omitted, and cap maximum at 600s
    v_ttl := LEAST(COALESCE(p_ttl_seconds, 600), 600);

    -- 3. Atomic Fixed-Window Rate Limiter (Max 10 requests per user per 10-minute window)
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(v_user_id::text), 1, 16))::bit(64)::bigint);
    v_now := clock_timestamp();

    INSERT INTO public.turn_request_rate_limits (user_id, request_count, window_start, updated_at)
    VALUES (v_user_id, 0, v_now, v_now)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT request_count, window_start
    INTO v_rate_count, v_rate_window_start
    FROM public.turn_request_rate_limits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_now - v_rate_window_start >= INTERVAL '10 minutes' THEN
        v_rate_count := 0;
        v_rate_window_start := v_now;
    END IF;

    IF v_rate_count >= 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RATE_LIMIT_EXCEEDED',
            'message', 'Rate limit exceeded: Maximum 10 TURN credential requests per 10-minute window.',
            'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate_window_start + INTERVAL '10 minutes' - v_now)))::INT)
        );
    END IF;

    UPDATE public.turn_request_rate_limits
    SET request_count = v_rate_count + 1,
        window_start = v_rate_window_start,
        updated_at = v_now
    WHERE user_id = v_user_id;

    -- 4. Retrieve Secret from Supabase Vault strictly using canonical name 'turn_shared_secret'
    SELECT decrypted_secret INTO v_turn_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'turn_shared_secret' 
    ORDER BY created_at DESC
    LIMIT 1;

    -- Fallback to session setting (transient test overrides only)
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

    -- Missing secret fallback: return stun servers gracefully with turn_configured = false
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

    -- 5. Calculate Ephemeral Username & HMAC-SHA1 Credential (TTL strictly capped at 600s)
    -- Expiry algorithm: (extract(epoch from v_now)::bigint) + v_ttl
    -- Note: PostgreSQL extract() returns numeric; numeric-to-bigint cast rounds ties away from zero.
    v_expiry_epoch := (extract(epoch from v_now)::bigint) + v_ttl;
    v_turn_username := format('%s:%s', v_expiry_epoch, v_user_id);
    v_turn_credential := encode(extensions.hmac(v_turn_username::bytea, v_turn_secret::bytea, 'sha1'), 'base64');

    v_result := jsonb_build_object(
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

    -- 6. Diagnostic Parameter Authorization:
    -- Production clients cannot enable diagnostic output.
    -- Diagnostic access is restricted to dedicated test/admin paths (service_role or database admin).
    IF p_diagnostic THEN
        IF auth.role() = 'service_role' 
           OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        THEN
            v_result := v_result || jsonb_build_object(
                'diagnostic', jsonb_build_object(
                    'issued_at', v_now,
                    'issued_epoch_exact', extract(epoch from v_now)
                )
            );
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT, BOOLEAN) TO authenticated, service_role;

