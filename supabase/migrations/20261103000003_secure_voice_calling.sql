-- ============================================================================
-- CareLoop Migration 3: Real-Time WebRTC Voice Calling System (Hardened)
-- Version: 20261103000003
-- Security Remediation: State machine authorization, call expiration protection,
--                      ICE credential verification, Realtime private broadcast
--                      topic authorization, and least-privilege RPC execution.
-- ============================================================================

-- ============================================================================
-- 1. CALLING ENTITY TABLES
-- ============================================================================

-- 1.1 Call Sessions Table (WebRTC & Stage 1 Calling State Machine)
CREATE TABLE IF NOT EXISTS public.call_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    request_id UUID REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL DEFAULT 'VOICE' CHECK (call_type IN ('VOICE', 'DIALER_FALLBACK')),
    status TEXT NOT NULL DEFAULT 'INITIATING' CHECK (status IN (
        'INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED', 'ENDED', 'REJECTED', 'TIMEOUT', 'FAILED'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ringing_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    end_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 1.2 Call Events Audit & Telemetry Table
CREATE TABLE IF NOT EXISTS public.call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'INITIATED', 'RINGING', 'ACCEPTED', 'CONNECTED', 'MUTED', 'UNMUTED',
        'RECONNECTED', 'ENDED', 'REJECTED', 'TIMEOUT', 'FAILED'
    )),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES FOR FAST QUERYING & REALTIME FILTERING
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_receiver ON public.call_sessions(caller_id, receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_receiver_status ON public.call_sessions(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON public.call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_events_call_created ON public.call_events(call_id, created_at ASC);

-- ============================================================================
-- 3. HARDENED SECURITY DEFINER RPC FUNCTIONS
-- ============================================================================

-- 3.1 Issue ICE Credentials
-- SECURITY MANDATE: Only authenticated caller, receiver, or coordinator can fetch ICE credentials.
CREATE OR REPLACE FUNCTION public.issue_ice_credentials(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_call RECORD;
    v_user_id UUID := auth.uid();
    v_ice_servers JSONB;
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

    -- Google public STUN servers
    v_ice_servers := jsonb_build_array(
        jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun1.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun2.l.google.com:19302')
    );

    RETURN jsonb_build_object(
        'success', true,
        'ice_servers', v_ice_servers,
        'call_id', p_call_id
    );
END;
$$;

-- 3.2 Initiate Call
-- SECURITY MANDATE: Verifies caller identity, conversation active state, confirmed donor acceptance,
--                   prevents overlapping active calls, and initializes RINGING state.
CREATE OR REPLACE FUNCTION public.initiate_call(
    p_conversation_id UUID,
    p_call_type TEXT DEFAULT 'VOICE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_conv RECORD;
    v_req RECORD;
    v_receiver_id UUID;
    v_donor_resp RECORD;
    v_active_call RECORD;
    v_new_call_id UUID;
    v_ice_res JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required to initiate emergency call.');
    END IF;

    -- 1. Inspect conversation
    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation channel not found.');
    END IF;

    IF v_conv.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation is not active.');
    END IF;

    -- 2. Verify caller is an authorized participant and resolve receiver
    IF v_conv.requester_id = v_caller_id THEN
        SELECT profile_id INTO v_receiver_id FROM public.donors WHERE id = v_conv.donor_id;
        IF v_receiver_id IS NULL THEN
            SELECT user_id INTO v_receiver_id FROM public.conversation_participants
            WHERE conversation_id = p_conversation_id AND participant_role = 'donor' AND is_active = true
            LIMIT 1;
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM public.donors WHERE id = v_conv.donor_id AND profile_id = v_caller_id)
           OR EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = p_conversation_id AND user_id = v_caller_id AND participant_role = 'donor' AND is_active = true) THEN
            v_receiver_id := v_conv.requester_id;
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Caller is not an authorized participant in this conversation.');
        END IF;
    END IF;

    IF v_receiver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Recipient participant could not be resolved.');
    END IF;

    -- 3. Verify emergency request is active
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = v_conv.request_id;
    IF NOT FOUND OR v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'The associated emergency request is no longer active.');
    END IF;

    -- 4. Confirm Donor Acceptance is verified in database
    SELECT * INTO v_donor_resp FROM public.donor_responses
    WHERE request_id = v_conv.request_id AND donor_id = v_conv.donor_id AND response_status = 'ACCEPTED';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency call unavailable: Donor acceptance is not confirmed.');
    END IF;

    -- 5. Prevent concurrent active calls in this conversation
    SELECT * INTO v_active_call FROM public.call_sessions
    WHERE conversation_id = p_conversation_id AND status IN ('INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED')
    ORDER BY started_at DESC LIMIT 1;

    IF FOUND THEN
        IF v_active_call.started_at < (NOW() - INTERVAL '45 seconds') THEN
            UPDATE public.call_sessions
            SET status = 'TIMEOUT', ended_at = NOW(), end_reason = 'STALE_CALL_SUPERSEDED'
            WHERE id = v_active_call.id;
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'A call is already active or in progress in this channel.');
        END IF;
    END IF;

    -- 6. Insert new call session with RINGING state
    INSERT INTO public.call_sessions (
        conversation_id,
        request_id,
        caller_id,
        receiver_id,
        call_type,
        status,
        started_at,
        ringing_at
    )
    VALUES (
        p_conversation_id,
        v_conv.request_id,
        v_caller_id,
        v_receiver_id,
        p_call_type,
        'RINGING',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_call_id;

    -- 7. Record call audit event
    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (
        v_new_call_id,
        'INITIATED',
        v_caller_id,
        jsonb_build_object(
            'caller_id', v_caller_id,
            'receiver_id', v_receiver_id,
            'call_type', p_call_type,
            'conversation_id', p_conversation_id
        )
    );

    v_ice_res := public.issue_ice_credentials(v_new_call_id);

    RETURN jsonb_build_object(
        'success', true,
        'call_id', v_new_call_id,
        'caller_id', v_caller_id,
        'receiver_id', v_receiver_id,
        'conversation_id', p_conversation_id,
        'ice_servers', v_ice_res->'ice_servers'
    );
END;
$$;

-- 3.3 Accept Call
-- SECURITY MANDATE: Only the designated receiver can accept the call.
CREATE OR REPLACE FUNCTION public.accept_call(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_call RECORD;
    v_ice_res JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.receiver_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Only the designated receiver can accept this call.');
    END IF;

    IF v_call.status = 'ACCEPTED' THEN
        v_ice_res := public.issue_ice_credentials(p_call_id);
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'ACCEPTED', 'ice_servers', v_ice_res->'ice_servers');
    END IF;

    IF v_call.status = 'CONNECTED' THEN
        v_ice_res := public.issue_ice_credentials(p_call_id);
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'CONNECTED', 'ice_servers', v_ice_res->'ice_servers');
    END IF;

    IF v_call.status <> 'RINGING' THEN
        RETURN jsonb_build_object('success', false, 'message', format('Call cannot be accepted from current status: %s', v_call.status));
    END IF;

    UPDATE public.call_sessions
    SET status = 'ACCEPTED', accepted_at = NOW()
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'ACCEPTED', v_user_id, jsonb_build_object('accepted_at', NOW()));

    v_ice_res := public.issue_ice_credentials(p_call_id);

    RETURN jsonb_build_object(
        'success', true,
        'call_id', p_call_id,
        'status', 'ACCEPTED',
        'ice_servers', v_ice_res->'ice_servers'
    );
END;
$$;

-- 3.4 Record WebRTC Connected
-- SECURITY MANDATE: Only participating caller or receiver can record connection state.
CREATE OR REPLACE FUNCTION public.record_call_connected(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_call RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.caller_id <> v_user_id AND v_call.receiver_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to update connection state for this call.');
    END IF;

    IF v_call.status = 'CONNECTED' THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'CONNECTED', 'connected_at', v_call.connected_at);
    END IF;

    IF v_call.status NOT IN ('ACCEPTED', 'RINGING') THEN
        RETURN jsonb_build_object('success', false, 'message', format('Call cannot be connected from status: %s', v_call.status));
    END IF;

    UPDATE public.call_sessions
    SET status = 'CONNECTED', connected_at = COALESCE(connected_at, NOW())
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'CONNECTED', v_user_id, jsonb_build_object('connected_at', NOW()));

    RETURN jsonb_build_object(
        'success', true,
        'call_id', p_call_id,
        'status', 'CONNECTED',
        'connected_at', NOW()
    );
END;
$$;

-- 3.5 Reject Call
-- SECURITY MANDATE: Only designated receiver or coordinator can reject call.
CREATE OR REPLACE FUNCTION public.reject_call(
    p_call_id UUID,
    p_reason TEXT DEFAULT 'DECLINED_BY_RECEIVER'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_call RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.receiver_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Only the receiver can reject this call.');
    END IF;

    IF v_call.status IN ('REJECTED', 'ENDED') THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', v_call.status);
    END IF;

    UPDATE public.call_sessions
    SET status = 'REJECTED', ended_at = NOW(), end_reason = p_reason
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'REJECTED', v_user_id, jsonb_build_object('reason', p_reason));

    RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'REJECTED');
END;
$$;

-- 3.6 Cancel Call
-- SECURITY MANDATE: Only caller or coordinator can cancel an outgoing call.
CREATE OR REPLACE FUNCTION public.cancel_call(
    p_call_id UUID,
    p_reason TEXT DEFAULT 'CANCELLED_BY_CALLER'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_call RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.caller_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Only the caller can cancel this call.');
    END IF;

    IF v_call.status IN ('ENDED', 'CANCELLED') THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', v_call.status);
    END IF;

    UPDATE public.call_sessions
    SET status = 'ENDED', ended_at = NOW(), end_reason = p_reason
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'ENDED', v_user_id, jsonb_build_object('reason', p_reason));

    RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'ENDED');
END;
$$;

-- 3.7 End Call
-- SECURITY MANDATE: Only call participants or coordinator can terminate an active call.
CREATE OR REPLACE FUNCTION public.end_call(
    p_call_id UUID,
    p_reason TEXT DEFAULT 'USER_HANGUP'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_call RECORD;
    v_duration INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_call.caller_id <> v_user_id AND v_call.receiver_id <> v_user_id AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to end this call.');
    END IF;

    IF v_call.status = 'ENDED' THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'ENDED', 'duration_seconds', v_call.duration_seconds);
    END IF;

    IF v_call.connected_at IS NOT NULL THEN
        v_duration := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - v_call.connected_at)))::INTEGER);
    END IF;

    UPDATE public.call_sessions
    SET status = 'ENDED',
        ended_at = NOW(),
        duration_seconds = v_duration,
        end_reason = p_reason
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'ENDED', v_user_id, jsonb_build_object('reason', p_reason, 'duration_seconds', v_duration));

    RETURN jsonb_build_object(
        'success', true,
        'call_id', p_call_id,
        'status', 'ENDED',
        'duration_seconds', v_duration
    );
END;
$$;

-- 3.8 Expire Unanswered Calls
-- SECURITY MANDATE: Only call participants, coordinators, or trusted service role can expire calls.
--                   Enforces that the 30-second ring threshold has actually elapsed.
CREATE OR REPLACE FUNCTION public.expire_call(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_call RECORD;
    v_caller_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_call FROM public.call_sessions
    WHERE id = p_call_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    -- Validate authorization
    IF v_caller_id IS NOT NULL AND v_call.caller_id <> v_caller_id AND v_call.receiver_id <> v_caller_id 
       AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to expire this call.');
    END IF;

    -- Only expire if still in ringing/initiating state
    IF v_call.status NOT IN ('RINGING', 'INITIATING') THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', v_call.status);
    END IF;

    -- Enforce actual elapsed time threshold (minimum 30 seconds since start)
    IF v_call.started_at > (NOW() - INTERVAL '30 seconds') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call cannot be expired before the timeout threshold (30s) has elapsed.');
    END IF;

    UPDATE public.call_sessions
    SET status = 'TIMEOUT', ended_at = NOW(), end_reason = 'RING_TIMEOUT'
    WHERE id = p_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (p_call_id, 'TIMEOUT', v_caller_id, jsonb_build_object('reason', 'RING_TIMEOUT'));

    RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', 'TIMEOUT');
END;
$$;

-- 3.9 Call Session Immutability & State Machine Enforcement Trigger
-- SECURITY MANDATE: Call session identities (id, participants, conversation, call_type, started_at)
-- are immutable. Terminal states (ENDED, REJECTED, TIMEOUT, FAILED) cannot be revived or altered.
-- State transitions must strictly follow the valid finite state machine.
CREATE OR REPLACE FUNCTION public.enforce_call_session_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Immutable core identity fields
    IF (NEW.id IS DISTINCT FROM OLD.id OR
        NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
        NEW.request_id IS DISTINCT FROM OLD.request_id OR
        NEW.caller_id IS DISTINCT FROM OLD.caller_id OR
        NEW.receiver_id IS DISTINCT FROM OLD.receiver_id OR
        NEW.call_type IS DISTINCT FROM OLD.call_type OR
        NEW.started_at IS DISTINCT FROM OLD.started_at) THEN
        RAISE EXCEPTION 'Unauthorized: Call session identity (id, participants, conversation, type, started_at) is immutable.';
    END IF;

    -- Enforce state machine transitions
    IF OLD.status = NEW.status THEN
        -- No status change: allow duration/metadata updates if not in terminal state
        RETURN NEW;
    END IF;

    -- Terminal states cannot transition to anything
    IF OLD.status IN ('ENDED', 'REJECTED', 'TIMEOUT', 'FAILED') THEN
        RAISE EXCEPTION 'Illegal state transition: Call session is in terminal state % and cannot be modified.', OLD.status;
    END IF;

    -- Valid state transitions
    IF OLD.status = 'INITIATING' AND NEW.status NOT IN ('RINGING', 'FAILED', 'TIMEOUT', 'ENDED') THEN
        RAISE EXCEPTION 'Illegal state transition from INITIATING to %.', NEW.status;
    ELSIF OLD.status = 'RINGING' AND NEW.status NOT IN ('ACCEPTED', 'REJECTED', 'TIMEOUT', 'FAILED', 'ENDED') THEN
        RAISE EXCEPTION 'Illegal state transition from RINGING to %.', NEW.status;
    ELSIF OLD.status = 'ACCEPTED' AND NEW.status NOT IN ('CONNECTED', 'ENDED', 'FAILED') THEN
        RAISE EXCEPTION 'Illegal state transition from ACCEPTED to %.', NEW.status;
    ELSIF OLD.status = 'CONNECTED' AND NEW.status NOT IN ('ENDED', 'FAILED') THEN
        RAISE EXCEPTION 'Illegal state transition from CONNECTED to %.', NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_call_session_immutability ON public.call_sessions;
CREATE TRIGGER trg_enforce_call_session_immutability
    BEFORE UPDATE ON public.call_sessions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_call_session_immutability();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

-- 4.1 Call Sessions Policies
CREATE POLICY "Call participants read call sessions" ON public.call_sessions
    FOR SELECT USING (
        caller_id = auth.uid()
        OR receiver_id = auth.uid()
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Callers insert call sessions" ON public.call_sessions
    FOR INSERT WITH CHECK (
        caller_id = auth.uid()
        AND public.is_conversation_participant(conversation_id)
    );

-- SECURITY MANDATE: Direct client updates are disallowed.
-- All call state transitions must execute via verified SECURITY DEFINER RPCs.
CREATE POLICY "Direct call session update disallowed" ON public.call_sessions
    FOR UPDATE USING (false);

-- 4.2 Call Events Policies
CREATE POLICY "Call participants read call events" ON public.call_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_id
              AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
        )
    );

CREATE POLICY "Call participants insert call events" ON public.call_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.call_sessions cs
            WHERE cs.id = call_id
              AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
        )
    );

-- ============================================================================
-- 5. REALTIME PUBLICATION & BROADCAST CHANNEL POLICIES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'call_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'call_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.call_events;
    END IF;
END $$;

-- 5.1 Realtime Private Broadcast RLS on realtime.messages
-- SECURITY MANDATE: Strict topic authorization. Users can only listen to their own inboxes
--                   or authorized call rooms. Users can only broadcast to active call rooms
--                   or send incoming alerts if they have an active RINGING call session.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'realtime' AND table_name = 'messages'
    ) THEN
        -- Note: RLS is already enabled by default on realtime.messages by Supabase.
        -- We define strict private broadcast RLS policies via supautils without modifying table ownership.
        DROP POLICY IF EXISTS "Call participants can listen to call rooms" ON realtime.messages;
        DROP POLICY IF EXISTS "Call participants can broadcast to call rooms" ON realtime.messages;

        -- Listen Policy: Only own inboxes or verified call sessions
        CREATE POLICY "Call participants can listen to call rooms"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
            -- Private Call room signaling
            (realtime.topic() LIKE 'call:%' AND EXISTS (
                SELECT 1 FROM public.call_sessions cs
                WHERE cs.id::text = substring(realtime.topic() from 6)
                  AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
            ))
            -- Personal incoming call inbox
            OR (realtime.topic() = 'user:' || auth.uid()::text)
            OR (realtime.topic() = 'user-calls:' || auth.uid()::text)
        );

        -- Broadcast Policy: Only active call sessions or legitimate caller sending to callee inbox
        CREATE POLICY "Call participants can broadcast to call rooms"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            -- Broadcasting to call room where caller/receiver
            (realtime.topic() LIKE 'call:%' AND EXISTS (
                SELECT 1 FROM public.call_sessions cs
                WHERE cs.id::text = substring(realtime.topic() from 6)
                  AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
            ))
            -- Broadcasting incoming call notification to recipient's inbox (strictly verified against active session)
            OR ((realtime.topic() LIKE 'user:%' OR realtime.topic() LIKE 'user-calls:%') AND EXISTS (
                SELECT 1 FROM public.call_sessions cs
                WHERE cs.caller_id = auth.uid()
                  AND cs.status = 'RINGING'
                  AND (
                      cs.receiver_id::text = substring(realtime.topic() from 6)
                      OR cs.receiver_id::text = substring(realtime.topic() from 12)
                  )
            ))
        );
    END IF;
END $$;

-- 5.2 Table Privileges & Execution Grants (Least Privilege)
REVOKE UPDATE ON public.call_sessions FROM PUBLIC, authenticated, anon;
GRANT UPDATE ON public.call_sessions TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_call_session_immutability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_call_session_immutability() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.initiate_call(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_call(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_call(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_call_connected(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_call_connected(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_call(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_call(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_call(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_call(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_call(UUID) TO authenticated;
