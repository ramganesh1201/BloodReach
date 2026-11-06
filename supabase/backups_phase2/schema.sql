-- ============================================================================
-- CareLoop Production Unified Database Schema Reference (Hardened)
-- Version: 20261103.1
-- Engine: PostgreSQL 17.x / Supabase
--
-- This file represents the complete consolidated schema specification for CareLoop.
-- It matches the cumulative output of hardened migrations 1 through 4:
--   1. 20261103000001_core_schema.sql
--   2. 20261103000002_communication_system.sql
--   3. 20261103000003_secure_voice_calling.sql
--   4. 20261103000004_notifications_and_storage.sql
-- ============================================================================

-- 1. Enable Cryptographic & UUID Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. IDENTITY, PROFILES & NOTIFICATION PREFERENCES
-- ============================================================================

-- 2.1 Profiles Table (Linked 1:1 with Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'donor', 'blood_centre', 'coordinator', 'admin')),
    city TEXT,
    district TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Device Push Tokens (Web Push / FCM / APNS)
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- 2.3 User Notification Preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    enable_in_app BOOLEAN NOT NULL DEFAULT true,
    enable_push BOOLEAN NOT NULL DEFAULT true,
    enable_sms BOOLEAN NOT NULL DEFAULT true,
    enable_emergency_calls BOOLEAN NOT NULL DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. HEALTHCARE FACILITIES & BLOOD INVENTORY
-- ============================================================================

-- 3.1 Verified Healthcare Facilities & Hospitals
CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    license_number TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    state TEXT DEFAULT 'Andhra Pradesh',
    postal_code TEXT,
    emergency_phone TEXT NOT NULL,
    lat NUMERIC(9,6) NOT NULL,
    lng NUMERIC(9,6) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Blood Centres Table
CREATE TABLE IF NOT EXISTS public.blood_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    license_number TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    state TEXT DEFAULT 'Andhra Pradesh',
    phone TEXT NOT NULL,
    email TEXT,
    verified BOOLEAN NOT NULL DEFAULT true,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    operating_hours TEXT DEFAULT '24/7 Emergency Service',
    inventory_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 Blood Inventory Table
CREATE TABLE IF NOT EXISTS public.blood_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blood_centre_id UUID NOT NULL REFERENCES public.blood_centres(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(blood_centre_id, blood_group, component)
);

-- ============================================================================
-- 4. DONORS & EMERGENCY REQUEST COORDINATION
-- ============================================================================

-- 4.1 Donors Table
CREATE TABLE IF NOT EXISTS public.donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    is_medically_cleared BOOLEAN NOT NULL DEFAULT true,
    total_donations INTEGER NOT NULL DEFAULT 0 CHECK (total_donations >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Emergency Requests Table
CREATE TABLE IF NOT EXISTS public.emergency_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code TEXT UNIQUE NOT NULL,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units_required INTEGER NOT NULL CHECK (units_required > 0),
    units_coordinated INTEGER NOT NULL DEFAULT 0 CHECK (units_coordinated >= 0),
    urgency TEXT NOT NULL CHECK (urgency IN ('Today', 'Urgent', 'Critical')),
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    hospital_name TEXT NOT NULL,
    hospital_address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    state TEXT DEFAULT 'Andhra Pradesh',
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_units_coordinated_max CHECK (units_coordinated <= units_required)
);

-- 4.3 Emergency Events Table (Immutable Audit Event Log)
CREATE TABLE IF NOT EXISTS public.emergency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.4 Donor Responses Table
CREATE TABLE IF NOT EXISTS public.donor_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    response_status TEXT NOT NULL CHECK (response_status IN ('NOTIFIED', 'ACCEPTED', 'DECLINED')),
    response_channel TEXT NOT NULL DEFAULT 'WEB' CHECK (response_channel IN ('WEB', 'SMS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(request_id, donor_id)
);

-- 4.5 Donor Assignments Table
CREATE TABLE IF NOT EXISTS public.donor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    units_assigned INTEGER NOT NULL DEFAULT 1 CHECK (units_assigned > 0),
    status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'CONFIRMED', 'DONATED', 'CANCELLED')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    UNIQUE(request_id, donor_id)
);

-- ============================================================================
-- 5. COMMUNICATION & MESSAGING SYSTEM
-- ============================================================================

-- 5.1 Conversations Table (Private Request-Donor Coordination Channel)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_ACCEPTANCE', 'ACTIVE', 'RESTRICTED', 'CLOSED')),
    closed_at TIMESTAMPTZ,
    closure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(request_id, donor_id)
);

-- 5.2 Conversation Participants Table (Defines Explicit Authorization)
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

-- 5.3 Messages Table
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

-- 5.4 Message Receipts Table
CREATE TABLE IF NOT EXISTS public.message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE(message_id, user_id)
);

-- 5.5 Message Attachments Table
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.6 Structured Coordination Events Table
CREATE TABLE IF NOT EXISTS public.coordination_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. WEBRTC VOICE CALLING SYSTEM
-- ============================================================================

-- 6.1 Call Sessions Table
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

-- 6.2 Call Events Table
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
-- 7. NOTIFICATIONS & AUDIT LOGS
-- ============================================================================

-- 7.1 Multi-channel Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_phone TEXT,
    recipient_email TEXT,
    channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'SMS', 'PUSH', 'EMAIL')),
    title TEXT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

-- 7.2 Audit Logs Table (Admin Governance)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON public.hospitals(city);
CREATE INDEX IF NOT EXISTS idx_hospitals_geo ON public.hospitals(lat, lng);
CREATE INDEX IF NOT EXISTS idx_blood_centres_city ON public.blood_centres(city);
CREATE INDEX IF NOT EXISTS idx_inventory_lookup ON public.blood_inventory(blood_centre_id, blood_group, component);
CREATE INDEX IF NOT EXISTS idx_donors_search ON public.donors(blood_group, is_available, city);
CREATE INDEX IF NOT EXISTS idx_donors_profile ON public.donors(profile_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_blood ON public.emergency_requests(blood_group, urgency);
CREATE INDEX IF NOT EXISTS idx_requests_ref ON public.emergency_requests(reference_code);
CREATE INDEX IF NOT EXISTS idx_requests_creator ON public.emergency_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_events_req ON public.emergency_events(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_donor_resp_req ON public.donor_responses(request_id, response_status);
CREATE INDEX IF NOT EXISTS idx_assignments_req ON public.donor_assignments(request_id, status);
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
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_receiver ON public.call_sessions(caller_id, receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_receiver_status ON public.call_sessions(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON public.call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_events_call_created ON public.call_events(call_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_stat ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);

-- ============================================================================
-- 9. STORED PROCEDURES, FUNCTIONS & SECURITY TRIGGERS
-- ============================================================================

-- 9.1 Helper: User Role (Safe NULL / Anonymous resolution)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid() AND status = 'ACTIVE'),
    'anonymous'
  );
$$;

-- 9.2 Trigger: Handle New User Registration (Strictly defaults to 'patient')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_phone := NEW.raw_user_meta_data->>'phone';

    INSERT INTO public.profiles (id, email, full_name, phone, role, status)
    VALUES (NEW.id, NEW.email, v_full_name, v_phone, 'patient', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9.3 Trigger: Prevent Profile Privilege Escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.id IS DISTINCT FROM OLD.id) THEN
            IF public.get_user_role() <> 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: Users cannot modify their own role, status, or identity.';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 9.3b Lifecycle & Status Transition Integrity Trigger
CREATE OR REPLACE FUNCTION public.validate_emergency_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Prevent modification of terminal states
    IF OLD.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Cannot modify an emergency request in terminal state (%).', OLD.status;
    END IF;

    -- Only clinical coordinators, blood centres, or admins can set FULFILLED or AWAITING_CENTRE_VERIFICATION
    IF NEW.status IN ('FULFILLED', 'AWAITING_CENTRE_VERIFICATION') AND public.get_user_role() NOT IN ('coordinator', 'blood_centre', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only clinical staff can fulfill or verify emergency requests.';
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_emergency_request_transition ON public.emergency_requests;
CREATE TRIGGER trg_validate_emergency_request_transition
    BEFORE UPDATE ON public.emergency_requests
    FOR EACH ROW EXECUTE FUNCTION public.validate_emergency_request_transition();

-- 9.4 Admin Role Management RPC
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_new_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.get_user_role() <> 'admin' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only administrators can modify roles.');
    END IF;

    IF p_new_role NOT IN ('patient', 'donor', 'blood_centre', 'coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid role specified.');
    END IF;

    UPDATE public.profiles
    SET role = p_new_role, updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User profile not found.');
    END IF;

    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (auth.uid(), 'ROLE_CHANGE', 'profiles', p_user_id::text, jsonb_build_object('new_role', p_new_role));

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'new_role', p_new_role);
END;
$$;

-- 9.5 Helper: Is Conversation Participant
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

-- 9.6 Trigger: Validate Message Sender & Role Spoofing
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

-- 9.7 Trigger: Prevent Message Tampering
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

-- 9.8 Atomic Donor Assignment Procedure
CREATE OR REPLACE FUNCTION public.assign_donor_atomic(
    p_request_id UUID,
    p_donor_id UUID,
    p_units INTEGER DEFAULT 1,
    p_coordinator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_acting_coordinator_id UUID;
    v_req RECORD;
    v_donor RECORD;
    v_existing_assignment RECORD;
    v_units_diff INTEGER;
    v_new_coordinated INTEGER;
    v_assignment_id UUID;
BEGIN
    -- 1. Validate units parameter
    IF p_units IS NULL OR p_units <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid units quantity. Units must be greater than zero.');
    END IF;

    -- 2. Authorization check: Only coordinator, admin, or the request creator can assign donors
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_caller_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.emergency_requests WHERE id = p_request_id AND created_by = v_caller_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only coordinators, administrators, or the request creator can assign donors.');
        END IF;
    END IF;

    -- Secure Attribution: Coordinator identity cannot be spoofed by callers
    IF v_caller_role = 'admin' THEN
        -- Administrators may attribute to a designated coordinator if valid, else self
        IF p_coordinator_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = p_coordinator_id AND role IN ('coordinator', 'admin')
        ) THEN
            v_acting_coordinator_id := p_coordinator_id;
        ELSE
            v_acting_coordinator_id := v_caller_id;
        END IF;
    ELSIF v_caller_role = 'coordinator' THEN
        -- Coordinators are strictly bound to their own authenticated identity
        v_acting_coordinator_id := v_caller_id;
    ELSE
        -- Patients / creators cannot forge coordinator identities
        v_acting_coordinator_id := NULL;
    END IF;

    -- 3. Lock emergency request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot assign donor to a closed or fulfilled request.');
    END IF;

    -- 4. Lock donor profile
    SELECT * INTO v_donor FROM public.donors WHERE id = p_donor_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor record not found.');
    END IF;

    IF NOT v_donor.is_available THEN
        RETURN jsonb_build_object('success', false, 'message', 'Donor is currently marked as unavailable.');
    END IF;

    -- 5. Calculate units delta to prevent duplicate incrementing
    SELECT * INTO v_existing_assignment FROM public.donor_assignments
    WHERE request_id = p_request_id AND donor_id = p_donor_id FOR UPDATE;

    IF FOUND THEN
        -- If already assigned with identical units, return idempotently
        IF v_existing_assignment.units_assigned = p_units AND v_existing_assignment.status = 'ASSIGNED' THEN
            RETURN jsonb_build_object(
                'success', true,
                'assignment_id', v_existing_assignment.id,
                'units_coordinated', v_req.units_coordinated,
                'units_required', v_req.units_required,
                'already_assigned', true
            );
        END IF;
        v_units_diff := p_units - v_existing_assignment.units_assigned;
    ELSE
        v_units_diff := p_units;
    END IF;

    -- 6. Verify units will not exceed total required
    IF (v_req.units_coordinated + v_units_diff) > v_req.units_required THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assigned units would exceed total units required for this request.');
    END IF;

    -- 7. Upsert assignment with verified coordinator attribution
    INSERT INTO public.donor_assignments (request_id, donor_id, units_assigned, status, coordinator_id)
    VALUES (p_request_id, p_donor_id, p_units, 'ASSIGNED', v_acting_coordinator_id)
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET units_assigned = p_units,
        status = 'ASSIGNED',
        assigned_at = NOW(),
        coordinator_id = v_acting_coordinator_id
    RETURNING id INTO v_assignment_id;

    -- 8. Update request units and status
    v_new_coordinated := v_req.units_coordinated + v_units_diff;

    UPDATE public.emergency_requests
    SET units_coordinated = v_new_coordinated,
        status = CASE 
            WHEN v_new_coordinated >= v_req.units_required THEN 'AWAITING_CENTRE_VERIFICATION'
            ELSE 'DONOR_ASSIGNED'
        END,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 9. Insert emergency event
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'DONOR_ASSIGNED',
        format('Donor %s assigned for %s unit(s). Total coordinated: %s/%s.', v_donor.full_name, p_units, v_new_coordinated, v_req.units_required),
        COALESCE(v_caller_role, 'Coordinator'),
        jsonb_build_object('donor_id', p_donor_id, 'assignment_id', v_assignment_id, 'units', p_units, 'coordinator_id', v_acting_coordinator_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'units_coordinated', v_new_coordinated,
        'units_required', v_req.units_required
    );
END;
$$;

-- 9.9 Privacy-Preserving Donor Discovery RPC
-- SECURITY MANDATE: Replaces direct public access to public.donors.
-- Enforces caller authentication, request status validation, distance clamping (>0 and <=500km),
-- strict guest request authorization, and acos numerical bounds protection.
CREATE OR REPLACE FUNCTION public.discover_matching_donors(
    p_request_id UUID,
    p_max_distance_km NUMERIC DEFAULT 25.0
)
RETURNS TABLE (
    donor_id UUID,
    blood_group TEXT,
    city TEXT,
    district TEXT,
    is_available BOOLEAN,
    distance_km NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_req RECORD;
BEGIN
    -- 1. Authentication check
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    -- 2. Validate distance parameter (Must be positive and <= 500 km)
    IF p_max_distance_km IS NULL OR p_max_distance_km <= 0 OR p_max_distance_km > 500 THEN
        RETURN;
    END IF;

    -- 3. Lookup and validate emergency request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- 4. Status check: Never search donors for terminal or fulfilled requests
    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN;
    END IF;

    -- 5. Authorization check:
    -- If created by an authenticated user, caller must be the creator, coordinator, blood_centre, or admin.
    -- If created by a guest (created_by IS NULL), ONLY staff (coordinator, blood_centre, admin) can search donors.
    IF v_req.created_by IS NOT NULL THEN
        IF v_req.created_by <> v_caller_id AND v_caller_role NOT IN ('coordinator', 'admin', 'blood_centre') THEN
            RETURN;
        END IF;
    ELSE
        IF v_caller_role NOT IN ('coordinator', 'admin', 'blood_centre') THEN
            RETURN;
        END IF;
    END IF;

    -- 6. Query matching donors safely with acos bounds protection
    RETURN QUERY
    SELECT 
        d.id AS donor_id,
        d.blood_group,
        d.city,
        d.district,
        d.is_available,
        CASE 
            WHEN v_req.lat IS NOT NULL AND v_req.lng IS NOT NULL AND d.lat IS NOT NULL AND d.lng IS NOT NULL THEN
                ROUND(
                    (6371 * acos(
                        LEAST(1.0::numeric, GREATEST(-1.0::numeric,
                            (cos(radians(v_req.lat)) * cos(radians(d.lat)) *
                             cos(radians(d.lng) - radians(v_req.lng)) +
                             sin(radians(v_req.lat)) * sin(radians(d.lat)))::numeric
                        ))
                    ))::numeric, 2
                )
            ELSE NULL
        END AS distance_km
    FROM public.donors d
    WHERE d.is_available = true
      AND d.is_medically_cleared = true
      AND (d.deferral_until IS NULL OR d.deferral_until <= NOW())
      AND (
          v_req.lat IS NULL OR v_req.lng IS NULL OR d.lat IS NULL OR d.lng IS NULL OR
          (6371 * acos(
              LEAST(1.0::numeric, GREATEST(-1.0::numeric,
                  (cos(radians(v_req.lat)) * cos(radians(d.lat)) *
                   cos(radians(d.lng) - radians(v_req.lng)) +
                   sin(radians(v_req.lat)) * sin(radians(d.lat)))::numeric
              ))
          ) <= p_max_distance_km)
      )
    ORDER BY distance_km ASC NULLS LAST;
END;
$$;

-- 9.9.1 Discoverable Emergency Requests View (Privacy-Preserving Projection)
-- SECURITY MANDATE: Excludes patient phone, contact name, contact method, and private notes.
-- Registered donors and the public query this view to browse open donation needs safely.
CREATE OR REPLACE VIEW public.discoverable_emergency_requests AS
SELECT 
    er.id,
    er.reference_code,
    er.blood_group,
    er.component,
    er.units_required,
    er.units_coordinated,
    er.urgency,
    er.hospital_id,
    er.hospital_name,
    er.hospital_address,
    er.city,
    er.district,
    er.state,
    er.postal_code,
    er.lat,
    er.lng,
    er.status,
    er.escalation_level,
    er.created_at,
    er.updated_at
FROM public.emergency_requests er
WHERE er.status IN ('CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED');

-- 9.9.2 Discoverable Emergency Requests RPC
CREATE OR REPLACE FUNCTION public.get_discoverable_emergency_requests(
    p_blood_group TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    reference_code TEXT,
    blood_group TEXT,
    component TEXT,
    units_required INTEGER,
    units_coordinated INTEGER,
    urgency TEXT,
    hospital_name TEXT,
    city TEXT,
    district TEXT,
    state TEXT,
    status TEXT,
    escalation_level INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT 
        er.id,
        er.reference_code,
        er.blood_group,
        er.component,
        er.units_required,
        er.units_coordinated,
        er.urgency,
        er.hospital_name,
        er.city,
        er.district,
        er.state,
        er.status,
        er.escalation_level,
        er.created_at
    FROM public.emergency_requests er
    WHERE er.status IN ('CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED')
      AND (p_blood_group IS NULL OR er.blood_group = p_blood_group)
      AND (p_city IS NULL OR er.city ILIKE p_city)
    ORDER BY er.created_at DESC;
$$;

-- 9.9.3 Audit Log Integrity Trigger
-- SECURITY MANDATE: Enforces actor attribution (cannot spoof user_id) and restricts
-- client actions for non-administrative accounts to an explicit allowlist.
CREATE OR REPLACE FUNCTION public.validate_audit_log_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT := public.get_user_role();
BEGIN
    -- Immutable audit log: cannot update or alter existing entries
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Audit logs are strictly immutable and cannot be updated.';
    END IF;

    -- Enforce actor attribution: If authenticated, user_id MUST be auth.uid()
    IF auth.uid() IS NOT NULL THEN
        NEW.user_id := auth.uid();
    END IF;

    -- Restrict client-inserted actions for non-admin callers
    IF v_caller_role NOT IN ('admin') THEN
        IF NEW.action NOT IN (
            'CLIENT_SESSION_START',
            'CLIENT_SESSION_END',
            'CLIENT_ERROR_REPORT',
            'USER_LOGIN',
            'USER_LOGOUT',
            'CONSENT_ACCEPTED'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Non-administrative callers can only submit documented client audit actions.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_audit_log_actor ON public.audit_logs;
CREATE TRIGGER trg_validate_audit_log_actor
    BEFORE INSERT OR UPDATE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.validate_audit_log_actor();

-- 9.10 Atomic Donor Acceptance & Private Conversation Provisioning
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
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required to accept donation requests.');
    END IF;

    -- Derive donor identity from auth.uid() (never trust client-supplied donor ID for ordinary users)
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

    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'This emergency request is no longer active.');
    END IF;

    v_donor_profile_id := v_donor.profile_id;
    v_requester_id := v_req.created_by;

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

    INSERT INTO public.donor_responses (request_id, donor_id, response_status, response_channel)
    VALUES (p_request_id, v_donor.id, 'ACCEPTED', 'WEB')
    ON CONFLICT (request_id, donor_id) DO UPDATE
    SET response_status = 'ACCEPTED', created_at = NOW();

    IF v_existing_conv.id IS NOT NULL THEN
        v_conversation_id := v_existing_conv.id;
    ELSE
        INSERT INTO public.conversations (request_id, donor_id, requester_id, status)
        VALUES (p_request_id, v_donor.id, v_requester_id, 'ACTIVE')
        ON CONFLICT (request_id, donor_id) DO UPDATE
        SET status = 'ACTIVE', updated_at = NOW()
        RETURNING id INTO v_conversation_id;

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
        jsonb_build_object('donor_id', v_donor.id, 'conversation_id', v_conversation_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'request_id', p_request_id,
        'donor_name', v_donor.full_name,
        'already_accepted', false
    );
END;
$$;

-- 9.11 Issue ICE Credentials
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

-- 9.12 Initiate Call
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

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation channel not found.');
    END IF;

    IF v_conv.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversation is not active.');
    END IF;

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

    SELECT * INTO v_req FROM public.emergency_requests WHERE id = v_conv.request_id;
    IF NOT FOUND OR v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'The associated emergency request is no longer active.');
    END IF;

    SELECT * INTO v_donor_resp FROM public.donor_responses
    WHERE request_id = v_conv.request_id AND donor_id = v_conv.donor_id AND response_status = 'ACCEPTED';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency call unavailable: Donor acceptance is not confirmed.');
    END IF;

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

    INSERT INTO public.call_sessions (
        conversation_id, request_id, caller_id, receiver_id, call_type, status, started_at, ringing_at
    )
    VALUES (
        p_conversation_id, v_conv.request_id, v_caller_id, v_receiver_id, p_call_type, 'RINGING', NOW(), NOW()
    )
    RETURNING id INTO v_new_call_id;

    INSERT INTO public.call_events (call_id, event_type, actor_id, event_data)
    VALUES (
        v_new_call_id, 'INITIATED', v_caller_id,
        jsonb_build_object('caller_id', v_caller_id, 'receiver_id', v_receiver_id, 'call_type', p_call_type, 'conversation_id', p_conversation_id)
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

-- 9.13 Accept Call
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

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
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

-- 9.14 Record Call Connected
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

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
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

-- 9.15 Reject Call
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

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
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

-- 9.16 Cancel Call
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

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
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

-- 9.17 End Call
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

    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
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

-- 9.18 Expire Call (With strict timeout threshold & caller verification)
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
    SELECT * INTO v_call FROM public.call_sessions WHERE id = p_call_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Call session not found.');
    END IF;

    IF v_caller_id IS NOT NULL AND v_call.caller_id <> v_caller_id AND v_call.receiver_id <> v_caller_id 
       AND public.get_user_role() NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to expire this call.');
    END IF;

    IF v_call.status NOT IN ('RINGING', 'INITIATING') THEN
        RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'status', v_call.status);
    END IF;

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

-- 9.19 Call Session Immutability & State Machine Enforcement Trigger
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
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 10.1 Profiles Policies
DROP POLICY IF EXISTS "Authorized profile read" ON public.profiles;
CREATE POLICY "Authorized profile read" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR public.get_user_role() IN ('coordinator', 'admin')
        OR EXISTS (
            SELECT 1 FROM public.conversation_participants cp_me
            JOIN public.conversation_participants cp_other ON cp_me.conversation_id = cp_other.conversation_id
            WHERE cp_me.user_id = auth.uid()
              AND cp_other.user_id = profiles.id
              AND cp_me.is_active = true
              AND cp_other.is_active = true
        )
    );

CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.get_user_role() = 'admin');

CREATE POLICY "Allow profile creation on register" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 10.2 Device Tokens & Preferences
CREATE POLICY "Users manage own device tokens" ON public.device_tokens
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 10.3 Hospitals Policies
CREATE POLICY "Public read hospitals" ON public.hospitals
    FOR SELECT USING (true);

CREATE POLICY "Coordinators and Admin manage hospitals" ON public.hospitals
    FOR ALL USING (public.get_user_role() IN ('coordinator', 'admin'));

-- 10.4 Blood Centres Policies
CREATE POLICY "Public read blood centres" ON public.blood_centres
    FOR SELECT USING (true);

CREATE POLICY "Blood centres and Admin manage blood centres" ON public.blood_centres
    FOR ALL USING (public.get_user_role() IN ('blood_centre', 'coordinator', 'admin'));

-- 10.5 Blood Inventory Policies
CREATE POLICY "Public read inventory" ON public.blood_inventory
    FOR SELECT USING (true);

CREATE POLICY "Blood Centre and Admin update inventory" ON public.blood_inventory
    FOR ALL USING (public.get_user_role() IN ('blood_centre', 'admin'));

-- 10.6 Donor Privacy Policies
CREATE POLICY "Donors and Coordinators read donor records" ON public.donors
    FOR SELECT USING (
        profile_id = auth.uid()
        OR public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR EXISTS (
            SELECT 1 FROM public.donor_assignments da
            JOIN public.emergency_requests er ON da.request_id = er.id
            WHERE da.donor_id = donors.id
              AND er.created_by = auth.uid()
        )
    );

CREATE POLICY "Donors insert own profile" ON public.donors
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Donors update own availability" ON public.donors
    FOR UPDATE USING (
        profile_id = auth.uid()
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

-- 10.7 Emergency Requests Policies
-- SECURITY MANDATE: Only the creator, coordinators, blood centres, and confirmed responders/assigned donors
-- can access full request details (including contact phone, contact name, and private patient notes).
-- General donors must discover requests via the privacy-preserving view: discoverable_emergency_requests.
CREATE POLICY "Authorized users read emergency requests" ON public.emergency_requests
    FOR SELECT USING (
        created_by = auth.uid()
        OR public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR EXISTS (
            SELECT 1 FROM public.donor_responses dr
            JOIN public.donors d ON dr.donor_id = d.id
            WHERE dr.request_id = emergency_requests.id
              AND d.profile_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.donor_assignments da
            JOIN public.donors d ON da.donor_id = d.id
            WHERE da.request_id = emergency_requests.id
              AND d.profile_id = auth.uid()
        )
    );

CREATE POLICY "Authorized roles create requests" ON public.emergency_requests
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('patient', 'coordinator', 'admin')
        OR auth.uid() IS NULL
    );

CREATE POLICY "Coordinators and Creator update requests" ON public.emergency_requests
    FOR UPDATE USING (
        public.get_user_role() IN ('blood_centre', 'coordinator', 'admin')
        OR created_by = auth.uid()
    );

-- 10.8 Emergency Events Policies
CREATE POLICY "Authorized actors read emergency events" ON public.emergency_events
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR EXISTS (
            SELECT 1 FROM public.emergency_requests er
            WHERE er.id = request_id
              AND (
                  er.created_by = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.donor_responses dr
                      JOIN public.donors d ON dr.donor_id = d.id
                      WHERE dr.request_id = er.id AND d.profile_id = auth.uid()
                  )
              )
        )
    );

CREATE POLICY "Authorized actors insert emergency events" ON public.emergency_events
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR (
            auth.uid() IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.emergency_requests er
                WHERE er.id = request_id AND er.created_by = auth.uid()
            )
        )
    );

-- 10.9 Donor Responses Policies
CREATE POLICY "Donors, Requesters and Coordinators read responses" ON public.donor_responses
    FOR SELECT USING (
        donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
        OR EXISTS (
            SELECT 1 FROM public.emergency_requests er
            WHERE er.id = request_id AND er.created_by = auth.uid()
        )
    );

CREATE POLICY "Donors and Coordinators insert responses" ON public.donor_responses
    FOR INSERT WITH CHECK (
        donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Donors update own response" ON public.donor_responses
    FOR UPDATE USING (
        donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

-- 10.10 Donor Assignments Policies
CREATE POLICY "Read assignments" ON public.donor_assignments
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin', 'blood_centre')
        OR donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.emergency_requests er
            WHERE er.id = request_id AND er.created_by = auth.uid()
        )
    );

CREATE POLICY "Coordinators manage assignments" ON public.donor_assignments
    FOR ALL USING (public.get_user_role() IN ('coordinator', 'admin'));

-- 10.11 Conversations Policies
CREATE POLICY "Authorized participants read conversations" ON public.conversations
    FOR SELECT USING (
        (requester_id IS NOT NULL AND requester_id = auth.uid())
        OR donor_id IN (SELECT id FROM public.donors WHERE profile_id = auth.uid())
        OR public.get_user_role() IN ('coordinator', 'admin')
    );

CREATE POLICY "Coordinators manage conversations" ON public.conversations
    FOR UPDATE USING (public.get_user_role() IN ('coordinator', 'admin'));

-- 10.12 Conversation Participants Policies
CREATE POLICY "Participants read roster" ON public.conversation_participants
    FOR SELECT USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Coordinators manage participants" ON public.conversation_participants
    FOR INSERT WITH CHECK (public.get_user_role() IN ('coordinator', 'admin'));

CREATE POLICY "Participants update own read status" ON public.conversation_participants
    FOR UPDATE USING (user_id = auth.uid());

-- 10.13 Messages Policies
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

-- 10.14 Message Receipts Policies
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

-- 10.15 Message Attachments Policies
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

-- 10.16 Coordination Events Policies
CREATE POLICY "Participants read coordination events" ON public.coordination_events
    FOR SELECT USING (conversation_id IS NULL OR public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert coordination events" ON public.coordination_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND (conversation_id IS NULL OR public.is_conversation_participant(conversation_id))
    );

-- 10.17 Call Sessions Policies
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

-- 10.18 Call Events Policies
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

-- 10.19 Notifications Policies
CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users acknowledge own notifications" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Coordinators and Admin insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('coordinator', 'admin')
        OR auth.role() = 'service_role'
    );

-- 10.20 Audit Logs Policies
CREATE POLICY "Admin read audit logs" ON public.audit_logs
    FOR SELECT USING (public.get_user_role() = 'admin');

CREATE POLICY "Authenticated users insert attributable audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
        AND (user_id IS NULL OR user_id = auth.uid())
    );

CREATE POLICY "No one can update audit logs" ON public.audit_logs
    FOR UPDATE USING (false);

CREATE POLICY "No one can delete audit logs" ON public.audit_logs
    FOR DELETE USING (false);

-- ============================================================================
-- 11. REALTIME PUBLICATION & PERMISSIONS
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

-- 11.1 Realtime Private Broadcast RLS on realtime.messages
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

        CREATE POLICY "Call participants can listen to call rooms"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
            (realtime.topic() LIKE 'call:%' AND EXISTS (
                SELECT 1 FROM public.call_sessions cs
                WHERE cs.id::text = substring(realtime.topic() from 6)
                  AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
            ))
            OR (realtime.topic() = 'user:' || auth.uid()::text)
            OR (realtime.topic() = 'user-calls:' || auth.uid()::text)
        );

        CREATE POLICY "Call participants can broadcast to call rooms"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            (realtime.topic() LIKE 'call:%' AND EXISTS (
                SELECT 1 FROM public.call_sessions cs
                WHERE cs.id::text = substring(realtime.topic() from 6)
                  AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
            ))
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

-- ============================================================================
-- 12. STORAGE BUCKET CONFIGURATION & RLS
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'message-attachments',
            'message-attachments',
            false,
            10485760,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = 10485760,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        -- Note: RLS is already enabled by default on storage.objects by Supabase.
        -- We define conversation-scoped RLS policies directly via supautils without modifying table ownership.
        DROP POLICY IF EXISTS "Conversation participants can read attachments" ON storage.objects;
        DROP POLICY IF EXISTS "Conversation participants can upload attachments" ON storage.objects;

        CREATE POLICY "Conversation participants can read attachments"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'message-attachments'
            AND (
                (storage.foldername(name))[1] = 'conversations'
                AND public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
            )
        );

        CREATE POLICY "Conversation participants can upload attachments"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'message-attachments'
            AND (
                (storage.foldername(name))[1] = 'conversations'
                AND public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
            )
        );
    END IF;
END $$;

-- ============================================================================
-- 13. EXECUTION PRIVILEGES (LEAST PRIVILEGE) & TABLE PERMISSIONS
-- ============================================================================
GRANT SELECT ON public.discoverable_emergency_requests TO authenticated, anon;

REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, authenticated, anon;

REVOKE UPDATE ON public.call_sessions FROM PUBLIC, authenticated, anon;
GRANT UPDATE ON public.call_sessions TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_emergency_request_transition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_emergency_request_transition() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_message_sender() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_message_sender() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_message_tampering() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_message_tampering() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assign_donor_atomic(UUID, UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_donor_atomic(UUID, UUID, INTEGER, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.discover_matching_donors(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_matching_donors(UUID, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_discoverable_emergency_requests(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discoverable_emergency_requests(TEXT, TEXT) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.validate_audit_log_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_audit_log_actor() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_and_create_conversation(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_ice_credentials(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.initiate_call(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_call(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_call(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_call_connected(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_call_connected(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_call(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_call(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_call(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_call(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_call(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_call(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_call_session_immutability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_call_session_immutability() TO authenticated, service_role;
