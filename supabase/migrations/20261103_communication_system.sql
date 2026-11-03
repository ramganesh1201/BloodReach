-- ============================================================================
-- CareLoop Communication System Migration
-- Secure Request-Linked Private Conversations, Messages, Receipts,
-- Coordination Events, and Real-Time Calling
-- ============================================================================

-- 1. Conversations Table (Tied to Emergency Request and Accepted Donor)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_ACCEPTANCE', 'ACTIVE', 'RESTRICTED', 'CLOSED')),
    closed_at TIMESTAMPTZ,
    closure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Enforce: exactly one private conversation per request-donor pair
    UNIQUE(request_id, donor_id)
);

-- 2. Conversation Participants Table (Defines explicit authorization)
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_role TEXT NOT NULL CHECK (participant_role IN ('requester', 'donor', 'coordinator')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- 3. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'donor', 'coordinator', 'blood_centre', 'system')),
    message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'IMAGE', 'DOCUMENT', 'COORDINATION_EVENT', 'SYSTEM')),
    content TEXT NOT NULL,
    client_message_id TEXT, -- For idempotency and offline queue synchronization
    reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_edited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- 4. Message Receipts Table (Truthful Delivery and Read Tracking)
CREATE TABLE IF NOT EXISTS public.message_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE(message_id, user_id)
);

-- 5. Message Attachments Table (Strictly Private Medical / Coordination Files)
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- Max 10MB
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Structured Coordination Events Table
CREATE TABLE IF NOT EXISTS public.coordination_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Call Sessions Table (WebRTC / Stage 1 Calling Metadata)
CREATE TABLE IF NOT EXISTS public.call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL DEFAULT 'VOICE' CHECK (call_type IN ('VOICE', 'DIALER_FALLBACK')),
    status TEXT NOT NULL DEFAULT 'INITIATING' CHECK (status IN (
        'INITIATING', 'RINGING', 'CONNECTED', 'ENDED', 'REJECTED', 'TIMEOUT', 'FAILED'
    )),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    termination_reason TEXT
);

-- Indexes for Fast Communication Queries
CREATE INDEX IF NOT EXISTS idx_conversations_request ON public.conversations(request_id);
CREATE INDEX IF NOT EXISTS idx_conversations_donor ON public.conversations(donor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_requester ON public.conversations(requester_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON public.messages(client_message_id);
CREATE INDEX IF NOT EXISTS idx_coordination_events_conv ON public.coordination_events(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_conv ON public.call_sessions(conversation_id, started_at DESC);

-- ============================================================================
-- ATOMIC DONOR ACCEPTANCE & CONVERSATION CREATION
-- Secure server-side stored procedure: Prevents race conditions, validates
-- donor eligibility, updates response, and creates private conversation atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_request_and_create_conversation(
    p_request_id UUID,
    p_donor_id UUID
)
RETURNS JSONB AS $$
DECLARe
    v_req RECORD;
    v_donor RECORD;
    v_donor_profile_id UUID;
    v_requester_id UUID;
    v_conversation_id UUID;
    v_existing_conv RECORD;
BEGIN
    -- 1. Lock and verify emergency request
    SELECT * INTO v_req FROM public.emergency_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This emergency request is no longer active.');
    END IF;

    -- 2. Lock and verify donor
    SELECT * INTO v_donor FROM public.donors
    WHERE id = p_donor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor profile not found.');
    END IF;

    IF NOT v_donor.is_available THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor is currently marked as unavailable.');
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by;

    -- If created_by is null (e.g. guest emergency), fallback to a system coordinator or first profile
    IF v_requester_id IS NULL THEN
        SELECT id INTO v_requester_id FROM public.profiles WHERE role = 'coordinator' LIMIT 1;
    END IF;

    -- 3. Upsert Donor Response
    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, p_donor_id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    -- 4. Check if private conversation already exists
    SELECT * INTO v_existing_conv FROM public.conversations
    WHERE request_id = p_request_id AND donor_id = p_donor_id;

    IF FOUND THEN
        v_conversation_id := v_existing_conv.id;
    ELSE
        -- Create private conversation between Requester and Donor
        INSERT INTO public.conversations (request_id, donor_id, requester_id, status)
        VALUES (p_request_id, p_donor_id, v_requester_id, 'ACTIVE')
        RETURNING id INTO v_conversation_id;

        -- Attach Requester as participant
        INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
        VALUES (v_conversation_id, v_requester_id, 'requester')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;

        -- Attach Donor as participant (if donor has linked profile)
        IF v_donor_profile_id IS NOT NULL THEN
            INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
            VALUES (v_conversation_id, v_donor_profile_id, 'donor')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;

        -- Insert initial system greeting message
        INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
        VALUES (
            v_conversation_id,
            v_requester_id,
            'CareLoop System',
            'system',
            'SYSTEM',
            format('Private coordination channel activated for Request #%s. Donor %s accepted the call.', v_req.reference_code, v_donor.full_name)
        );

        -- Insert audit coordination event
        INSERT INTO public.coordination_events (request_id, conversation_id, actor_id, actor_role, event_type, event_data)
        VALUES (
            p_request_id,
            v_conversation_id,
            COALESCE(v_donor_profile_id, v_requester_id),
            'Donor',
            'CONFIRMED_AVAILABILITY',
            jsonb_build_object('donor_name', v_donor.full_name, 'blood_group', v_donor.blood_group)
        );
    END IF;

    -- 5. Update request status to RESPONDER_FOUND if still awaiting response
    IF v_req.status IN ('CREATED', 'AWAITING_RESPONSE', 'MATCHING_RESPONDERS') THEN
        UPDATE public.emergency_requests
        SET status = 'RESPONDER_FOUND', updated_at = NOW()
        WHERE id = p_request_id;
    END IF;

    -- 6. Insert audit event into emergency_events
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'RESPONDER_ACCEPTED',
        format('Donor %s accepted emergency request. Private coordination channel #%s opened.', v_donor.full_name, v_conversation_id),
        'Donor Response',
        jsonb_build_object('donor_id', p_donor_id, 'conversation_id', v_conversation_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'request_id', p_request_id,
        'donor_name', v_donor.full_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR COMMUNICATION
-- ============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Helper Function: Check if user is active participant in conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conv_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
      AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('coordinator', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Conversations Policies
CREATE POLICY "Authorized participants read conversations" ON public.conversations
    FOR SELECT USING (
        requester_id = auth.uid()
        OR donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Coordinators manage conversations" ON public.conversations
    FOR UPDATE USING (
        public.get_user_role() IN ('coordinator', 'admin')
    );

-- 2. Conversation Participants Policies
CREATE POLICY "Participants read participant roster" ON public.conversation_participants
    FOR SELECT USING (
        public.is_conversation_participant(conversation_id)
    );

-- 3. Messages Policies
CREATE POLICY "Participants read messages" ON public.messages
    FOR SELECT USING (
        public.is_conversation_participant(conversation_id)
    );

CREATE POLICY "Participants insert messages" ON public.messages
    FOR INSERT WITH CHECK (
        public.is_conversation_participant(conversation_id)
        AND sender_id = auth.uid()
    );

CREATE POLICY "Senders update own message (soft-edit)" ON public.messages
    FOR UPDATE USING (
        sender_id = auth.uid()
    );

-- 4. Message Receipts Policies
CREATE POLICY "Participants read receipts" ON public.message_receipts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)
        )
    );

CREATE POLICY "Users insert/update own receipts" ON public.message_receipts
    FOR ALL USING (
        user_id = auth.uid()
    );

-- 5. Attachments Policies
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
            WHERE m.id = message_id AND m.sender_id = auth.uid()
        )
    );

-- 6. Coordination Events Policies
CREATE POLICY "Participants read coordination events" ON public.coordination_events
    FOR SELECT USING (
        conversation_id IS NULL OR public.is_conversation_participant(conversation_id)
    );

CREATE POLICY "Participants insert coordination events" ON public.coordination_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND (conversation_id IS NULL OR public.is_conversation_participant(conversation_id))
    );

-- 7. Call Sessions Policies
CREATE POLICY "Participants read call sessions" ON public.call_sessions
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

CREATE POLICY "Call participants update call status" ON public.call_sessions
    FOR UPDATE USING (
        caller_id = auth.uid() OR receiver_id = auth.uid()
    );

