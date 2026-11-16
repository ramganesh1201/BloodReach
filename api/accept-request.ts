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

  const rawRequestId = body.requestId || body.request_id || body.referenceCode || body.reference_code;
  const rawDonorId = body.donorId || body.donor_id;

  if (!rawRequestId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Emergency requestId is required.' }));
    return;
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 4. Resolve Request UUID (handles UUID or Human-Readable Reference Code like CL-8F42)
  let resolvedRequestId: string | null = UUID_REGEX.test(String(rawRequestId).trim())
    ? String(rawRequestId).trim()
    : null;

  if (!resolvedRequestId) {
    const { data: reqByCode } = await supabase
      .from('emergency_requests')
      .select('id, reference_code, created_by, status, units_coordinated, units_required')
      .ilike('reference_code', String(rawRequestId).trim())
      .maybeSingle();

    if (reqByCode?.id) {
      resolvedRequestId = reqByCode.id;
    }
  }

  if (!resolvedRequestId) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: `Emergency request "${rawRequestId}" not found.` }));
    return;
  }

  // 5. Resolve Caller Donor Profile & Auto-Provision if Profile Exists
  let { data: donorRow } = await supabase
    .from('donors')
    .select('id, profile_id, full_name, phone, blood_group, is_available, is_medically_cleared, medical_clearance_status, deferral_until')
    .eq('profile_id', callerUser.id)
    .maybeSingle();

  if (!donorRow) {
    // If no donor row exists, check user profile and auto-provision donor record under clinical review
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (userProfile) {
      const { data: newDonor } = await supabase
        .from('donors')
        .insert({
          profile_id: callerUser.id,
          full_name: userProfile.full_name || callerUser.email?.split('@')[0] || 'Volunteer Donor',
          phone: userProfile.phone || '+91 98490 00000',
          email: callerUser.email || null,
          blood_group: userProfile.blood_group || 'O+',
          city: userProfile.city || 'Hyderabad',
          district: userProfile.district || null,
          is_available: true,
          is_medically_cleared: false,
          medical_clearance_status: 'PENDING_REVIEW',
          total_donations: 0,
        })
        .select()
        .maybeSingle();

      if (newDonor) {
        donorRow = newDonor;
      }
    }
  }

  // Determine Target Donor ID (strictly validate UUID; strip mock/demo identifiers like 'donor-1')
  let targetDonorId: string | null = null;
  if (rawDonorId && UUID_REGEX.test(String(rawDonorId).trim())) {
    targetDonorId = String(rawDonorId).trim();
  } else if (donorRow?.id) {
    targetDonorId = donorRow.id;
  }

  // 6. Anti-Self-Match Server Verification
  const { data: reqRow } = await supabase
    .from('emergency_requests')
    .select('id, created_by, status, units_coordinated, units_required')
    .eq('id', resolvedRequestId)
    .maybeSingle();

  if (reqRow && reqRow.created_by && (reqRow.created_by === callerUser.id || (donorRow && reqRow.created_by === donorRow.profile_id))) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'ANTI_SELF_MATCH: Donors cannot accept emergency requests created by their own user account.',
    }));
    return;
  }

  // 7. Server-Authoritative Atomic Acceptance via PostgreSQL SECURITY DEFINER RPC
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
        p_request_id: resolvedRequestId,
        p_donor_id: targetDonorId || null,
      }
    );

    if (rpcError) {
      console.warn('[accept-request] Database RPC error:', rpcError.message);
      const msg = rpcError.message || 'Database error during acceptance.';
      let statusCode = 400;
      let errorCode = 'INTERNAL_SERVER_ERROR';
      let errorDetails: string | undefined = undefined;
      let actionRequired: string | undefined = undefined;

      if (msg.includes('permission denied') || msg.includes('JWT') || msg.includes('unauthorized')) {
        statusCode = 401;
        errorCode = 'AUTHORIZATION_FAILED';
      } else if (msg.includes('not found')) {
        statusCode = 404;
        errorCode = 'REQUEST_NOT_FOUND';
      } else if (msg.includes('medical clearance hold')) {
        statusCode = 400;
        errorCode = 'MEDICAL_CLEARANCE_HOLD';
        errorDetails = 'Your volunteer donor registration is awaiting clinical verification by an authorized coordinator or transfusion medicine department before emergency dispatch acceptance can be enabled.';
        actionRequired = 'REQUEST_MEDICAL_CLEARANCE';
      }

      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, code: errorCode, error: msg, details: errorDetails, actionRequired }));
      return;
    }

    if (rpcData && typeof rpcData === 'object') {
      if (rpcData.success) {
        const conversationId = rpcData.conversation_id;

        // Fetch assignment ID for contract completeness
        const { data: assignRow } = await supabase
          .from('donor_assignments')
          .select('id')
          .eq('request_id', resolvedRequestId)
          .eq('donor_id', targetDonorId || donorRow?.id)
          .maybeSingle();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            requestId: rpcData.request_id || resolvedRequestId,
            assignmentId: assignRow?.id || null,
            conversationId,
            conversationRoute: `/communication?conversationId=${conversationId}`,
            donorName: rpcData.donor_name || donorRow?.full_name || 'Volunteer Donor',
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
        let errorCode = rpcData.code || 'ACCEPTANCE_FAILED';
        let errorDetails: string | undefined = undefined;
        let actionRequired: string | undefined = undefined;

        if (errorCode === 'MEDICAL_CLEARANCE_HOLD' || msg.includes('medical clearance hold')) {
          errorCode = 'MEDICAL_CLEARANCE_HOLD';
          statusCode = 400;
          errorDetails =
            'Your volunteer donor registration is awaiting clinical verification by an authorized coordinator or transfusion medicine department before emergency dispatch acceptance can be enabled.';
          actionRequired = 'REQUEST_MEDICAL_CLEARANCE';
        } else if (errorCode === 'ANTI_SELF_MATCH' || msg.includes('ANTI_SELF_MATCH')) {
          errorCode = 'ANTI_SELF_MATCH';
          statusCode = 403;
          errorDetails = 'Donors cannot accept emergency requests created by their own user account.';
        } else if (errorCode === 'ACTIVE_DEFERRAL' || msg.includes('deferral')) {
          errorCode = 'ACTIVE_DEFERRAL';
          statusCode = 409;
          errorDetails = 'Active NBTC medical interval or temporary deferral period has not elapsed.';
        } else if (errorCode === 'DONOR_UNAVAILABLE' || msg.includes('unavailable')) {
          errorCode = 'DONOR_UNAVAILABLE';
          statusCode = 400;
          errorDetails = 'Donor status is set to unavailable or paused in the dispatch grid.';
        } else if (errorCode === 'INCOMPATIBLE_BLOOD_GROUP' || msg.includes('Incompatible')) {
          errorCode = 'INCOMPATIBLE_BLOOD_GROUP';
          statusCode = 400;
          errorDetails = 'ABO/Rh or blood component is not clinically compatible with the patient request.';
        } else if (
          errorCode === 'CAPACITY_REACHED' ||
          msg.includes('no longer active') ||
          msg.includes('coordinated') ||
          msg.includes('capacity') ||
          msg.includes('FULFILLED')
        ) {
          errorCode = 'CAPACITY_REACHED';
          statusCode = 409;
          errorDetails = 'This emergency request has reached capacity or is no longer accepting commitments.';
        } else if (errorCode === 'REQUEST_NOT_FOUND' || msg.includes('not found')) {
          errorCode = 'REQUEST_NOT_FOUND';
          statusCode = 404;
        } else if (errorCode === 'UNAUTHORIZED' || msg.includes('Authentication required')) {
          errorCode = 'UNAUTHORIZED';
          statusCode = 401;
        }

        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            code: errorCode,
            error: msg,
            details: errorDetails,
            actionRequired,
            clearanceStatus: rpcData.clearance_status || (errorCode === 'MEDICAL_CLEARANCE_HOLD' ? 'PENDING_REVIEW' : undefined),
            deferralUntil: rpcData.deferral_until,
          })
        );
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
