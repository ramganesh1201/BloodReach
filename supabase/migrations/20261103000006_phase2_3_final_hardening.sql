-- ============================================================================
-- CARELOOP SCHEMA MIGRATION 6: PHASE 2.3 FINAL INDEPENDENT HARDENING
-- ============================================================================
-- 1. Ephemeral TURN / ICE Credentials Generator with RFC 5766 HMAC-SHA1 expiration
-- 2. Strict Privilege Revocation on inventory tables (no direct PostgREST mutations)
-- 3. Multi-Member Blood Centre Memberships with roles and status tracking
-- 4. Notification Delivery Lifecycle separation (PENDING vs DELIVERED for external channels)
-- ============================================================================

-- ============================================================================
-- 1. TURN SECURITY & EPHEMERAL CREDENTIALS GENERATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.issue_ice_credentials(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_call RECORD;
    v_user_id UUID := auth.uid();
    v_ice_servers JSONB;
    v_turn_secret TEXT;
    v_turn_url TEXT;
    v_ttl_seconds INT := 600; -- 10 minute ephemeral window
    v_expiry_epoch BIGINT;
    v_turn_username TEXT;
    v_turn_credential TEXT;
    v_turn_configured BOOLEAN := false;
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

    -- Base STUN configuration
    v_ice_servers := jsonb_build_array(
        jsonb_build_object('urls', 'stun:stun.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun1.l.google.com:19302'),
        jsonb_build_object('urls', 'stun:stun2.l.google.com:19302')
    );

    -- Check if TURN shared secret is configured in app_settings table or PostgreSQL database settings
    SELECT value INTO v_turn_secret FROM public.app_settings WHERE key = 'turn_shared_secret';
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

    IF v_turn_secret IS NOT NULL AND v_turn_secret <> '' THEN
        IF v_turn_url IS NULL OR v_turn_url = '' THEN
            v_turn_url := 'turn:turn.careloop.org:3478?transport=udp';
        END IF;

        v_expiry_epoch := (extract(epoch from now())::bigint) + v_ttl_seconds;
        v_turn_username := format('%s:%s', v_expiry_epoch, v_user_id);
        v_turn_credential := encode(extensions.hmac(v_turn_username::bytea, v_turn_secret::bytea, 'sha1'), 'base64');
        v_turn_configured := true;

        -- Append ephemeral TURN server to ICE servers array
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
        'ice_servers', v_ice_servers,
        'call_id', p_call_id,
        'turn_configured', v_turn_configured,
        'expires_at', CASE WHEN v_turn_configured THEN to_timestamp(v_expiry_epoch) ELSE NULL END,
        'note', CASE 
            WHEN v_turn_configured THEN 'Ephemeral TURN relay credentials generated successfully (10-minute TTL).'
            ELSE 'STUN-only mode; TURN relay server not configured. NAT firewall traversal relies on direct STUN or fallback phone dialer.'
        END
    );
END;
$$;

-- Dedicated RPC for generating ephemeral TURN credentials
CREATE OR REPLACE FUNCTION public.get_ephemeral_turn_credentials(p_ttl_seconds INT DEFAULT 600)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_turn_secret TEXT;
    v_turn_url TEXT;
    v_expiry_epoch BIGINT;
    v_turn_username TEXT;
    v_turn_credential TEXT;
    v_ttl INT := COALESCE(p_ttl_seconds, 600);
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    -- Bound TTL between 60 seconds and 3600 seconds (1 hour)
    IF v_ttl < 60 THEN v_ttl := 60; END IF;
    IF v_ttl > 3600 THEN v_ttl := 3600; END IF;

    SELECT value INTO v_turn_secret FROM public.app_settings WHERE key = 'turn_shared_secret';
    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        v_turn_secret := current_setting('app.settings.turn_shared_secret', true);
    END IF;

    SELECT value INTO v_turn_url FROM public.app_settings WHERE key = 'turn_server_url';
    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := current_setting('app.settings.turn_server_url', true);
    END IF;

    IF v_turn_secret IS NULL OR v_turn_secret = '' THEN
        RETURN jsonb_build_object(
            'success', true,
            'turn_configured', false,
            'ice_servers', jsonb_build_array(
                jsonb_build_object('urls', 'stun:stun.l.google.com:19302')
            ),
            'message', 'TURN server not configured on backend. STUN fallback returned.'
        );
    END IF;

    IF v_turn_url IS NULL OR v_turn_url = '' THEN
        v_turn_url := 'turn:turn.careloop.org:3478?transport=udp';
    END IF;

    v_expiry_epoch := (extract(epoch from now())::bigint) + v_ttl;
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

REVOKE EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ephemeral_turn_credentials(INT) TO authenticated;

-- ============================================================================
-- 2. INVENTORY SECURITY & PRIVILEGE HARDENING
-- ============================================================================

-- Explicitly revoke direct mutation privileges on inventory tables from client roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.blood_inventory FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.blood_inventory TO authenticated, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory_transactions FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.inventory_transactions TO authenticated;

-- ============================================================================
-- 3. BLOOD CENTRE MULTI-MEMBER STAFF MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blood_centre_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centre_id UUID NOT NULL REFERENCES public.blood_centres(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('manager', 'technician', 'staff')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (centre_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_centre_memberships_user ON public.blood_centre_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_centre_memberships_centre ON public.blood_centre_memberships(centre_id, status);

ALTER TABLE public.blood_centre_memberships ENABLE ROW LEVEL SECURITY;

-- Backfill existing single-user blood_centres.profile_id as active managers
INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
SELECT id, profile_id, 'manager', 'active'
FROM public.blood_centres
WHERE profile_id IS NOT NULL
ON CONFLICT (centre_id, user_id) DO NOTHING;

-- Membership helper function supporting both legacy profile_id and membership table
CREATE OR REPLACE FUNCTION public.is_centre_member(
    p_centre_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blood_centre_memberships
        WHERE centre_id = p_centre_id
          AND user_id = p_user_id
          AND status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.blood_centres
        WHERE id = p_centre_id
          AND profile_id = p_user_id
    );
$$;

-- RLS policies for memberships
DROP POLICY IF EXISTS "Members and admins read centre memberships" ON public.blood_centre_memberships;
CREATE POLICY "Members and admins read centre memberships" ON public.blood_centre_memberships
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR user_id = auth.uid()
        OR centre_id IN (
            SELECT centre_id FROM public.blood_centre_memberships WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS "Centre managers and admins modify memberships" ON public.blood_centre_memberships;
CREATE POLICY "Centre managers and admins modify memberships" ON public.blood_centre_memberships
    FOR ALL USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = blood_centre_memberships.centre_id
              AND user_id = auth.uid()
              AND role = 'manager'
              AND status = 'active'
        )
    );

-- Procedure to add or update centre staff member
CREATE OR REPLACE FUNCTION public.add_centre_member_atomic(
    p_centre_id UUID,
    p_user_id UUID,
    p_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := public.get_user_role();
    v_mem_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
    END IF;

    IF p_role NOT IN ('manager', 'technician', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid membership role.');
    END IF;

    -- Caller must be admin, coordinator, or an active manager of the target centre
    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.blood_centre_memberships
            WHERE centre_id = p_centre_id AND user_id = v_caller_id AND role = 'manager' AND status = 'active'
        ) AND NOT EXISTS (
            SELECT 1 FROM public.blood_centres
            WHERE id = p_centre_id AND profile_id = v_caller_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only centre managers, coordinators, or admins can manage staff.');
        END IF;
    END IF;

    INSERT INTO public.blood_centre_memberships (centre_id, user_id, role, status)
    VALUES (p_centre_id, p_user_id, p_role, 'active')
    ON CONFLICT (centre_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()
    RETURNING id INTO v_mem_id;

    RETURN jsonb_build_object('success', true, 'membership_id', v_mem_id, 'centre_id', p_centre_id, 'user_id', p_user_id, 'role', p_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_centre_member_atomic(UUID, UUID, TEXT) TO authenticated;

-- Update adjust_inventory_atomic to check is_centre_member
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

    -- 2. Authorization Check (Supports multi-member blood centres)
    SELECT * INTO v_centre FROM public.blood_centres WHERE id = p_centre_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Blood centre not found.');
    END IF;

    IF v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF v_caller_role = 'blood_centre' THEN
            IF NOT public.is_centre_member(p_centre_id, v_caller_id) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You may only adjust stock for your own assigned blood centre.');
            END IF;
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Insufficient privileges to adjust inventory.');
        END IF;
    END IF;

    -- 3. Lock Inventory Row (Prevents concurrent race conditions)
    SELECT units INTO v_current_units
    FROM public.blood_inventory
    WHERE blood_centre_id = p_centre_id
      AND blood_group = p_blood_group
      AND component = p_component
    FOR UPDATE;

    IF NOT FOUND THEN
        IF p_delta_units < 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Insufficient stock: Item does not exist in inventory and cannot be decremented.');
        END IF;

        v_current_units := 0;
        v_new_units := p_delta_units;

        INSERT INTO public.blood_inventory (
            blood_centre_id, blood_group, component, units, updated_at
        )
        VALUES (
            p_centre_id, p_blood_group, p_component, v_new_units, NOW()
        );
    ELSE
        v_new_units := v_current_units + p_delta_units;
        IF v_new_units < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format('Insufficient stock: Available %s units, cannot deduct %s units (negative inventory prohibited).', v_current_units, ABS(p_delta_units))
            );
        END IF;

        UPDATE public.blood_inventory
        SET units = v_new_units,
            updated_at = NOW()
        WHERE blood_centre_id = p_centre_id
          AND blood_group = p_blood_group
          AND component = p_component;
    END IF;

    -- 4. Update centre freshness timestamp
    UPDATE public.blood_centres
    SET inventory_updated_at = NOW()
    WHERE id = p_centre_id;

    -- 5. Record Transaction in Immutable Ledger
    INSERT INTO public.inventory_transactions (
        blood_centre_id, blood_group, component, delta_units, previous_units, new_units, reason, performed_by
    )
    VALUES (
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

-- Update RLS policy on inventory_transactions for multi-member support
DROP POLICY IF EXISTS "Authorized users read inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized users read inventory transactions" ON public.inventory_transactions
    FOR SELECT USING (
        public.get_user_role() IN ('coordinator', 'admin')
        OR (
            public.get_user_role() = 'blood_centre'
            AND public.is_centre_member(blood_centre_id, auth.uid())
        )
    );

-- ============================================================================
-- 4. NOTIFICATION DELIVERY LIFECYCLE SEPARATION
-- ============================================================================

-- Expand status check constraint to support PENDING, ATTEMPTED, DELIVERED, FAILED
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_status_check
    CHECK (status = ANY (ARRAY['PENDING'::text, 'QUEUED'::text, 'ATTEMPTED'::text, 'SENT'::text, 'DELIVERED'::text, 'FAILED'::text, 'ACKNOWLEDGED'::text]));

-- Update create_notification: In-app is DELIVERED, external channels are PENDING
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
    v_existing_id UUID;
    v_existing_status TEXT;
    v_notif_id UUID;
    v_initial_status TEXT;
BEGIN
    IF p_channel NOT IN ('IN_APP', 'SMS', 'PUSH', 'EMAIL') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid notification channel.');
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification content is required.');
    END IF;

    IF v_caller_id IS NOT NULL AND v_caller_role NOT IN ('coordinator', 'admin') THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Non-staff users cannot inject notifications for other accounts.');
        END IF;
    END IF;

    -- In-app notifications are immediately visible in-app (DELIVERED).
    -- External channels (SMS, PUSH, EMAIL) require transport dispatch (PENDING).
    IF p_channel = 'IN_APP' THEN
        v_initial_status := 'DELIVERED';
    ELSE
        v_initial_status := 'PENDING';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM public.notifications
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'notification_id', v_existing_id,
                'status', v_existing_status,
                'deduplicated', true
            );
        END IF;
    END IF;

    INSERT INTO public.notifications (
        user_id, channel, title, content, metadata, idempotency_key, status
    )
    VALUES (
        p_user_id, p_channel, p_title, p_content, p_metadata, p_idempotency_key, v_initial_status
    )
    RETURNING id INTO v_notif_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notif_id,
        'status', v_initial_status,
        'deduplicated', false
    );
END;
$$;

-- Procedure to advance delivery status (PENDING -> ATTEMPTED -> DELIVERED / FAILED)
CREATE OR REPLACE FUNCTION public.update_notification_delivery_status(
    p_notification_id UUID,
    p_status TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT := public.get_user_role();
    v_notif RECORD;
BEGIN
    IF v_caller_role NOT IN ('coordinator', 'admin') AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Only system dispatcher or coordinators can update delivery status.');
    END IF;

    IF p_status NOT IN ('PENDING', 'QUEUED', 'ATTEMPTED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid notification status.');
    END IF;

    SELECT * INTO v_notif FROM public.notifications WHERE id = p_notification_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification not found.');
    END IF;

    UPDATE public.notifications
    SET status = p_status,
        metadata = CASE 
            WHEN p_error IS NOT NULL THEN jsonb_set(metadata, '{delivery_error}', to_jsonb(p_error))
            ELSE metadata
        END
    WHERE id = p_notification_id;

    RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status(UUID, TEXT, TEXT) TO authenticated;
