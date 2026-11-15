-- ============================================================================
-- CareLoop Migration: Case-Based Communication Lifecycle & Messenger Upgrade
-- Version: 20261115000001
-- Description: Additive lifecycle states (active, completion_pending, completed),
--              per-user archive/mute preferences, audit trail, concurrency-safe RPCs,
--              message immutability for completed cases, and call history indexing.
-- Safety: Purely additive, fully idempotent, zero table recreations, no production disruption.
-- Rollback Strategy: 
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS lifecycle_status, DROP COLUMN IF EXISTS ...;
--   ALTER TABLE public.conversation_participants DROP COLUMN IF EXISTS is_archived, DROP COLUMN IF EXISTS is_muted, ...;
--   DROP TABLE IF EXISTS public.conversation_lifecycle_events CASCADE;
--   DROP FUNCTION IF EXISTS public.propose_case_completion CASCADE;
--   DROP FUNCTION IF EXISTS public.confirm_case_completion CASCADE;
--   DROP FUNCTION IF EXISTS public.reject_case_completion CASCADE;
--   DROP FUNCTION IF EXISTS public.coordinator_resolve_case CASCADE;
--   DROP FUNCTION IF EXISTS public.toggle_conversation_archive CASCADE;
--   DROP FUNCTION IF EXISTS public.toggle_conversation_mute CASCADE;
--   DROP FUNCTION IF EXISTS public.get_conversation_call_history CASCADE;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ADDITIVE CONVERSATION LIFECYCLE COLUMNS
-- ----------------------------------------------------------------------------

-- Add lifecycle_status with fallback to existing 'ACTIVE' rows
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
CHECK (lifecycle_status IN ('active', 'completion_pending', 'completed'));

-- Completion proposal tracking
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completion_proposed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completion_proposed_at TIMESTAMPTZ;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completion_proposal_reason TEXT;

-- Completion confirmation tracking
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Coordinator override resolution tracking
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS resolved_by_coordinator UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS coordinator_resolution_reason TEXT;

-- Index for fast lifecycle queries
CREATE INDEX IF NOT EXISTS idx_conversations_lifecycle
ON public.conversations(lifecycle_status, updated_at DESC);

-- ----------------------------------------------------------------------------
-- 2. PER-USER ARCHIVE AND MUTE PREFERENCES
-- ----------------------------------------------------------------------------

ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conv_participants_user_archive
ON public.conversation_participants(user_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user_mute
ON public.conversation_participants(user_id, is_muted);

-- Index call sessions by conversation for fast chat-timeline call history lookups
CREATE INDEX IF NOT EXISTS idx_call_sessions_conv_started
ON public.call_sessions(conversation_id, started_at DESC);

-- ----------------------------------------------------------------------------
-- 3. AUDIT TRAIL: CONVERSATION LIFECYCLE EVENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    request_id UUID REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
        'PROPOSE_COMPLETION',
        'CONFIRM_COMPLETION',
        'REJECT_COMPLETION',
        'COORDINATOR_RESOLVE',
        'CANCEL_COMPLETION'
    )),
    previous_lifecycle_status TEXT NOT NULL,
    new_lifecycle_status TEXT NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_lifecycle_events_conv
ON public.conversation_lifecycle_events(conversation_id, created_at ASC);

ALTER TABLE public.conversation_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read lifecycle events" ON public.conversation_lifecycle_events;
CREATE POLICY "Participants read lifecycle events" ON public.conversation_lifecycle_events
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

-- ----------------------------------------------------------------------------
-- 4. CONCURRENCY-SAFE TRANSACTIONAL RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 4.1 Propose Case Completion
CREATE OR REPLACE FUNCTION public.propose_case_completion(
    p_conversation_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_conv RECORD;
    v_is_participant BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    v_user_role := public.get_user_role();
    v_is_participant := public.is_conversation_participant(p_conversation_id);

    IF NOT v_is_participant AND v_user_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You are not a participant in this conversation.');
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation not found.');
    END IF;

    IF v_conv.lifecycle_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Case is already completed.');
    END IF;

    IF v_conv.lifecycle_status = 'completion_pending' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Completion proposal is already pending.', 'lifecycle_status', 'completion_pending');
    END IF;

    -- Update conversation state
    UPDATE public.conversations
    SET lifecycle_status = 'completion_pending',
        completion_proposed_by = v_caller_id,
        completion_proposed_at = NOW(),
        completion_proposal_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_conversation_id;

    -- Record audit event
    INSERT INTO public.conversation_lifecycle_events (
        conversation_id, request_id, actor_id, actor_role, action,
        previous_lifecycle_status, new_lifecycle_status, reason
    ) VALUES (
        p_conversation_id, v_conv.request_id, v_caller_id, v_user_role, 'PROPOSE_COMPLETION',
        'active', 'completion_pending', p_reason
    );

    -- Emit system notification message
    PERFORM set_config('careloop.system_message_allowed', 'true', true);
    INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
    VALUES (
        p_conversation_id,
        v_caller_id,
        'CareLoop System',
        'system',
        'SYSTEM',
        format('Case completion proposed by %s. Awaiting confirmation from the other participant.', initcap(v_user_role))
    );
    PERFORM set_config('careloop.system_message_allowed', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'lifecycle_status', 'completion_pending',
        'proposed_by', v_caller_id,
        'proposed_at', NOW()
    );
END;
$$;

-- 4.2 Confirm Case Completion
CREATE OR REPLACE FUNCTION public.confirm_case_completion(
    p_conversation_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_conv RECORD;
    v_is_participant BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    v_user_role := public.get_user_role();
    v_is_participant := public.is_conversation_participant(p_conversation_id);

    IF NOT v_is_participant AND v_user_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You are not a participant in this conversation.');
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation not found.');
    END IF;

    IF v_conv.lifecycle_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Case is already completed.', 'lifecycle_status', 'completed');
    END IF;

    IF v_conv.lifecycle_status <> 'completion_pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot confirm: No completion proposal is currently pending.');
    END IF;

    -- Concurrency & security rule: Proposer cannot self-confirm unless coordinator/admin
    IF v_conv.completion_proposed_by = v_caller_id AND v_user_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'The other participant must confirm case completion.');
    END IF;

    -- Transition conversation to COMPLETED and CLOSED
    UPDATE public.conversations
    SET lifecycle_status = 'completed',
        status = 'CLOSED',
        completed_by = v_caller_id,
        completed_at = NOW(),
        closed_at = NOW(),
        closure_reason = COALESCE(p_notes, v_conv.completion_proposal_reason, 'Case completed and confirmed by participants'),
        completion_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_conversation_id;

    -- Update corresponding donor_assignment if exists
    UPDATE public.donor_assignments
    SET status = 'COMPLETED', updated_at = NOW()
    WHERE request_id = v_conv.request_id AND donor_id = v_conv.donor_id AND status = 'ASSIGNED';

    -- Record audit event
    INSERT INTO public.conversation_lifecycle_events (
        conversation_id, request_id, actor_id, actor_role, action,
        previous_lifecycle_status, new_lifecycle_status, reason, metadata
    ) VALUES (
        p_conversation_id, v_conv.request_id, v_caller_id, v_user_role, 'CONFIRM_COMPLETION',
        'completion_pending', 'completed', p_notes,
        jsonb_build_object('proposed_by', v_conv.completion_proposed_by, 'confirmed_by', v_caller_id)
    );

    -- Emit system notification message
    PERFORM set_config('careloop.system_message_allowed', 'true', true);
    INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
    VALUES (
        p_conversation_id,
        v_caller_id,
        'CareLoop System',
        'system',
        'SYSTEM',
        'Emergency coordination case successfully completed. Channel is now preserved in read-only mode.'
    );
    PERFORM set_config('careloop.system_message_allowed', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'lifecycle_status', 'completed',
        'completed_by', v_caller_id,
        'completed_at', NOW()
    );
END;
$$;

-- 4.3 Reject Case Completion (Returns to Active)
CREATE OR REPLACE FUNCTION public.reject_case_completion(
    p_conversation_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_conv RECORD;
    v_is_participant BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    v_user_role := public.get_user_role();
    v_is_participant := public.is_conversation_participant(p_conversation_id);

    IF NOT v_is_participant AND v_user_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You are not a participant in this conversation.');
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation not found.');
    END IF;

    IF v_conv.lifecycle_status <> 'completion_pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot reject: No completion proposal is currently pending.');
    END IF;

    -- Return to active state
    UPDATE public.conversations
    SET lifecycle_status = 'active',
        completion_proposed_by = NULL,
        completion_proposed_at = NULL,
        completion_proposal_reason = NULL,
        updated_at = NOW()
    WHERE id = p_conversation_id;

    -- Record audit event
    INSERT INTO public.conversation_lifecycle_events (
        conversation_id, request_id, actor_id, actor_role, action,
        previous_lifecycle_status, new_lifecycle_status, reason
    ) VALUES (
        p_conversation_id, v_conv.request_id, v_caller_id, v_user_role, 'REJECT_COMPLETION',
        'completion_pending', 'active', p_reason
    );

    -- Emit system notification message
    PERFORM set_config('careloop.system_message_allowed', 'true', true);
    INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
    VALUES (
        p_conversation_id,
        v_caller_id,
        'CareLoop System',
        'system',
        'SYSTEM',
        format('Case completion was declined (%s). Coordination channel remains active.', COALESCE(p_reason, 'Ongoing coordination required'))
    );
    PERFORM set_config('careloop.system_message_allowed', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'lifecycle_status', 'active'
    );
END;
$$;

-- 4.4 Coordinator Override Resolution
CREATE OR REPLACE FUNCTION public.coordinator_resolve_case(
    p_conversation_id UUID,
    p_reason TEXT,
    p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_conv RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    v_user_role := public.get_user_role();
    IF v_user_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only clinical coordinators or administrators can execute administrative resolution.');
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A mandatory administrative resolution reason of at least 5 characters is required.');
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation not found.');
    END IF;

    -- Resolve and close conversation
    UPDATE public.conversations
    SET lifecycle_status = 'completed',
        status = 'CLOSED',
        resolved_by_coordinator = v_caller_id,
        coordinator_resolution_reason = trim(p_reason),
        completed_by = v_caller_id,
        completed_at = NOW(),
        closed_at = NOW(),
        closure_reason = trim(p_reason),
        completion_notes = p_resolution_notes,
        updated_at = NOW()
    WHERE id = p_conversation_id;

    -- Update assignment
    UPDATE public.donor_assignments
    SET status = 'COMPLETED', updated_at = NOW()
    WHERE request_id = v_conv.request_id AND donor_id = v_conv.donor_id AND status = 'ASSIGNED';

    -- Record audit event
    INSERT INTO public.conversation_lifecycle_events (
        conversation_id, request_id, actor_id, actor_role, action,
        previous_lifecycle_status, new_lifecycle_status, reason, metadata
    ) VALUES (
        p_conversation_id, v_conv.request_id, v_caller_id, v_user_role, 'COORDINATOR_RESOLVE',
        v_conv.lifecycle_status, 'completed', trim(p_reason),
        jsonb_build_object('resolution_notes', p_resolution_notes)
    );

    -- Emit system notification message
    PERFORM set_config('careloop.system_message_allowed', 'true', true);
    INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
    VALUES (
        p_conversation_id,
        v_caller_id,
        'CareLoop System',
        'system',
        'SYSTEM',
        format('Case administratively resolved by coordinator/admin. Reason: %s', trim(p_reason))
    );
    PERFORM set_config('careloop.system_message_allowed', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'lifecycle_status', 'completed',
        'resolved_by', v_caller_id,
        'reason', trim(p_reason)
    );
END;
$$;

-- 4.5 Toggle Per-User Archive Preference
CREATE OR REPLACE FUNCTION public.toggle_conversation_archive(
    p_conversation_id UUID,
    p_archived BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_conv RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation not found.');
    END IF;

    -- Protection rule: Cannot archive an unresolved active emergency case
    IF p_archived AND v_conv.lifecycle_status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot archive an active emergency case. Complete the case before archiving.');
    END IF;

    UPDATE public.conversation_participants
    SET is_archived = p_archived,
        archived_at = CASE WHEN p_archived THEN NOW() ELSE NULL END
    WHERE conversation_id = p_conversation_id AND user_id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User is not a participant in this conversation.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'is_archived', p_archived
    );
END;
$$;

-- 4.6 Toggle Per-User Mute Preference
CREATE OR REPLACE FUNCTION public.toggle_conversation_mute(
    p_conversation_id UUID,
    p_muted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    UPDATE public.conversation_participants
    SET is_muted = p_muted,
        muted_at = CASE WHEN p_muted THEN NOW() ELSE NULL END
    WHERE conversation_id = p_conversation_id AND user_id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User is not a participant in this conversation.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'is_muted', p_muted
    );
END;
$$;

-- 4.7 Get Conversation Call History
CREATE OR REPLACE FUNCTION public.get_conversation_call_history(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_is_participant BOOLEAN;
    v_calls JSONB;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    v_is_participant := public.is_conversation_participant(p_conversation_id);
    IF NOT v_is_participant AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to inspect calls for this conversation.');
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', cs.id,
                'conversation_id', cs.conversation_id,
                'request_id', cs.request_id,
                'caller_id', cs.caller_id,
                'receiver_id', cs.receiver_id,
                'call_type', cs.call_type,
                'status', cs.status,
                'started_at', cs.started_at,
                'ringing_at', cs.ringing_at,
                'accepted_at', cs.accepted_at,
                'connected_at', cs.connected_at,
                'ended_at', cs.ended_at,
                'duration_seconds', cs.duration_seconds,
                'end_reason', cs.end_reason,
                'metadata', cs.metadata
            ) ORDER BY cs.started_at DESC
        ),
        '[]'::jsonb
    ) INTO v_calls
    FROM public.call_sessions cs
    WHERE cs.conversation_id = p_conversation_id;

    RETURN jsonb_build_object('success', true, 'data', v_calls);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. IMMUTABILITY TRIGGER: BLOCK NEW MESSAGES IN COMPLETED CASES
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual_role TEXT;
    v_is_system_allowed BOOLEAN := false;
    v_conv_lifecycle TEXT;
    v_conv_status TEXT;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_actual_role := public.get_user_role();
        v_is_system_allowed := (COALESCE(current_setting('careloop.system_message_allowed', true), 'false') = 'true');

        -- Check conversation lifecycle: completed/closed conversations are read-only
        SELECT lifecycle_status, status INTO v_conv_lifecycle, v_conv_status
        FROM public.conversations WHERE id = NEW.conversation_id;

        IF v_conv_lifecycle = 'completed' OR v_conv_status = 'CLOSED' THEN
            IF NEW.sender_role <> 'system' OR (NOT v_is_system_allowed AND v_actual_role NOT IN ('coordinator', 'admin')) THEN
                RAISE EXCEPTION 'Cannot send message: This coordination case is completed and preserved in read-only mode.';
            END IF;
        END IF;

        -- sender_id must match authenticated user unless emitted via authorized system context
        IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
            IF NEW.sender_role <> 'system' OR (NOT v_is_system_allowed AND v_actual_role NOT IN ('coordinator', 'admin')) THEN
                RAISE EXCEPTION 'Unauthorized: sender_id must match authenticated user.';
            END IF;
        END IF;

        -- Prevent privileged role spoofing in sender_role
        IF NEW.sender_role IN ('admin', 'coordinator') AND v_actual_role NOT IN ('admin', 'coordinator') THEN
            RAISE EXCEPTION 'Unauthorized: Cannot spoof privileged role in messages.';
        END IF;

        -- Ordinary users cannot send SYSTEM messages unless within an authorized procedure
        IF NEW.sender_role = 'system' THEN
            IF v_is_system_allowed THEN
                NULL;
            ELSIF v_actual_role IN ('admin', 'coordinator') THEN
                NULL;
            ELSE
                RAISE EXCEPTION 'Unauthorized: Only system processes or administrators can emit SYSTEM messages.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. REALTIME SUBSCRIPTION REGISTRATION
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_lifecycle_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_lifecycle_events;
    END IF;
END $$;

COMMIT;
