/**
 * CareLoop — Emergency Request Service
 * 
 * Provides database operations for emergency blood donation requests against
 * Supabase `public.emergency_requests` and `public.discoverable_emergency_requests`.
 */

import { supabase } from './supabaseClient';
import {
  EmergencyRequest,
  BloodGroup,
  BloodComponent,
  UrgencyLevel,
  EmergencyStatus,
} from '../types';

export interface CreateEmergencyRequestInput {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  landmark?: string;
  hospitalContactPerson?: string;
  city: string;
  district?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  contactName: string;
  contactPhone: string;
  preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  requiredDateTime?: string;
  additionalInstructions?: string;
  notes?: string;
}

const VALID_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_COMPONENTS: BloodComponent[] = ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'];
const VALID_URGENCIES: UrgencyLevel[] = ['Today', 'Urgent', 'Critical'];

/**
 * Generate a unique, clinical reference code (e.g., CL-8F42)
 * Uses cryptographically secure random entropy via crypto.getRandomValues
 */
export function generateReferenceCode(): string {
  const chars = '0123456789ABCDEF';
  let suffix = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(bytes[i] % chars.length);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return `CL-${suffix}`;
}

/**
 * Validate input fields before submission
 */
export function validateEmergencyRequestInput(data: CreateEmergencyRequestInput): { valid: boolean; error?: string } {
  if (!VALID_BLOOD_GROUPS.includes(data.bloodGroup)) {
    return { valid: false, error: `Invalid blood group: ${data.bloodGroup}` };
  }
  if (!VALID_COMPONENTS.includes(data.component)) {
    return { valid: false, error: `Invalid blood component: ${data.component}` };
  }
  if (!VALID_URGENCIES.includes(data.urgency)) {
    return { valid: false, error: `Invalid urgency level: ${data.urgency}` };
  }
  if (!Number.isInteger(data.unitsRequired) || data.unitsRequired <= 0) {
    return { valid: false, error: 'Units required must be a positive integer.' };
  }
  if (!data.hospitalName || data.hospitalName.trim().length === 0) {
    return { valid: false, error: 'Hospital name is required.' };
  }
  if (!data.hospitalAddress || data.hospitalAddress.trim().length === 0) {
    return { valid: false, error: 'Hospital address is required.' };
  }
  if (!data.city || data.city.trim().length === 0) {
    return { valid: false, error: 'City is required.' };
  }
  if (!data.contactName || data.contactName.trim().length === 0) {
    return { valid: false, error: 'Contact person name is required.' };
  }
  if (!data.contactPhone || data.contactPhone.trim().length < 7) {
    return { valid: false, error: 'A valid contact phone number is required.' };
  }
  return { valid: true };
}

/**
 * Map raw database row to frontend EmergencyRequest domain model
 */
export function mapDbToEmergencyRequest(row: any): EmergencyRequest {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    bloodGroup: row.blood_group as BloodGroup,
    component: row.component as BloodComponent,
    unitsRequired: Number(row.units_required),
    unitsCoordinated: Number(row.units_coordinated ?? 0),
    urgency: row.urgency as UrgencyLevel,
    hospitalName: row.hospital_name,
    hospitalAddress: row.hospital_address,
    city: row.city,
    district: row.district ?? undefined,
    state: row.state ?? 'Andhra Pradesh',
    postalCode: row.postal_code ?? undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    contactName: row.contact_name ?? '',
    contactPhone: row.contact_phone ?? '',
    preferredContact: (row.contact_method as 'Phone' | 'SMS' | 'WhatsApp') || 'Phone',
    status: row.status as EmergencyStatus,
    escalationLevel: Number(row.escalation_level ?? 1),
    createdBy: row.created_by ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    notes: row.notes ?? undefined,
    trackingToken: row.tracking_token ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new emergency blood request in the database
 */
export async function createEmergencyRequest(
  data: CreateEmergencyRequestInput,
  userId?: string | null
): Promise<{ success: boolean; data?: EmergencyRequest; error?: string }> {
  const validation = validateEmergencyRequestInput(data);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const requestId = crypto.randomUUID();
  const referenceCode = generateReferenceCode();
  const trackingToken = crypto.randomUUID();

  const insertPayload = {
    id: requestId,
    reference_code: referenceCode,
    blood_group: data.bloodGroup,
    component: data.component,
    units_required: data.unitsRequired,
    units_coordinated: 0,
    urgency: data.urgency,
    hospital_name: data.hospitalName.trim(),
    hospital_address: data.hospitalAddress.trim(),
    city: data.city.trim(),
    district: data.district?.trim() || null,
    state: data.state?.trim() || 'Andhra Pradesh',
    postal_code: data.postalCode?.trim() || null,
    lat: data.latitude ?? null,
    lng: data.longitude ?? null,
    contact_name: data.contactName.trim(),
    contact_phone: data.contactPhone.trim(),
    contact_method: data.preferredContact,
    status: 'CREATED',
    escalation_level: 1,
    created_by: userId || null,
    notes: data.notes || data.additionalInstructions || null,
    tracking_token: trackingToken,
  };

  // 1. For guest submissions, invoke atomic submit_guest_emergency_request RPC to guarantee DB commit
  if (!userId) {
    try {
      const { data: rpcRes, error: rpcError } = await supabase.rpc('submit_guest_emergency_request', {
        p_id: requestId,
        p_reference_code: referenceCode,
        p_blood_group: data.bloodGroup,
        p_component: data.component,
        p_units_required: data.unitsRequired,
        p_urgency: data.urgency,
        p_hospital_name: data.hospitalName.trim(),
        p_hospital_address: data.hospitalAddress.trim(),
        p_city: data.city.trim(),
        p_district: data.district?.trim() || null,
        p_state: data.state?.trim() || 'Andhra Pradesh',
        p_postal_code: data.postalCode?.trim() || null,
        p_lat: data.latitude ?? null,
        p_lng: data.longitude ?? null,
        p_contact_name: data.contactName.trim(),
        p_contact_phone: data.contactPhone.trim(),
        p_contact_method: data.preferredContact,
        p_notes: data.notes || data.additionalInstructions || null,
        p_tracking_token: trackingToken,
      });

      if (!rpcError && rpcRes && rpcRes.success) {
        const assignedToken = rpcRes.tracking_token || trackingToken;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`careloop_tracking_token_${rpcRes.id || requestId}`, assignedToken);
          } catch {
            // Storage quota or restricted context
          }
        }
        return {
          success: true,
          data: {
            id: rpcRes.id || requestId,
            referenceCode: rpcRes.reference_code || referenceCode,
            bloodGroup: data.bloodGroup,
            component: data.component,
            unitsRequired: data.unitsRequired,
            unitsCoordinated: 0,
            urgency: data.urgency,
            hospitalName: data.hospitalName.trim(),
            hospitalAddress: data.hospitalAddress.trim(),
            city: data.city.trim(),
            district: data.district?.trim() || undefined,
            state: data.state?.trim() || 'Andhra Pradesh',
            postalCode: data.postalCode?.trim() || undefined,
            lat: data.latitude ?? undefined,
            lng: data.longitude ?? undefined,
            contactName: data.contactName.trim(),
            contactPhone: data.contactPhone.trim(),
            preferredContact: data.preferredContact,
            status: 'CREATED',
            escalationLevel: 1,
            createdBy: undefined,
            cancellationReason: undefined,
            notes: data.notes || data.additionalInstructions || undefined,
            trackingToken: assignedToken,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      if (rpcRes?.collision) {
        // Retry once with fresh reference code
        const retryCode = generateReferenceCode();
        const retryId = crypto.randomUUID();
        const retryToken = crypto.randomUUID();
        const { data: retryRes, error: retryError } = await supabase.rpc('submit_guest_emergency_request', {
          p_id: retryId,
          p_reference_code: retryCode,
          p_blood_group: data.bloodGroup,
          p_component: data.component,
          p_units_required: data.unitsRequired,
          p_urgency: data.urgency,
          p_hospital_name: data.hospitalName.trim(),
          p_hospital_address: data.hospitalAddress.trim(),
          p_city: data.city.trim(),
          p_district: data.district?.trim() || null,
          p_state: data.state?.trim() || 'Andhra Pradesh',
          p_postal_code: data.postalCode?.trim() || null,
          p_lat: data.latitude ?? null,
          p_lng: data.longitude ?? null,
          p_contact_name: data.contactName.trim(),
          p_contact_phone: data.contactPhone.trim(),
          p_contact_method: data.preferredContact,
          p_notes: data.notes || data.additionalInstructions || null,
          p_tracking_token: retryToken,
        });

        if (!retryError && retryRes && retryRes.success) {
          const assignedRetryToken = retryRes.tracking_token || retryToken;
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(`careloop_tracking_token_${retryRes.id || retryId}`, assignedRetryToken);
            } catch {
              // Storage quota or restricted context
            }
          }
          return {
            success: true,
            data: {
              id: retryRes.id || retryId,
              referenceCode: retryRes.reference_code || retryCode,
              bloodGroup: data.bloodGroup,
              component: data.component,
              unitsRequired: data.unitsRequired,
              unitsCoordinated: 0,
              urgency: data.urgency,
              hospitalName: data.hospitalName.trim(),
              hospitalAddress: data.hospitalAddress.trim(),
              city: data.city.trim(),
              district: data.district?.trim() || undefined,
              state: data.state?.trim() || 'Andhra Pradesh',
              postalCode: data.postalCode?.trim() || undefined,
              lat: data.latitude ?? undefined,
              lng: data.longitude ?? undefined,
              contactName: data.contactName.trim(),
              contactPhone: data.contactPhone.trim(),
              preferredContact: data.preferredContact,
              status: 'CREATED',
              escalationLevel: 1,
              createdBy: undefined,
              cancellationReason: undefined,
              notes: data.notes || data.additionalInstructions || undefined,
              trackingToken: assignedRetryToken,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          };
        }
      }

      if (rpcRes && !rpcRes.success && rpcRes.error) {
        return { success: false, error: rpcRes.error };
      }
    } catch {
      // Fall through to direct table insert if RPC is unavailable in older schema/mock environments
    }
  }

  try {
    const { data: inserted, error } = await supabase
      .from('emergency_requests')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      // Check for reference code collision (retry once with fresh code)
      if (error.code === '23505' && error.message?.includes('reference_code')) {
        const retryCode = generateReferenceCode();
        const retryPayload = { ...insertPayload, reference_code: retryCode };
        const { data: retryInserted, error: retryError } = await supabase
          .from('emergency_requests')
          .insert(retryPayload)
          .select()
          .single();

        if (retryError) {
          if (retryError.code === 'PGRST116' || retryError.message?.includes('JSON object requested')) {
            return {
              success: true,
              data: {
                id: requestId,
                referenceCode: retryCode,
                bloodGroup: data.bloodGroup,
                component: data.component,
                unitsRequired: data.unitsRequired,
                unitsCoordinated: 0,
                urgency: data.urgency,
                hospitalName: data.hospitalName.trim(),
                hospitalAddress: data.hospitalAddress.trim(),
                city: data.city.trim(),
                district: data.district?.trim() || undefined,
                state: data.state?.trim() || 'Andhra Pradesh',
                postalCode: data.postalCode?.trim() || undefined,
                lat: data.latitude ?? undefined,
                lng: data.longitude ?? undefined,
                contactName: data.contactName.trim(),
                contactPhone: data.contactPhone.trim(),
                preferredContact: data.preferredContact,
                status: 'CREATED',
                escalationLevel: 1,
                createdBy: undefined,
                cancellationReason: undefined,
                notes: data.notes || data.additionalInstructions || undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            };
          }
          return { success: false, error: retryError.message };
        }
        return { success: true, data: mapDbToEmergencyRequest(retryInserted) };
      }

      // Guest submission permission handling:
      // When unauthenticated guests submit an emergency request, the INSERT succeeds under
      // the RLS policy "Authorized roles create requests", but the appended .select().single()
      // returns PGRST116 because guests do not hold SELECT privileges on raw emergency_requests.
      if (error.code === 'PGRST116' || error.message?.includes('JSON object requested')) {
        return {
          success: true,
          data: {
            id: requestId,
            referenceCode: insertPayload.reference_code,
            bloodGroup: data.bloodGroup,
            component: data.component,
            unitsRequired: data.unitsRequired,
            unitsCoordinated: 0,
            urgency: data.urgency,
            hospitalName: data.hospitalName.trim(),
            hospitalAddress: data.hospitalAddress.trim(),
            city: data.city.trim(),
            district: data.district?.trim() || undefined,
            state: data.state?.trim() || 'Andhra Pradesh',
            postalCode: data.postalCode?.trim() || undefined,
            lat: data.latitude ?? undefined,
            lng: data.longitude ?? undefined,
            contactName: data.contactName.trim(),
            contactPhone: data.contactPhone.trim(),
            preferredContact: data.preferredContact,
            status: 'CREATED',
            escalationLevel: 1,
            createdBy: undefined,
            cancellationReason: undefined,
            notes: data.notes || data.additionalInstructions || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      return { success: false, error: error.message };
    }

    return { success: true, data: mapDbToEmergencyRequest(inserted) };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network failure while creating emergency request.',
    };
  }
}

/**
 * Retrieve all emergency requests created by the authenticated user
 */
export async function getMyEmergencyRequests(
  userId: string
): Promise<{ success: boolean; data?: EmergencyRequest[]; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User identifier is required.' };
  }

  try {
    const { data, error } = await supabase
      .from('emergency_requests')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []).map(mapDbToEmergencyRequest) };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to fetch your emergency requests.',
    };
  }
}

/**
 * Retrieve emergency request details by ID
 * Tries direct table first (creator/staff/assigned), falls back to discoverable view
 */
export async function getEmergencyRequestById(
  requestId: string,
  trackingToken?: string
): Promise<{ success: boolean; data?: EmergencyRequest; error?: string }> {
  if (!requestId) {
    return { success: false, error: 'Request ID is required.' };
  }

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId);
    const resolvedToken = trackingToken || (typeof localStorage !== 'undefined' ? localStorage.getItem(`careloop_tracking_token_${requestId}`) : null);

    // 1. Direct query on emergency_requests (succeeds if creator, staff, or assigned)
    let fullReqQuery = supabase.from('emergency_requests').select('*');
    if (isUuid) {
      fullReqQuery = fullReqQuery.eq('id', requestId);
    } else {
      fullReqQuery = fullReqQuery.ilike('reference_code', requestId);
    }
    const { data: fullReq, error: fullError } = await fullReqQuery.maybeSingle();

    if (fullReq) {
      return { success: true, data: mapDbToEmergencyRequest(fullReq) };
    }

    // 2. High-security tracking RPC: requires secret tracking_token for anonymous guests
    // or authenticated session for request owners/coordinators
    try {
      const isTokenUuid = resolvedToken ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedToken) : false;
      const { data: trackData } = await supabase.rpc('track_emergency_request', {
        p_tracking_token: isTokenUuid ? resolvedToken : null,
        p_request_id: isUuid ? requestId : null,
        p_reference_code: isUuid ? null : requestId,
      });
      const trackRow = Array.isArray(trackData) ? trackData[0] : trackData;
      if (trackRow && trackRow.id) {
        return { success: true, data: mapDbToEmergencyRequest(trackRow) };
      }
    } catch {
      // Ignore if RPC unavailable in older schema or mock environments
    }

    // 3. Fallback to privacy-preserving discoverable view (active requests)
    let discReqQuery = supabase.from('discoverable_emergency_requests').select('*');
    if (isUuid) {
      discReqQuery = discReqQuery.eq('id', requestId);
    } else {
      discReqQuery = discReqQuery.ilike('reference_code', requestId);
    }
    const { data: discReq, error: discError } = await discReqQuery.maybeSingle();

    if (discReq) {
      return { success: true, data: mapDbToEmergencyRequest(discReq) };
    }

    const finalError = fullError?.message || discError?.message || 'Emergency request not found.';
    return { success: false, error: finalError };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve request details.',
    };
  }
}

/**
 * Cancel an emergency request
 */
export async function cancelEmergencyRequest(
  requestId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!requestId) {
    return { success: false, error: 'Request ID is required.' };
  }
  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Cancellation reason is required.' };
  }

  try {
    const { error } = await supabase
      .from('emergency_requests')
      .update({
        status: 'CANCELLED',
        cancellation_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .not('status', 'in', '("FULFILLED","CANCELLED","EXPIRED")');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to cancel emergency request.',
    };
  }
}

