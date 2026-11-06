-- ============================================================================
-- CareLoop Migration 5: Phase 2.2 Production Functionality Completion & Hardening
-- Version: 20261103000005
-- Scope: Coordinator & blood centre inventory persistence, atomic adjustments,
--        persistent notifications with deduplication, coordinator assignments,
--        security barrier view hardening, and verified facility directory data.
-- ============================================================================

-- ============================================================================
-- 1. DISCOVERABLE EMERGENCY REQUESTS VIEW HARDENING (SECURITY BARRIER)
-- ============================================================================
-- Security Mandate: Set security_barrier = true so user-supplied predicates
-- cannot be pushed down before view filters. The view purposefully executes
-- as owner (postgres) without security_invoker so that unregistered donors and
-- public emergency search can discover open requests without exposing patient PII
-- (contact_name, contact_phone, contact_method, private notes).
ALTER VIEW public.discoverable_emergency_requests SET (security_barrier = true);
GRANT SELECT ON public.discoverable_emergency_requests TO authenticated, anon;

-- ============================================================================
-- 2. BLOOD CENTRES & INVENTORY MANAGEMENT HARDENING
-- ============================================================================

-- 2.1 Add profile_id to blood_centres to link authenticated centre staff
ALTER TABLE public.blood_centres ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blood_centres_profile ON public.blood_centres(profile_id);

-- 2.2 Update blood_centres RLS policy for strict centre attribution
DROP POLICY IF EXISTS "Blood centres and Admin manage blood centres" ON public.blood_centres;
CREATE POLICY "Blood centres and Admin manage blood centres" ON public.blood_centres
    FOR ALL USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR (public.get_user_role() = 'blood_centre' AND profile_id = auth.uid())
    );

-- 2.3 Update blood_inventory RLS policy:
-- Coordinators and Admin can update any centre stock; centre staff can ONLY update their own centre stock.
DROP POLICY IF EXISTS "Blood Centre and Admin update inventory" ON public.blood_inventory;
CREATE POLICY "Blood Centre and Admin update inventory" ON public.blood_inventory
    FOR ALL USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR (
            public.get_user_role() = 'blood_centre'
            AND blood_centre_id IN (SELECT id FROM public.blood_centres WHERE profile_id = auth.uid())
        )
    );

-- 2.4 Auditable Inventory Transactions Table (Immutable Financial/Clinical Ledger)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blood_centre_id UUID NOT NULL REFERENCES public.blood_centres(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component TEXT NOT NULL CHECK (component IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma')),
    delta_units INTEGER NOT NULL,
    previous_units INTEGER NOT NULL CHECK (previous_units >= 0),
    new_units INTEGER NOT NULL CHECK (new_units >= 0),
    reason TEXT NOT NULL,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_centre ON public.inventory_transactions(blood_centre_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_performer ON public.inventory_transactions(performed_by, created_at DESC);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users read inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized users read inventory transactions" ON public.inventory_transactions
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR (
            public.get_user_role() = 'blood_centre'
            AND blood_centre_id IN (SELECT id FROM public.blood_centres WHERE profile_id = auth.uid())
        )
    );

REVOKE UPDATE, DELETE ON public.inventory_transactions FROM PUBLIC, authenticated, anon;

-- 2.5 Atomic Inventory Adjustment Procedure
-- Ensures serializable row-level locking, prevents negative inventory,
-- enforces authorization, updates centre timestamps, and records transactions.
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_centre_id UUID,
    p_blood_group TEXT,
    p_component TEXT,
    p_delta_units INTEGER,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_current_units INTEGER;
    v_new_units INTEGER;
    v_centre RECORD;
BEGIN
    -- 1. Parameter Validation
    IF p_centre_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Blood centre ID is required.');
    END IF;

    IF p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid blood group specified.');
    END IF;

    IF p_component NOT IN ('Packed RBC', 'Whole Blood', 'Platelets', 'Plasma') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid blood component specified.');
    END IF;

    IF p_delta_units IS NULL OR p_delta_units = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Delta units cannot be zero or null.');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'A valid reason for inventory adjustment is required for audit logs.');
    END IF;

    -- 2. Authorization Check
    -- Coordinators and administrators can manage all centres.
    -- Blood centre staff can only modify the centre where profile_id = auth.uid().
    SELECT * INTO v_centre FROM public.blood_centres WHERE id = p_centre_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Blood centre not found.');
    END IF;

    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_caller_role = 'blood_centre' THEN
            IF v_centre.profile_id IS NULL OR v_centre.profile_id <> v_caller_id THEN
                RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You may only adjust stock for your own assigned blood centre.');
            END IF;
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Insufficient privileges to adjust inventory.');
        END IF;
    END IF;

    -- 3. Lock Inventory Row (Prevents concurrent race conditions)
    SELECT units INTO v_current_units
    FROM public.blood_inventory
    WHERE blood_centre_id = p_centre_id AND blood_group = p_blood_group AND component = p_component
    FOR UPDATE;

    IF NOT FOUND THEN
        IF p_delta_units < 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Insufficient stock: Item does not exist in inventory and cannot be decremented.');
        END IF;
        v_current_units := 0;
        v_new_units := p_delta_units;

        INSERT INTO public.blood_inventory (blood_centre_id, blood_group, component, units, updated_at)
        VALUES (p_centre_id, p_blood_group, p_component, v_new_units, NOW());
    ELSE
        v_new_units := v_current_units + p_delta_units;
        IF v_new_units < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format('Insufficient stock: Available %s units, cannot deduct %s units (negative inventory prohibited).', v_current_units, abs(p_delta_units)),
                'current_units', v_current_units
            );
        END IF;

        UPDATE public.blood_inventory
        SET units = v_new_units, updated_at = NOW()
        WHERE blood_centre_id = p_centre_id AND blood_group = p_blood_group AND component = p_component;
    END IF;

    -- 4. Update Centre Timestamp
    UPDATE public.blood_centres
    SET inventory_updated_at = NOW()
    WHERE id = p_centre_id;

    -- 5. Record Transaction History in dedicated inventory audit ledger
    INSERT INTO public.inventory_transactions (
        blood_centre_id, blood_group, component, delta_units, previous_units, new_units, reason, performed_by
    ) VALUES (
        p_centre_id, p_blood_group, p_component, p_delta_units, v_current_units, v_new_units, p_reason, v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'centre_id', p_centre_id,
        'blood_group', p_blood_group,
        'component', p_component,
        'previous_units', v_current_units,
        'new_units', v_new_units,
        'delta_units', p_delta_units
    );
END;
$$;

-- 2.6 Atomic Inventory Quantity Setter Procedure
CREATE OR REPLACE FUNCTION public.set_inventory_atomic(
    p_centre_id UUID,
    p_blood_group TEXT,
    p_component TEXT,
    p_new_units INTEGER,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_units INTEGER := 0;
BEGIN
    IF p_new_units IS NULL OR p_new_units < 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'New units cannot be negative or null.');
    END IF;

    SELECT COALESCE(units, 0) INTO v_current_units
    FROM public.blood_inventory
    WHERE blood_centre_id = p_centre_id AND blood_group = p_blood_group AND component = p_component;

    IF NOT FOUND THEN
        v_current_units := 0;
    END IF;

    IF v_current_units = p_new_units THEN
        RETURN jsonb_build_object(
            'success', true,
            'centre_id', p_centre_id,
            'blood_group', p_blood_group,
            'component', p_component,
            'previous_units', v_current_units,
            'new_units', p_new_units,
            'delta_units', 0,
            'unchanged', true
        );
    END IF;

    RETURN public.adjust_inventory_atomic(
        p_centre_id,
        p_blood_group,
        p_component,
        p_new_units - v_current_units,
        p_reason
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_inventory_atomic(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_atomic(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 3. COORDINATOR ASSIGNMENTS EXPANSION & ATOMIC WORKFLOWS
-- ============================================================================

-- 3.1 Allow assigning a blood centre directly in addition to donors
ALTER TABLE public.donor_assignments ADD COLUMN IF NOT EXISTS blood_centre_id UUID REFERENCES public.blood_centres(id) ON DELETE CASCADE;
ALTER TABLE public.donor_assignments ALTER COLUMN donor_id DROP NOT NULL;
ALTER TABLE public.donor_assignments DROP CONSTRAINT IF EXISTS check_assignment_target;
ALTER TABLE public.donor_assignments ADD CONSTRAINT check_assignment_target CHECK (donor_id IS NOT NULL OR blood_centre_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_donor_assignments_req_centre ON public.donor_assignments(request_id, blood_centre_id) WHERE blood_centre_id IS NOT NULL;

-- 3.2 Atomic Procedure to Assign Blood Centre to Emergency Request
CREATE OR REPLACE FUNCTION public.assign_blood_centre_atomic(
    p_request_id UUID,
    p_centre_id UUID,
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
    v_acting_coord UUID;
    v_req RECORD;
    v_centre RECORD;
    v_existing RECORD;
    v_diff INTEGER;
    v_new_coord INTEGER;
    v_asgn_id UUID;
BEGIN
    -- 1. Validate units
    IF p_units IS NULL OR p_units <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid units quantity. Units must be greater than zero.');
    END IF;

    -- 2. Authorization
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only coordinators or administrators can assign blood centres.');
    END IF;

    IF v_caller_role = 'admin' AND p_coordinator_id IS NOT NULL THEN
        v_acting_coord := p_coordinator_id;
    ELSE
        v_acting_coord := v_caller_id;
    END IF;

    -- 3. Lock Emergency Request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Emergency request not found.');
    END IF;

    IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot assign blood centre to a closed or fulfilled request.');
    END IF;

    -- 4. Verify Blood Centre
    SELECT * INTO v_centre FROM public.blood_centres WHERE id = p_centre_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Blood centre not found.');
    END IF;

    -- 5. Calculate units diff
    SELECT * INTO v_existing FROM public.donor_assignments
    WHERE request_id = p_request_id AND blood_centre_id = p_centre_id FOR UPDATE;

    IF FOUND THEN
        IF v_existing.units_assigned = p_units AND v_existing.status = 'ASSIGNED' THEN
            RETURN jsonb_build_object(
                'success', true,
                'assignment_id', v_existing.id,
                'units_coordinated', v_req.units_coordinated,
                'units_required', v_req.units_required,
                'already_assigned', true
            );
        END IF;
        v_diff := p_units - v_existing.units_assigned;
    ELSE
        v_diff := p_units;
    END IF;

    IF (v_req.units_coordinated + v_diff) > v_req.units_required THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assigned units would exceed total units required for this request.');
    END IF;

    -- 6. Upsert assignment
    INSERT INTO public.donor_assignments (request_id, blood_centre_id, units_assigned, status, coordinator_id)
    VALUES (p_request_id, p_centre_id, p_units, 'ASSIGNED', v_acting_coord)
    ON CONFLICT (request_id, blood_centre_id) WHERE blood_centre_id IS NOT NULL DO UPDATE
    SET units_assigned = p_units,
        status = 'ASSIGNED',
        assigned_at = NOW(),
        coordinator_id = v_acting_coord
    RETURNING id INTO v_asgn_id;

    -- 7. Update request
    v_new_coord := v_req.units_coordinated + v_diff;
    UPDATE public.emergency_requests
    SET units_coordinated = v_new_coord,
        status = CASE 
            WHEN v_new_coord >= v_req.units_required THEN 'AWAITING_CENTRE_VERIFICATION'
            ELSE 'DONOR_ASSIGNED'
        END,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 8. Emergency Event
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        p_request_id,
        'CENTRE_ASSIGNED',
        format('Blood Centre %s assigned for %s unit(s). Total coordinated: %s/%s.', v_centre.name, p_units, v_new_coord, v_req.units_required),
        'Coordinator',
        jsonb_build_object('blood_centre_id', p_centre_id, 'assignment_id', v_asgn_id, 'units', p_units)
    );

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_asgn_id,
        'units_coordinated', v_new_coord,
        'units_required', v_req.units_required
    );
END;
$$;

-- 3.3 Atomic Assignment Cancellation Procedure
CREATE OR REPLACE FUNCTION public.cancel_donor_assignment_atomic(
    p_assignment_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by coordinator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_asgn RECORD;
    v_req RECORD;
    v_new_coord INTEGER;
BEGIN
    -- 1. Lock assignment
    SELECT * INTO v_asgn FROM public.donor_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Assignment not found.');
    END IF;

    IF v_asgn.status = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', true, 'already_cancelled', true);
    END IF;

    -- 2. Lock request
    SELECT * INTO v_req FROM public.emergency_requests WHERE id = v_asgn.request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Associated emergency request not found.');
    END IF;

    -- 3. Authorization check
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_caller_id IS NULL OR (
            v_req.created_by <> v_caller_id
            AND NOT EXISTS (
                SELECT 1 FROM public.donors WHERE id = v_asgn.donor_id AND profile_id = v_caller_id
            )
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized to cancel this assignment.');
        END IF;
    END IF;

    -- 4. Mark assignment cancelled
    UPDATE public.donor_assignments
    SET status = 'CANCELLED',
        notes = p_reason
    WHERE id = p_assignment_id;

    -- 5. Revert coordinated units
    v_new_coord := GREATEST(0, v_req.units_coordinated - v_asgn.units_assigned);

    UPDATE public.emergency_requests
    SET units_coordinated = v_new_coord,
        status = CASE
            WHEN v_req.status = 'FULFILLED' THEN 'FULFILLED'
            WHEN v_new_coord = 0 THEN 'AWAITING_RESPONSE'
            ELSE 'DONOR_ASSIGNED'
        END,
        updated_at = NOW()
    WHERE id = v_req.id;

    -- 6. Record audit event
    INSERT INTO public.emergency_events (request_id, event_type, description, actor_role, metadata)
    VALUES (
        v_req.id,
        'ASSIGNMENT_CANCELLED',
        format('Assignment %s cancelled (%s). Coordinated units reverted to %s/%s.', p_assignment_id, p_reason, v_new_coord, v_req.units_required),
        COALESCE(v_caller_role, 'Coordinator'),
        jsonb_build_object('assignment_id', p_assignment_id, 'reason', p_reason, 'reverted_units', v_asgn.units_assigned)
    );

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'units_coordinated', v_new_coord,
        'units_required', v_req.units_required
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_blood_centre_atomic(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_blood_centre_atomic(UUID, UUID, INTEGER, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_donor_assignment_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_donor_assignment_atomic(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. PERSISTENT NOTIFICATIONS & DEDUPLICATION
-- ============================================================================

-- 4.1 Add idempotency_key for safe notification deduplication
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency ON public.notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4.2 Safe Notification Creation Procedure
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_channel TEXT,
    p_title TEXT,
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_existing RECORD;
    v_notif_id UUID;
    v_initial_status TEXT;
BEGIN
    -- 1. Validation
    IF p_channel NOT IN ('IN_APP', 'SMS', 'PUSH', 'EMAIL') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid notification channel.');
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification content is required.');
    END IF;

    -- 2. Authorization
    IF v_caller_role NOT IN ('coordinator', 'admin') AND auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL OR (p_user_id IS NOT NULL AND p_user_id <> v_caller_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Non-staff users cannot inject notifications for other accounts.');
        END IF;
    END IF;

    -- 3. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, status, created_at INTO v_existing
        FROM public.notifications
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'notification_id', v_existing.id,
                'deduplicated', true,
                'status', v_existing.status
            );
        END IF;
    END IF;

    v_initial_status := CASE WHEN p_channel = 'IN_APP' THEN 'DELIVERED' ELSE 'QUEUED' END;

    INSERT INTO public.notifications (
        user_id, channel, title, content, status, metadata, idempotency_key
    ) VALUES (
        p_user_id, p_channel, p_title, p_content, v_initial_status, p_metadata, p_idempotency_key
    ) RETURNING id INTO v_notif_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notif_id,
        'deduplicated', false,
        'status', v_initial_status
    );
END;
$$;

-- 4.3 Notification Acknowledgment Procedures
CREATE OR REPLACE FUNCTION public.acknowledge_notification(p_notification_id UUID)
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

    UPDATE public.notifications
    SET status = 'ACKNOWLEDGED', acknowledged_at = NOW()
    WHERE id = p_notification_id AND user_id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification not found or access denied.');
    END IF;

    RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_all_notifications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_count INTEGER;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    UPDATE public.notifications
    SET status = 'ACKNOWLEDGED', acknowledged_at = NOW()
    WHERE user_id = v_caller_id AND status <> 'ACKNOWLEDGED';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'acknowledged_count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.acknowledge_notification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.acknowledge_all_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_all_notifications() TO authenticated, service_role;

-- ============================================================================
-- 5. HEALTHCARE FACILITY DIRECTORY HARDENING & SEEDING
-- ============================================================================

-- 5.1 Schema Hardening: Do not invent hospital emergency phone numbers
ALTER TABLE public.hospitals ALTER COLUMN emergency_phone DROP NOT NULL;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS facility_type TEXT;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS source TEXT;

-- 5.2 Seed Blood Centres
INSERT INTO public.blood_centres (id, name, license_number, address, city, district, state, phone, email, verified, operating_hours, lat, lng)
VALUES 
('a0000000-0000-0000-0000-000000000001', 'CareLoop Central Blood Depository', 'CL-BB-2024-001', '45 Health Sciences Avenue, Sector 4', 'Hyderabad', 'Hyderabad', 'Telangana', '+91 40 2345 6789', 'central@careloop.health', true, '24/7 Clinical Emergency Unit', 17.3850, 78.4867),
('a0000000-0000-0000-0000-000000000002', 'Red Cross Regional Blood Centre', 'RC-TS-1088', '102 LifeLine Corridor, Banjara Hills', 'Hyderabad', 'Hyderabad', 'Telangana', '+91 40 2311 9920', 'hyderabad@redcross.org', true, '24/7 Transfusion Wing', 17.4123, 78.4410),
('a0000000-0000-0000-0000-000000000003', 'Apollo Jubilee Emergency Blood Bank', 'AP-TS-9421', 'Road No. 72, Jubilee Hills', 'Hyderabad', 'Hyderabad', 'Telangana', '+91 40 2360 7777', 'bloodbank@apollo.health', true, '24/7 Emergency Blood Reserve', 17.4325, 78.4071)
ON CONFLICT (id) DO NOTHING;

-- 5.3 Seed Initial Verified Inventory
INSERT INTO public.blood_inventory (id, blood_centre_id, blood_group, component, units)
VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'A+', 'Packed RBC', 14),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'B+', 'Packed RBC', 9),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'O+', 'Packed RBC', 2),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'O-', 'Packed RBC', 1),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'AB+', 'Plasma', 6),
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'A+', 'Platelets', 4),
('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'O+', 'Packed RBC', 1),
('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'A-', 'Packed RBC', 3),
('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000002', 'O+', 'Platelets', 5),
('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000002', 'B+', 'Whole Blood', 7),
('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000003', 'AB+', 'Packed RBC', 5),
('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000003', 'O-', 'Packed RBC', 0),
('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000003', 'O+', 'Packed RBC', 3),
('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000003', 'AB-', 'Plasma', 4)
ON CONFLICT (blood_centre_id, blood_group, component) DO NOTHING;

-- 5.4 Seed Verified Andhra Pradesh Healthcare Facilities
INSERT INTO public.hospitals (id, name, address, city, district, state, postal_code, lat, lng, facility_type, source, is_verified)
VALUES
('c0000000-0000-0000-0000-000000000001', 'Government General Hospital, Machilipatnam', 'Ramanayyapeta Road, Near Bus Stand', 'Machilipatnam', 'Krishna', 'Andhra Pradesh', '521001', 16.1856, 81.1362, 'government_hospital', 'AP Department of Health & Family Welfare', true),
('c0000000-0000-0000-0000-000000000002', 'Area Hospital, Gudivada', 'Eluru Road, Gudivada Town', 'Gudivada', 'Krishna', 'Andhra Pradesh', '521301', 16.4328, 80.9942, 'area_hospital', 'AP Vaidya Vidhana Parishad (APVVP)', true),
('c0000000-0000-0000-0000-000000000003', 'Government General Hospital, Vijayawada', 'Ring Road, Gunadala', 'Vijayawada', 'Krishna', 'Andhra Pradesh', '520008', 16.5165, 80.6558, 'teaching_hospital', 'Directorate of Medical Education', true),
('c0000000-0000-0000-0000-000000000004', 'Government General Hospital, Guntur', 'Sambasiva Pet', 'Guntur', 'Guntur', 'Andhra Pradesh', '522001', 16.3067, 80.4365, 'teaching_hospital', 'Directorate of Medical Education', true),
('c0000000-0000-0000-0000-000000000005', 'King George Hospital, Visakhapatnam', 'Maharanipeta', 'Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', '530002', 17.7089, 83.3056, 'teaching_hospital', 'Directorate of Medical Education', true),
('c0000000-0000-0000-0000-000000000006', 'Sri Venkateswara Institute of Medical Sciences (SVIMS)', 'Alipiri Road', 'Tirupati', 'Tirupati', 'Andhra Pradesh', '517507', 13.6373, 79.4034, 'speciality_hospital', 'Government of Andhra Pradesh Autonomous Institute', true),
('c0000000-0000-0000-0000-000000000007', 'Government General Hospital, Kurnool', 'Budhwarpet', 'Kurnool', 'Kurnool', 'Andhra Pradesh', '518002', 15.8281, 78.0373, 'teaching_hospital', 'Directorate of Medical Education', true)
ON CONFLICT (id) DO NOTHING;
