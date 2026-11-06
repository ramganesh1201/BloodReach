/**
 * CareLoop — Conversation Service
 * 
 * Manages request-linked private communication channels and messages via
 * Supabase `public.conversations` and `public.messages`.
 */

import { supabase } from './supabaseClient';
import {
  Conversation,
  ConversationStatus,
  ChatMessage,
  UserRole,
  BloodGroup,
  BloodComponent,
  UrgencyLevel,
} from '../types';

/**
 * Map raw database message row to frontend ChatMessage domain model
 */
export function mapDbToChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role as UserRole | 'system',
    messageType: row.message_type as 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'COORDINATION_EVENT' | 'SYSTEM',
    content: row.content,
    clientMessageId: row.client_message_id ?? undefined,
    replyToMessageId: row.reply_to_id ?? undefined,
    timestamp: row.created_at,
    deliveryStatus: 'DELIVERED',
    isEdited: Boolean(row.is_edited),
  };
}

/**
 * Retrieve all conversations accessible by the authenticated user
 */
export async function getConversationsForUser(
  userId: string
): Promise<{ success: boolean; data?: Conversation[]; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User ID is required.' };
  }

  try {
    // Select conversation rows with related emergency request and donor records
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id,
        request_id,
        donor_id,
        requester_id,
        status,
        created_at,
        updated_at,
        closed_at,
        closure_reason,
        emergency_requests (
          reference_code,
          hospital_name,
          blood_group,
          component,
          units_required,
          urgency,
          contact_name,
          contact_phone
        ),
        donors (
          full_name,
          phone,
          blood_group,
          city
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const conversations: Conversation[] = (data || []).map((row: any) => {
      const req = row.emergency_requests;
      const donor = row.donors;

      return {
        id: row.id,
        requestId: row.request_id,
        donorId: row.donor_id,
        requesterId: row.requester_id ?? '',
        status: (row.status as ConversationStatus) || 'ACTIVE',
        donorName: donor?.full_name || 'Volunteer Donor',
        donorPhone: donor?.phone,
        donorBloodGroup: (donor?.blood_group as BloodGroup) || 'O+',
        donorCity: donor?.city,
        requesterName: req?.contact_name || 'Patient Attendant',
        requesterPhone: req?.contact_phone,
        referenceCode: req?.reference_code || 'CL-REQ',
        hospitalName: req?.hospital_name || 'Emergency Hospital',
        component: (req?.component as BloodComponent) || 'Packed RBC',
        unitsRequired: Number(req?.units_required ?? 1),
        urgency: (req?.urgency as UrgencyLevel) || 'Urgent',
        unreadCount: 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        closedAt: row.closed_at ?? undefined,
        closureReason: row.closure_reason ?? undefined,
      };
    });

    return { success: true, data: conversations };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve conversations.',
    };
  }
}

/**
 * Retrieve messages for a specific conversation
 */
export async function getConversationMessages(
  conversationId: string
): Promise<{ success: boolean; data?: ChatMessage[]; error?: string }> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  // Guard against querying PostgreSQL with non-UUID mock/demo identifiers
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(conversationId)) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []).map(mapDbToChatMessage) };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to retrieve conversation messages.',
    };
  }
}

/**
 * Send a chat message in an active conversation
 */
export async function sendChatMessage(
  conversationId: string,
  senderId: string,
  senderName: string,
  senderRole: UserRole | 'system',
  content: string,
  clientMessageId?: string
): Promise<{ success: boolean; data?: ChatMessage; error?: string }> {
  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required.' };
  }

  // Guard against querying PostgreSQL with non-UUID mock/demo identifiers
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(conversationId)) {
    return { success: false, error: 'Valid UUID conversation ID is required.' };
  }
  if (!senderId) {
    return { success: false, error: 'Sender ID is required.' };
  }
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Message content cannot be empty.' };
  }

  const payload = {
    conversation_id: conversationId,
    sender_id: senderId,
    sender_name: senderName,
    sender_role: senderRole,
    message_type: 'TEXT',
    content: content.trim(),
    client_message_id: clientMessageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && payload.client_message_id) {
        const { data: existing } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('client_message_id', payload.client_message_id)
          .maybeSingle();

        if (existing) {
          return { success: true, data: mapDbToChatMessage(existing) };
        }
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: mapDbToChatMessage(data) };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to send message.',
    };
  }
}

/**
 * Subscribe to realtime incoming messages for a conversation
 */
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void
): () => void {
  if (!conversationId) return () => {};

  const channelName = `chat:${conversationId}`;
  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: false },
    },
  });

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload: any) => {
      if (payload.new) {
        onMessage(mapDbToChatMessage(payload.new));
      }
    }
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

