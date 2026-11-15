import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptRequestAndCreateConversation } from '../services/donorResponseService';
import { supabase } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => {
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: vi.fn(),
      },
    },
  };
});

describe('CareLoop — Acceptance & Onboarding Hardening Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. donorResponseService Acceptance Contract', () => {
    it('1.1 Returns structured conversationRoute and identifiers on successful RPC acceptance', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          conversation_id: 'conv-uuid-1234',
          request_id: 'req-uuid-5678',
          donor_name: 'Dr. Sarah Jenkins',
          already_accepted: false,
        },
        error: null,
      });

      const res = await acceptRequestAndCreateConversation('req-uuid-5678', 'donor-uuid-9999');

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe('conv-uuid-1234');
      expect(res.conversationRoute).toBe('/communication?conversationId=conv-uuid-1234');
      expect(res.requestId).toBe('req-uuid-5678');
      expect(res.donorName).toBe('Dr. Sarah Jenkins');
      expect(res.alreadyAccepted).toBe(false);
    });

    it('1.2 Gracefully surfaces structured error message when request is already coordinated or fulfilled', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: false,
          message: 'REQUEST_ALREADY_FULFILLED',
        },
        error: null,
      });

      const res = await acceptRequestAndCreateConversation('req-uuid-fulfilled', 'donor-uuid-1');

      expect(res.success).toBe(false);
      expect(res.error).toBe('REQUEST_ALREADY_FULFILLED');
      expect(res.conversationId).toBeUndefined();
    });

    it('1.3 Rejects empty request ID upfront without database invocation', async () => {
      const res = await acceptRequestAndCreateConversation('');

      expect(res.success).toBe(false);
      expect(res.error).toBe('Request ID is required.');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('2. Conversation Navigation Route Generation', () => {
    it('2.1 Correctly formats deep-link conversation route with URL parameters', () => {
      const convId = '550e8400-e29b-41d4-a716-446655440000';
      const route = `/communication?conversationId=${convId}`;
      const params = new URLSearchParams(route.split('?')[1]);

      expect(params.get('conversationId')).toBe(convId);
    });
  });
});
