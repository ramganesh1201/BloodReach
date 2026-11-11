// ============================================================================
// CareLoop — FCM HTTP v1 Push Dispatch Supabase Edge Function
// Runtime: Deno (Supabase Edge Runtime)
// File: supabase/functions/dispatch-push-notification/index.ts
// ============================================================================
// SECURITY & CLINICAL INTEGRITY MANDATES:
// 1. Strict Caller Authentication:
//    - Authenticates Supabase caller via supabaseAdmin.auth.getUser(token).
//    - Rejects missing, invalid, or expired sessions (HTTP 401).
// 2. Request Ownership & Role-Based Access:
//    - Strict requestId requirement for all patient-originated dispatches (HTTP 400).
//    - Caller must own the emergency request (created_by === user.id) OR possess
//      an explicitly authorized staff role ('coordinator', 'admin', 'blood_centre').
//    - Rejects unauthorized cross-patient alert dispatches (HTTP 403).
//    - Rejects terminal request states (FULFILLED, CANCELLED, EXPIRED) (HTTP 400).
// 3. Server-Side Clinical Recipient Resolution:
//    - Never trusts client-supplied recipient IDs as proof of donor eligibility.
//    - Evaluates donor eligibility on the server using CareLoop NBTC 2023 rules:
//      * Active availability (is_available === true)
//      * Linked auth profile (profile_id is not null)
//      * Exclude self: creator never notified of own request
//      * Medical clearance & active deferral checking
//      * NBTC 2023 Weight criteria (>= 45 kg)
//      * NBTC 2023 Age criteria (18 - 65 years)
//      * NBTC 2023 Donation intervals (90d male, 120d female, 14d platelets, 28d plasma, 112d RBC)
//      * Geographic proximity (Haversine <= 50km or matching city/district)
//      * Component-specific ABO/Rh clinical compatibility tables (matchingEngine.ts)
//    - If client supplies recipient IDs, strictly filters down to the verified eligible subset.
// 4. Server-Generated Payload Security (Zero PII):
//    - Generates generic, approved clinical notification titles and bodies on server.
//    - Never trusts client-supplied titles or bodies.
//    - Strictly excludes patient names, contact telephone numbers, or private medical details.
//    - Restricts deep-link navigation exclusively to approved CareLoop routes (/donor, /track).
// 5. Accurate Invalid Token Pruning:
//    - Deletes device tokens ONLY when Firebase explicitly confirms the token is
//      unregistered or invalid (UNREGISTERED, NOT_FOUND, or explicit token format rejection).
//    - NEVER prunes tokens on generic INVALID_ARGUMENT (which may indicate payload format issues).
//    - Logs failures securely without leaking OAuth access tokens or service account private keys.
// 6. Google OAuth 2.0 RS256 Authentication:
//    - Exchanges service account credentials for Google OAuth 2.0 access token via Web Crypto API.
//    - Preserves secret names: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
//    - Returns honest PENDING_CONFIGURATION status if secrets are unconfigured.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cached OAuth2 Access Token
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// ============================================================================
// CLINICAL COMPATIBILITY TABLES (Mirrors matchingEngine.ts)
// ============================================================================
const RBC_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

const PLASMA_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A-', 'A+', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB-', 'AB+'],
};

const PLATELET_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-', 'O+', 'A-', 'B-', 'AB-'],
  'O+': ['O+', 'O-', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'O-'],
  'A+': ['A+', 'A-', 'AB+', 'O+'],
  'B-': ['B-', 'B+', 'AB-', 'O-'],
  'B+': ['B+', 'B-', 'AB+', 'O+'],
  'AB-': ['AB-', 'AB+', 'A-', 'B-'],
  'AB+': ['AB+', 'AB-', 'A+', 'B+'],
};

const WHOLE_BLOOD_COMPATIBILITY: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O+'],
  'A-': ['A-'],
  'A+': ['A+'],
  'B-': ['B-'],
  'B+': ['B+'],
  'AB-': ['AB-'],
  'AB+': ['AB+'],
};

function checkClinicalCompatibility(
  patientGroup: string,
  donorGroup: string,
  component: string
): boolean {
  if (patientGroup === donorGroup) return true;

  let table: Record<string, string[]>;
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
      table = WHOLE_BLOOD_COMPATIBILITY;
      break;
  }

  const compatibleList = table[patientGroup] || [patientGroup];
  return compatibleList.includes(donorGroup);
}

function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

function isDonationIntervalSatisfied(
  lastDonatedAt: string | null | undefined,
  targetComponent: string,
  gender: string | null | undefined
): boolean {
  if (!lastDonatedAt) return true;
  const lastDate = new Date(lastDonatedAt).getTime();
  if (isNaN(lastDate)) return true;
  const now = Date.now();

  if (targetComponent === 'Platelets') {
    return now - lastDate >= 14 * 24 * 3600 * 1000;
  }
  if (targetComponent === 'Plasma') {
    return now - lastDate >= 28 * 24 * 3600 * 1000;
  }
  if (targetComponent === 'Packed RBC') {
    return now - lastDate >= 112 * 24 * 3600 * 1000;
  }

  // Whole Blood: 90 days male, 120 days female or unspecified
  const normGender = (gender || '').trim().toLowerCase();
  const requiredDays = normGender === 'male' ? 90 : 120;
  return now - lastDate >= requiredDays * 24 * 3600 * 1000;
}

function isDonorClinicallyEligible(
  donor: any,
  request: any,
  callerUserId: string
): boolean {
  // 1. Linked profile must exist and must not be the request creator
  if (!donor.profile_id || donor.profile_id === callerUserId) {
    return false;
  }

  // 2. Active availability
  if (!donor.is_available) {
    return false;
  }
  if (donor.availability_state && donor.availability_state !== 'AVAILABLE') {
    return false;
  }

  // 3. Medical clearance & active deferral
  if (donor.is_medically_cleared === false) {
    return false;
  }
  if (donor.deferral_until) {
    const deferralDate = new Date(donor.deferral_until).getTime();
    if (!isNaN(deferralDate) && deferralDate > Date.now()) {
      return false;
    }
  }

  // 4. Clinical weight criteria: >= 45 kg (NBTC 2023)
  if (donor.weight_kg != null && Number(donor.weight_kg) < 45) {
    return false;
  }

  // 5. Clinical age criteria: 18 - 65 (NBTC 2023)
  if (donor.age != null && (Number(donor.age) < 18 || Number(donor.age) > 65)) {
    return false;
  }
  if (donor.birth_date) {
    const bDate = new Date(donor.birth_date);
    if (!isNaN(bDate.getTime())) {
      const ageYears = Math.floor((Date.now() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (ageYears < 18 || ageYears > 65) {
        return false;
      }
    }
  }

  // 6. Donation intervals (NBTC 2023)
  if (!isDonationIntervalSatisfied(donor.last_donated_at, request.component, donor.gender)) {
    return false;
  }

  // 7. Clinical ABO/Rh compatibility
  if (!checkClinicalCompatibility(request.blood_group, donor.blood_group, request.component)) {
    return false;
  }

  // 8. Geographic scope / proximity:
  // If coordinates exist for both request and donor, enforce Haversine distance <= 50 km
  if (request.lat != null && request.lng != null && donor.lat != null && donor.lng != null) {
    const distanceKm = calculateHaversineDistanceKm(
      Number(request.lat),
      Number(request.lng),
      Number(donor.lat),
      Number(donor.lng)
    );
    if (distanceKm <= 50.0) {
      return true;
    }
  }

  // Fallback to locality matching (city or district)
  const reqCity = (request.city || '').trim().toLowerCase();
  const donorCity = (donor.city || '').trim().toLowerCase();
  if (reqCity && donorCity && reqCity === donorCity) {
    return true;
  }

  const reqDistrict = (request.district || '').trim().toLowerCase();
  const donorDistrict = (donor.district || '').trim().toLowerCase();
  if (reqDistrict && donorDistrict && reqDistrict === donorDistrict) {
    return true;
  }

  // If coordinates were present and exceeded radius, or localities do not match
  return false;
}

// ============================================================================
// GOOGLE OAUTH 2.0 RS256 TOKEN GENERATION
// ============================================================================
function pemToPkcs8(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getGoogleOAuth2AccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.accessToken;
  }

  const pkcs8Bytes = pemToPkcs8(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodeB64Url = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const unsignedToken = `${encodeB64Url(header)}.${encodeB64Url(claims)}`;
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${unsignedToken}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 token exchange failed: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in || 3600),
  };

  return tokenData.access_token;
}

// ============================================================================
// MAIN EDGE FUNCTION HANDLER
// ============================================================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 1. Initialize Supabase Admin Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Supabase server environment variables missing.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Strict Authentication: Authenticate Caller Context via Supabase Auth
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer /i, '').trim();

  if (!accessToken) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: Missing bearer authentication token.' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: Invalid or expired authentication session.' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const callerUserId = userData.user.id;

  // Retrieve user role from profiles table
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', callerUserId)
    .maybeSingle();

  const callerRole = profile?.role || 'patient';
  const isAuthorizedStaff = ['coordinator', 'admin', 'blood_centre'].includes(callerRole);

  // 3. Parse and Validate Request Payload
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON request payload.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const { requestId, recipientUserIds, clickUrl } = payload;

  // Enforce mandatory requestId
  if (!requestId || typeof requestId !== 'string' || requestId.trim().length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Valid requestId is required for push dispatch.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Verify Request Existence & Caller Authorization
  const { data: emergencyReq, error: reqFetchError } = await supabaseAdmin
    .from('emergency_requests')
    .select('id, created_by, blood_group, component, city, district, hospital_name, status, lat, lng')
    .eq('id', requestId.trim())
    .maybeSingle();

  if (reqFetchError || !emergencyReq) {
    return new Response(
      JSON.stringify({ success: false, error: 'Emergency request not found.' }),
      { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Disallow notification dispatches for terminal requests
  if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(emergencyReq.status)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Cannot dispatch push notifications for request in ${emergencyReq.status} state.`,
      }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Patient caller must own the emergency request
  if (!isAuthorizedStaff) {
    if (emergencyReq.created_by !== callerUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: You are not authorized to dispatch alerts for this emergency request.',
        }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 5. Server-Side Clinical Recipient Resolution
  // Query candidate donors from public.donors
  const { data: candidateDonors, error: donorFetchError } = await supabaseAdmin
    .from('donors')
    .select(
      'id, profile_id, blood_group, city, district, lat, lng, is_available, availability_state, is_medically_cleared, weight_kg, birth_date, age, gender, last_donated_at, last_donated_component, deferral_until'
    )
    .eq('is_available', true)
    .eq('is_medically_cleared', true)
    .not('profile_id', 'is', null);

  if (donorFetchError) {
    console.error('[dispatch-push-notification] Donor query error:', donorFetchError.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to resolve candidate donors from database.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Clinically evaluate each donor on server
  const eligibleDonors = (candidateDonors || []).filter((donor) =>
    isDonorClinicallyEligible(donor, emergencyReq, callerUserId)
  );

  const eligibleUserIds = new Set<string>(
    eligibleDonors.map((d) => d.profile_id).filter((id): id is string => Boolean(id))
  );

  // Recipient resolution: Never trust client-supplied recipient IDs blindly.
  // If client provided recipientUserIds, strictly filter down to clinically eligible recipients.
  let targetedUserIds: string[] = [];
  if (Array.isArray(recipientUserIds) && recipientUserIds.length > 0) {
    targetedUserIds = recipientUserIds.filter(
      (uid) => typeof uid === 'string' && eligibleUserIds.has(uid)
    );
  } else {
    targetedUserIds = Array.from(eligibleUserIds);
  }

  if (targetedUserIds.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        status: 'NO_ELIGIBLE_DONORS',
        message: 'No clinically eligible, available donors found matching emergency criteria in the request locality.',
        targetedUsersCount: 0,
        dispatchedCount: 0,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 6. Inspect Firebase Service Account Secrets
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY');

  const isConfigured = Boolean(
    projectId &&
    clientEmail &&
    privateKey &&
    projectId !== 'REPLACE_ME' &&
    clientEmail !== 'REPLACE_ME' &&
    privateKey !== 'REPLACE_ME'
  );

  if (!isConfigured) {
    return new Response(
      JSON.stringify({
        success: true,
        status: 'PENDING_CONFIGURATION',
        carrierConfigured: false,
        message: 'Push notification dispatch deferred: Firebase Service Account secrets pending configuration in Supabase Edge Functions.',
        targetedUsersCount: targetedUserIds.length,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 7. Resolve Recipient Device Tokens from Database Records
  const { data: deviceTokens, error: tokenFetchError } = await supabaseAdmin
    .from('device_tokens')
    .select('id, user_id, token, platform')
    .in('user_id', targetedUserIds);

  if (tokenFetchError || !deviceTokens || deviceTokens.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        status: 'NO_ACTIVE_TOKENS',
        message: 'No registered device push tokens found for targeted recipients.',
        targetedUsersCount: targetedUserIds.length,
        dispatchedCount: 0,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 8. Obtain Google OAuth 2.0 Access Token
  let oauthToken = '';
  try {
    oauthToken = await getGoogleOAuth2AccessToken(clientEmail!, privateKey!);
  } catch (authErr: any) {
    console.error('[dispatch-push-notification] OAuth error:', authErr.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to authenticate with Firebase Cloud Messaging.',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 9. Generate Approved Generic Notification Payload (Zero PII)
  const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const sanitizedTitle = `CareLoop Emergency Alert: ${emergencyReq.blood_group} Needed`;
  const sanitizedBody = `Urgent need for ${emergencyReq.blood_group} (${emergencyReq.component}) at ${emergencyReq.hospital_name || 'medical facility'}, ${emergencyReq.city}. Open CareLoop to respond.`;

  // Restrict navigation exclusively to approved CareLoop routes
  let safeRoute = `/donor?requestId=${encodeURIComponent(emergencyReq.id)}`;
  if (typeof clickUrl === 'string' && clickUrl.startsWith('/') && !clickUrl.startsWith('//') && !clickUrl.includes(':')) {
    if (clickUrl.startsWith('/donor') || clickUrl.startsWith('/track')) {
      safeRoute = clickUrl;
    }
  }

  const results: any[] = [];
  const invalidTokenIds: string[] = [];

  for (const record of deviceTokens) {
    try {
      const fcmPayload = {
        message: {
          token: record.token,
          notification: {
            title: sanitizedTitle,
            body: sanitizedBody,
          },
          data: {
            requestId: emergencyReq.id,
            click_action: safeRoute,
            url: safeRoute,
            timestamp: String(Date.now()),
          },
          webpush: {
            headers: {
              Urgency: 'high',
            },
            fcm_options: {
              link: `https://careloop-mauve.vercel.app${safeRoute}`,
            },
          },
        },
      };

      const res = await fetch(fcmEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload),
      });

      if (res.ok) {
        const resJson = await res.json();
        results.push({ userId: record.user_id, status: 'SENT', messageId: resJson.name });
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errorCode = errJson.error?.details?.[0]?.errorCode || errJson.error?.status;
        const errMessage = errJson.error?.message || `HTTP ${res.status}`;

        // Accurate token pruning: ONLY when Firebase explicitly confirms the token is unregistered or invalid
        const isUnregistered = errorCode === 'UNREGISTERED' || errMessage.includes('registration-token-not-registered');
        const isExplicitlyDeadToken =
          (res.status === 404 && (errorCode === 'UNREGISTERED' || errorCode === 'NOT_FOUND')) ||
          errMessage.includes('The registration token is not a valid FCM registration token');

        // Preserves valid tokens when the failure is generic INVALID_ARGUMENT or configuration error
        if (isUnregistered || isExplicitlyDeadToken) {
          invalidTokenIds.push(record.id);
        }

        console.warn(`[dispatch-push-notification] FCM delivery failed for user ${record.user_id}: ${errMessage}`);
        results.push({
          userId: record.user_id,
          status: 'FAILED',
          error: errMessage,
        });
      }
    } catch (sendErr: any) {
      console.warn(`[dispatch-push-notification] FCM transport error for user ${record.user_id}:`, sendErr.message);
      results.push({ userId: record.user_id, status: 'FAILED', error: sendErr.message });
    }
  }

  // 10. Prune Verified Invalid Tokens
  if (invalidTokenIds.length > 0) {
    await supabaseAdmin.from('device_tokens').delete().in('id', invalidTokenIds);
  }

  const successCount = results.filter((r) => r.status === 'SENT').length;

  return new Response(
    JSON.stringify({
      success: true,
      status: successCount > 0 ? 'DISPATCHED' : 'FAILED',
      totalTokensTargeted: deviceTokens.length,
      dispatchedCount: successCount,
      failedCount: results.length - successCount,
      prunedTokensCount: invalidTokenIds.length,
      results,
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
});
