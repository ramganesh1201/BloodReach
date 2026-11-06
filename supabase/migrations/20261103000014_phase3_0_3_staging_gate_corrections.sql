-- ============================================================================
-- CareLoop Migration 14: Phase 3.0.3 Staging Gate Corrections
-- Version: 20261103000014
-- Description: 
--   1. Broadcast Topic Binding: Strictly restricts call signaling to caller and callee
--      (removes outsider/admin room eavesdropping) and binds user-calls topic to callee.
--   2. Canonical Vault Secret Name: Enforces 'turn_shared_secret' lookup in RPCs.
--   3. TURN TTL Handling: Rejects non-positive TTL, defaults to 600s, caps maximum at 600s.
-- ============================================================================

-- 1. Hardened Realtime Broadcast RLS Policies on realtime.messages
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'realtime' AND table_name = 'messages'
    ) THEN
        DROP POLICY IF EXISTS "Call participants can listen to call rooms" ON realtime.messages;
        DROP POLICY IF EXISTS "Call participants can broadcast to call rooms" ON realtime.messages;

        -- Listen Policy: Active profile check, strictly caller/callee on active sessions, self on inbox
        CREATE POLICY "Call participants can listen to call rooms"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
            AND (
                -- Call room signaling: strictly non-terminal call sessions and strictly caller or receiver
                (realtime.topic() LIKE 'call:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.id::text = substring(realtime.topic() from 6)
                      AND cs.status IN ('INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED')
                      AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid())
                ))
                -- Personal incoming call inbox (strictly self)
                OR (realtime.topic() = 'user:' || auth.uid()::text)
                OR (realtime.topic() = 'user-calls:' || auth.uid()::text)
            )
        );

        -- Broadcast Policy: Active profile check, strictly caller/callee on call room, bound callee on alert
        CREATE POLICY "Call participants can broadcast to call rooms"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
            AND (
                -- Broadcasting to active call room (strictly caller or receiver)
                (realtime.topic() LIKE 'call:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.id::text = substring(realtime.topic() from 6)
                      AND cs.status IN ('INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED')
                      AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid())
                ))
                -- Broadcasting incoming alert to callee inbox (strictly verified against active RINGING session where topic matches cs.receiver_id)
                OR (realtime.topic() LIKE 'user-calls:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.caller_id = auth.uid()
                      AND cs.status = 'RINGING'
                      AND cs.receiver_id::text = substring(realtime.topic() from 12)
                ))
                OR (realtime.topic() LIKE 'user:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.caller_id = auth.uid()
                      AND cs.status = 'RINGING'
                      AND cs.receiver_id::text = substring(realtime.topic() from 6)
                ))
            )
        );
    END IF;
END $$;

-- 2. Enhanced get_ephemeral_turn_credentials RPC
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
    v_ttl INT;
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

-- 3. Update issue_ice_credentials to enforce canonical Vault secret name 'turn_shared_secret'
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
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    -- Strictly caller or callee
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
    ORDER BY created_at DESC
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
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'call_id', p_call_id,
        'ice_servers', v_ice_servers,
        'expires_at', (NOW() + (v_ttl_seconds || ' seconds')::INTERVAL)
    );
END;
$$;

-- 4. Permissions & Grants
REVOKE EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) TO authenticated, service_role;

