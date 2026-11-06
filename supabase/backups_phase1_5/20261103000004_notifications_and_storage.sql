-- ============================================================================
-- CareLoop Migration 4: Notifications, Device Tokens & Secure Storage (Hardened)
-- Version: 20261103000004
-- Security Remediation: Multi-tenant notification isolation, token protection,
--                      storage object RLS linked to verified conversation membership.
-- ============================================================================

-- ============================================================================
-- 1. NOTIFICATIONS & DEVICE TOKENS TABLES
-- ============================================================================

-- 1.1 Multi-channel Notifications Table
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

-- 1.2 Device Push Tokens (Web Push / FCM / APNS)
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

-- 1.3 User Notification Preferences
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
-- 2. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_stat ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 3.1 Notifications Policies
-- SECURITY MANDATE: Users can only read their own notifications.
CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users acknowledge own notifications" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid());

-- SECURITY MANDATE: Only coordinators, admins, or backend service role can generate notifications.
-- Ordinary users CANNOT inject arbitrary notifications for other accounts.
CREATE POLICY "Coordinators and Admin insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (
        public.get_user_role() IN ('coordinator', 'admin')
        OR auth.role() = 'service_role'
    );

-- 3.2 Device Tokens Policies
-- Users can only manage their own device tokens
CREATE POLICY "Users manage own device tokens" ON public.device_tokens
    FOR ALL USING (
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
    );

-- 3.3 Notification Preferences Policies
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences
    FOR ALL USING (
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
    );

-- ============================================================================
-- 4. PRIVATE SUPABASE STORAGE CONFIGURATION
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
            10485760, -- 10MB limit
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = 10485760,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    END IF;
END $$;

-- Storage Objects RLS Policies
-- SECURITY MANDATE: Strictly validates that the requester or uploader is an active
--                   participant in the conversation corresponding to the folder.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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
