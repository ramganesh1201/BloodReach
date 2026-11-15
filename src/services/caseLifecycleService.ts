/**
 * CareLoop — Case Lifecycle & History Service
 *
 * Manages database-backed emergency coordination case lifecycle:
 * - active -> completion_pending -> completed
 * - Propose, confirm, reject completion
 * - Coordinator/admin override resolution with mandatory audit reason
 * - Per-user archive & mute preferences
 * - Real call session history retrieval
 */

import { supabase } from './supabaseClient';
import {
  Conversation,
  CaseLifecycleStatus,
  CallHistoryRecord,
} from '../types';

export interface LifecycleActionResult {
  success: boolean;
  lifecycleStatus?: CaseLifecycleStatus;
  message?: string;
  error?: string;
}

/**
 * Propose completion of an active coordination case.
 * Both patient/attendant and assigned donor can propose.
 */
export async function proposeCaseCompletion(
  conversationId: string,
  reason?: string
): Promise<LifecycleActionResult> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('propose_case_completion', {
      p_conversation_id: conversationId,
      p_reason: reason || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to propose case completion.' };
    }

    return {
      success: true,
      lifecycleStatus: (data.lifecycle_status as CaseLifecycleStatus) || 'completion_pending',
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error proposing case completion.',
    };
  }
}

/**
 * Confirm case completion. Must be confirmed by the other participant or coordinator/admin.
 */
export async function confirmCaseCompletion(
  conversationId: string,
  notes?: string
): Promise<LifecycleActionResult> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('confirm_case_completion', {
      p_conversation_id: conversationId,
      p_notes: notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to confirm case completion.' };
    }

    return {
      success: true,
      lifecycleStatus: (data.lifecycle_status as CaseLifecycleStatus) || 'completed',
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error confirming case completion.',
    };
  }
}

/**
 * Reject a completion proposal and return the case to active status.
 */
export async function rejectCaseCompletion(
  conversationId: string,
  reason?: string
): Promise<LifecycleActionResult> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('reject_case_completion', {
      p_conversation_id: conversationId,
      p_reason: reason || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to reject case completion.' };
    }

    return {
      success: true,
      lifecycleStatus: (data.lifecycle_status as CaseLifecycleStatus) || 'active',
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error rejecting case completion.',
    };
  }
}

/**
 * Coordinator or Admin administrative resolution override.
 * Requires a mandatory reason (min 5 characters).
 */
export async function coordinatorResolveCase(
  conversationId: string,
  reason: string,
  resolutionNotes?: string
): Promise<LifecycleActionResult> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }
  if (!reason || reason.trim().length < 5) {
    return {
      success: false,
      error: 'A mandatory resolution reason of at least 5 characters is required.',
    };
  }

  try {
    const { data, error } = await supabase.rpc('coordinator_resolve_case', {
      p_conversation_id: conversationId,
      p_reason: reason.trim(),
      p_resolution_notes: resolutionNotes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to administratively resolve case.' };
    }

    return {
      success: true,
      lifecycleStatus: (data.lifecycle_status as CaseLifecycleStatus) || 'completed',
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error resolving case.',
    };
  }
}

/**
 * Toggle per-user archive status for a completed conversation.
 * Active cases cannot be archived.
 */
export async function toggleConversationArchive(
  conversationId: string,
  isArchived: boolean
): Promise<{ success: boolean; isArchived?: boolean; error?: string }> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('toggle_conversation_archive', {
      p_conversation_id: conversationId,
      p_archived: isArchived,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to update archive preference.' };
    }

    return { success: true, isArchived: data.is_archived };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error updating archive preference.',
    };
  }
}

/**
 * Toggle per-user mute status for conversation notifications.
 */
export async function toggleConversationMute(
  conversationId: string,
  isMuted: boolean
): Promise<{ success: boolean; isMuted?: boolean; error?: string }> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('toggle_conversation_mute', {
      p_conversation_id: conversationId,
      p_muted: isMuted,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.message || 'Failed to update mute preference.' };
    }

    return { success: true, isMuted: data.is_muted };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error updating mute preference.',
    };
  }
}

/**
 * Retrieve real call sessions associated with a conversation.
 */
export async function getConversationCallHistory(
  conversationId: string
): Promise<{ success: boolean; data?: CallHistoryRecord[]; error?: string }> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(conversationId)) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase.rpc('get_conversation_call_history', {
      p_conversation_id: conversationId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const calls: CallHistoryRecord[] = rawList.map((row: any) => ({
      id: row.id,
      conversationId: row.conversation_id,
      requestId: row.request_id,
      callerId: row.caller_id,
      receiverId: row.receiver_id,
      callType: row.call_type || 'VOICE',
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds || 0,
      endReason: row.end_reason,
      metadata: row.metadata,
    }));

    return { success: true, data: calls };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve call history.',
    };
  }
}

/**
 * Enrich raw conversations with lifecycle status and per-user preferences.
 */
export async function enrichConversationsWithLifecycle(
  conversations: Conversation[],
  currentUserId?: string
): Promise<Conversation[]> {
  if (!conversations || conversations.length === 0) return [];

  const conversationIds = conversations.map((c) => c.id).filter(Boolean);
  if (conversationIds.length === 0) return conversations;

  try {
    // 1. Fetch lifecycle metadata for conversations
    const { data: lifecycleRows } = await supabase
      .from('conversations')
      .select(`
        id,
        lifecycle_status,
        completion_proposed_by,
        completion_proposed_at,
        completion_proposal_reason,
        completed_by,
        completed_at,
        completion_notes,
        resolved_by_coordinator,
        coordinator_resolution_reason
      `)
      .in('id', conversationIds);

    const lifecycleMap = new Map<string, any>();
    (lifecycleRows || []).forEach((row) => {
      lifecycleMap.set(row.id, row);
    });

    // 2. Fetch current user's participant preferences (archive, mute)
    const participantMap = new Map<string, any>();
    if (currentUserId) {
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id, is_archived, archived_at, is_muted, muted_at')
        .eq('user_id', currentUserId)
        .in('conversation_id', conversationIds);

      (participantRows || []).forEach((row) => {
        participantMap.set(row.conversation_id, row);
      });
    }

    return conversations.map((conv) => {
      const lc = lifecycleMap.get(conv.id);
      const pref = participantMap.get(conv.id);

      // Infer lifecycle status if not set in database
      let resolvedLifecycle: CaseLifecycleStatus = 'active';
      if (lc?.lifecycle_status) {
        resolvedLifecycle = lc.lifecycle_status as CaseLifecycleStatus;
      } else if (conv.status === 'CLOSED') {
        resolvedLifecycle = 'completed';
      }

      return {
        ...conv,
        lifecycleStatus: resolvedLifecycle,
        completionProposedBy: lc?.completion_proposed_by || undefined,
        completionProposedAt: lc?.completion_proposed_at || undefined,
        completionProposalReason: lc?.completion_proposal_reason || undefined,
        completedBy: lc?.completed_by || undefined,
        completedAt: lc?.completed_at || undefined,
        completionNotes: lc?.completion_notes || undefined,
        resolvedByCoordinator: lc?.resolved_by_coordinator || undefined,
        coordinatorResolutionReason: lc?.coordinator_resolution_reason || undefined,
        isArchived: Boolean(pref?.is_archived),
        archivedAt: pref?.archived_at || undefined,
        isMuted: Boolean(pref?.is_muted),
        mutedAt: pref?.muted_at || undefined,
      };
    });
  } catch (err) {
    console.warn('[caseLifecycleService] Failed to enrich conversations:', err);
    return conversations;
  }
}
