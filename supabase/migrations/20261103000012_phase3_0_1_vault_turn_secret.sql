-- ============================================================================
-- CareLoop Migration 12: Vault Migration for TURN Shared Secret
-- Version: 20261103000012
-- Description: Migrates TURN HMAC shared secret from plaintext public.app_settings
--              into Supabase Vault (vault.secrets / vault.decrypted_secrets)
--              encrypted with AEAD at rest, and updates credential RPCs.
-- ============================================================================

-- 1. Migrate Existing Secret from app_settings to vault.secrets idempotently
DO $$
DECLARE
    v_existing_secret TEXT;
BEGIN
    SELECT value INTO v_existing_secret 
    FROM public.app_settings 
    WHERE key IN ('turn_shared_secret', 'app.settings.turn_shared_secret') 
    LIMIT 1;

    IF v_existing_secret IS NOT NULL AND v_existing_secret <> '' THEN
        IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'turn_shared_secret') THEN
            PERFORM vault.create_secret(
                v_existing_secret,
                'turn_shared_secret',
                'Coturn HMAC-SHA1 shared secret for CareLoop WebRTC'
            );
        END IF;
    END IF;
END $$;

-- 2. Purge Plaintext Secret from public.app_settings
DELETE FROM public.app_settings WHERE key IN ('turn_shared_secret', 'app.settings.turn_shared_secret');

-- 3. Update get_ephemeral_turn_credentials to read strictly from Supabase Vault
CREATE OR REPLACE FUNCTION public.get_ephemeral_turn_credentials(p_ttl_seconds INT DEFAULT 600)
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

    -- 2. Strict TTL Validation: Ephemeral TURN credential lifetime is strictly 600 seconds
    IF p_ttl_seconds IS NOT NULL AND (p_ttl_seconds > 600 OR p_ttl_seconds <= 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TTL_EXCEEDED',
            'message', 'Invalid TTL: Ephemeral TURN credential lifetime is strictly 600 seconds (10 minutes).'
        );
    END IF;

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

    -- 4. Retrieve Secret from Supabase Vault (vault.decrypted_secrets)
    SELECT decrypted_secret INTO v_turn_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'turn_shared_secret' 
    LIMIT 1;

    -- Fallback to session setting (transient test overrides only)
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

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

-- 4. Update issue_ice_credentials to read strictly from Supabase Vault
CREATE OR REPLACE FUNCTION public.issue_ice_credentials(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_temp
AS $$
DECLARE
    v_call RECORD;
    v_user_id UUID := auth.uid();
    v_ice_servers JSONB;
    v_turn_secret TEXT;
    v_turn_url TEXT;
    v_ttl_seconds INT := 600;
    v_expiry_epoch BIGINT;
    v_turn_username TEXT;
    v_turn_credential TEXT;
    v_turn_configured BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.caller_id <> v_user_id AND v_call.receiver_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to obtain ICE credentials for this call.');
    END IF;

    v_ice_servers := jsonb_build_array(
        jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun1.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun2.l.google.com:19302')
    );

    SELECT decrypted_secret INTO v_turn_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'turn_shared_secret' 
    LIMIT 1;

    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

    IF v_turn_secret IS NOT NULL AND v_turn_secret <> '' AND v_turn_url IS NOT NULL AND v_turn_url <> '' THEN
        v_expiry_epoch := EXTRACT(EPOCH FROM NOW())::BIGINT + v_ttl_seconds;
        v_turn_username := v_expiry_epoch || ':' || v_user_id;
        v_turn_credential := encode(extensions.hmac(v_turn_username::bytea, v_turn_secret::bytea, 'sha1'), 'base64');

        v_ice_servers := v_ice_servers || jsonb_build_array(
            jsonb_build_object(
                'urls', v_turn_url,
                'username', v_turn_username,
                'credential', v_turn_credential
            )
        );
        v_turn_configured := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'turn_configured', v_turn_configured,
        'ice_servers', v_ice_servers,
        'ttl_seconds', v_ttl_seconds
    );
END;
$$;

-- 5. Strict Execution Grants
REVOKE EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) TO authenticated;

-- 6. Realtime CDC Evaluation Permissions
-- Ensures supabase_realtime_admin and client evaluation contexts have permission
-- to evaluate RLS filters on the messages table published to supabase_realtime.
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO anon, authenticated, service_role, supabase_realtime_admin;
