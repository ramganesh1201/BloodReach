-- ============================================================================
-- CareLoop Production PostgreSQL Schema & Security Infrastructure
-- Enforces Role-Based Access Control (RBAC), Row Level Security (RLS),
-- and Atomic State Transitions for Blood Donation Coordination.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Linked with Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('patient', 'donor', 'blood_centre', 'coordinator', 'admin')),
    city TEXT,
    district TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Emergency Requests Table
CREATE TABLE IF NOT EXISTS public.emergency_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_code TEXT UNIQUE NOT NULL, -- e.g. CL-8F42
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units_required INTEGER NOT NULL CHECK (units_required > 0),
    units_coordinated INTEGER NOT NULL DEFAULT 0 CHECK (units_coordinated >= 0),
    urgency TEXT NOT NULL CHECK (urgency IN ('Today', 'Urgent', 'Critical')),
    hospital_name TEXT NOT NULL,
    hospital_address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    state TEXT,
    postal_code TEXT,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_method TEXT NOT NULL DEFAULT 'Phone' CHECK (contact_method IN ('Phone', 'SMS', 'WhatsApp')),
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
        'CREATED', 'VERIFYING', 'CHECKING_RESOURCES', 'SHORTAGE_IDENTIFIED',
        'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND',
        'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED',
        'AWAITING_CENTRE_VERIFICATION', 'FULFILLED', 'CANCELLED', 'EXPIRED'
    )),
    escalation_level INTEGER NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 4),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_units_coordinated_max CHECK (units_coordinated <= units_required)
);

-- 3. Emergency Events Table (Immutable Audit Event Log)
CREATE TABLE IF NOT EXISTS public.emergency_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Blood Centres Table
CREATE TABLE IF NOT EXISTS public.blood_centres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    license_number TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    state TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    verified BOOLEAN NOT NULL DEFAULT true,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    operating_hours TEXT DEFAULT '24/7 Emergency Service',
    inventory_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Blood Inventory Table
CREATE TABLE IF NOT EXISTS public.blood_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_centre_id UUID NOT NULL REFERENCES public.blood_centres(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blood_centre_id, blood_group, component)
);

-- 6. Donors Table
CREATE TABLE IF NOT EXISTS public.donors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    city TEXT NOT NULL,
    district TEXT,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    is_available BOOLEAN NOT NULL DEFAULT true,
    weight_kg NUMERIC(4,1),
    birth_date DATE,
    last_donated_at TIMESTAMPTZ,
    last_donated_component TEXT CHECK (last_donated_component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    deferral_until TIMESTAMPTZ,
    is_medically_cleared BOOLEAN DEFAULT true,
    total_donations INTEGER NOT NULL DEFAULT 0 CHECK (total_donations >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Donor Responses Table
CREATE TABLE IF NOT EXISTS public.donor_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    response_status TEXT NOT NULL CHECK (response_status IN ('NOTIFIED', 'ACCEPTED', 'DECLINED')),
    response_channel TEXT NOT NULL DEFAULT 'WEB' CHECK (response_channel IN ('WEB', 'SMS')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(request_id, donor_id)
);

-- 8. Donor Assignments Table (Controlled, Conflict-Resistant Coordination)
CREATE TABLE IF NOT EXISTS public.donor_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    units_assigned INTEGER NOT NULL DEFAULT 1 CHECK (units_assigned > 0),
    status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'CONFIRMED', 'DONATED', 'CANCELLED')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    UNIQUE(request_id, donor_id)
);

-- 9. Notifications Table (Explicit Status Tracking)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_phone TEXT,
    recipient_email TEXT,
    channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'SMS', 'PUSH', 'EMAIL')),
    title TEXT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

-- 10. Audit Logs Table (Admin Governance)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Fast Query Performance
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_blood_group ON public.emergency_requests(blood_group);
CREATE INDEX IF NOT EXISTS idx_requests_reference ON public.emergency_requests(reference_code);
CREATE INDEX IF NOT EXISTS idx_events_request_id ON public.emergency_events(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_blood_centre ON public.blood_inventory(blood_centre_id);
CREATE INDEX IF NOT EXISTS idx_donors_availability ON public.donors(is_available, blood_group);
CREATE INDEX IF NOT EXISTS idx_assignments_request ON public.donor_assignments(request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, status);

-- ============================================================================
-- ATOMIC DONOR ASSIGNMENT STORED PROCEDURE
-- Prevents race conditions and duplicate over-assignment
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_donor_atomic(
    p_request_id UUID,
    p_donor_id UUID,
    p_units INTEGER DEFAULT 1,
    p_coordinator_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_req RECORD;
    v_donor RECORD;
    v_new_coordinated INTEGER;
    v_assignment_id UUID;
BEGIN
    -- 1. Lock and fetch emergency request
    SELECT * INTO v_req FROM public.emergency_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot assign donor to a closed or fulfilled request.');
    END IF;

    -- 2. Verify remaining units required
    IF (v_req.units_coordinated + p_units) > v_req.units_required THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assigned units would exceed total units required for this request.');
    END IF;

    -- 3. Lock and fetch donor
    SELECT * INTO v_donor FROM public.donors
    WHERE id = p_donor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor record not found.');
    END IF;

    IF NOT v_donor.is_available THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor is currently marked unavailable.');
    END IF;

    -- 4. Insert or update assignment
    INSERT INTO public.donor_assignments (request_id, donor_id, units_assigned, status, coordinator_id)
    VALUES (p_request_id, p_donor_id, p_units, 'ASSIGNED', p_coordinator_id)
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET units_assigned = p_units, status = 'ASSIGNED', assigned_at = NOW(), coordinator_id = p_coordinator_id
    RETURNING id INTO v_assignment_id;

    -- 5. Update request units and status
    v_new_coordinated := v_req.units_coordinated + p_units;
    
    UPDATE public.emergency_requests
    SET units_coordinated = v_new_coordinated,
        status = CASE 
            WHEN v_new_coordinated >= v_req.units_required THEN 'AWAITING_CENTRE_VERIFICATION'
            ELSE 'DONOR_ASSIGNED'
        END,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 6. Insert audit event
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'DONOR_ASSIGNED',
        format('Donor %s assigned for %s unit(s). Total coordinated: %s/%s.', v_donor.full_name, p_units, v_new_coordinated, v_req.units_required),
        'Coordinator',
        jsonb_build_object('donor_id', p_donor_id, 'assignment_id', v_assignment_id, 'units', p_units)
    );

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'units_coordinated', v_new_coordinated,
        'units_required', v_req.units_required
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: Extract User Role from Auth Profile
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Profiles Policies
CREATE POLICY "Users read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.get_user_role() = 'admin');

CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.get_user_role() = 'admin');

CREATE POLICY "Allow profile creation on register" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Emergency Requests Policies
CREATE POLICY "Public read emergency requests" ON public.emergency_requests
    FOR SELECT USING (true);

CREATE POLICY "Authorized roles create requests" ON public.emergency_requests
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('patient', 'coordinator', 'admin')
        OR auth.uid() IS NULL -- Allow guest emergency request submissions
    );

CREATE POLICY "Coordinators & Staff update requests" ON public.emergency_requests
    FOR UPDATE USING (
        public.get_user_role() IN ('blood_centre', 'coordinator', 'admin')
        OR created_by = auth.uid()
    );

-- 3. Inventory Policies
CREATE POLICY "Public read inventory" ON public.blood_inventory
    FOR SELECT USING (true);

CREATE POLICY "Blood Centre & Admin update inventory" ON public.blood_inventory
    FOR ALL USING (
        public.get_user_role() IN ('blood_centre', 'admin')
    );

-- 4. Donor Privacy Policies
CREATE POLICY "Public read available donor counts" ON public.donors
    FOR SELECT USING (
        is_available = true
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Donors update own availability" ON public.donors
    FOR UPDATE USING (
        profile_id = auth.uid()
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

-- 5. Donor Assignments Policies
CREATE POLICY "Read assignments" ON public.donor_assignments
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
    );

CREATE POLICY "Coordinators manage assignments" ON public.donor_assignments
    FOR ALL USING (
        public.get_user_role() IN ('coordinator', 'admin')
    );

-- 6. Notifications Policies
CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users acknowledge own notifications" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid());

-- 7. Audit Logs Policies (Admin Only)
CREATE POLICY "Admin read audit logs" ON public.audit_logs
    FOR SELECT USING (public.get_user_role() = 'admin');

-- ============================================================================
-- COMMUNICATION SYSTEM EXTENSIONS
-- Private Conversations, Messages, Receipts, Attachments, Events & Calling
-- ============================================================================

-- 11. Conversations Table
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
    UNIQUE(request_id, donor_id)
);

-- 12. Conversation Participants Table
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

-- 13. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- 14. Message Receipts Table
CREATE TABLE IF NOT EXISTS public.message_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE(message_id, user_id)
);

-- 15. Message Attachments Table
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Structured Coordination Events Table
CREATE TABLE IF NOT EXISTS public.coordination_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'CONFIRMED_AVAILABILITY', 'ON_THE_WAY', 'REACHED_HOSPITAL',
        'UNABLE_TO_PROCEED', 'WITHDRAWN', 'SHARED_HOSPITAL_DETAILS',
        'REQUESTED_UPDATE', 'CONFIRMED_ARRIVAL', 'COORDINATION_OUTCOME'
    )),
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Call Sessions Table
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

-- Communication Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_request ON public.conversations(request_id);
CREATE INDEX IF NOT EXISTS idx_conversations_donor ON public.conversations(donor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_requester ON public.conversations(requester_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON public.messages(client_message_id);
CREATE INDEX IF NOT EXISTS idx_coordination_events_conv ON public.coordination_events(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_conv ON public.call_sessions(conversation_id, started_at DESC);

-- ============================================================================
-- STORED PROCEDURE: ACCEPT REQUEST AND CREATE CONVERSATION ATOMICALLY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_request_and_create_conversation(
    p_request_id UUID,
    p_donor_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_req RECORD;
    v_donor RECORD;
    v_donor_profile_id UUID;
    v_requester_id UUID;
    v_conversation_id UUID;
    v_existing_conv RECORD;
BEGIN
    SELECT * INTO v_req FROM public.emergency_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This emergency request is no longer active.');
    END IF;

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

    IF v_requester_id IS NULL THEN
        SELECT id INTO v_requester_id FROM public.profiles WHERE role = 'coordinator' LIMIT 1;
    END IF;

    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, p_donor_id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    SELECT * INTO v_existing_conv FROM public.conversations
    WHERE request_id = p_request_id AND donor_id = p_donor_id;

    IF FOUND THEN
        v_conversation_id := v_existing_conv.id;
    ELSE
        INSERT INTO public.conversations (request_id, donor_id, requester_id, status)
        VALUES (p_request_id, p_donor_id, v_requester_id, 'ACTIVE')
        RETURNING id INTO v_conversation_id;

        INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
        VALUES (v_conversation_id, v_requester_id, 'requester')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;

        IF v_donor_profile_id IS NOT NULL THEN
            INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
            VALUES (v_conversation_id, v_donor_profile_id, 'donor')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;

        INSERT INTO public.messages (conversation_id, sender_id, sender_name, sender_role, message_type, content)
        VALUES (
            v_conversation_id,
            v_requester_id,
            'CareLoop System',
            'system',
            'SYSTEM',
            format('Private coordination channel activated for Request #%s. Donor %s accepted the call.', v_req.reference_code, v_donor.full_name)
        );

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

    IF v_req.status IN ('CREATED', 'AWAITING_RESPONSE', 'MATCHING_RESPONDERS') THEN
        UPDATE public.emergency_requests
        SET status = 'RESPONDER_FOUND', updated_at = NOW()
        WHERE id = p_request_id;
    END IF;

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

-- Communication RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Participants read participant roster" ON public.conversation_participants
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants read messages" ON public.messages
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert messages" ON public.messages
    FOR INSERT WITH CHECK (
        public.is_conversation_participant(conversation_id)
        AND sender_id = auth.uid()
    );

CREATE POLICY "Senders update own message" ON public.messages
    FOR UPDATE USING (sender_id = auth.uid());

CREATE POLICY "Participants read receipts" ON public.message_receipts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id)
        )
    );

CREATE POLICY "Users insert/update own receipts" ON public.message_receipts
    FOR ALL USING (user_id = auth.uid());

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

CREATE POLICY "Participants read coordination events" ON public.coordination_events
    FOR SELECT USING (conversation_id IS NULL OR public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert coordination events" ON public.coordination_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND (conversation_id IS NULL OR public.is_conversation_participant(conversation_id))
    );

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
    FOR UPDATE USING (caller_id = auth.uid() OR receiver_id = auth.uid());
