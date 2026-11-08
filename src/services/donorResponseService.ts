/**
 * CareLoop — Donor Response Service
 * 
 * Manages donor responses and atomic acceptance via the database RPC:
 * `accept_request_and_create_conversation(UUID, UUID)`.
 */

import { supabase } from './supabaseClient';
import { Donor, DonorResponse, BloodGroup, BloodComponent } from '../types';

export interface AcceptRequestResult {
  success: boolean;
  conversationId?: string;
  requestId?: string;
  donorName?: string;
  alreadyAccepted?: boolean;
  error?: string;
}

export interface DonorOnboardingInput {
  fullName: string;
  phone: string;
  email?: string;
  bloodGroup: BloodGroup;
  gender?: 'male' | 'female' | 'other';
  age: number;
  weightKg: number;
  city: string;
  district?: string;
  state?: string;
  donationHistory: number;
  lastDonatedAt?: string;
  donationType?: BloodComponent;
  isAvailable: boolean;
}

export function normalizePhoneNumber(rawPhone: string): string {
  const cleaned = rawPhone.trim().replace(/[\s\-()]/g, '');
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (/^(\+91|91)[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.replace(/^(\+91|91)/, '');
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  return rawPhone.trim();
}

export function validateDonorOnboardingInput(data: DonorOnboardingInput): { valid: boolean; error?: string } {
  if (!data.fullName || data.fullName.trim().length === 0) {
    return { valid: false, error: 'Full name is required.' };
  }
  if (!data.phone || data.phone.trim().length < 7 || data.phone.trim().length > 50) {
    return { valid: false, error: 'Valid contact phone number is required (7-50 characters).' };
  }
  const cleanDigits = data.phone.replace(/\D/g, '');
  if (cleanDigits.length < 7 || cleanDigits.length > 15) {
    return { valid: false, error: 'Please enter a valid telephone number (7-15 digits).' };
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const validBloodGroups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!validBloodGroups.includes(data.bloodGroup)) {
    return { valid: false, error: `Invalid blood group: ${data.bloodGroup}` };
  }
  if (!Number.isInteger(data.age) || data.age < 18 || data.age > 65) {
    return { valid: false, error: 'Eligible donor age must be between 18 and 65 years.' };
  }
  if (typeof data.weightKg !== 'number' || data.weightKg < 45) {
    return { valid: false, error: 'Eligible donor weight must be at least 45 kg.' };
  }
  if (!data.city || data.city.trim().length === 0) {
    return { valid: false, error: 'City is required.' };
  }
  if (data.donationHistory < 0 || !Number.isInteger(data.donationHistory)) {
    return { valid: false, error: 'Total donations must be a non-negative integer.' };
  }
  if (data.lastDonatedAt) {
    const lastDate = new Date(data.lastDonatedAt);
    if (isNaN(lastDate.getTime())) {
      return { valid: false, error: 'Invalid last donation date format.' };
    }
    if (lastDate > new Date()) {
      return { valid: false, error: 'Last donation date cannot be in the future.' };
    }
  }
  return { valid: true };
}

/**
 * Map raw database row to frontend Donor domain model
 */
export function mapDbToDonor(row: any): Donor {
  return {
    id: row.id,
    profileId: row.profile_id ?? undefined,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? undefined,
    bloodGroup: row.blood_group as BloodGroup,
    city: row.city,
    district: row.district ?? undefined,
    isAvailable: Boolean(row.is_available),
    lastDonatedAt: row.last_donated_at ?? undefined,
    lastDonatedComponent: (row.last_donated_component as BloodComponent) ?? undefined,
    isMedicallyCleared: Boolean(row.is_medically_cleared ?? true),
    deferralUntil: row.deferral_until ?? undefined,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
    totalDonations: Number(row.total_donations ?? 0),
    registeredAt: row.created_at,
  };
}

/**
 * Retrieve verified donor record for the authenticated user profile
 */
export async function getDonorProfileByUserId(
  userId: string
): Promise<{ success: boolean; data?: Donor | null; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User ID is required.' };
  }

  try {
    const { data, error } = await supabase
      .from('donors')
      .select('*')
      .eq('profile_id', userId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data ? mapDbToDonor(data) : null };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve donor profile.',
    };
  }
}

/**
 * Submit verified donor onboarding application
 * Persists to public.donors with is_medically_cleared: false awaiting administrative role activation
 */
export async function submitDonorOnboarding(
  input: DonorOnboardingInput,
  userId: string
): Promise<{ success: boolean; data?: Donor; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User must be authenticated to submit donor registration.' };
  }

  const validation = validateDonorOnboardingInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const birthYear = new Date().getFullYear() - input.age;
  const estimatedBirthDate = `${birthYear}-01-01`;
  const normalizedPhone = normalizePhoneNumber(input.phone);

  const payload = {
    profile_id: userId,
    full_name: input.fullName.trim(),
    phone: normalizedPhone,
    email: input.email?.trim() || null,
    blood_group: input.bloodGroup,
    city: input.city.trim(),
    district: input.district?.trim() || null,
    weight_kg: input.weightKg,
    birth_date: estimatedBirthDate,
    last_donated_at: input.lastDonatedAt || null,
    last_donated_component: input.donationType || null,
    is_available: input.isAvailable ?? true,
    total_donations: input.donationHistory ?? 0,
    is_medically_cleared: false, // Requires clinical verification & admin approval
  };

  try {
    const { data, error } = await supabase
      .from('donors')
      .upsert(payload, { onConflict: 'profile_id' })
      .select()
      .single();

    if (error) {
      if (
        error.code === '23505' ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('donors_phone_key')
      ) {
        return {
          success: false,
          error: 'This phone number is already registered to another volunteer donor profile.',
        };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: mapDbToDonor(data) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit donor onboarding.' };
  }
}

/**
 * Accept an emergency donation request atomically
 * Executes `public.accept_request_and_create_conversation` RPC
 */
export async function acceptRequestAndCreateConversation(
  requestId: string,
  donorId?: string
): Promise<AcceptRequestResult> {
  if (!requestId) {
    return { success: false, error: 'Request ID is required.' };
  }

  try {
    const params: Record<string, any> = {
      p_request_id: requestId,
    };
    if (donorId) {
      params.p_donor_id = donorId;
    }

    const { data, error } = await supabase.rpc('accept_request_and_create_conversation', params);

    if (error) {
      return { success: false, error: error.message };
    }

    // The RPC returns a JSONB payload
    const result = data as {
      success: boolean;
      message?: string;
      conversation_id?: string;
      request_id?: string;
      donor_name?: string;
      already_accepted?: boolean;
    };

    if (!result || result.success === false) {
      return {
        success: false,
        error: result?.message || 'Failed to accept emergency request.',
      };
    }

    return {
      success: true,
      conversationId: result.conversation_id,
      requestId: result.request_id,
      donorName: result.donor_name,
      alreadyAccepted: Boolean(result.already_accepted),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error during donor acceptance.',
    };
  }
}

/**
 * Decline an emergency request
 */
export async function declineRequest(
  requestId: string,
  donorId: string
): Promise<{ success: boolean; error?: string }> {
  if (!requestId || !donorId) {
    return { success: false, error: 'Request ID and Donor ID are required.' };
  }

  try {
    const { error } = await supabase
      .from('donor_responses')
      .upsert(
        {
          request_id: requestId,
          donor_id: donorId,
          response_status: 'DECLINED',
          response_channel: 'WEB',
        },
        { onConflict: 'request_id,donor_id' }
      );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to record response.',
    };
  }
}

/**
 * Retrieve donor responses for the given donor
 */
export async function getDonorResponses(
  donorId: string
): Promise<{ success: boolean; data?: DonorResponse[]; error?: string }> {
  if (!donorId) {
    return { success: false, error: 'Donor ID is required.' };
  }

  try {
    const { data, error } = await supabase
      .from('donor_responses')
      .select('*')
      .eq('donor_id', donorId);

    if (error) {
      return { success: false, error: error.message };
    }

    const mapped: DonorResponse[] = (data || []).map((row: any) => ({
      id: row.id,
      requestId: row.request_id,
      donorId: row.donor_id,
      responseStatus: row.response_status as 'NOTIFIED' | 'ACCEPTED' | 'DECLINED',
      responseChannel: (row.response_channel as 'WEB' | 'SMS') || 'WEB',
      timestamp: row.created_at,
    }));

    return { success: true, data: mapped };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve responses.',
    };
  }
}

