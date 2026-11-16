-- ==============================================================================
-- Migration: 20261116000004_privacy_and_oauth_hardening.sql
-- Description:
--   1. Tightens public.is_conversation_participant to eliminate blanket admin/coordinator access,
--      ensuring coordinators only access conversations where explicitly assigned to the request
--      or active in the conversation roster.
--   2. Restricts SELECT on public.conversations to participant-only visibility:
--      patient (requester), donor, explicit active participants, and assigned coordinators.
--   3. Adds explicit DELETE policy on public.messages to enforce participant authorization.
--   4. Updates handle_new_user() to support OAuth full_name/name metadata safely,
--      strictly assigning default role 'patient' and preserving existing roles on conflict.
-- ==============================================================================

-- 1. Tighten is_conversation_participant
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Check active membership in conversation_participants
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conv_id
      AND cp.user_id = auth.uid()
      AND cp.is_active = true
  )
  -- Or authenticated requester on the conversation
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conv_id
      AND c.requester_id IS NOT NULL
      AND c.requester_id = auth.uid()
  )
  -- Or authenticated donor on the conversation
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.donors d ON d.id = c.donor_id
    WHERE c.id = p_conv_id
      AND d.profile_id = auth.uid()
  )
  -- Or authorized coordinator/admin explicitly assigned to this emergency request
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.donor_assignments da ON da.request_id = c.request_id
    WHERE c.id = p_conv_id
      AND da.coordinator_id = auth.uid()
      AND public.get_user_role() = ANY (ARRAY['coordinator', 'admin'])
  );
$function$;

-- 2. Tighten SELECT policy on public.conversations
DROP POLICY IF EXISTS "Authorized participants read conversations" ON public.conversations;
CREATE POLICY "Authorized participants read conversations" ON public.conversations
FOR SELECT USING (
  -- Requester
  ((requester_id IS NOT NULL) AND (requester_id = auth.uid()))
  -- Donor
  OR (donor_id IN (SELECT d.id FROM public.donors d WHERE d.profile_id = auth.uid()))
  -- Explicit active participant
  OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
      AND cp.is_active = true
  )
  -- Explicitly assigned coordinator/admin for this request
  OR (
    (public.get_user_role() = ANY (ARRAY['coordinator'::text, 'admin'::text]))
    AND EXISTS (
      SELECT 1 FROM public.donor_assignments da
      WHERE da.request_id = conversations.request_id
        AND da.coordinator_id = auth.uid()
    )
  )
);

-- 3. Add explicit DELETE policy on public.messages for audit & compliance
DROP POLICY IF EXISTS "Senders delete own messages" ON public.messages;
CREATE POLICY "Senders delete own messages" ON public.messages
FOR DELETE USING (
  sender_id = auth.uid() AND is_conversation_participant(conversation_id)
);

-- 4. Update handle_new_user to robustly support OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    v_phone := NEW.raw_user_meta_data->>'phone';

    -- Strictly assign default 'patient'. Privileged roles require administrative promotion.
    INSERT INTO public.profiles (id, email, full_name, phone, role, status)
    VALUES (NEW.id, NEW.email, v_full_name, v_phone, 'patient', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        updated_at = NOW();

    RETURN NEW;
END;
$function$;
