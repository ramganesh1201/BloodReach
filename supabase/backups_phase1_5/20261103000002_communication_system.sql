-- ============================================================================
-- CareLoop Migration 2: Communication & Coordination System (Hardened)
-- Version: 20261103000002
-- Security Remediation: Sender identity enforcement, anti-spoofing triggers,
--                      participant roster protection, idempotent acceptance,
--                      message tamper protection, and Realtime publication.
-- ============================================================================

-- ============================================================================
-- 1. COMMUNICATION ENTITY TABLES
-- ============================================================================

-- 1.1 Conversations Table (Private Request-Donor Coordination Channel)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Nullable for guest requests
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_ACCEPTANCE', 'ACTIVE', 'RESTRICTED', 'CLOSED')),
    closed_at TIMESTAMPTZ,
    closure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enforce: exactly one private conversation per request-donor pair
    UNIQUE(request_id, donor_id)
);

-- 1.2 Conversation Participants Table (Defines Explicit Authorization)
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_role TEXT NOT NULL CHECK (participant_role IN ('requester', 'donor', 'coordinator')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- 1.3 Messages Table (Supports Text, Media, Event Cards & Offline Idempotency)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'donor', 'coordinator', 'blood_centre', 'system')),
    message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'IMAGE', 'DOCUMENT', 'COORDINATION_EVENT', 'SYSTEM')),
    content TEXT NOT NULL,
    client_message_id TEXT,
    reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_edited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- 1.4 Message Receipts Table (Truthful Delivery and Read Tracking)
CREATE TABLE IF NOT EXISTS public.message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE(message_id, user_id)
);

-- 1.5 Message Attachments Table (Strictly Private Medical / Coordination Files)
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- Max 10MB
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.6 Structured Coordination Events Table (Milestone Timeline)
CREATE TABLE IF NOT EXISTS public.coordination_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'CONFIRMED_AVAILABILITY',
        'ON_THE_WAY',
        'REACHED_HOSPITAL',
        'UNABLE_TO_PROCEED',
        'WITHDRAWN',
        'SHARED_HOSPITAL_DETAILS',
        'REQUESTED_UPDATE',
        'CONFIRMED_ARRIVAL',
        'COORDINATION_OUTCOME'
    )),
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. COMMUNICATION INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_request ON public.conversations(request_id);
CREATE INDEX IF NOT EXISTS idx_conversations_donor ON public.conversations(donor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_requester ON public.conversations(requester_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_lookup ON public.conversation_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique_client_id ON public.messages(conversation_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_receipts_lookup ON public.message_receipts(message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_msg ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_coordination_events_conv ON public.coordination_events(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_coordination_events_req ON public.coordination_events(request_id, created_at ASC);

-- ============================================================================
-- 3. STORED PROCEDURES & MESSAGE VALIDATION TRIGGERS
-- ============================================================================

-- 3.1 Check Active Participant Membership
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
      AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('coordinator', 'admin')
  );
$$;

-- 3.2 Anti-Impersonation Trigger: Validate Message Sender & Role
-- SECURITY MANDATE: Senders cannot impersonate other accounts or spoof privileged roles.
-- Allows trusted system messages from internal procedures via transaction-local setting or staff.
CREATE OR REPLACE FUNCTION public.validate_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual_role TEXT;
    v_is_system_allowed BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_actual_role := public.get_user_role();
        v_is_system_allowed := (COALESCE(current_setting('careloop.system_message_allowed', true), 'false') = 'true');

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
                -- Allowed: Internal trusted system procedure
                NULL;
            ELSIF v_actual_role IN ('admin', 'coordinator') THEN
                -- Allowed: Privileged staff
                NULL;
            ELSE
                RAISE EXCEPTION 'Unauthorized: Only system processes or administrators can emit SYSTEM messages.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_message_sender ON public.messages;
CREATE TRIGGER trg_validate_message_sender
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.validate_message_sender();

-- 3.3 Message Tamper Protection Trigger
-- SECURITY MANDATE: Message metadata (conversation_id, sender_id, sender_role, message_type, created_at)
-- is strictly immutable. System messages cannot be edited by anyone.
CREATE OR REPLACE FUNCTION public.prevent_message_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Senders cannot alter conversation_id, sender_id, sender_role, message_type, or original timestamp
    IF (NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR 
        NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
        NEW.sender_role IS DISTINCT FROM OLD.sender_role OR
        NEW.message_type IS DISTINCT FROM OLD.message_type OR
        NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'Unauthorized: Message metadata (conversation, sender, role, type, created_at) is immutable.';
    END IF;

    -- System messages are immutable and cannot be edited
    IF OLD.message_type = 'SYSTEM' OR OLD.sender_role = 'system' THEN
        RAISE EXCEPTION 'Unauthorized: System messages are immutable and cannot be edited.';
    END IF;

    NEW.is_edited := true;
    NEW.edited_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_message_tampering ON public.messages;
CREATE TRIGGER trg_prevent_message_tampering
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.prevent_message_tampering();

-- 3.4 Atomic Donor Acceptance & Private Conversation Provisioning
-- SECURITY MANDATE: Verifies donor ownership, validates active request state,
--                   prevents multi-donor race conditions, and operates idempotently.
CREATE OR REPLACE FUNCTION public.accept_request_and_create_conversation(
    p_request_id UUID,
    p_donor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_req RECORD;
    v_donor RECORD;
    v_existing_resp RECORD;
    v_existing_conv RECORD;
    v_conversation_id UUID;
    v_donor_profile_id UUID;
    v_requester_id UUID;
BEGIN
    -- 1. Authentication check
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required to accept donation requests.');
    END IF;

    -- 2. Derive donor identity from auth.uid() (never trust client-supplied donor ID for ordinary users)
    IF public.get_user_role() IN ('coordinator', 'admin') AND p_donor_id IS NOT NULL THEN
        SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    ELSE
        SELECT * INTO v_donor FROM public.donors WHERE profile_id = v_caller_id FOR UPDATE;
    END IF;

    IF NOT FOUND OR v_donor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Active donor profile not found for authenticated user.');
    END IF;

    IF NOT v_donor.is_available THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor is currently marked as unavailable.');
    END IF;

    -- 3. Lock and verify emergency request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This emergency request is no longer active.');
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by; -- Nullable for guest emergency requests

    -- 4. Idempotency check: If already accepted, return existing conversation
    SELECT * INTO v_existing_resp FROM public.donor_responses
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    SELECT * INTO v_existing_conv FROM public.conversations
    WHERE request_id = p_request_id AND donor_id = v_donor.id;

    IF FOUND AND v_existing_resp.response_status = 'ACCEPTED' AND v_existing_conv.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'conversation_id', v_existing_conv.id,
            'request_id', p_request_id,
            'donor_name', v_donor.full_name,
            'already_accepted', true
        );
    END IF;

    -- 5. Record or update donor response to ACCEPTED
    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, v_donor.id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    -- 6. Provision Conversation idempotently
    IF v_existing_conv.id IS NOT NULL THEN
        v_conversation_id := v_existing_conv.id;
    ELSE
        INSERT INTO public.conversations (request_id, donor_id, requester_id, status)
        VALUES (p_request_id, v_donor.id, v_requester_id, 'ACTIVE')
        ON CONFLICT (request_id, donor_id) DO UPDATE
        SET status = 'ACTIVE', updated_at = NOW()
        RETURNING id INTO v_conversation_id;

        -- Add participants (DO NOT create fake coordinator identities if requester is NULL)
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

        -- Enable trusted internal system greeting emission for this transaction
        PERFORM set_config('careloop.system_message_allowed', 'true', true);

        -- Automated system greeting
        INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
        VALUES (
            v_conversation_id,
            COALESCE(v_donor_profile_id, v_caller_id),
            'CareLoop System',
            'system',
            'SYSTEM',
            format('Private coordination channel activated for Request #%s. Donor %s accepted the call.', v_req.reference_code, v_donor.full_name)
        );

        -- Reset internal system message setting
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

    -- 7. Update request status to RESPONDER_FOUND if still awaiting
    IF v_req.status IN ('CREATED', 'AWAITING_RESPONSE', 'MATCHING_RESPONDERS') THEN
        UPDATE public.emergency_requests
        SET status = 'RESPONDER_FOUND', updated_at = NOW()
        WHERE id = p_request_id;
    END IF;

    -- 8. Audit event on request timeline
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'RESPONDER_ACCEPTED',
        format('Donor %s accepted emergency request. Private coordination channel #%s opened.', v_donor.full_name, v_conversation_id),
        'Donor Response',
        jsonb_build_object('donor_id', v_donor.id, 'conversation_id', v_conversation_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'request_id', p_request_id,
        'donor_name', v_donor.full_name
    );
END;
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;

-- 4.1 Conversations Policies
CREATE POLICY "Authorized participants read conversations" ON public.conversations
    FOR SELECT USING (
        (requester_id IS NOT NULL AND requester_id = auth.uid())
        OR donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Coordinators manage conversations" ON public.conversations
    FOR UPDATE USING (
        public.get_user_role() IN ('coordinator', 'admin')
    );

-- 4.2 Conversation Participants Policies
CREATE POLICY "Participants read roster" ON public.conversation_participants
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

-- SECURITY MANDATE: Only coordinators, admins, or security definer procedures can add participants
CREATE POLICY "Coordinators manage participants" ON public.conversation_participants
    FOR INSERT WITH CHECK (public.get_user_role() IN ('coordinator', 'admin'));

CREATE POLICY "Participants update own read status" ON public.conversation_participants
    FOR UPDATE USING (user_id = auth.uid());

-- 4.3 Messages Policies
CREATE POLICY "Participants read messages" ON public.messages
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert own messages" ON public.messages
    FOR INSERT WITH CHECK (
        public.is_conversation_participant(conversation_id)
        AND sender_id = auth.uid()
    );

CREATE POLICY "Senders update own message content only" ON public.messages
    FOR UPDATE USING (
        sender_id = auth.uid()
        AND public.is_conversation_participant(conversation_id)
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND public.is_conversation_participant(conversation_id)
    );

-- 4.4 Message Receipts Policies
CREATE POLICY "Participants read receipts" ON public.message_receipts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)
        )
    );

CREATE POLICY "Users manage own receipts" ON public.message_receipts
    FOR ALL USING (
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)
        )
    );

-- 4.5 Message Attachments Policies
CREATE POLICY "Participants read attachments" ON public.message_attachments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)
        )
    );

CREATE POLICY "Senders insert attachments" ON public.message_attachments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id 
              AND m.sender_id = auth.uid()
              AND public.is_conversation_participant(m.conversation_id)
        )
    );

-- 4.6 Coordination Events Policies
CREATE POLICY "Participants read coordination events" ON public.coordination_events
    FOR SELECT USING (conversation_id IS NULL OR public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert coordination events" ON public.coordination_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND (conversation_id IS NULL OR public.is_conversation_participant(conversation_id))
    );

-- ============================================================================
-- 5. REALTIME PUBLICATION & PERMISSIONS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_message_sender() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_message_sender() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_message_tampering() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_message_tampering() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) TO authenticated;
