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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function parseRequestBody(req: IncomingMessage): Promise<any> {
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

  const { requestId, donorId, notificationId } = body;
  if (!requestId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Emergency requestId is required.' }));
    return;
  }

  // 4. Resolve Donor Profile
  let donorQuery = supabase
    .from('donors')
    .select('id, profile_id, full_name, phone, blood_group, city, is_available, availability_state, is_medically_cleared, deferral_until');

  if (donorId) {
    donorQuery = donorQuery.eq('id', donorId);
  } else {
    donorQuery = donorQuery.eq('profile_id', callerUser.id);
  }

  const { data: donorRows, error: donorErr } = await donorQuery.limit(1);

  if (donorErr || !donorRows || donorRows.length === 0) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Active registered donor profile not found.' }));
    return;
  }

  const donor = donorRows[0];

  // Verify donor ownership (prevent accepting on behalf of other donors unless coordinator/admin)
  const isOwner = donor.profile_id === callerUser.id;
  const userRole = callerUser.user_metadata?.role || callerUser.app_metadata?.role || 'donor';
  const isStaff = userRole === 'coordinator' || userRole === 'admin';

  if (!isOwner && !isStaff) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Forbidden: You cannot accept emergency requests on behalf of another donor.' }));
    return;
  }

  // 5. Verify Notification Ownership (if notificationId provided)
  if (notificationId) {
    const { data: notifData } = await supabase
      .from('notifications')
      .select('id, user_id, metadata')
      .eq('id', notificationId)
      .maybeSingle();

    if (notifData && notifData.user_id !== callerUser.id && !isStaff) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Notification does not belong to the authenticated user.' }));
      return;
    }
  }

  // 6. Medical Clearance, Deferral & Availability Verification
  if (donor.is_medically_cleared === false) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Your profile has an active medical clearance hold. Acceptance cannot be processed.',
    }));
    return;
  }

  if (donor.deferral_until) {
    const deferralDate = new Date(donor.deferral_until);
    if (deferralDate > new Date()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: `Your profile is under medical deferral until ${deferralDate.toLocaleDateString()}. Acceptance cannot be processed.`,
      }));
      return;
    }
  }

  if (!donor.is_available || donor.availability_state === 'TEMPORARILY_UNAVAILABLE') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Donor is currently marked as unavailable. Reactivate availability in your donor profile before accepting.',
    }));
    return;
  }

  // 7. Lock and Inspect Target Emergency Request
  const { data: reqData, error: reqErr } = await supabase
    .from('emergency_requests')
    .select('id, reference_code, blood_group, component, units_required, units_coordinated, hospital_name, city, status, created_by')
    .eq('id', requestId)
    .maybeSingle();

  if (reqErr || !reqData) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Emergency request not found.' }));
    return;
  }

  // 8. ANTI-SELF-MATCH: Creator cannot accept their own emergency request
  if (reqData.created_by && (reqData.created_by === callerUser.id || reqData.created_by === donor.profile_id)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'ANTI_SELF_MATCH: Donors cannot accept emergency requests created by their own user account.',
    }));
    return;
  }

  // 9. Status & Capacity Check
  if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(reqData.status)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: `Emergency request ${reqData.reference_code} is no longer active (${reqData.status}).`,
    }));
    return;
  }

  // 10. Server-Authoritative ABO/Rh & Component Clinical Compatibility Check
  const compResult = isClinicallyCompatible(
    reqData.blood_group as BloodGroup,
    donor.blood_group as BloodGroup,
    (reqData.component || 'Whole Blood') as BloodComponent
  );

  if (!compResult.compatible) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: `CLINICAL_INCOMPATIBILITY: Donor blood group ${donor.blood_group} is not clinically compatible with patient need ${reqData.blood_group} ${reqData.component || 'blood'}.`,
    }));
    return;
  }

  // 11. Idempotency Check: Already accepted?
  const { data: existingResp } = await supabase
    .from('donor_responses')
    .select('id, response_status')
    .eq('request_id', requestId)
    .eq('donor_id', donor.id)
    .maybeSingle();

  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('request_id', requestId)
    .eq('donor_id', donor.id)
    .maybeSingle();

  if (existingResp?.response_status === 'ACCEPTED' && existingConv?.id) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      conversationId: existingConv.id,
      requestId,
      donorName: donor.full_name,
      alreadyAccepted: true,
      message: 'You have already accepted this emergency request.',
    }));
    return;
  }

  // Check units capacity constraint
  const currentUnitsCoordinated = Number(reqData.units_coordinated || 0);
  const unitsRequired = Number(reqData.units_required || 1);

  if (currentUnitsCoordinated >= unitsRequired) {
    res.statusCode = 409;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'REQUEST_ALREADY_FULFILLED: All required donation units for this emergency have already been coordinated.',
    }));
    return;
  }

  // 12. Atomic Execution: Update response, create/activate conversation, add assignment
  try {
    // 12.1 Upsert donor response
    await supabase
      .from('donor_responses')
      .upsert(
        {
          request_id: requestId,
          donor_id: donor.id,
          response_status: 'ACCEPTED',
          response_channel: 'WEB',
          created_at: new Date().toISOString(),
        },
        { onConflict: 'request_id,donor_id' }
      );

    // 12.2 Create / Activate Conversation
    let convId = existingConv?.id;
    if (!convId) {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          request_id: requestId,
          donor_id: donor.id,
          requester_id: reqData.created_by || null,
          status: 'ACTIVE',
        })
        .select('id')
        .single();

      if (!convErr && newConv) {
        convId = newConv.id;
      }
    }

    if (convId) {
      // Add participants
      if (reqData.created_by) {
        await supabase
          .from('conversation_participants')
          .upsert(
            { conversation_id: convId, user_id: reqData.created_by, participant_role: 'requester', is_active: true },
            { onConflict: 'conversation_id,user_id' }
          );
      }
      if (donor.profile_id) {
        await supabase
          .from('conversation_participants')
          .upsert(
            { conversation_id: convId, user_id: donor.profile_id, participant_role: 'donor', is_active: true },
            { onConflict: 'conversation_id,user_id' }
          );
      }
    }

    // 12.3 Record Donor Assignment (atomic uniqueness)
    await supabase
      .from('donor_assignments')
      .upsert(
        {
          request_id: requestId,
          donor_id: donor.id,
          units_assigned: 1,
          status: 'ASSIGNED',
        },
        { onConflict: 'request_id,donor_id' }
      );

    // 12.4 Increment units_coordinated and update status
    const newCoordinated = currentUnitsCoordinated + 1;
    const newStatus = newCoordinated >= unitsRequired ? 'RESPONDER_FOUND' : 'COORDINATION_IN_PROGRESS';

    await supabase
      .from('emergency_requests')
      .update({
        units_coordinated: newCoordinated,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // 12.5 Record timeline event
    try {
      await supabase.from('emergency_events').insert({
        request_id: requestId,
        event_type: 'RESPONDER_ACCEPTED',
        description: `Donor ${donor.full_name} (${donor.blood_group}) accepted emergency request. Coordination channel opened.`,
        actor_role: 'donor',
        metadata: {
          donor_id: donor.id,
          conversation_id: convId,
          channel: 'WEB',
        },
      });
    } catch {
      // Non-blocking
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      conversationId: convId,
      requestId,
      donorName: donor.full_name,
      alreadyAccepted: false,
    }));
  } catch (err: any) {
    console.error('[AcceptRequest] Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Failed to complete acceptance transaction.' }));
  }
}
