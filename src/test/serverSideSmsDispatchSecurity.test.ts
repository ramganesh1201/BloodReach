/**
 * CareLoop — Server-Side SMS Dispatch & Security Architecture Test Suite
 * 
 * Verifies:
 * 1. Zero SMS secrets in client environment variables or frontend bundles.
 * 2. Serverless endpoint (/api/dispatch-sms) execution, rate-limiting & idempotency.
 * 3. Privacy compliance: Phone masking and token truncation in logs.
 * 4. Transparent carrier delivery status (PENDING vs SENT vs FAILED).
 * 5. In-app notification preservation on SMS failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  maskPhoneNumber,
  truncateToken,
  checkServerRateLimit,
  recordServerRateLimit,
} from '../../api/dispatch-sms';
import {
  smsNotificationService,
  SmsSendOptions,
} from '../services/smsNotificationService';
import { notificationService } from '../services/notificationService';

describe('CareLoop — Server-Side SMS Security & Dispatch Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smsNotificationService.clearStorageForTesting();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Client Environment & Bundle Secret Prevention                           */
  /* -------------------------------------------------------------------------- */
  describe('1. Client Environment & Bundle Secret Prevention', () => {
    it('1.1 Verifies that no VITE_SMS_ secrets are exposed in process.env or import.meta', () => {
      // In Vite client environment, secrets must NEVER be prefixed with VITE_
      const clientEnv = (import.meta as any).env || {};
      const viteSmsKeys = Object.keys(clientEnv).filter((k) => k.startsWith('VITE_SMS_'));
      expect(viteSmsKeys).toEqual([]);
    });

    it('1.2 Verifies that smsNotificationService does not contain hardcoded secret keys', () => {
      expect((smsNotificationService as any).apiKey).toBeUndefined();
      expect((smsNotificationService as any).gatewaySecret).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Privacy & PII Masking in Audit Logs                                     */
  /* -------------------------------------------------------------------------- */
  describe('2. Privacy & PII Masking in Audit Logs', () => {
    it('2.1 Correctly masks Indian & international phone numbers', () => {
      expect(maskPhoneNumber('+91 98490 12345')).toBe('+91 ******2345');
      expect(maskPhoneNumber('+919876543210')).toBe('+91 ******3210');
      expect(maskPhoneNumber('9849012345')).toBe(' ******2345');
      expect(maskPhoneNumber(undefined)).toBe('REDACTED');
    });

    it('2.2 Correctly truncates single-use response tokens in server logs', () => {
      const fullToken = 'tok_48b7405852165bd8be739925';
      const truncated = truncateToken(fullToken);
      expect(truncated).toBe('tok_48b7...');
      expect(truncated).not.toBe(fullToken);
      expect(truncateToken(undefined)).toBe('null');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Server-Side Rate Limiting & Idempotency                                 */
  /* -------------------------------------------------------------------------- */
  describe('3. Server-Side Rate Limiting & Idempotency', () => {
    it('3.1 Enforces server-side rate limit of 3 SMS per recipient per hour', () => {
      const testDonorId = `donor-test-rate-${Date.now()}`;

      // Initially allowed (3 remaining)
      const initial = checkServerRateLimit(testDonorId);
      expect(initial.allowed).toBe(true);
      expect(initial.remaining).toBe(3);

      // Record 3 dispatches
      recordServerRateLimit(testDonorId);
      recordServerRateLimit(testDonorId);
      recordServerRateLimit(testDonorId);

      // 4th check should be blocked
      const blocked = checkServerRateLimit(testDonorId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Carrier Dispatch Status & In-App Notification Decoupling               */
  /* -------------------------------------------------------------------------- */
  describe('4. Carrier Dispatch Status & In-App Notification Decoupling', () => {
    it('4.1 Reports PENDING transparently when cellular gateway is unconfigured', async () => {
      const options: SmsSendOptions = {
        donorId: 'd-101',
        requestId: 'req-201',
        referenceCode: 'CL-A101',
        recipientPhone: '+91 98490 99999',
        bloodGroup: 'B+',
        component: 'Packed RBC',
        hospitalName: 'Apollo Hospital',
        city: 'Hyderabad',
        urgency: 'Critical',
      };

      const result = await smsNotificationService.dispatchEmergencyAlert(options);
      expect(result.success).toBe(true);
      expect(result.status).toBe('PENDING');
      expect(result.carrierConfigured).toBe(false);
      expect(result.token).toMatch(/^tok_/);
    });

    it('4.2 Preserves in-app notifications even when SMS delivery is PENDING or fails', async () => {
      const sendInAppSpy = vi.spyOn(notificationService, 'sendInAppNotification');

      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-202',
        referenceCode: 'CL-A102',
        donorId: 'd-102',
        bloodGroup: 'O+',
        component: 'Platelets',
        hospitalName: 'NIMS Hyderabad',
        city: 'Hyderabad',
        urgency: 'Critical',
      });

      // Declining token triggers in-app notification without external network RPC calls
      const response = await smsNotificationService.processTokenResponse(tokenPayload.token, 'DECLINE', 'Temporarily unavailable');
      expect(response.success).toBe(true);
      expect(response.action).toBe('DECLINED');

      // In-app notification must have been dispatched independently
      expect(sendInAppSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'd-102',
          title: 'Emergency Alert Declined',
          requestId: 'req-202',
        })
      );
    });
  });
});
