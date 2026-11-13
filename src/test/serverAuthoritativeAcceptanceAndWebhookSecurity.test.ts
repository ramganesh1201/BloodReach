import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authenticateInboundWebhook,
  extractCarrierMessage,
  validateTimestampFreshness,
  isMessageAlreadyProcessed,
  recordProcessedMessageId,
  verifyTwilioSignature,
  verifyMsg91Webhook,
  verifyKarixWebhook,
} from '../services/sms/carrierAdapters';
import { processInboundSms, InboundSmsPayload } from '../services/sms/inboundSmsProcessor';
import { isClinicallyCompatible } from '../services/matchingEngine';
import crypto from 'crypto';

describe('CareLoop — Server-Authoritative Acceptance & Inbound Webhook Security Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Carrier Authentication Adapters & Signature Verification               */
  /* -------------------------------------------------------------------------- */
  describe('1. Carrier Authentication Adapters & Signature Verification', () => {
    it('1.1 Verifies valid Twilio HMAC-SHA1 signature and rejects tampering', () => {
      const authToken = 'test_twilio_secret_token_12345';
      const url = 'https://careloop-mauve.vercel.app/api/sms-webhook';
      const body = { Body: '1', From: '+919849012345' };

      // Calculate correct Twilio signature
      const dataToSign = `${url}Body${body.Body}From${body.From}`;
      const validSignature = crypto.createHmac('sha1', authToken).update(Buffer.from(dataToSign, 'utf8')).digest('base64');

      const mockReqValid = {
        headers: {
          'x-twilio-signature': validSignature,
          'x-forwarded-proto': 'https',
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyTwilioSignature(mockReqValid, body, authToken)).toBe(true);

      const mockReqTampered = {
        headers: {
          'x-twilio-signature': 'tampered_bad_signature==',
          'x-forwarded-proto': 'https',
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyTwilioSignature(mockReqTampered, body, authToken)).toBe(false);
    });

    it('1.2 Verifies MSG91 webhook header and rejects invalid token', () => {
      const secret = 'msg91_secret_flow_key_999';

      const validReq = {
        headers: {
          authkey: secret,
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyMsg91Webhook(validReq, {}, secret)).toBe(true);

      const invalidReq = {
        headers: {
          authkey: 'wrong_secret',
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyMsg91Webhook(invalidReq, {}, secret)).toBe(false);
    });

    it('1.3 Verifies Karix webhook signature and bearer token', () => {
      const secret = 'karix_bearer_secret_xyz';

      const validReq = {
        headers: {
          authorization: `Bearer ${secret}`,
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyKarixWebhook(validReq, {}, secret)).toBe(true);

      const invalidReq = {
        headers: {
          authorization: 'Bearer wrong_token',
          host: 'careloop-mauve.vercel.app',
        },
        url: '/api/sms-webhook',
      } as any;

      expect(verifyKarixWebhook(invalidReq, {}, secret)).toBe(false);
    });

    it('1.4 Strictly enforces fail-closed rejection in production for unauthenticated webhooks', () => {
      const unauthReq = {
        headers: { host: 'careloop-mauve.vercel.app' },
        url: '/api/sms-webhook',
      } as any;

      const authRes = authenticateInboundWebhook(unauthReq, { sender: '919849012345', content: '1' }, true);
      expect(authRes.valid).toBe(false);
      expect(authRes.reason).toContain('Unauthorized');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Replay Protection & Carrier Idempotency                                 */
  /* -------------------------------------------------------------------------- */
  describe('2. Replay Protection & Carrier Idempotency', () => {
    it('2.1 Rejects stale timestamps older than 10 minutes', () => {
      const elevenMinsAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      const check = validateTimestampFreshness(elevenMinsAgo);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Stale webhook request rejected');
    });

    it('2.2 Rejects future-dated timestamps with clock skew > 2 minutes', () => {
      const fiveMinsFuture = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const check = validateTimestampFreshness(fiveMinsFuture);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Future-dated webhook request rejected');
    });

    it('2.3 Accepts fresh timestamps within normal tolerance', () => {
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const check = validateTimestampFreshness(twoMinsAgo);
      expect(check.valid).toBe(true);
    });

    it('2.4 Tracks carrier message IDs to prevent duplicate webhook delivery', () => {
      const msgId = 'carrier_sid_test_unique_9988';
      expect(isMessageAlreadyProcessed(msgId)).toBe(false);

      recordProcessedMessageId(msgId);
      expect(isMessageAlreadyProcessed(msgId)).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Server-Authoritative Anti-Self-Match & Clinical Safety on Inbound SMS   */
  /* -------------------------------------------------------------------------- */
  describe('3. Server-Authoritative Anti-Self-Match & Clinical Safety on Inbound SMS', () => {
    it('3.1 Rejects Anti-Self-Match: Emergency request creator cannot accept their own request', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'donors') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'donor-creator-1',
                    profile_id: 'usr-patient-creator',
                    full_name: 'Dr. Jane Creator',
                    phone: '+91 98490 11111',
                    blood_group: 'O+',
                    city: 'Hyderabad',
                    is_available: true,
                    availability_state: 'AVAILABLE',
                    is_medically_cleared: true,
                    deferral_until: null,
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'emergency_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'req-self-100',
                    reference_code: 'CL-SELF1',
                    blood_group: 'O+',
                    component: 'Packed RBC',
                    hospital_name: 'NIMS Hyderabad',
                    city: 'Hyderabad',
                    status: 'SEEKING_DONORS',
                    created_by: 'usr-patient-creator', // SAME AS DONOR PROFILE ID!
                  },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      } as any;

      const payload: InboundSmsPayload = {
        sender: '+91 98490 11111',
        message: 'CL-SELF1 1',
      };

      const result = await processInboundSms(payload, mockSupabase);
      expect(result.success).toBe(false);
      expect(result.action).toBe('ERROR');
      expect(result.error).toBe('ANTI_SELF_MATCH');
      expect(result.replyMessage).toContain('Anti-Self-Match');
    });

    it('3.2 Rejects Clinical Incompatibility: Incompatible ABO/Rh cannot accept transfusion call', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'donors') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'donor-incomp-2',
                    profile_id: 'usr-donor-bpos',
                    full_name: 'Rahul B-Positive',
                    phone: '+91 98490 22222',
                    blood_group: 'B+', // Incompatible with A+ Packed RBC patient
                    city: 'Hyderabad',
                    is_available: true,
                    availability_state: 'AVAILABLE',
                    is_medically_cleared: true,
                    deferral_until: null,
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'emergency_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'req-apos-200',
                    reference_code: 'CL-APOS2',
                    blood_group: 'A+',
                    component: 'Packed RBC',
                    hospital_name: 'Apollo Jubilee Hills',
                    city: 'Hyderabad',
                    status: 'SEEKING_DONORS',
                    created_by: 'usr-different-patient',
                  },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      } as any;

      const payload: InboundSmsPayload = {
        sender: '+91 98490 22222',
        message: 'CL-APOS2 1',
      };

      const result = await processInboundSms(payload, mockSupabase);
      expect(result.success).toBe(false);
      expect(result.action).toBe('ERROR');
      expect(result.error).toContain('CLINICAL_INCOMPATIBILITY');
      expect(result.replyMessage).toContain('not clinically compatible');
    });

    it('3.3 Rejects Medical Clearance Hold: Donor pending medical clearance cannot accept', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'donors') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'donor-uncleared-3',
                    profile_id: 'usr-donor-uncleared',
                    full_name: 'Sunil Uncleared',
                    phone: '+91 98490 33333',
                    blood_group: 'O-',
                    city: 'Hyderabad',
                    is_available: true,
                    availability_state: 'AVAILABLE',
                    is_medically_cleared: false, // MEDICAL CLEARANCE HOLD!
                    deferral_until: null,
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'emergency_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'req-oneg-300',
                    reference_code: 'CL-ONEG3',
                    blood_group: 'O-',
                    component: 'Packed RBC',
                    hospital_name: 'Gandhi Hospital',
                    city: 'Hyderabad',
                    status: 'SEEKING_DONORS',
                    created_by: 'usr-different-patient',
                  },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      } as any;

      const payload: InboundSmsPayload = {
        sender: '+91 98490 33333',
        message: 'CL-ONEG3 1',
      };

      const result = await processInboundSms(payload, mockSupabase);
      expect(result.success).toBe(false);
      expect(result.action).toBe('ERROR');
      expect(result.error).toBe('DONOR_NOT_MEDICALLY_CLEARED');
      expect(result.replyMessage).toContain('medical clearance hold');
    });

    it('3.4 Successfully accepts valid, clinically compatible donation with zero patient PII leaked', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'donors') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'donor-valid-4',
                    profile_id: 'usr-donor-valid',
                    full_name: 'Anand Kumar',
                    phone: '+91 98490 44444',
                    blood_group: 'O-', // Universal donor for RBC!
                    city: 'Hyderabad',
                    is_available: true,
                    availability_state: 'AVAILABLE',
                    is_medically_cleared: true,
                    deferral_until: null,
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'emergency_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'req-abpos-400',
                    reference_code: 'CL-AB400',
                    blood_group: 'AB+',
                    component: 'Packed RBC',
                    hospital_name: 'Yashoda Hospital Secunderabad',
                    city: 'Hyderabad',
                    status: 'SEEKING_DONORS',
                    created_by: 'usr-patient-rohit',
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'donor_responses') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === 'emergency_events') {
            return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
        rpc: vi.fn().mockResolvedValue({
          data: { conversation_id: 'conv-new-400', success: true },
          error: null,
        }),
      } as any;

      const payload: InboundSmsPayload = {
        sender: '+91 98490 44444',
        message: 'CL-AB400 1',
      };

      const result = await processInboundSms(payload, mockSupabase);
      expect(result.success).toBe(true);
      expect(result.action).toBe('ACCEPTED');
      expect(result.referenceCode).toBe('CL-AB400');
      expect(result.conversationId).toBe('conv-new-400');

      // Verify ZERO patient PII in reply message
      expect(result.replyMessage).not.toContain('rohit');
      expect(result.replyMessage).not.toContain('usr-patient-rohit');
      expect(result.replyMessage).toContain('CONFIRMED');
      expect(result.replyMessage).toContain('Yashoda Hospital');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Clinical Safety Table Completeness                                      */
  /* -------------------------------------------------------------------------- */
  describe('4. Clinical Safety Table Completeness (NBTC 2023)', () => {
    it('4.1 Whole Blood requires exact match', () => {
      expect(isClinicallyCompatible('A+', 'A+', 'Whole Blood').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'O-', 'Whole Blood').compatible).toBe(false);
      expect(isClinicallyCompatible('B+', 'O+', 'Whole Blood').compatible).toBe(false);
    });

    it('4.2 Packed RBC allows O- universal donor', () => {
      expect(isClinicallyCompatible('O-', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('B+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O-', 'A+', 'Packed RBC').compatible).toBe(false);
    });

    it('4.3 Fresh Frozen Plasma allows AB universal donor and reversed rules', () => {
      expect(isClinicallyCompatible('O+', 'AB+', 'Plasma').compatible).toBe(true);
      expect(isClinicallyCompatible('O-', 'AB+', 'Plasma').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'AB+', 'Plasma').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O+', 'Plasma').compatible).toBe(false);
    });
  });
});
