-- ============================================================================
-- CareLoop Migration 11: Realtime Publications for Notifications & Coordination
-- Version: 20261103000011
-- Description: Adds notifications, donor_assignments, blood_inventory, and
--              emergency_requests to supabase_realtime publication with
--              REPLICA IDENTITY FULL for granular real-time event filtering.
-- ============================================================================

-- 1. Ensure Full Replica Identity for Correct Change Payload Generation
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.donor_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.blood_inventory REPLICA IDENTITY FULL;
ALTER TABLE public.emergency_requests REPLICA IDENTITY FULL;

-- 2. Add Tables to supabase_realtime Publication Idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'donor_assignments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.donor_assignments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'blood_inventory'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.blood_inventory;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;
    END IF;
END $$;

