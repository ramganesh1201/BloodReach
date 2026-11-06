-- ============================================================================
-- CareLoop Migration 1: Core Database Schema & Hardened Security Infrastructure
-- Version: 20261103000001
-- Security Remediation: Strict default roles, privilege escalation prevention,
--                      donor/patient PII protection, idempotent assignments,
--                      immutable audit trails, and least-privilege RLS.
-- ============================================================================

-- 1. Enable Cryptographic & UUID Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CORE ENTITY TABLES
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

-- 2.2 Verified Healthcare Facilities & Hospitals
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

-- 2.3 Blood Centres Table
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

-- 2.4 Blood Inventory Table
CREATE TABLE IF NOT EXISTS public.blood_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blood_centre_id UUID NOT NULL REFERENCES public.blood_centres(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(blood_centre_id, blood_group, component)
);

-- 2.5 Donors Table
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

-- 2.6 Emergency Requests Table
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

-- 2.7 Emergency Events Table (Immutable Audit Event Log)
CREATE TABLE IF NOT EXISTS public.emergency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8 Donor Responses Table
CREATE TABLE IF NOT EXISTS public.donor_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    response_status TEXT NOT NULL CHECK (response_status IN ('NOTIFIED', 'ACCEPTED', 'DECLINED')),
    response_channel TEXT NOT NULL DEFAULT 'WEB' CHECK (response_channel IN ('WEB', 'SMS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(request_id, donor_id)
);

-- 2.9 Donor Assignments Table
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

-- 2.10 Audit Logs Table (Admin Governance)
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
-- 3. CORE INDEXES FOR HIGH-THROUGHPUT PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);

-- ============================================================================
-- 4. SECURITY DEFINER HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- 4.1 Safe Role Resolution (Handles NULL / Unauthenticated Callers Safely)
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

-- 4.2 Auto-create Profile on Auth Signup
-- SECURITY MANDATE: Public registration ALWAYS defaults strictly to 'patient'.
-- Client-supplied raw_user_meta_data can NEVER assign 'admin', 'coordinator', or 'blood_centre'.
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

    -- Strictly assign 'patient'. Privileged roles require administrative promotion.
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

-- 4.3 Prevent Profile Privilege Escalation Trigger
-- SECURITY MANDATE: Users cannot modify their own role, status, or identity.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        -- If caller is not admin, disallow changes to role, status, or id
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

-- 4.3b Lifecycle & Status Transition Integrity Trigger
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

-- 4.4 Admin Role Management RPC (Trusted Administrative Role Modification)
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

    -- Audit trail
    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (auth.uid(), 'ROLE_CHANGE', 'profiles', p_user_id::text, jsonb_build_object('new_role', p_new_role));

    RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'new_role', p_new_role);
END;
$$;

-- 4.5 Atomic Donor Assignment Stored Procedure
-- SECURITY MANDATE: Rejects non-positive units, row-locks requests and donors,
--                   prevents double-counting existing assignments, and enforces authorization.
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

-- 4.6 Privacy-Preserving Donor Discovery RPC
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

-- 4.7 Discoverable Emergency Requests View (Privacy-Preserving Projection)
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

-- 4.8 Discoverable Emergency Requests RPC
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

-- 4.9 Audit Log Integrity Trigger
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

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 Profiles Policies
-- Users read own profile; coordinators and admins read all;
-- Verified conversation participants read each other's profile.
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

-- 5.2 Hospitals Policies (Public Directory, Admin Managed)
CREATE POLICY "Public read hospitals" ON public.hospitals
    FOR SELECT USING (true);

CREATE POLICY "Coordinators and Admin manage hospitals" ON public.hospitals
    FOR ALL USING (public.get_user_role() IN ('coordinator', 'admin'));

-- 5.3 Blood Centres Policies
CREATE POLICY "Public read blood centres" ON public.blood_centres
    FOR SELECT USING (true);

CREATE POLICY "Blood centres and Admin manage blood centres" ON public.blood_centres
    FOR ALL USING (public.get_user_role() IN ('blood_centre', 'coordinator', 'admin'));

-- 5.4 Blood Inventory Policies
CREATE POLICY "Public read inventory" ON public.blood_inventory
    FOR SELECT USING (true);

CREATE POLICY "Blood Centre and Admin update inventory" ON public.blood_inventory
    FOR ALL USING (public.get_user_role() IN ('blood_centre', 'admin'));

-- 5.5 Donor Privacy Policies
-- SECURITY MANDATE: Direct SELECT from donors is strictly restricted.
-- Sensitive donor PII (phone, email, birth date, weight, coordinates) is NEVER exposed to public!
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

-- 5.6 Emergency Requests Policies
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
        OR auth.uid() IS NULL -- Guest emergency request submission permitted
    );

CREATE POLICY "Coordinators and Creator update requests" ON public.emergency_requests
    FOR UPDATE USING (
        public.get_user_role() IN ('blood_centre', 'coordinator', 'admin')
        OR created_by = auth.uid()
    );

-- 5.7 Emergency Events Policies (Immutable Audit Trail)
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

-- 5.8 Donor Responses Policies
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

-- 5.9 Donor Assignments Policies
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

-- 5.10 Audit Logs Policies (Admin Governance)
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
-- 6. LEAST-PRIVILEGE FUNCTION PERMISSIONS & GRANTS
-- ============================================================================
GRANT SELECT ON public.discoverable_emergency_requests TO authenticated, anon;

REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, authenticated, anon;

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

REVOKE EXECUTE ON FUNCTION public.assign_donor_atomic(UUID, UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_donor_atomic(UUID, UUID, INTEGER, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.discover_matching_donors(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_matching_donors(UUID, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_discoverable_emergency_requests(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discoverable_emergency_requests(TEXT, TEXT) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.validate_audit_log_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_audit_log_actor() TO authenticated, service_role;
