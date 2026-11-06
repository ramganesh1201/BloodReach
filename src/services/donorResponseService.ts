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

