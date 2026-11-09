-- ============================================================================
-- CareLoop Migration 19: Persistent SMS Dispatches, Atomic Concurrency & Rate Limiting
-- Version: 20261109190000
-- 
-- DESCRIPTION:
-- 1. Creates public.sms_dispatches table for persistent, concurrency-safe dispatch tracking.
-- 2. Enforces atomic idempotency via UNIQUE constraint on idempotency_key.
-- 3. Provides atomic stored procedure for rate-limit checking (max 3 SMS per donor per rolling hour).
-- 4. Stores SHA-256 token hashes rather than plaintext capability tokens.
-- 5. Enables strict Row Level Security (RLS) preventing client tampering.
-- ============================================================================

SET search_path = public, pg_temp;

-- 1. Create sms_dispatches table
CREATE TABLE IF NOT EXISTS public.sms_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    recipient_phone_masked TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'SMS' CHECK (channel = 'SMS'),
    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'PENDING_CONFIGURATION', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'RATE_LIMITED')),
    carrier TEXT,
    carrier_message_id TEXT,
    delivery_receipt TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 1,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT uq_sms_dispatches_idempotency UNIQUE (idempotency_key)
);

-- 2. Indexes for fast rolling-window rate check and request lookups
CREATE INDEX IF NOT EXISTS idx_sms_dispatches_donor_rate 
    ON public.sms_dispatches (donor_id, dispatched_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_dispatches_request 
    ON public.sms_dispatches (request_id, status);

CREATE INDEX IF NOT EXISTS idx_sms_dispatches_token_hash 
    ON public.sms_dispatches (token_hash);

-- 3. Atomic Rate-Limiting & Idempotent Dispatch Check Procedure
CREATE OR REPLACE FUNCTION public.check_and_record_sms_dispatch(
    p_request_id UUID,
    p_donor_id UUID,
    p_idempotency_key TEXT,
    p_token_hash TEXT,
    p_phone_masked TEXT,
    p_initial_status TEXT,
    p_carrier TEXT DEFAULT NULL,
    p_carrier_msg_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recent_count INTEGER;
    v_existing RECORD;
    v_new_id UUID;
    c_max_per_hour CONSTANT INTEGER := 3;
BEGIN
    -- 1. Concurrency guard: Advisory lock per donor to serialize rapid concurrent dispatches
    PERFORM pg_advisory_xact_lock(hashtext('sms_rate_limit_' || p_donor_id::text));

    -- 2. Check for existing idempotency match
    SELECT * INTO v_existing
    FROM public.sms_dispatches
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'is_replay', true,
            'dispatch_id', v_existing.id,
            'status', v_existing.status,
            'message_id', v_existing.carrier_message_id,
            'dispatched_at', v_existing.dispatched_at
        );
    END IF;

    -- 3. Persistent rolling 1-hour rate limit check
    SELECT COUNT(*) INTO v_recent_count
    FROM public.sms_dispatches
    WHERE donor_id = p_donor_id
      AND dispatched_at >= NOW() - INTERVAL '1 hour'
      AND status NOT IN ('FAILED', 'RATE_LIMITED');

    IF v_recent_count >= c_max_per_hour THEN
        -- Record the rate limit rejection for auditing
        INSERT INTO public.sms_dispatches (
            request_id, donor_id, idempotency_key, token_hash,
            recipient_phone_masked, status, error_message, metadata
        ) VALUES (
            p_request_id, p_donor_id, p_idempotency_key, p_token_hash,
            p_phone_masked, 'RATE_LIMITED', 'Rolling hour rate limit exceeded (max 3/hr)', p_metadata
        );

        RETURN jsonb_build_object(
            'allowed', false,
            'is_replay', false,
            'status', 'RATE_LIMITED',
            'error', 'Rate limit exceeded: Maximum 3 SMS notifications per donor per rolling hour.'
        );
    END IF;

    -- 4. Insert new dispatch record
    INSERT INTO public.sms_dispatches (
        request_id, donor_id, idempotency_key, token_hash,
        recipient_phone_masked, status, carrier, carrier_message_id, metadata
    ) VALUES (
        p_request_id, p_donor_id, p_idempotency_key, p_token_hash,
        p_phone_masked, p_initial_status, p_carrier, p_carrier_msg_id, p_metadata
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'allowed', true,
        'is_replay', false,
        'dispatch_id', v_new_id,
        'status', p_initial_status,
        'dispatched_at', NOW()
    );
END;
$$;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.sms_dispatches ENABLE ROW LEVEL SECURITY;

-- Coordinators and administrators can view dispatch audit records
CREATE POLICY "Coordinators and admins view SMS dispatches"
    ON public.sms_dispatches
    FOR SELECT
    TO authenticated
    USING (
        public.get_user_role() IN ('coordinator', 'admin')
    );

-- Donors can only view dispatches addressed to their own donor record
CREATE POLICY "Donors view own SMS dispatch summaries"
    ON public.sms_dispatches
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.donors d
            WHERE d.id = public.sms_dispatches.donor_id
              AND d.profile_id = auth.uid()
        )
    );

-- Direct modifications are revoked from public/client roles
REVOKE ALL ON TABLE public.sms_dispatches FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.sms_dispatches TO authenticated;
GRANT ALL ON TABLE public.sms_dispatches TO service_role;

REVOKE ALL ON FUNCTION public.check_and_record_sms_dispatch(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_record_sms_dispatch(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
