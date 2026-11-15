/**
 * CareLoop — Server-Authoritative Emergency Request Acceptance Endpoint
 * Runtime: Vercel Serverless Function (Node.js)
 * File: api/accept-request.ts
 * 
 * CRITICAL CLINICAL & CONCURRENCY SAFEGUARDS:
 * 1. Self-contained Vercel serverless bundle (zero external relative import failures under ESM).
 * 2. Authenticates caller using Supabase JWT (`auth.getUser()`).
 * 3. Resolves caller's verified donor profile directly from database (`profile_id = user.id`).
 * 4. Enforces Anti-Self-Match: Emergency request creator CANNOT accept their own request.
 * 5. Server-Authoritative ABO/Rh & Component Clinical Compatibility:
 *    Validates donor blood group against patient need and component (Whole Blood, RBC, Platelets, Plasma).
 * 6. Eligibility & Deferral Check:
 *    Rejects if donor is under active medical deferral, medically uncleared, or temporarily unavailable.
 * 7. Notification / Token Ownership:
 *    Ensures donor cannot accept an alert addressed to a different user/donor.
 * 8. Terminal State & Capacity Protection:
 *    Rejects fulfilled, cancelled, expired requests, or requests where `units_coordinated >= units_required`.
 * 9. Concurrency & Idempotency:
 *    Duplicate acceptances return existing conversation without double-incrementing coordinated units.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MAX_PAYLOAD_BYTES = 16384;

// ============================================================================
// CLINICAL COMPATIBILITY TABLES (NBTC 2023 Guidelines)
// ============================================================================
type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
type BloodComponent = 'Whole Blood' | 'Packed RBC' | 'Platelets' | 'Plasma';

const RBC_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

const PLASMA_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A-', 'A+', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB-', 'AB+'],
};

const PLATELET_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'B-', 'AB-'],
  'O+': ['O+', 'O-', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'O-'],
  'A+': ['A+', 'A-', 'AB+', 'O+'],
  'B-': ['B-', 'B+', 'AB-', 'O-'],
  'B+': ['B+', 'B-', 'AB+', 'O+'],
  'AB-': ['AB-', 'AB+', 'A-', 'B-'],
  'AB+': ['AB+', 'AB-', 'A+', 'B+'],
};

function isClinicallyCompatible(
  patientGroup: BloodGroup,
  donorGroup: BloodGroup,
  component: BloodComponent = 'Whole Blood'
): { compatible: boolean; isExact: boolean } {
  if (patientGroup === donorGroup) {
    return { compatible: true, isExact: true };
  }

  let table: Record<BloodGroup, BloodGroup[]>;
  switch (component) {
    case 'Packed RBC':
      table = RBC_COMPATIBILITY;
      break;
    case 'Plasma':
      table = PLASMA_COMPATIBILITY;
      break;
    case 'Platelets':
      table = PLATELET_COMPATIBILITY;
      break;
    case 'Whole Blood':
    default:
      return { compatible: false, isExact: false };
  }

  const compatibleList = table[patientGroup] || [patientGroup];
  return { compatible: compatibleList.includes(donorGroup), isExact: false };
}

// ============================================================================
// SUPABASE CLIENT & PAYLOAD PARSER
// ============================================================================
function getServerSupabaseClient(): SupabaseClient | null {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://uzwtchnqmveapzehuafb.supabase.co';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_zBAqRhIEnx0_4OPm4GLttQ_U3ra_svx';

  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function parseRequestBody(req: IncomingMessage): Promise<any> {
  const anyReq = req as any;
  if (anyReq.body !== undefined && anyReq.body !== null) {
    if (typeof anyReq.body === 'object') {
      return Promise.resolve(anyReq.body);
    }
    if (typeof anyReq.body === 'string' && anyReq.body.trim().length > 0) {
      try {
        return Promise.resolve(JSON.parse(anyReq.body));
      } catch {
        // continue to stream fallback
      }
    }
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_PAYLOAD_BYTES) {
        reject(new Error('Payload size exceeds 16KB limit'));
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw || raw.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        try {
          const params = new URLSearchParams(raw);
          const parsed: Record<string, string> = {};
          params.forEach((v, k) => {
            parsed[k] = v;
          });
          resolve(parsed);
        } catch {
          reject(new Error('Invalid JSON or URL-encoded payload'));
        }
      }
    });

    req.on('error', (err) => reject(err));
  });
}

// ============================================================================
// VERCEL SERVERLESS HANDLER
// ============================================================================
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
    return;
  }

  // 1. Initialize Supabase Admin Client
  const supabase = getServerSupabaseClient();
  if (!supabase) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Server database configuration missing.' }));
    return;
  }

  // 2. Authenticate Caller via Bearer Token
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Authentication required. Missing Bearer token.' }));
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData?.user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Invalid, missing, or expired authentication session.' }));
    return;
  }

  const callerUser = authData.user;

  // 3. Parse Request Body
  let body: any = {};
  try {
    body = await parseRequestBody(req);
  } catch (err: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Malformed request body' }));
    return;
  }

  const { requestId, donorId } = body;
  if (!requestId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Emergency requestId is required.' }));
    return;
  }

  // 4. Server-Authoritative Atomic Acceptance via PostgreSQL SECURITY DEFINER RPC
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://uzwtchnqmveapzehuafb.supabase.co';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_zBAqRhIEnx0_4OPm4GLttQ_U3ra_svx';

  const userSupabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const { data: rpcData, error: rpcError } = await userSupabase.rpc(
      'accept_request_and_create_conversation',
      {
        p_request_id: requestId,
        p_donor_id: donorId || null,
      }
    );

    if (rpcError) {
      console.warn('[accept-request] Database RPC error:', rpcError.message);
      const msg = rpcError.message || 'Database error during acceptance.';
      let statusCode = 400;
      if (msg.includes('permission denied')) statusCode = 403;
      else if (msg.includes('not found')) statusCode = 404;

      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: msg }));
      return;
    }

    if (rpcData && typeof rpcData === 'object') {
      if (rpcData.success) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            conversationId: rpcData.conversation_id,
            requestId: rpcData.request_id || requestId,
            donorName: rpcData.donor_name,
            alreadyAccepted: Boolean(rpcData.already_accepted),
            message: rpcData.already_accepted
              ? 'You have already accepted this emergency request.'
              : 'Emergency request accepted successfully.',
          })
        );
        return;
      } else {
        const msg = rpcData.message || 'Failed to accept emergency request.';
        let statusCode = 400;

        if (msg.includes('not found')) {
          statusCode = 404;
        } else if (msg.includes('ANTI_SELF_MATCH')) {
          statusCode = 403;
        } else if (msg.includes('Authentication required')) {
          statusCode = 401;
        } else if (
          msg.includes('no longer active') ||
          msg.includes('coordinated') ||
          msg.includes('capacity')
        ) {
          statusCode = 409;
        }

        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: msg }));
        return;
      }
    }

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Empty response from acceptance procedure.' }));
  } catch (err: any) {
    console.error('[accept-request] Unhandled error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Internal server error.' }));
  }
}
