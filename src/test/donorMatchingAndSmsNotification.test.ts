import { describe, it, expect, beforeEach, vi } from 'vitest';
import { smsNotificationService, CARELOOP_DLT_CONFIG } from '../services/smsNotificationService';
import {
  evaluateDonorEligibility,
  isClinicallyCompatible,
  findPotentialResponders,
  NBTC_2023_INTERVALS,
} from '../services/matchingEngine';
import { Donor, EmergencyRequest } from '../types';

describe('CareLoop — SMS Notification & Clinical Donor Matching Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smsNotificationService.clearStorageForTesting();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Indian DLT Template Formatting & Privacy Compliance                    */
  /* -------------------------------------------------------------------------- */
  describe('1. Indian DLT Template Formatting & Privacy Compliance', () => {
    it('1.1 Formats DLT message according to TRAI registered template and sender ID', () => {
      const msg = smsNotificationService.formatDltMessage({
        bloodGroup: 'O+',
        component: 'Packed RBC',
        hospitalName: 'Apollo Health City',
        city: 'Hyderabad',
        referenceCode: 'CL-8F42',
        responseUrl: 'https://careloop-mauve.vercel.app/respond/tok_test123',
      });

      // Verification of DLT regulatory contents
      expect(msg).toContain('CARELOOP EMERGENCY: Urgent need for O+ Packed RBC');
      expect(msg).toContain('Apollo Health City, Hyderabad');
      expect(msg).toContain('Ref: CL-8F42');
      expect(msg).toContain('https://careloop-mauve.vercel.app/respond/tok_test123');
      expect(msg).toContain(`Sender: ${CARELOOP_DLT_CONFIG.senderId}`);

      // Verification that zero personal patient PII is leaked in SMS
      expect(msg).not.toContain('patient');
      expect(msg).not.toContain('attendant');
      expect(msg).not.toContain('phone');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Response Token Generation & Expiration Handling                         */
  /* -------------------------------------------------------------------------- */
  describe('2. Response Token Generation & Expiration Handling', () => {
    it('2.1 Creates secure response token with correct clinical payload', () => {
      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-001',
        referenceCode: 'CL-9901',
        donorId: 'donor-101',
        bloodGroup: 'B+',
        component: 'Packed RBC',
        hospitalName: 'NIMS Hyderabad',
        city: 'Hyderabad',
        urgency: 'Critical',
        expiryMinutes: 60,
      });

      expect(tokenPayload.token).toMatch(/^tok_/);
      expect(tokenPayload.status).toBe('ACTIVE');
      expect(tokenPayload.referenceCode).toBe('CL-9901');

      // Resolves token cleanly
      const resolved = smsNotificationService.resolveToken(tokenPayload.token);
      expect(resolved).not.toBeNull();
      expect(resolved?.hospitalName).toBe('NIMS Hyderabad');
    });

    it('2.2 Marks token as EXPIRED if accessed past expiry time', () => {
      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-002',
        referenceCode: 'CL-9902',
        donorId: 'donor-102',
        bloodGroup: 'O-',
        component: 'Whole Blood',
        hospitalName: 'Osmania General Hospital',
        city: 'Hyderabad',
        urgency: 'Critical',
        expiryMinutes: -10, // Expired 10 minutes ago
      });

      const resolved = smsNotificationService.resolveToken(tokenPayload.token);
      expect(resolved).not.toBeNull();
      expect(resolved?.status).toBe('EXPIRED');

      // Action on expired token should fail gracefully
      return smsNotificationService.processTokenResponse(tokenPayload.token, 'ACCEPT').then((res) => {
        expect(res.success).toBe(false);
        expect(res.error).toBe('Token expired');
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. One-Click Token Response & In-App Sync                                 */
  /* -------------------------------------------------------------------------- */
  describe('3. One-Click Token Response & In-App Sync', () => {
    it('3.1 Successfully accepts emergency call and marks token USED atomically', async () => {
      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-003',
        referenceCode: 'CL-9903',
        donorId: 'donor-103',
        bloodGroup: 'A+',
        component: 'Platelets',
        hospitalName: 'Apollo Health City',
        city: 'Hyderabad',
        urgency: 'Critical',
      });

      const res = await smsNotificationService.processTokenResponse(tokenPayload.token, 'ACCEPT');
      expect(res.success).toBe(true);
      expect(res.action).toBe('ACCEPTED');
      expect(res.message).toContain('acceptance for CL-9903 has been confirmed');

      // Second attempt must fail with "Token already used"
      const secondAttempt = await smsNotificationService.processTokenResponse(tokenPayload.token, 'ACCEPT');
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toBe('Token already used');
    }, 15000);

    it('3.2 Successfully declines emergency call and marks token USED', async () => {
      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-004',
        referenceCode: 'CL-9904',
        donorId: 'donor-104',
        bloodGroup: 'AB+',
        component: 'Plasma',
        hospitalName: 'GGH Vijayawada',
        city: 'Vijayawada',
        urgency: 'Urgent',
      });

      const res = await smsNotificationService.processTokenResponse(
        tokenPayload.token,
        'DECLINE',
        'At work right now'
      );
      expect(res.success).toBe(true);
      expect(res.action).toBe('DECLINED');

      const resolved = smsNotificationService.resolveToken(tokenPayload.token);
      expect(resolved?.status).toBe('USED');
      expect(resolved?.actionTaken).toBe('DECLINED');
    }, 15000);

    it('3.3 Synchronizes in-app action to mark SMS tokens as used', () => {
      const tokenPayload = smsNotificationService.createResponseToken({
        requestId: 'req-005',
        referenceCode: 'CL-9905',
        donorId: 'donor-105',
        bloodGroup: 'O+',
        component: 'Packed RBC',
        hospitalName: 'Care Hospital',
        city: 'Hyderabad',
        urgency: 'Critical',
      });

      // User accepted in-app
      smsNotificationService.syncInAppActionToTokens('req-005', 'donor-105', 'ACCEPTED');

      const resolved = smsNotificationService.resolveToken(tokenPayload.token);
      expect(resolved?.status).toBe('USED');
      expect(resolved?.actionTaken).toBe('ACCEPTED');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. SMS Rate Limiting & Safety                                             */
  /* -------------------------------------------------------------------------- */
  describe('4. SMS Rate Limiting & Safety', () => {
    it('4.1 Enforces maximum 3 SMS alerts per donor per hour', async () => {
      const donorId = 'donor-rate-limit-test';

      const sendOptions = {
        recipientPhone: '+91 98490 11111',
        donorId,
        requestId: 'req-010',
        referenceCode: 'CL-RL01',
        bloodGroup: 'O+' as const,
        component: 'Packed RBC' as const,
        hospitalName: 'NIMS',
        city: 'Hyderabad',
        urgency: 'Critical' as const,
      };

      // Dispatches 1, 2, 3 should succeed
      const res1 = await smsNotificationService.dispatchEmergencyAlert(sendOptions);
      expect(res1.success).toBe(true);

      const res2 = await smsNotificationService.dispatchEmergencyAlert(sendOptions);
      expect(res2.success).toBe(true);

      const res3 = await smsNotificationService.dispatchEmergencyAlert(sendOptions);
      expect(res3.success).toBe(true);

      // Dispatch 4 must be rate-limited
      const res4 = await smsNotificationService.dispatchEmergencyAlert(sendOptions);
      expect(res4.success).toBe(false);
      expect(res4.error).toContain('Rate limit reached');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Clinical Compatibility & NBTC 2023 Interval Rules                      */
  /* -------------------------------------------------------------------------- */
  describe('5. Clinical Compatibility & NBTC 2023 Interval Rules', () => {
    it('5.1 Evaluates universal RBC compatibility for O- and universal recipient AB+', () => {
      // O- can give Packed RBC to anyone
      expect(isClinicallyCompatible('A+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('B-', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);

      // AB+ can receive Packed RBC from any group
      expect(isClinicallyCompatible('AB+', 'A+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'B+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O+', 'Packed RBC').compatible).toBe(true);
    });

    it('5.2 Enforces NBTC 2023 Whole Blood Interval: 90 days for male, 120 days for female', () => {
      const now = new Date();
      const eightyDaysAgo = new Date(now.getTime() - 80 * 24 * 3600 * 1000).toISOString();
      const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 3600 * 1000).toISOString();

      const maleDonor: Donor = {
        id: 'd-male',
        fullName: 'Rahul Verma',
        phone: '+91 98490 22334',
        bloodGroup: 'O+',
        city: 'Hyderabad',
        isAvailable: true,
        gender: 'male',
        totalDonations: 3,
        lastDonatedAt: hundredDaysAgo, // 100 days ago > 90 days required -> ELIGIBLE
        lastDonatedComponent: 'Whole Blood',
      };

      const maleCheck = evaluateDonorEligibility(maleDonor, 'Whole Blood');
      expect(maleCheck.isEligible).toBe(true);

      const femaleDonor: Donor = {
        id: 'd-female',
        fullName: 'Ananya Roy',
        phone: '+91 98490 22335',
        bloodGroup: 'O+',
        city: 'Hyderabad',
        isAvailable: true,
        gender: 'female',
        totalDonations: 2,
        lastDonatedAt: hundredDaysAgo, // 100 days ago < 120 days required -> DEFERRED
        lastDonatedComponent: 'Whole Blood',
      };

      const femaleCheck = evaluateDonorEligibility(femaleDonor, 'Whole Blood');
      expect(femaleCheck.isEligible).toBe(false);
      expect(femaleCheck.status).toBe('DEFERRED');
      expect(femaleCheck.daysRemaining).toBeGreaterThan(0);
    });
  });
});
