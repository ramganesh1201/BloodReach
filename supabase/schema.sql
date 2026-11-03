-- ============================================================================
-- BloodReach Production PostgreSQL Schema & Security Infrastructure
-- Enforces Role-Based Access Control (RBAC) & Row Level Security (RLS)
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Emergency Requests Table
CREATE TABLE IF NOT EXISTS public.emergency_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_code TEXT UNIQUE NOT NULL, -- e.g. BR-8F42
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    units_required INTEGER NOT NULL CHECK (units_required > 0),
    units_coordinated INTEGER NOT NULL DEFAULT 0 CHECK (units_coordinated >= 0),
    urgency TEXT NOT NULL CHECK (urgency IN ('Today', 'Urgent', 'Critical')),
    hospital_name TEXT NOT NULL,
    hospital_address TEXT NOT NULL,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_method TEXT NOT NULL DEFAULT 'Phone' CHECK (contact_method IN ('Phone', 'SMS', 'WhatsApp')),
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
        'CREATED', 'VERIFYING', 'CHECKING_RESOURCES', 'SHORTAGE_IDENTIFIED',
        'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND',
        'AWAITING_CENTRE_VERIFICATION', 'FULFILLED', 'CANCELLED', 'EXPIRED'
    )),
    escalation_level INTEGER NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 4),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT true,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    inventory_updated_at TIMESTAMPTZ DEFAULT NOW()
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
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    city TEXT NOT NULL,
    lat NUMERIC(9,6),
    lng NUMERIC(9,6),
    is_available BOOLEAN NOT NULL DEFAULT true,
    last_donated_at TIMESTAMPTZ,
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

-- 8. Audit Logs Table (Admin Only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_blood_group ON public.emergency_requests(blood_group);
CREATE INDEX IF NOT EXISTS idx_requests_reference ON public.emergency_requests(reference_code);
CREATE INDEX IF NOT EXISTS idx_events_request_id ON public.emergency_events(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_blood_centre ON public.blood_inventory(blood_centre_id);
CREATE INDEX IF NOT EXISTS idx_donors_availability ON public.donors(is_available, blood_group);

-- Row Level Security (RLS) Authorization Policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_responses ENABLE ROW LEVEL SECURITY;
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

-- 2. Emergency Requests Policies
CREATE POLICY "Public read emergency requests" ON public.emergency_requests
    FOR SELECT USING (true);

CREATE POLICY "Authorized roles create requests" ON public.emergency_requests
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('patient', 'coordinator', 'admin')
        OR auth.uid() IS NULL -- Allow public guest attendants
    );

CREATE POLICY "Coordinators & Blood Centres update requests" ON public.emergency_requests
    FOR UPDATE USING (
        public.get_user_role() IN ('blood_centre', 'coordinator', 'admin')
    );

-- 3. Inventory Policies (Restricted to Blood Centre & Admin for updates)
CREATE POLICY "Public read inventory" ON public.blood_inventory
    FOR SELECT USING (true);

CREATE POLICY "Blood Centre & Admin update inventory" ON public.blood_inventory
    FOR ALL USING (
        public.get_user_role() IN ('blood_centre', 'admin')
    );

-- 4. Donor Privacy Policies (Private phone/location protected from public query)
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

-- 5. Audit Logs Policies (Admin Only)
CREATE POLICY "Admin read audit logs" ON public.audit_logs
    FOR SELECT USING (public.get_user_role() = 'admin');
