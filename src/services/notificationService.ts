import { EmergencyRequest, NotificationPayload, NotificationChannel, NotificationStatus } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * CareLoop Enterprise Notification Architecture
 * 
 * Multi-channel dispatching with explicit delivery state tracking:
 * - QUEUED: Message created and enqueued
 * - SENT: Dispatched to gateway/transport
 * - DELIVERED: Transport confirmed arrival to device
 * - FAILED: Delivery failed or rejected by network
 * - ACKNOWLEDGED: User read or tapped notification
 *
 * Persistence:
 * - Persists in-app and outbound alerts to public.notifications in Supabase.
 * - Subscribes to real-time database changes for the authenticated user.
 * - Deduplicates repeated alert triggers using idempotency keys.
 * - Demarcates carrier SMS/Push from persisted in-app alerts.
 */

type NotificationListener = (notifications: NotificationPayload[]) => void;

export const mapDbToNotification = (row: any): NotificationPayload => ({
  id: row.id,
  userId: row.user_id,
  recipientPhone: row.recipient_phone,
  recipientEmail: row.recipient_email,
  channel: row.channel as NotificationChannel,
  title: row.title,
  content: row.content,
  status: row.status as NotificationStatus,
  timestamp: row.created_at || new Date().toISOString(),
  acknowledgedAt: row.acknowledged_at,
  requestId: row.metadata?.request_id,
  metadata: row.metadata,
});

class NotificationService {
  private notifications: NotificationPayload[] = [
    {
      id: 'notif-seed-1',
      channel: 'IN_APP',
      title: 'Emergency Response Activated',
      content: 'Request CL-8F42 matching O+ Packed RBC at City General Hospital.',
      status: 'DELIVERED',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-seed-2',
      channel: 'IN_APP',
      title: 'Volunteer Donor Notification',
      content: 'System registered standby availability. Real-time in-app alerts will trigger for urgent requests.',
      status: 'DELIVERED',
      timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    },
  ];

  private listeners: Set<NotificationListener> = new Set();
  private processedSmsReplies: Set<string> = new Set(); // Idempotency key: `ref:phone:reply`
  private realtimeChannel: any = null;
  private currentUserId: string | null = null;

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    listener([...this.notifications]);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const list = [...this.notifications];
    this.listeners.forEach((fn) => fn(list));
  }

  /**
   * Initialize notification synchronization for the authenticated user
   */
  public async initUserSession(userId: string): Promise<void> {
    if (!userId || !isSupabaseConfigured) return;
    this.currentUserId = userId;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        const dbNotifs = data.map(mapDbToNotification);
        // Merge with seed notifications, deduplicating by ID
        const existingIds = new Set(dbNotifs.map((n) => n.id));
        const nonDuplicateSeeds = this.notifications.filter((n) => !existingIds.has(n.id) && !n.userId);
        this.notifications = [...dbNotifs, ...nonDuplicateSeeds];
        this.emit();
      }

      this.subscribeRealtime(userId);
    } catch (err) {
      console.warn('[NotificationService] Failed to load DB notifications:', err);
    }
  }

  /**
   * Subscribe to Realtime notifications for this user
   */
  private subscribeRealtime(userId: string): void {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    this.realtimeChannel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const newNotif = mapDbToNotification(payload.new);
            this.notifications = [newNotif, ...this.notifications.filter((n) => n.id !== newNotif.id)];
            this.emit();
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = mapDbToNotification(payload.new);
            this.notifications = this.notifications.map((n) => (n.id === updated.id ? updated : n));
            this.emit();
          }
        }
      )
      .subscribe();
  }

  public cleanup(): void {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.currentUserId = null;
  }

  // Format outbound SMS payload with clear reference and action instructions
  public formatEmergencySms(request: EmergencyRequest, unitsNeeded: number): string {
    return (
      `CARELOOP EMERGENCY ALERT\n\n` +
      `${request.bloodGroup} ${request.component} urgently needed.\n` +
      `Hospital: ${request.hospitalName}\n` +
      `Units Required: ${unitsNeeded}\n` +
      `Ref Code: ${request.referenceCode}\n\n` +
      `Reply 1 if available to help.\n` +
      `Reply 2 if currently unavailable.`
    );
  }

  // Create In-App Notification (Database Persisted with Local Immediate Feedback)
  public sendInAppNotification(params: {
    userId?: string;
    title: string;
    content: string;
    requestId?: string;
    metadata?: Record<string, any>;
    idempotencyKey?: string;
  }): NotificationPayload {
    const targetUserId = params.userId || this.currentUserId || undefined;
    const localId = `notif-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const notif: NotificationPayload = {
      id: localId,
      userId: targetUserId,
      channel: 'IN_APP',
      title: params.title,
      content: params.content,
      status: 'DELIVERED',
      timestamp: new Date().toISOString(),
      requestId: params.requestId,
      metadata: {
        ...(params.metadata || {}),
        request_id: params.requestId,
      },
    };

    this.notifications.unshift(notif);
    this.emit();

    // Persist to Supabase asynchronously if configured and authenticated
    if (isSupabaseConfigured && targetUserId) {
      Promise.resolve(
        supabase.rpc('create_notification', {
          p_user_id: targetUserId,
          p_channel: 'IN_APP',
          p_title: params.title,
          p_content: params.content,
          p_metadata: {
            ...(params.metadata || {}),
            request_id: params.requestId,
          },
          p_idempotency_key: params.idempotencyKey || null,
        })
      )
        .then(({ data, error }) => {
          if (!error && data?.notification_id) {
            this.notifications = this.notifications.map((n) =>
              n.id === localId ? { ...n, id: data.notification_id } : n
            );
            this.emit();
          }
        })
        .catch((err: any) => {
          console.warn('[NotificationService] RPC create_notification error:', err);
        });
    }

    return notif;
  }

  // Outbound SMS Dispatch — PERMANENTLY DEACTIVATED for current release
  // Architecture preserved for future carrier integration (Twilio / AWS SNS), but execution disabled
  public sendSms(phone: string, message: string, requestId?: string): NotificationPayload {
    console.info(`[NotificationService] Cellular SMS delivery is disabled in current release. Alert suppressed for ${phone}.`);

    // Return dormant, non-dispatched record strictly marked as PENDING (never falsely marked as DELIVERED)
    const localId = `notif-sms-disabled-${Date.now()}`;
    const notif: NotificationPayload = {
      id: localId,
      recipientPhone: phone,
      channel: 'SMS',
      title: 'SMS Alert (Carrier Dispatch Disabled)',
      content: message,
      status: 'PENDING', // Strictly non-delivered; awaiting future gateway activation
      timestamp: new Date().toISOString(),
      requestId,
      metadata: {
        delivery_status: 'disabled',
        reason: 'Cellular SMS delivery is permanently disabled in this release. System relies exclusively on real-time in-app alerts.',
      },
    };

    // Note: Do NOT simulate carrier transmission or fake webhook delivery
    // Note: Do NOT schedule fake setTimeout transitions to ATTEMPTED or DELIVERED
    return notif;
  }

  // Update Notification Status in memory and sync to DB if persisted
  public updateStatus(id: string, status: NotificationStatus, error?: string): void {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, status, metadata: error ? { ...(n.metadata || {}), error } : n.metadata } : n
    );
    this.emit();

    if (isSupabaseConfigured && id && !id.startsWith('notif-seed') && !id.startsWith('notif-app') && !id.startsWith('notif-sms')) {
      Promise.resolve(
        supabase.rpc('update_notification_delivery_status', {
          p_notification_id: id,
          p_status: status,
          p_error: error || null,
        })
      ).catch((err: any) => {
        console.warn('[NotificationService] Failed to update delivery status in DB:', err);
      });
    }
  }

  // Mark notification as acknowledged / read
  public acknowledgeNotification(id: string): void {
    const nowIso = new Date().toISOString();
    this.notifications = this.notifications.map((n) =>
      n.id === id
        ? {
            ...n,
            status: 'ACKNOWLEDGED',
            acknowledgedAt: nowIso,
          }
        : n
    );
    this.emit();

    if (isSupabaseConfigured && id && !id.startsWith('notif-seed') && !id.startsWith('notif-app')) {
      Promise.resolve(
        supabase.rpc('acknowledge_notification', {
          p_notification_id: id,
        })
      ).catch((err: any) => {
        console.warn('[NotificationService] Failed to acknowledge in DB:', err);
      });
    }
  }

  // Mark all unacknowledged notifications as read
  public acknowledgeAll(): void {
    const nowIso = new Date().toISOString();
    this.notifications = this.notifications.map((n) =>
      n.status !== 'ACKNOWLEDGED'
        ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: nowIso }
        : n
    );
    this.emit();

    if (isSupabaseConfigured && this.currentUserId) {
      Promise.resolve(supabase.rpc('acknowledge_all_notifications')).catch((err: any) => {
        console.warn('[NotificationService] Failed to acknowledge all in DB:', err);
      });
    }
  }

  // Process incoming SMS Webhook with idempotency guard
  public processIncomingSmsWebhook(payload: {
    donorPhone: string;
    referenceCode: string;
    replyText: string;
  }): {
    success: boolean;
    isDuplicate: boolean;
    action: 'ACCEPTED' | 'DECLINED' | 'INVALID';
    message: string;
  } {
    const replyClean = payload.replyText.trim();
    const idempotencyKey = `${payload.referenceCode.toUpperCase()}:${payload.donorPhone}:${replyClean}`;

    if (this.processedSmsReplies.has(idempotencyKey)) {
      return {
        success: true,
        isDuplicate: true,
        action: replyClean === '1' ? 'ACCEPTED' : replyClean === '2' ? 'DECLINED' : 'INVALID',
        message: `Duplicate response detected from ${payload.donorPhone}. Ignored to prevent duplicate count.`,
      };
    }

    if (replyClean === '1') {
      this.processedSmsReplies.add(idempotencyKey);
      this.sendInAppNotification({
        title: 'SMS Response: Donor Available',
        content: `Donor (${payload.donorPhone}) replied '1' for emergency ${payload.referenceCode}.`,
        metadata: { action: 'ACCEPTED', donorPhone: payload.donorPhone },
        idempotencyKey: `sms-reply:${idempotencyKey}`,
      });
      return {
        success: true,
        isDuplicate: false,
        action: 'ACCEPTED',
        message: `SMS '1' confirmed from ${payload.donorPhone}. Donor registered as potential responder for ${payload.referenceCode}.`,
      };
    } else if (replyClean === '2') {
      this.processedSmsReplies.add(idempotencyKey);
      return {
        success: true,
        isDuplicate: false,
        action: 'DECLINED',
        message: `SMS '2' confirmed from ${payload.donorPhone}. Marked unavailable for ${payload.referenceCode}.`,
      };
    }

    return {
      success: false,
      isDuplicate: false,
      action: 'INVALID',
      message: `Unrecognized SMS command '${replyClean}'. Expected 1 or 2.`,
    };
  }

  public getNotificationLogs(): NotificationPayload[] {
    return [...this.notifications];
  }

  public getUnreadCount(): number {
    return this.notifications.filter((n) => n.status !== 'ACKNOWLEDGED').length;
  }
}

export const notificationService = new NotificationService();
