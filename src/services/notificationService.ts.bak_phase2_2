import { EmergencyRequest, NotificationPayload, NotificationChannel, NotificationStatus } from '../types';

/**
 * CareLoop Enterprise Notification Architecture
 * 
 * Multi-channel dispatching with explicit delivery state tracking:
 * - QUEUED: Message created and enqueued
 * - SENT: Dispatched to gateway/transport
 * - DELIVERED: Transport confirmed arrival to device
 * - FAILED: Delivery failed or rejected by network
 * - ACKNOWLEDGED: User read or tapped notification
 */

type NotificationListener = (notifications: NotificationPayload[]) => void;

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
      channel: 'SMS',
      recipientPhone: '+1 (555) 0101',
      title: 'CareLoop SMS Alert',
      content: 'URGENT: O+ Packed RBC needed at City General Hospital. Ref: CL-8F42. Reply 1 to help, 2 if unavailable.',
      status: 'DELIVERED',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }
  ];

  private listeners: Set<NotificationListener> = new Set();
  private processedSmsReplies: Set<string> = new Set(); // Idempotency key: `ref:phone:reply`

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    listener([...this.notifications]);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const list = [...this.notifications];
    this.listeners.forEach((fn) => fn(list));
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

  // Create In-App Notification
  public sendInAppNotification(params: {
    userId?: string;
    title: string;
    content: string;
    requestId?: string;
    metadata?: Record<string, any>;
  }): NotificationPayload {
    const notif: NotificationPayload = {
      id: `notif-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: params.userId,
      channel: 'IN_APP',
      title: params.title,
      content: params.content,
      status: 'DELIVERED', // In-app is immediately delivered to the client session
      timestamp: new Date().toISOString(),
      requestId: params.requestId,
      metadata: params.metadata,
    };

    this.notifications.unshift(notif);
    this.emit();
    return notif;
  }

  // Dispatch Outbound SMS Notification with state progression
  public sendSms(phone: string, message: string, requestId?: string): NotificationPayload {
    const notif: NotificationPayload = {
      id: `notif-sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientPhone: phone,
      channel: 'SMS',
      title: 'SMS Alert Dispatch',
      content: message,
      status: 'SENT', // Initial state when handed off to SMS gateway
      timestamp: new Date().toISOString(),
      requestId,
    };

    this.notifications.unshift(notif);
    this.emit();

    // Emulate realistic provider webhook confirmation of delivery
    setTimeout(() => {
      this.updateStatus(notif.id, 'DELIVERED');
    }, 1800);

    return notif;
  }

  // Update Notification Status (e.g. from SMS webhook or push delivery report)
  public updateStatus(id: string, status: NotificationStatus): void {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, status } : n
    );
    this.emit();
  }

  // Mark notification as acknowledged / read
  public acknowledgeNotification(id: string): void {
    this.notifications = this.notifications.map((n) =>
      n.id === id
        ? {
            ...n,
            status: 'ACKNOWLEDGED',
            acknowledgedAt: new Date().toISOString(),
          }
        : n
    );
    this.emit();
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
