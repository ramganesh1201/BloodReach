-- ============================================================================
-- CareLoop Migration 18: Clinical Donor Matching, NBTC 2023 Validation,
--                       Recipient-Isolated Notification Triggers & First-Admin Bootstrap
-- Version: 20261108190000
-- 
-- DESCRIPTION:
-- 1. Enforces NBTC 2023 donor validation constraints (age 18-65, weight >= 45kg).
-- 2. Implements secure first-admin bootstrap procedure locked permanently once
--    an administrator account exists.
-- 3. Implements comprehensive component-specific clinical compatibility matching
--    in the emergency request trigger, fully aligned with matchingEngine.ts:
--    - Whole Blood: exact match standard
--    - Packed RBC: universal red-cell rules (O- universal donor)
--    - Fresh Frozen Plasma: reversed antibody rules (AB universal donor)
--    - Platelets: component-compatible donor rules
--    - Medical clearance & active deferral enforcement
--    - NBTC 2023 donation interval (90d male, 120d female, 14d platelets)
--    - Geographic scope matching (district/city)
-- 4. Ensures strict user isolation: notifications are addressed directly to
--    user_id and guarded by existing RLS ("Users read own notifications").
-- ============================================================================

SET search_path = public, pg_temp;

-- ============================================================================
-- 1. DONOR TABLE CLINICAL CONSTRAINTS & COLUMNS (NBTC 2023)
-- ============================================================================
DO $$
BEGIN
    -- Ensure gender, age, and availability_state columns exist on public.donors
    ALTER TABLE public.donors
        ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
        ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age IS NULL OR (age >= 18 AND age <= 65)),
        ADD COLUMN IF NOT EXISTS availability_state TEXT DEFAULT 'AVAILABLE' CHECK (availability_state IN ('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'NOT_ACCEPTING'));

    -- Ensure age constraint is enforced on public.donors
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.donors'::regclass
          AND conname = 'chk_donors_nbtc_age'
    ) THEN
        ALTER TABLE public.donors
            ADD CONSTRAINT chk_donors_nbtc_age
            CHECK (age IS NULL OR (age >= 18 AND age <= 65));
    END IF;

    -- Ensure weight is >= 45 kg if present
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.donors'::regclass
          AND conname = 'chk_donors_nbtc_weight'
    ) THEN
        ALTER TABLE public.donors
            ADD CONSTRAINT chk_donors_nbtc_weight
            CHECK (weight_kg IS NULL OR weight_kg >= 45.0);
    END IF;

    -- Ensure is_medically_cleared defaults to FALSE
    ALTER TABLE public.donors
        ALTER COLUMN is_medically_cleared SET DEFAULT false;
END $$;


-- ============================================================================
-- 2. SECURE FIRST-ADMIN BOOTSTRAP STORED PROCEDURE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_count INTEGER;
BEGIN
    -- 1. Concurrency Guard: Serialize concurrent bootstrap invocations with transaction advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('careloop_bootstrap_first_admin'));

    -- 2. Authentication Context: Caller can only bootstrap their own authenticated account
    IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Unauthorized: Caller can only bootstrap their own authenticated account.'
        );
    END IF;

    -- 3. Security Gate: Verify ZERO administrators currently exist across the entire system
    SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';
    IF v_admin_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bootstrap locked: System administrator account already provisioned.'
        );
    END IF;

    -- 4. Verify target user profile exists (registered via standard Supabase Auth)
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Target user profile not found. User must register before bootstrap.'
        );
    END IF;

    -- 5. Elevate initial user to admin role
    UPDATE public.profiles
    SET role = 'admin', updated_at = NOW()
    WHERE id = p_user_id;

    -- 6. Record immutable audit entry
    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (p_user_id, 'FIRST_ADMIN_BOOTSTRAP', 'profiles', p_user_id::text, jsonb_build_object('bootstrapped_at', NOW()));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'First administrator successfully provisioned. Bootstrap procedure is now permanently locked.',
        'admin_user_id', p_user_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(UUID) TO authenticated;


-- ============================================================================
-- 3. TRIGGER FUNCTION: DONOR ONBOARDING -> NOTIFY COORDINATORS & ADMINS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.on_donor_onboarding_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_rec RECORD;
BEGIN
    -- Notify authorized coordinators and administrators of new volunteer application
    FOR v_admin_rec IN
        SELECT id FROM public.profiles
        WHERE role IN ('coordinator', 'admin')
    LOOP
        INSERT INTO public.notifications (
            user_id,
            channel,
            title,
            content,
            status,
            metadata
        ) VALUES (
            v_admin_rec.id,
            'IN_APP',
            'New Volunteer Donor Registration',
            'Volunteer donor application received from ' || NEW.full_name || ' (' || NEW.blood_group || ', ' || COALESCE(NEW.city, 'Unspecified') || '). Clinical verification and role activation required.',
            'QUEUED',
            jsonb_build_object(
                'donor_id', NEW.id,
                'profile_id', NEW.profile_id,
                'blood_group', NEW.blood_group,
                'city', NEW.city,
                'role', 'coordinator'
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;


-- ============================================================================
-- 4. TRIGGER FUNCTION: EMERGENCY REQUEST CREATED -> NOTIFY COMPATIBLE DONORS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.on_emergency_request_created_notify_donors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_donor_rec RECORD;
BEGIN
    -- Query donors adhering strictly to clinical rules:
    -- 1. Profile linked, active, and available
    -- 2. Medically cleared and not under active deferral
    -- 3. Body weight >= 45 kg and age 18-65
    -- 4. NBTC 2023 donation interval satisfied (Whole Blood: 90d male / 120d female; Platelets: 14d)
    -- 5. Geographic scope: matching district or city
    -- 6. Component-specific ABO/Rh compatibility matching matchingEngine.ts
    FOR v_donor_rec IN
        SELECT d.id, d.profile_id, d.full_name, d.blood_group
        FROM public.donors d
        WHERE d.profile_id IS NOT NULL
          AND d.is_available = true
          AND (d.availability_state IS NULL OR d.availability_state = 'AVAILABLE')
          AND d.is_medically_cleared = true
          AND (d.deferral_until IS NULL OR d.deferral_until <= NOW())
          -- Clinical safety: weight >= 45 kg
          AND (d.weight_kg IS NULL OR d.weight_kg >= 45.0)
          -- Clinical safety: age 18-65
          AND (d.birth_date IS NULL OR (EXTRACT(YEAR FROM AGE(NOW(), d.birth_date)) >= 18 AND EXTRACT(YEAR FROM AGE(NOW(), d.birth_date)) <= 65))
          -- NBTC 2023 Donation intervals:
          AND (
              d.last_donated_at IS NULL
              OR (
                  NEW.component = 'Platelets' AND d.last_donated_at <= (NOW() - INTERVAL '14 days')
              )
              OR (
                  NEW.component IN ('Whole Blood', 'Packed RBC', 'Plasma') AND (
                      (d.gender = 'female' AND d.last_donated_at <= (NOW() - INTERVAL '120 days'))
                      OR (d.gender = 'male' AND d.last_donated_at <= (NOW() - INTERVAL '90 days'))
                      OR (COALESCE(d.gender, '') NOT IN ('male', 'female') AND d.last_donated_at <= (NOW() - INTERVAL '120 days'))
                  )
              )
          )
          -- Geographic proximity: matching district or city
          AND (
              d.district IS NULL
              OR NEW.district IS NULL
              OR LOWER(TRIM(d.district)) = LOWER(TRIM(NEW.district))
              OR LOWER(TRIM(d.city)) = LOWER(TRIM(NEW.city))
          )
          -- Component-Specific Clinical Compatibility (mirrors matchingEngine.ts):
          AND (
              -- Case A: Whole Blood requires exact ABO/Rh match
              (NEW.component = 'Whole Blood' AND d.blood_group = NEW.blood_group)

              -- Case B: Packed Red Blood Cells (RBC)
              OR (NEW.component = 'Packed RBC' AND (
                  d.blood_group = 'O-'
                  OR NEW.blood_group = 'AB+'
                  OR d.blood_group = NEW.blood_group
                  OR (d.blood_group = 'O+' AND NEW.blood_group IN ('A+', 'B+', 'AB+'))
                  OR (d.blood_group = 'A-' AND NEW.blood_group IN ('A+', 'AB-', 'AB+'))
                  OR (d.blood_group = 'A+' AND NEW.blood_group = 'AB+')
                  OR (d.blood_group = 'B-' AND NEW.blood_group IN ('B+', 'AB-', 'AB+'))
                  OR (d.blood_group = 'B+' AND NEW.blood_group = 'AB+')
                  OR (d.blood_group = 'AB-' AND NEW.blood_group = 'AB+')
              ))

              -- Case C: Fresh Frozen Plasma (FFP - reversed: AB is universal donor; O can only receive O)
              OR (NEW.component = 'Plasma' AND (
                  d.blood_group IN ('AB+', 'AB-')
                  OR d.blood_group = NEW.blood_group
                  OR (NEW.blood_group IN ('O+', 'O-') AND d.blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
                  OR (NEW.blood_group IN ('A+', 'A-') AND d.blood_group IN ('A+', 'A-', 'AB+', 'AB-'))
                  OR (NEW.blood_group IN ('B+', 'B-') AND d.blood_group IN ('B+', 'B-', 'AB+', 'AB-'))
              ))

              -- Case D: Platelets
              OR (NEW.component = 'Platelets' AND (
                  d.blood_group = NEW.blood_group
                  OR (NEW.blood_group = 'O-' AND d.blood_group IN ('O+', 'A-', 'B-', 'AB-'))
                  OR (NEW.blood_group = 'O+' AND d.blood_group IN ('O-', 'A+', 'B+', 'AB+'))
                  OR (NEW.blood_group = 'A-' AND d.blood_group IN ('A+', 'AB-', 'O-'))
                  OR (NEW.blood_group = 'A+' AND d.blood_group IN ('A-', 'AB+', 'O+'))
                  OR (NEW.blood_group = 'B-' AND d.blood_group IN ('B+', 'AB-', 'O-'))
                  OR (NEW.blood_group = 'B+' AND d.blood_group IN ('B-', 'AB+', 'O+'))
                  OR (NEW.blood_group = 'AB-' AND d.blood_group IN ('AB+', 'A-', 'B-'))
                  OR (NEW.blood_group = 'AB+' AND d.blood_group IN ('AB-', 'A+', 'B+'))
              ))
          )
    LOOP
        -- Insert recipient-isolated notification. Patient personal contact details are strictly omitted.
        INSERT INTO public.notifications (
            user_id,
            channel,
            title,
            content,
            status,
            metadata
        ) VALUES (
            v_donor_rec.profile_id,
            'IN_APP',
            'Emergency Blood Alert: ' || NEW.blood_group || ' (' || NEW.component || ') Needed',
            'Emergency request ' || NEW.reference_code || ' requires ' || NEW.units_required || ' unit(s) of ' || NEW.blood_group || ' ' || NEW.component || ' at ' || NEW.hospital_name || ', ' || NEW.city || '.',
            'QUEUED',
            jsonb_build_object(
                'request_id', NEW.id,
                'reference_code', NEW.reference_code,
                'urgency', NEW.urgency,
                'blood_group', NEW.blood_group,
                'component', NEW.component,
                'city', NEW.city
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;


-- ============================================================================
-- 5. TRIGGER FUNCTION: REQUEST STATUS UPDATED -> NOTIFY REQUESTING PATIENT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.on_emergency_request_updated_notify_requester()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check if request has an authenticated patient owner and significant status/unit change
    IF NEW.created_by IS NOT NULL AND (
        NEW.status IS DISTINCT FROM OLD.status OR
        NEW.units_coordinated IS DISTINCT FROM OLD.units_coordinated
    ) THEN
        INSERT INTO public.notifications (
            user_id,
            channel,
            title,
            content,
            status,
            metadata
        ) VALUES (
            NEW.created_by,
            'IN_APP',
            'Emergency Request Update: ' || NEW.reference_code,
            'Your emergency blood request ' || NEW.reference_code || ' status has been updated to ' || NEW.status || ' (' || NEW.units_coordinated || '/' || NEW.units_required || ' units coordinated).',
            'QUEUED',
            jsonb_build_object(
                'request_id', NEW.id,
                'reference_code', NEW.reference_code,
                'status', NEW.status,
                'units_coordinated', NEW.units_coordinated,
                'units_required', NEW.units_required
            )
        );
    END IF;

    RETURN NEW;
END;
$$;


-- ============================================================================
-- 6. TRIGGER ATTACHMENTS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_donor_onboarding_notify ON public.donors;
CREATE TRIGGER trg_donor_onboarding_notify
    AFTER INSERT ON public.donors
    FOR EACH ROW
    EXECUTE FUNCTION public.on_donor_onboarding_notify();

DROP TRIGGER IF EXISTS trg_request_created_notify_donors ON public.emergency_requests;
CREATE TRIGGER trg_request_created_notify_donors
    AFTER INSERT ON public.emergency_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.on_emergency_request_created_notify_donors();

DROP TRIGGER IF EXISTS trg_request_updated_notify_requester ON public.emergency_requests;
CREATE TRIGGER trg_request_updated_notify_requester
    AFTER UPDATE ON public.emergency_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.on_emergency_request_updated_notify_requester();

-- ============================================================================
-- 7. SECURITY & RATE-LIMITING AUDIT NOTES
-- ============================================================================
-- A. GUEST SUBMISSION RATE-LIMITING BLOCKER:
--    Unauthenticated guest RPCs (submit_guest_emergency_request) cannot rely
--    on auth.uid() for rate limits. In production, an Edge Function / reverse proxy
--    (e.g., Cloudflare WAF or Supabase Edge Functions with Redis sliding window)
--    MUST rate-limit requests by client IP / network hash to prevent denial-of-service
--    or database exhaustion.
--
-- B. RECIPIENT NOTIFICATION ISOLATION:
--    All notifications inserted by triggers specify user_id = recipient profile.
--    Existing RLS policy "Users read own notifications" strictly restricts SELECT
--    to user_id = auth.uid(). Direct client INSERTs on notifications remain revoked.
--
-- C. FIRST-ADMIN BOOTSTRAP SECURITY:
--    bootstrap_first_admin() permanently aborts if COUNT(*) of profiles with
--    role = 'admin' > 0. Once initialized, subsequent administrative promotions
--    require an authenticated admin calling admin_set_user_role().
--
-- D. CLINICAL SAFETY (NBTC 2023):
--    Trigger notifications do NOT guarantee transfusion clearance. Mandatory
--    physical exam, hemoglobin screening (>= 12.5 g/dL), and pathology cross-matching
--    are conducted upon donor arrival at the certified blood centre.
-- ============================================================================
