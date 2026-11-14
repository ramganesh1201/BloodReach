-- Migration: 20261114000001_hospital_discovery_and_donor_uniqueness.sql
-- Description: Additive schema enhancements for live healthcare facility discovery metadata,
--              verified donor account uniqueness, and request lookup performance indexes.
-- Safety: Purely additive, fully idempotent, zero table recreations, no production disruption.

BEGIN;

--------------------------------------------------------------------------------
-- 1. EMERGENCY REQUESTS: DISCOVERY & FACILITY METADATA COLUMNS
--------------------------------------------------------------------------------

-- Add facility_id to persist stable facility references (e.g. OpenStreetMap osm_id or registry UUID)
ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS facility_id TEXT;

-- Add location_source to record data provenance (e.g. CareLoop Verified, Public Health Directory, OSM Discovered)
ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'Public Healthcare Directory';

-- Add location_verification_status to record verification tier (source_listed, verified, unverified)
ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS location_verification_status TEXT DEFAULT 'source_listed';

-- Index facility_id for fast hospital incident cross-referencing
CREATE INDEX IF NOT EXISTS idx_emergency_requests_facility_id
ON public.emergency_requests(facility_id)
WHERE facility_id IS NOT NULL;

-- Index reference_code for case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_emergency_requests_ref_code_lookup
ON public.emergency_requests(UPPER(reference_code));

-- Composite index for fast active emergency filtration
CREATE INDEX IF NOT EXISTS idx_emergency_requests_active_dispatch
ON public.emergency_requests(status, created_at DESC)
WHERE status IN ('CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED');

--------------------------------------------------------------------------------
-- 2. DONORS: ENSURE ENFORCED UNIQUENESS ON PROFILE_ID
--------------------------------------------------------------------------------

-- Explicit unique index on profile_id (one donor profile per authenticated user account)
CREATE UNIQUE INDEX IF NOT EXISTS idx_donors_profile_id_unique
ON public.donors(profile_id)
WHERE profile_id IS NOT NULL;

-- Fast index for phone verification
CREATE INDEX IF NOT EXISTS idx_donors_phone_lookup
ON public.donors(phone);

-- Fast index for regional donor discovery by blood group and city
CREATE INDEX IF NOT EXISTS idx_donors_matching_lookup
ON public.donors(blood_group, city, is_available)
WHERE is_available = true;

--------------------------------------------------------------------------------
-- 3. PERMISSIONS & COMMENTS
--------------------------------------------------------------------------------

COMMENT ON COLUMN public.emergency_requests.facility_id IS 'Stable facility identifier (e.g. OSM osm_id or registry UUID)';
COMMENT ON COLUMN public.emergency_requests.location_source IS 'Origin of hospital data: CareLoop Verified, Public Healthcare Directory, OSM Discovered, or User Submitted';
COMMENT ON COLUMN public.emergency_requests.location_verification_status IS 'Verification status of hospital location: verified, source_listed, or unverified';

COMMIT;
