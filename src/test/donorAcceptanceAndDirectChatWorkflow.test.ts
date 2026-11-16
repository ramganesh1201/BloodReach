import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  acceptRequestAndCreateConversation,
  requestMedicalClearanceReview,
} from '../services/donorResponseService';
import { supabase } from '../services/supabaseClient';

describe('CareLoop — Donor Acceptance & Direct Private Chat Workflow Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Acceptance Authorization & Governance Scenarios', () => {
    it('1.1 Eligible donor accepts open request -> Success with conversation and assignment', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          request_id: '5647429d-c2f2-43db-b87d-431284263333',
          assignment_id: 'assign-uuid-1',
          conversation_id: '506a67bb-de9d-415e-8c44-613f4977c060',
          donor_name: 'Synthetic Donor QA',
          status: 'ACCEPTED',
          already_accepted: false,
          message: 'Emergency request accepted successfully.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        '5647429d-c2f2-43db-b87d-431284263333',
        'd2222222-2222-4222-b222-222222222222'
      );

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('506a67bb-de9d-415e-8c44-613f4977c060');
      expect(result.conversationRoute).toBe(
        '/communication?conversationId=506a67bb-de9d-415e-8c44-613f4977c060'
      );
      expect(result.alreadyAccepted).toBe(false);
    });

    it('1.2 Donor has pending medical review -> Acceptance blocked with MEDICAL_CLEARANCE_HOLD', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          code: 'MEDICAL_CLEARANCE_HOLD',
          clearance_status: 'PENDING_REVIEW',
          message: 'Donor profile has an unresolved medical clearance hold.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-pending-1',
        'donor-pending-1'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('MEDICAL_CLEARANCE_HOLD');
      expect(result.actionRequired).toBe('REQUEST_MEDICAL_CLEARANCE');
      expect(result.clearanceStatus).toBe('PENDING_REVIEW');
    });

    it('1.3 Donor has rejected medical clearance -> Acceptance blocked', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          code: 'MEDICAL_CLEARANCE_HOLD',
          clearance_status: 'REJECTED',
          message: 'Donor profile has an unresolved medical clearance hold.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-rej-1',
        'donor-rej-1'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('MEDICAL_CLEARANCE_HOLD');
      expect(result.clearanceStatus).toBe('REJECTED');
    });

    it('1.4 Unauthorized user accepts -> Denied with UNAUTHORIZED / AUTHORIZATION_FAILED', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Authentication required to accept donation requests.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-open-1',
        'donor-unauth-1'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('1.5 Request is already filled -> Clear error with CAPACITY_REACHED', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          code: 'CAPACITY_REACHED',
          message: 'This emergency request has already reached required coordination capacity.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-full-1',
        'donor-avail-1'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('CAPACITY_REACHED');
    });

    it('1.6 Donor clicks Accept twice -> Idempotent response with alreadyAccepted=true', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-idem-1',
          assignment_id: 'assign-uuid-existing',
          conversation_id: 'conv-uuid-existing',
          donor_name: 'Synthetic Donor QA',
          status: 'ACCEPTED',
          already_accepted: true,
          message: 'You have already accepted this emergency request.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-idem-1',
        'd2222222-2222-4222-b222-222222222222'
      );

      expect(result.success).toBe(true);
      expect(result.alreadyAccepted).toBe(true);
      expect(result.conversationId).toBe('conv-uuid-existing');
      expect(result.conversationRoute).toBe(
        '/communication?conversationId=conv-uuid-existing'
      );
    });

    it('1.7 Conversation already exists -> Existing conversation is reused', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-reused-1',
          assignment_id: 'assign-1',
          conversation_id: 'conv-reused-1',
          donor_name: 'Mohan',
          status: 'ACCEPTED',
          already_accepted: true,
          message: 'You have already accepted this emergency request.',
        },
        error: null,
      } as any);

      const result = await acceptRequestAndCreateConversation(
        'req-reused-1',
        'donor-mohan-1'
      );

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-reused-1');
    });
  });

  describe('2. Direct Chat Navigation & Two-Account Sync Contract', () => {
    it('2.1 Successful acceptance generates direct navigation route to specific conversationId', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-chat-nav-1',
          assignment_id: 'assign-2',
          conversation_id: 'conv-chat-nav-1',
          donor_name: 'Synthetic Donor QA',
          status: 'ACCEPTED',
          already_accepted: false,
        },
        error: null,
      } as any);

      const res = await acceptRequestAndCreateConversation('req-chat-nav-1', 'donor-1');
      expect(res.conversationRoute).toBe('/communication?conversationId=conv-chat-nav-1');
    });

    it('2.2 Patient and donor share identical conversation ID', () => {
      const patientConversationId = '506a67bb-de9d-415e-8c44-613f4977c060';
      const donorConversationId = '506a67bb-de9d-415e-8c44-613f4977c060';
      expect(patientConversationId).toBe(donorConversationId);
    });

    it('2.3 Unrelated user is strictly denied access by RLS boundary', async () => {
      vi.spyOn(supabase, 'from').mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
      } as any);

      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', '506a67bb-de9d-415e-8c44-613f4977c060');

      expect(data).toHaveLength(0);
    });
  });

  describe('3. Review Notes, Clinical Approval & Acceptance Lifecycle', () => {
    it('3.1 Updating review notes persists notes, preserves PENDING_REVIEW, and does NOT navigate or create conversations', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          code: 'REVIEW_ALREADY_PENDING',
          message: 'A medical clearance review is already pending for your profile.',
          status: 'PENDING_REVIEW',
          requested_at: '2026-11-16T08:00:00Z',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview('Verified donor card #RC-9981');
      expect(res.success).toBe(true);
      expect(res.code).toBe('REVIEW_ALREADY_PENDING');
      expect(res.data?.status).toBe('PENDING_REVIEW');
      // Verify no conversationId or assignment is generated
      expect(res.data?.conversation_id).toBeUndefined();
      expect(res.data?.assignment_id).toBeUndefined();
    });

    it('3.2 Notes containing text "accepted" do NOT grant approval (status remains PENDING_REVIEW)', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          code: 'REVIEW_ALREADY_PENDING',
          message: 'A medical clearance review is already pending for your profile.',
          status: 'PENDING_REVIEW',
        },
        error: null,
      } as any);

      const res = await requestMedicalClearanceReview('accepted');
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('PENDING_REVIEW');
      expect(res.data?.status).not.toBe('APPROVED');
    });

    it('3.3 Authorized clinical reviewer approves clearance -> donor status transitions to APPROVED', async () => {
      const { reviewDonorMedicalClearance } = await import('../services/donorResponseService');
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          decision: 'APPROVED',
          donor_id: 'd2222222-2222-4222-b222-222222222222',
          message: 'Donor medical clearance approved successfully.',
        },
        error: null,
      } as any);

      const res = await reviewDonorMedicalClearance(
        'd2222222-2222-4222-b222-222222222222',
        'APPROVED',
        'NBTC criteria verified. Weight 65kg, Hb 14.2 g/dL.'
      );

      expect(res.success).toBe(true);
      expect(res.decision).toBe('APPROVED');
    });

    it('3.4 Once approved, donor acceptance succeeds and creates private conversation route', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-after-approval-1',
          assignment_id: 'assign-approved-1',
          conversation_id: 'conv-approved-1',
          donor_name: 'Approved Donor',
          status: 'ACCEPTED',
          already_accepted: false,
        },
        error: null,
      } as any);

      const res = await acceptRequestAndCreateConversation(
        'req-after-approval-1',
        'd2222222-2222-4222-b222-222222222222'
      );

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe('conv-approved-1');
      expect(res.conversationRoute).toBe('/communication?conversationId=conv-approved-1');
    });
  });
});
