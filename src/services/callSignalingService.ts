/**
 * CareLoop Secure WebRTC Realtime Signaling Service
 * 
 * Handles authenticated, private out-of-band signaling over Supabase Realtime
 * broadcast channels (call:{call_id} and user-calls:{user_id}) and local
 * BroadcastChannel for cross-tab multi-session execution.
 * 
 * Protocol:
 * 1. Incoming Call Alert: Caller dispatches call metadata to receiver's private channel.
 * 2. Handshake: When receiver answers, receiver subscribes to call channel and dispatches "signal:receiver_ready".
 * 3. Offer: Caller sends SDP offer ONLY after receiver_ready acknowledgment.
 * 4. Answer: Receiver sets remote description and dispatches SDP answer.
 * 5. ICE Exchange: Both peers exchange ICE candidates with pre-description buffering.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { CallSession } from '../types';

export interface CallSignalingCallbacks {
  onReceiverReady?: (payload: { calleeId: string }) => void;
  onOffer?: (payload: { sdp: RTCSessionDescriptionInit; callerId: string }) => void;
  onAnswer?: (payload: { sdp: RTCSessionDescriptionInit; answererId: string }) => void;
  onIceCandidate?: (payload: { candidate: RTCIceCandidateInit; senderId: string }) => void;
  onRinging?: (payload: { callId: string; receiverId: string }) => void;
  onAccepted?: (payload: { callId: string; receiverId: string }) => void;
  onRejected?: (payload: { callId: string; reason: string }) => void;
  onCancelled?: (payload: { callId: string; reason: string }) => void;
  onEnded?: (payload: { callId: string; reason: string; durationSeconds?: number }) => void;
}

export class CallSignalingService {
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private broadcastChannels: Map<string, BroadcastChannel> = new Map();
  private callbacksMap: Map<string, CallSignalingCallbacks> = new Map();
  private userIncomingChannels: Map<string, RealtimeChannel> = new Map();
  private incomingBroadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.incomingBroadcastChannel = new BroadcastChannel('careloop_incoming_calls');
      } catch (e) {
        console.warn('[Signaling] BroadcastChannel setup notice:', e);
      }
    }
  }

  /**
   * Subscribe user to receive remote incoming-call events (Cross-Device & Cross-Tab)
   */
  subscribeToUserIncomingCalls(
    userId: string,
    onIncomingCall: (session: CallSession) => void,
    onCallStateChange?: (callId: string, status: string, reason?: string) => void
  ): () => void {
    if (!userId) return () => {};

    // 1. Private Supabase Realtime channel for user's incoming call alerts
    const channelName = `user-calls:${userId}`;
    if (!this.userIncomingChannels.has(userId)) {
      const channel = supabase.channel(channelName, {
        config: {
          private: true, // Private channel enforced by RLS on realtime.messages
          broadcast: {
            self: false,
            ack: true,
          },
        },
      });

      // Listen for direct broadcast alerts
      channel.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
        if (payload && payload.id) {
          onIncomingCall(payload as CallSession);
        }
      });

      channel.on('broadcast', { event: 'call:state_change' }, ({ payload }) => {
        if (payload && payload.callId) {
          onCallStateChange?.(payload.callId, payload.status, payload.reason);
        }
      });

      // Listen for Postgres database changes on call_sessions table (for guaranteed remote delivery)
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload: any) => {
          const newRow = payload.new;
          if (newRow && newRow.status === 'RINGING') {
            const session: CallSession = {
              id: newRow.id,
              conversationId: newRow.conversation_id,
              requestId: newRow.request_id,
              callerId: newRow.caller_id,
              callerName: newRow.metadata?.caller_name || 'Patient Attendant',
              callerRole: newRow.metadata?.caller_role || 'patient',
              receiverId: newRow.receiver_id,
              receiverName: newRow.metadata?.receiver_name || 'Volunteer Donor',
              receiverRole: newRow.metadata?.receiver_role || 'donor',
              callType: newRow.call_type || 'VOICE',
              status: newRow.status,
              startedAt: newRow.started_at,
              ringingAt: newRow.ringing_at,
              durationSeconds: newRow.duration_seconds || 0,
              metadata: newRow.metadata,
            };
            onIncomingCall(session);
          }
        }
      );

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (updated && ['REJECTED', 'ENDED', 'TIMEOUT'].includes(updated.status)) {
            onCallStateChange?.(updated.id, updated.status, updated.end_reason || updated.termination_reason);
          }
        }
      );

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info(`[Signaling] Subscribed to user calls channel: ${channelName}`);
        }
      });

      this.userIncomingChannels.set(userId, channel);
    }

    // 2. Cross-tab BroadcastChannel listener
    const handleBroadcastMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'call:incoming' && data.session) {
        const session = data.session as CallSession;
        if (session.receiverId === userId) {
          onIncomingCall(session);
        }
      } else if (data.type === 'call:state_change' && data.callId) {
        onCallStateChange?.(data.callId, data.status, data.reason);
      }
    };

    if (this.incomingBroadcastChannel) {
      this.incomingBroadcastChannel.addEventListener('message', handleBroadcastMessage);
    }

    // Return cleanup function
    return () => {
      if (this.incomingBroadcastChannel) {
        this.incomingBroadcastChannel.removeEventListener('message', handleBroadcastMessage);
      }
      const ch = this.userIncomingChannels.get(userId);
      if (ch) {
        supabase.removeChannel(ch);
        this.userIncomingChannels.delete(userId);
      }
    };
  }

  /**
   * Broadcast an incoming call alert to the remote receiver across network and local tabs
   */
  async sendIncomingCallAlert(receiverId: string, session: CallSession): Promise<void> {
    // 1. Supabase Realtime broadcast to receiver's private channel
    const targetChannelName = `user-calls:${receiverId}`;
    let ch = this.userIncomingChannels.get(receiverId);

    if (!ch) {
      ch = supabase.channel(targetChannelName, {
        config: {
          private: true,
          broadcast: { self: false, ack: true },
        },
      });
      await new Promise<void>((resolve) => {
        ch!.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve();
          }
        });
      });
    }

    try {
      await ch.send({
        type: 'broadcast',
        event: 'call:incoming',
        payload: session,
      });
    } catch (err) {
      console.warn(`[Signaling] Error dispatching incoming call broadcast:`, err);
    }

    // 2. Dispatch across local tabs via BroadcastChannel
    if (this.incomingBroadcastChannel) {
      try {
        this.incomingBroadcastChannel.postMessage({
          type: 'call:incoming',
          session,
        });
      } catch (err) {
        console.warn(`[Signaling] Error dispatching incoming call to local tabs:`, err);
      }
    }
  }

  /**
   * Subscribe to call-specific signaling channel with private authorization
   */
  joinCallChannel(callId: string, callbacks: CallSignalingCallbacks): void {
    if (this.activeChannels.has(callId)) {
      this.leaveCallChannel(callId);
    }

    this.callbacksMap.set(callId, callbacks);

    // 1. Authenticated Private Supabase Realtime Broadcast Channel
    const channelName = `call:${callId}`;
    const channel = supabase.channel(channelName, {
      config: {
        private: true, // Private channel enforced by RLS on realtime.messages
        broadcast: {
          self: false, // Don't receive own broadcasts
          ack: true,   // Server acknowledgment
        },
      },
    });

    channel
      .on('broadcast', { event: 'signal:receiver_ready' }, ({ payload }) => {
        callbacks.onReceiverReady?.(payload);
      })
      .on('broadcast', { event: 'signal:offer' }, ({ payload }) => {
        callbacks.onOffer?.(payload);
      })
      .on('broadcast', { event: 'signal:answer' }, ({ payload }) => {
        callbacks.onAnswer?.(payload);
      })
      .on('broadcast', { event: 'signal:ice-candidate' }, ({ payload }) => {
        callbacks.onIceCandidate?.(payload);
      })
      .on('broadcast', { event: 'signal:ringing' }, ({ payload }) => {
        callbacks.onRinging?.(payload);
      })
      .on('broadcast', { event: 'signal:accepted' }, ({ payload }) => {
        callbacks.onAccepted?.(payload);
      })
      .on('broadcast', { event: 'signal:rejected' }, ({ payload }) => {
        callbacks.onRejected?.(payload);
      })
      .on('broadcast', { event: 'signal:cancelled' }, ({ payload }) => {
        callbacks.onCancelled?.(payload);
      })
      .on('broadcast', { event: 'signal:ended' }, ({ payload }) => {
        callbacks.onEnded?.(payload);
      });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info(`[Signaling] Subscribed to Realtime channel: ${channelName}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`[Signaling] Realtime error on channel ${channelName}, using multi-tab fallback`);
      }
    });

    this.activeChannels.set(callId, channel);

    // 2. Standard Web BroadcastChannel (for multi-tab / local two-party testing)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`careloop_call_${callId}`);
        bc.onmessage = (event) => {
          const { type, payload } = event.data || {};
          switch (type) {
            case 'signal:receiver_ready':
              callbacks.onReceiverReady?.(payload);
              break;
            case 'signal:offer':
              callbacks.onOffer?.(payload);
              break;
            case 'signal:answer':
              callbacks.onAnswer?.(payload);
              break;
            case 'signal:ice-candidate':
              callbacks.onIceCandidate?.(payload);
              break;
            case 'signal:ringing':
              callbacks.onRinging?.(payload);
              break;
            case 'signal:accepted':
              callbacks.onAccepted?.(payload);
              break;
            case 'signal:rejected':
              callbacks.onRejected?.(payload);
              break;
            case 'signal:cancelled':
              callbacks.onCancelled?.(payload);
              break;
            case 'signal:ended':
              callbacks.onEnded?.(payload);
              break;
          }
        };
        this.broadcastChannels.set(callId, bc);
      } catch (e) {
        console.warn('BroadcastChannel initialization notice:', e);
      }
    }
  }

  /**
   * Leave and clean up channel subscriptions
   */
  leaveCallChannel(callId: string): void {
    const channel = this.activeChannels.get(callId);
    if (channel) {
      supabase.removeChannel(channel);
      this.activeChannels.delete(callId);
    }

    const bc = this.broadcastChannels.get(callId);
    if (bc) {
      bc.close();
      this.broadcastChannels.delete(callId);
    }

    this.callbacksMap.delete(callId);
  }

  /**
   * Handshake: Broadcast receiver ready status (Callee -> Caller)
   * Signals to caller that receiver is subscribed and awaiting SDP offer.
   */
  async sendReceiverReady(callId: string, calleeId: string): Promise<void> {
    const payload = { callId, calleeId };
    await this.broadcastEvent(callId, 'signal:receiver_ready', payload);
  }

  /**
   * Broadcast SDP Offer (Caller -> Callee)
   */
  async sendOffer(callId: string, offer: RTCSessionDescriptionInit, callerId: string): Promise<void> {
    const payload = { sdp: offer, callerId };
    await this.broadcastEvent(callId, 'signal:offer', payload);
  }

  /**
   * Broadcast SDP Answer (Callee -> Caller)
   */
  async sendAnswer(callId: string, answer: RTCSessionDescriptionInit, answererId: string): Promise<void> {
    const payload = { sdp: answer, answererId };
    await this.broadcastEvent(callId, 'signal:answer', payload);
  }

  /**
   * Broadcast ICE Candidate
   */
  async sendIceCandidate(callId: string, candidate: RTCIceCandidateInit, senderId: string): Promise<void> {
    const payload = { candidate, senderId };
    await this.broadcastEvent(callId, 'signal:ice-candidate', payload);
  }

  /**
   * Broadcast Ringing State
   */
  async sendRinging(callId: string, receiverId: string): Promise<void> {
    const payload = { callId, receiverId };
    await this.broadcastEvent(callId, 'signal:ringing', payload);
  }

  /**
   * Broadcast Acceptance
   */
  async sendAccepted(callId: string, receiverId: string): Promise<void> {
    const payload = { callId, receiverId };
    await this.broadcastEvent(callId, 'signal:accepted', payload);
  }

  /**
   * Broadcast Rejection
   */
  async sendRejected(callId: string, reason: string): Promise<void> {
    const payload = { callId, reason };
    await this.broadcastEvent(callId, 'signal:rejected', payload);
  }

  /**
   * Broadcast Cancellation
   */
  async sendCancelled(callId: string, reason: string): Promise<void> {
    const payload = { callId, reason };
    await this.broadcastEvent(callId, 'signal:cancelled', payload);
  }

  /**
   * Broadcast End of Call
   */
  async sendEnded(callId: string, reason: string, durationSeconds?: number): Promise<void> {
    const payload = { callId, reason, durationSeconds };
    await this.broadcastEvent(callId, 'signal:ended', payload);
  }

  private async broadcastEvent(callId: string, event: string, payload: any): Promise<void> {
    // 1. Supabase Realtime broadcast
    const channel = this.activeChannels.get(callId);
    if (channel) {
      try {
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        });
      } catch (err) {
        console.warn(`[Signaling] Failed to send ${event} via Supabase Realtime:`, err);
      }
    }

    // 2. BroadcastChannel cross-tab dispatch
    const bc = this.broadcastChannels.get(callId);
    if (bc) {
      try {
        bc.postMessage({ type: event, payload });
      } catch (err) {
        console.warn(`[Signaling] BroadcastChannel post error:`, err);
      }
    }
  }
}

export const callSignalingService = new CallSignalingService();
