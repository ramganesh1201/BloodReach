import { EmergencyRequest, NotificationPayload } from '../types';

/**
 * NotificationService
 * 
 * Provider-independent abstraction for Web notifications, SMS dispatches,
 * and keypad feature-phone webhook processing.
 */

class NotificationService {
  private notifications: NotificationPayload[] = [];
  private processedSmsReplies: Set<string> = new Set(); // Idempotency tracker key: `requestId:donorPhone:reply`

  // Format outbound SMS payload for keypad phone users
  public formatEmergencySms(request: EmergencyRequest, unitsNeeded: number): string {
    return `BLOODREACH ALERT\n\n` +
      `${request.bloodGroup} ${request.component} urgently needed.\n` +
      `Hospital: ${request.hospitalName}\n` +
      `Need: ${unitsNeeded} unit(s)\n` +
      `Ref: ${request.referenceCode}\n\n` +
      `Reply 1 if you may be able to help.\n` +
      `Reply 2 if unavailable.`;
  }

  // Dispatch Web Push / Toast notification
  public sendWebNotification(recipient: string, message: string): NotificationPayload {
    const notification: NotificationPayload = {
      id: `notif-web-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientPhone: recipient,
      channel: 'WEB',
      content: message,
      status: 'SENT',
      timestamp: new Date().toISOString(),
    };
    this.notifications.unshift(notification);
    return notification;
  }

  // Dispatch SMS (Simulated / Edge function backend provider bridge)
  public sendSms(phone: string, message: string): NotificationPayload {
    const notification: NotificationPayload = {
      id: `notif-sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientPhone: phone,
      channel: 'SMS',
      content: message,
      status: 'SENT',
      timestamp: new Date().toISOString(),
    };
    this.notifications.unshift(notification);
    return notification;
  }

  // Handle incoming SMS Webhook from Keypad Phone with Idempotency Guard
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
    const idempotencyKey = `${payload.referenceCode}:${payload.donorPhone}:${replyClean}`;

    if (this.processedSmsReplies.has(idempotencyKey)) {
      return {
        success: true,
        isDuplicate: true,
        action: replyClean === '1' ? 'ACCEPTED' : replyClean === '2' ? 'DECLINED' : 'INVALID',
        message: `Duplicate SMS reply detected from ${payload.donorPhone}. Ignored to prevent double-counting.`,
      };
    }

    if (replyClean === '1') {
      this.processedSmsReplies.add(idempotencyKey);
      return {
        success: true,
        isDuplicate: false,
        action: 'ACCEPTED',
        message: `Keypad SMS '1' received from ${payload.donorPhone}. Potential responder registered for ${payload.referenceCode}.`,
      };
    } else if (replyClean === '2') {
      this.processedSmsReplies.add(idempotencyKey);
      return {
        success: true,
        isDuplicate: false,
        action: 'DECLINED',
        message: `Keypad SMS '2' received from ${payload.donorPhone}. Marked unavailable for ${payload.referenceCode}.`,
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
}

export const notificationService = new NotificationService();
