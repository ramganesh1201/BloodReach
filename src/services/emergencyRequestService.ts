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
 */
export function generateReferenceCode(): string {
  const chars = '0123456789ABCDEF';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
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

  const referenceCode = generateReferenceCode();

  const insertPayload = {
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
  };

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
          return { success: false, error: retryError.message };
        }
        return { success: true, data: mapDbToEmergencyRequest(retryInserted) };
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
  requestId: string
): Promise<{ success: boolean; data?: EmergencyRequest; error?: string }> {
  if (!requestId) {
    return { success: false, error: 'Request ID is required.' };
  }

  try {
    // 1. Direct query on emergency_requests (succeeds if creator, staff, or assigned)
    const { data: fullReq, error: fullError } = await supabase
      .from('emergency_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (fullReq) {
      return { success: true, data: mapDbToEmergencyRequest(fullReq) };
    }

    // 2. Fallback to privacy-preserving discoverable view
    const { data: discReq, error: discError } = await supabase
      .from('discoverable_emergency_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

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

