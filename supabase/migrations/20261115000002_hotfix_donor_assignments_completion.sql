-- Fix donor_assignments table to support updated_at and COMPLETED status required by case_based_communication_lifecycle
ALTER TABLE public.donor_assignments 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.donor_assignments 
  DROP CONSTRAINT IF EXISTS donor_assignments_status_check;

ALTER TABLE public.donor_assignments 
  ADD CONSTRAINT donor_assignments_status_check 
  CHECK (status = ANY (ARRAY['ASSIGNED'::text, 'CONFIRMED'::text, 'DONATED'::text, 'CANCELLED'::text, 'COMPLETED'::text]));
