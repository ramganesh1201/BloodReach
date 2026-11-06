/**
 * CareLoop — Donor Discovery Service
 * 
 * Provides privacy-preserving emergency request discovery for donors and
 * donor matching RPC calls for coordinators/patients.
 */

import { supabase } from './supabaseClient';
import { EmergencyRequest, BloodGroup } from '../types';
import { mapDbToEmergencyRequest } from './emergencyRequestService';

export interface MatchingDonorResult {
  donorId: string;
  bloodGroup: BloodGroup;
  city: string;
  district?: string;
  isAvailable: boolean;
  distanceKm: number | null;
}

export interface DiscoverableRequestFilters {
  bloodGroup?: BloodGroup;
  city?: string;
}

/**
 * Retrieve public/donor discoverable emergency blood requests
 * Uses privacy-preserving `discoverable_emergency_requests` view (omits patient phone/notes)
 */
export async function getDiscoverableRequests(
  filters?: DiscoverableRequestFilters
): Promise<{ success: boolean; data?: EmergencyRequest[]; error?: string }> {
  try {
    let query = supabase
      .from('discoverable_emergency_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.bloodGroup) {
      query = query.eq('blood_group', filters.bloodGroup);
    }
    if (filters?.city && filters.city.trim().length > 0) {
      query = query.ilike('city', `%${filters.city.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const requests = (data || []).map(mapDbToEmergencyRequest);
    return { success: true, data: requests };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve discoverable emergency requests.',
    };
  }
}

/**
 * Call the privacy-preserving donor discovery RPC: discover_matching_donors
 * Requires authentication and authorization (creator or coordinator)
 */
export async function discoverMatchingDonors(
  requestId: string,
  maxDistanceKm: number = 25.0
): Promise<{ success: boolean; data?: MatchingDonorResult[]; error?: string }> {
  if (!requestId) {
    return { success: false, error: 'Request ID is required.' };
  }
  if (maxDistanceKm <= 0 || maxDistanceKm > 500) {
    return { success: false, error: 'Distance radius must be between 1 km and 500 km.' };
  }

  try {
    const { data, error } = await supabase.rpc('discover_matching_donors', {
      p_request_id: requestId,
      p_max_distance_km: maxDistanceKm,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const mapped: MatchingDonorResult[] = (data || []).map((row: any) => ({
      donorId: row.donor_id,
      bloodGroup: row.blood_group as BloodGroup,
      city: row.city,
      district: row.district ?? undefined,
      isAvailable: Boolean(row.is_available),
      distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    }));

    return { success: true, data: mapped };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to discover matching donors.',
    };
  }
}

