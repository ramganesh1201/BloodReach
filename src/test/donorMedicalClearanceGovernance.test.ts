import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  acceptRequestAndCreateConversation,
  requestMedicalClearanceReview,
  reviewDonorMedicalClearance,
  getPendingMedicalClearances,
} from '../services/donorResponseService';
import { supabase } from '../services/supabaseClient';

describe('CareLoop — Donor Medical Clearance Governance & Structured Error Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Structured Medical Clearance Holds & Error Codes', () => {
    it('1.1 Maps database hold error to MEDICAL_CLEARANCE_HOLD structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Donor profile has an unresolved medical clearance hold. Formal clinical clearance required before emergency response.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-hold-1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('MEDICAL_CLEARANCE_HOLD');
      expect(result.actionRequired).toBe('REQUEST_MEDICAL_CLEARANCE');
      expect(result.error).toContain('medical clearance hold');
    });

    it('1.2 Maps anti-self-match error to ANTI_SELF_MATCH structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Patient cannot respond to or accept their own emergency request.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-self-1', 'donor-patient-1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('ANTI_SELF_MATCH');
      expect(result.error).toContain('cannot respond to or accept their own');
    });

    it('1.3 Maps active deferral to ACTIVE_DEFERRAL structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Donor is currently under a temporary clinical deferral until 2026-12-01.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-def-1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('ACTIVE_DEFERRAL');
    });

    it('1.4 Maps capacity reached to CAPACITY_REACHED structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Emergency request units have already been fully coordinated.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-full-1', 'donor-123');

      expect(result.success).toBe(false);
      expect(result.code).toBe('CAPACITY_REACHED');
    });

    it('1.5 Maps donor unavailable to DONOR_UNAVAILABLE structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Donor is currently marked as temporarily unavailable.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-unavail-1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('DONOR_UNAVAILABLE');
    });

    it('1.6 Maps incompatible blood group to INCOMPATIBLE_BLOOD_GROUP structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Incompatible blood group: Whole blood transfusion strictly requires exact match.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-incomp-1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('INCOMPATIBLE_BLOOD_GROUP');
    });

    it('1.7 Maps already accepted to REQUEST_ALREADY_ACCEPTED structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'You have already accepted this emergency request.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-123');

      expect(result.success).toBe(false);
      expect(result.code).toBe('REQUEST_ALREADY_ACCEPTED');
    });

    it('1.8 Maps authorization error to AUTHORIZATION_FAILED structured code', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Authentication required to accept donation requests.',
          code: 'P0001',
        },
      } as any);

      const result = await acceptRequestAndCreateConversation('req-123', 'donor-123');

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTHORIZATION_FAILED');
    });
  });

  describe('2. Donor Medical Clearance RPC Integration', () => {
    it('2.1 requestMedicalClearanceReview calls RPC and returns success payload', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          donor_id: 'donor-abc',
          status: 'PENDING_REVIEW',
          requested_at: '2026-11-16T08:00:00Z',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview('Recent lab tests normal, ready to donate');

      expect(res.success).toBe(true);
      expect(res.code).toBe('REVIEW_REQUESTED');
      expect(res.data?.status).toBe('PENDING_REVIEW');
    });

    it('2.2 reviewDonorMedicalClearance executes clinical approval with mandatory reason', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          donor_id: 'donor-xyz',
          decision: 'APPROVED',
          is_medically_cleared: true,
          reviewed_by: 'coord-doc-1',
          reviewed_at: '2026-11-16T08:30:00Z',
        },
        error: null,
      } as any);

      const res = await reviewDonorMedicalClearance(
        'donor-xyz',
        'APPROVED',
        'Valid physical screening and Hb 13.5 g/dL verified',
        'Routine follow-up in 90 days'
      );

      expect(res.success).toBe(true);
      expect(res.decision).toBe('APPROVED');
      expect(res.data?.is_medically_cleared).toBe(true);
    });

    it('2.3 reviewDonorMedicalClearance rejects without justification reason', async () => {
      const res = await reviewDonorMedicalClearance('donor-xyz', 'APPROVED', '');

      expect(res.success).toBe(false);
      expect(res.error).toContain('clinical justification reason is required');
    });

    it('2.4 reviewDonorMedicalClearance handles anti-self-clearance RPC error', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Reviewers cannot approve or alter their own medical clearance hold.',
          code: 'P0001',
        },
      } as any);

      const res = await reviewDonorMedicalClearance(
        'donor-reviewer-self',
        'APPROVED',
        'Self clearance attempt'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Reviewers cannot approve or alter their own');
    });

    it('2.5 getPendingMedicalClearances returns queue of hold candidates', async () => {
      const mockQueue = [
        {
          id: 'donor-1',
          full_name: 'Test Donor A',
          blood_group: 'O+',
          medical_clearance_status: 'PENDING_REVIEW',
          medical_review_requested_at: '2026-11-16T07:00:00Z',
        },
      ];

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: mockQueue,
        error: null,
      } as any);

      const res = await getPendingMedicalClearances();

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data?.[0].full_name).toBe('Test Donor A');
    });

    it('2.6 requestMedicalClearanceReview handles REVIEW_ALREADY_PENDING idempotently', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          code: 'REVIEW_ALREADY_PENDING',
          status: 'PENDING_REVIEW',
          message: 'A medical clearance review is already pending for your profile.',
          requested_at: '2026-11-16T08:00:00Z',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview('Repeated request with updated notes');

      expect(res.success).toBe(true);
      expect(res.code).toBe('REVIEW_ALREADY_PENDING');
      expect(res.data?.status).toBe('PENDING_REVIEW');
    });

    it('2.7 requestMedicalClearanceReview handles ACTIVE_DEFERRAL', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ACTIVE_DEFERRAL',
          message: 'Your profile is under medical deferral until 2026-12-01.',
          deferral_until: '2026-12-01T00:00:00Z',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview();

      expect(res.success).toBe(false);
      expect(res.code).toBe('ACTIVE_DEFERRAL');
    });

    it('2.8 requestMedicalClearanceReview handles ALREADY_CLEARED', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          code: 'ALREADY_CLEARED',
          status: 'APPROVED',
          message: 'Your donor profile is already medically cleared.',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview();

      expect(res.success).toBe(true);
      expect(res.code).toBe('ALREADY_CLEARED');
    });
  });

  describe('3. Successful Acceptance Flow for Medically Cleared Donor', () => {
    it('3.1 Returns valid conversation and response when donor is cleared', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          conversation_id: 'conv-test-999',
          response_id: 'resp-test-999',
          status: 'ACCEPTED',
          emergency_status: 'IN_PROGRESS',
          assigned_units: 1,
          units_coordinated: 1,
          units_required: 1,
          already_responded: false,
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation('req-valid-1', 'donor-cleared-1');

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-test-999');
      expect(result.status).toBe('ACCEPTED');
    });

    it('3.2 Idempotently handles already accepted request with REQUEST_ALREADY_ACCEPTED', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          code: 'REQUEST_ALREADY_ACCEPTED',
          conversation_id: 'conv-test-999',
          request_id: 'req-valid-1',
          donor_name: 'Mohan',
          already_accepted: true,
          status: 'ACCEPTED',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation('req-valid-1', 'donor-cleared-1');

      expect(result.success).toBe(true);
      expect(result.alreadyAccepted).toBe(true);
      expect(result.conversationId).toBe('conv-test-999');
    });
  });
});
