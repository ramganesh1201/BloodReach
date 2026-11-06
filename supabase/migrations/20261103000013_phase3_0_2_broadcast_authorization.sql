-- ============================================================================
-- CareLoop Migration 13: Broadcast Channel Authorization Hardening
-- Version: 20261103000013
-- Description: Closes signaling authorization gaps on realtime.messages:
--              1. Enforces active call status (denies expired, ended, and stale calls).
--              2. Enforces active profile status (denies suspended or inactive users).
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'realtime' AND table_name = 'messages'
    ) THEN
        DROP POLICY IF EXISTS "Call participants can listen to call rooms" ON realtime.messages;
        DROP POLICY IF EXISTS "Call participants can broadcast to call rooms" ON realtime.messages;

        -- 1. Listen Policy: Active profile check and non-terminal call session check
        CREATE POLICY "Call participants can listen to call rooms"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
            AND (
                -- Call room signaling: strictly non-terminal call sessions
                (realtime.topic() LIKE 'call:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.id::text = substring(realtime.topic() from 6)
                      AND cs.status IN ('INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED')
                      AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
                ))
                -- Personal incoming call inbox
                OR (realtime.topic() = 'user:' || auth.uid()::text)
                OR (realtime.topic() = 'user-calls:' || auth.uid()::text)
            )
        );

        -- 2. Broadcast Policy: Active profile check and non-terminal call session check
        CREATE POLICY "Call participants can broadcast to call rooms"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'ACTIVE')
            AND (
                -- Broadcasting to active call room
                (realtime.topic() LIKE 'call:%' AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.id::text = substring(realtime.topic() from 6)
                      AND cs.status IN ('INITIATING', 'RINGING', 'ACCEPTED', 'CONNECTED')
                      AND (cs.caller_id = auth.uid() OR cs.receiver_id = auth.uid() OR public.get_user_role() IN ('coordinator', 'admin'))
                ))
                -- Broadcasting incoming alert to callee inbox (strictly verified against active RINGING session)
                OR ((realtime.topic() LIKE 'user:%' OR realtime.topic() LIKE 'user-calls:%') AND EXISTS (
                    SELECT 1 FROM public.call_sessions cs
                    WHERE cs.caller_id = auth.uid()
                      AND cs.status = 'RINGING'
                      AND (
                          cs.receiver_id::text = substring(realtime.topic() from 6)
                          OR cs.receiver_id::text = substring(realtime.topic() from 12)
                      )
                ))
            )
        );
    END IF;
END $$;
