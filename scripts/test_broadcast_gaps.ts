/**
 * CareLoop Phase 3.0.2 — Test Broadcast Authorization Gaps
 */

import { execSync } from 'child_process';
import crypto from 'crypto';

function cleanPsqlOutput(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.find((l) => l.startsWith('{') || l.startsWith('['));
  if (jsonLine) return jsonLine;
  const filtered = lines.filter((l) => 
    !['BEGIN', 'SET', 'COMMIT', 'DO'].includes(l) && 
    !/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REVOKE|GRANT)\s+\d*(\s+\d+)?$/i.test(l)
  );
  return filtered.join('\n');
}

function psql(query: string): string {
  const raw = execSync(
    `docker exec -i supabase_db_blood psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -P pager=off`,
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
  return cleanPsqlOutput(raw);
}

function testTopicAuth(userId: string, role: string, topic: string, isInsert: boolean = false): boolean {
  try {
    const checkSql = isInsert
      ? `
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${userId}', true);
        SELECT set_config('request.jwt.claim.role', '${role}', true);
        SELECT set_config('realtime.topic', '${topic}', true);
        -- Test policy check expression for INSERT on realtime.messages
        SELECT (((realtime.topic() ~~ 'call:%'::text) AND (EXISTS ( 
          SELECT 1 FROM call_sessions cs
          WHERE (((cs.id)::text = SUBSTRING(realtime.topic() FROM 6)) 
            AND ((cs.caller_id = auth.uid()) OR (cs.receiver_id = auth.uid()) OR (get_user_role() = ANY (ARRAY['coordinator'::text, 'admin'::text]))))
        ))) OR (((realtime.topic() ~~ 'user:%'::text) OR (realtime.topic() ~~ 'user-calls:%'::text)) AND (EXISTS ( 
          SELECT 1 FROM call_sessions cs
          WHERE ((cs.caller_id = auth.uid()) AND (cs.status = 'RINGING'::text) AND (((cs.receiver_id)::text = SUBSTRING(realtime.topic() FROM 6)) OR ((cs.receiver_id)::text = SUBSTRING(realtime.topic() FROM 12))))
        ))));
        COMMIT;
      `
      : `
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${userId}', true);
        SELECT set_config('request.jwt.claim.role', '${role}', true);
        SELECT set_config('realtime.topic', '${topic}', true);
        -- Test policy check expression for SELECT on realtime.messages
        SELECT (((realtime.topic() ~~ 'call:%'::text) AND (EXISTS ( 
          SELECT 1 FROM call_sessions cs
          WHERE (((cs.id)::text = SUBSTRING(realtime.topic() FROM 6)) 
            AND ((cs.caller_id = auth.uid()) OR (cs.receiver_id = auth.uid()) OR (get_user_role() = ANY (ARRAY['coordinator'::text, 'admin'::text]))))
        ))) OR (realtime.topic() = ('user:'::text || (auth.uid())::text)) OR (realtime.topic() = ('user-calls:'::text || (auth.uid())::text)));
        COMMIT;
      `;
    const res = psql(checkSql);
    return res === 't';
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('Testing Broadcast Authorization Policies...\n');

  // Use existing users from auth.users
  const userIdsRaw = psql(`SELECT id FROM auth.users LIMIT 3;`);
  const userIds = userIdsRaw.split('\n').map((l) => l.trim()).filter(Boolean);
  const callerId = userIds[0];
  const calleeId = userIds[1];
  const outsiderId = userIds[2];
  const callId = crypto.randomUUID();
  const endedCallId = crypto.randomUUID();

  // Active call
  psql(`
    INSERT INTO public.call_sessions (id, caller_id, receiver_id, conversation_id, status)
    VALUES ('${callId}', '${callerId}', '${calleeId}', (SELECT id FROM public.conversations LIMIT 1), 'RINGING');

    -- Ended call
    INSERT INTO public.call_sessions (id, caller_id, receiver_id, conversation_id, status)
    VALUES ('${endedCallId}', '${callerId}', '${calleeId}', (SELECT id FROM public.conversations LIMIT 1), 'ENDED');
  `);

  console.log('1. Caller joins own call channel:', testTopicAuth(callerId, 'authenticated', `call:${callId}`, false));
  console.log('2. Callee joins own call channel:', testTopicAuth(calleeId, 'authenticated', `call:${callId}`, false));
  console.log('3. Outsider joins call channel:', testTopicAuth(outsiderId, 'authenticated', `call:${callId}`, false));
  console.log('4. Outsider listens to callee alert channel:', testTopicAuth(outsiderId, 'authenticated', `user-calls:${calleeId}`, false));
  console.log('5. Outsider broadcasts to callee alert channel:', testTopicAuth(outsiderId, 'authenticated', `user-calls:${calleeId}`, true));
  console.log('6. Ended call room: Can caller still broadcast to call:endedCallId?', testTopicAuth(callerId, 'authenticated', `call:${endedCallId}`, true));

  // Suspended user test:
  psql(`UPDATE public.profiles SET status = 'SUSPENDED' WHERE id = '${callerId}';`);
  console.log('7. Suspended user: Can suspended caller still broadcast to active call:callId?', testTopicAuth(callerId, 'authenticated', `call:${callId}`, true));
}

main().catch(console.error);
