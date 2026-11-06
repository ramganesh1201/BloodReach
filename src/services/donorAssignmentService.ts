import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DonorAssignment, BloodGroup } from '../types';

export interface AssignmentResult {
  success: boolean;
  assignmentId?: string;
  unitsCoordinated?: number;
  unitsRequired?: number;
  alreadyAssigned?: boolean;
  error?: string;
  message?: string;
}

export const mapDbToAssignment = (row: any): DonorAssignment => ({
  id: row.id,
  requestId: row.request_id,
  donorId: row.donor_id || row.blood_centre_id || '',
  donorName: row.donors?.full_name || row.blood_centres?.name || 'Assigned Responder',
  donorPhone: row.donors?.phone || row.blood_centres?.phone || '',
  donorBloodGroup: (row.donors?.blood_group || 'O+') as BloodGroup,
  unitsAssigned: Number(row.units_assigned || 1),
  status: row.status as 'ASSIGNED' | 'CONFIRMED' | 'DONATED' | 'CANCELLED',
  assignedAt: row.assigned_at || row.created_at || new Date().toISOString(),
  coordinatorId: row.coordinator_id,
  notes: row.notes,
});

/**
 * Assign a registered donor to an emergency request atomically.
 * Prevents over-coordination, checks donor availability, and updates request status.
 */
export async function assignDonorAtomic(params: {
  requestId: string;
  donorId: string;
  units?: number;
  coordinatorId?: string;
}): Promise<AssignmentResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase.rpc('assign_donor_atomic', {
      p_request_id: params.requestId,
      p_donor_id: params.donorId,
      p_units: params.units || 1,
      p_coordinator_id: params.coordinatorId || null,
    });

    if (error) {
      console.error('[AssignmentService] RPC error assign_donor_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.message || 'Donor assignment failed',
        message: data?.message,
      };
    }

    return {
      success: true,
      assignmentId: data.assignment_id,
      unitsCoordinated: data.units_coordinated,
      unitsRequired: data.units_required,
      alreadyAssigned: Boolean(data.already_assigned),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error assigning donor' };
  }
}

/**
 * Assign a verified blood centre to provide stock for an emergency request atomically.
 */
export async function assignBloodCentreAtomic(params: {
  requestId: string;
  centreId: string;
  units?: number;
  coordinatorId?: string;
}): Promise<AssignmentResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase.rpc('assign_blood_centre_atomic', {
      p_request_id: params.requestId,
      p_centre_id: params.centreId,
      p_units: params.units || 1,
      p_coordinator_id: params.coordinatorId || null,
    });

    if (error) {
      console.error('[AssignmentService] RPC error assign_blood_centre_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.message || 'Blood centre assignment failed',
        message: data?.message,
      };
    }

    return {
      success: true,
      assignmentId: data.assignment_id,
      unitsCoordinated: data.units_coordinated,
      unitsRequired: data.units_required,
      alreadyAssigned: Boolean(data.already_assigned),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error assigning blood centre' };
  }
}

/**
 * Cancel an assignment atomically and decrement coordinated units safely.
 */
export async function cancelAssignmentAtomic(params: {
  assignmentId: string;
  reason?: string;
}): Promise<{ success: boolean; unitsCoordinated?: number; error?: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase.rpc('cancel_donor_assignment_atomic', {
      p_assignment_id: params.assignmentId,
      p_reason: params.reason || 'Cancelled by coordinator',
    });

    if (error) {
      console.error('[AssignmentService] RPC error cancel_donor_assignment_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to cancel assignment' };
    }

    return {
      success: true,
      unitsCoordinated: data.units_coordinated,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error cancelling assignment' };
  }
}

/**
 * Fetch all assignments for an emergency request
 */
export async function fetchAssignmentsForRequest(requestId: string): Promise<{ data: DonorAssignment[]; error?: string }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('donor_assignments')
      .select('*, donors(full_name, phone, blood_group), blood_centres(name, phone)')
      .eq('request_id', requestId)
      .order('assigned_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data || []).map(mapDbToAssignment) };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch assignments' };
  }
}

/**
 * Realtime subscription to assignments for a request
 */
export function subscribeToRequestAssignments(
  requestId: string,
  onUpdate: (assignment: DonorAssignment) => void
): () => void {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel(`request-assignments:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'donor_assignments',
        filter: `request_id=eq.${requestId}`,
      },
      (payload) => {
        if (payload.new && (payload.new as any).id) {
          onUpdate(mapDbToAssignment(payload.new));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

