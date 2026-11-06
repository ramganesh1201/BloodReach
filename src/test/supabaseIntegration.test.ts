import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateEmergencyRequestInput,
  generateReferenceCode,
  createEmergencyRequest,
  getMyEmergencyRequests,
  getEmergencyRequestById,
  cancelEmergencyRequest,
  mapDbToEmergencyRequest,
} from '../services/emergencyRequestService';
import {
  getDiscoverableRequests,
  discoverMatchingDonors,
} from '../services/donorDiscoveryService';
import {
  acceptRequestAndCreateConversation,
  declineRequest,
  getDonorProfileByUserId,
  getDonorResponses,
} from '../services/donorResponseService';
import {
  getConversationsForUser,
  getConversationMessages,
  sendChatMessage,
  subscribeToMessages,
  mapDbToChatMessage,
} from '../services/conversationService';
import { supabase } from '../services/supabaseClient';

// Mock Supabase client for hermetic, unit/integration verification
vi.mock('../services/supabaseClient', () => {
  let currentResult: any = { data: [], error: null };

  const queryBuilder: any = {
    _setResult(result: any) {
      currentResult = result;
    },
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then(onFulfilled?: any, onRejected?: any) {
      return Promise.resolve(currentResult).then(onFulfilled, onRejected);
    },
  };

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb) => {
      if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
      return { unsubscribe: vi.fn() };
    }),
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn(),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
      auth: {
        getSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
  };
});

describe('CareLoop — Supabase Backend Vertical Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Emergency Request Service & Clinical Validation                         */
  /* -------------------------------------------------------------------------- */
  describe('Emergency Request Service', () => {
    it('1.1 Generates valid clinical reference codes with CL- prefix', () => {
      const code = generateReferenceCode();
      expect(code).toMatch(/^CL-[0-9A-F]{4}$/);
    });

    it('1.2 Validates required clinical fields accurately', () => {
      // Valid input
      const valid = validateEmergencyRequestInput({
        bloodGroup: 'O+',
        component: 'Packed RBC',
        unitsRequired: 2,
        urgency: 'Critical',
        hospitalName: 'NIMS Hyderabad',
        hospitalAddress: 'Punjagutta, Ward 2A',
        city: 'Hyderabad',
        contactName: 'Robert Taylor',
        contactPhone: '+91 98490 55123',
        preferredContact: 'Phone',
      });
      expect(valid.valid).toBe(true);

      // Invalid blood group
      const invalidBg = validateEmergencyRequestInput({
        bloodGroup: 'Z+' as any,
        component: 'Packed RBC',
        unitsRequired: 2,
        urgency: 'Critical',
        hospitalName: 'NIMS',
        hospitalAddress: 'Punjagutta',
        city: 'Hyderabad',
        contactName: 'Robert',
        contactPhone: '9849000000',
        preferredContact: 'Phone',
      });
      expect(invalidBg.valid).toBe(false);
      expect(invalidBg.error).toContain('Invalid blood group');

      // Invalid units
      const zeroUnits = validateEmergencyRequestInput({
        bloodGroup: 'O+',
        component: 'Packed RBC',
        unitsRequired: 0,
        urgency: 'Critical',
        hospitalName: 'NIMS',
        hospitalAddress: 'Punjagutta',
        city: 'Hyderabad',
        contactName: 'Robert',
        contactPhone: '9849000000',
        preferredContact: 'Phone',
      });
      expect(zeroUnits.valid).toBe(false);
      expect(zeroUnits.error).toContain('positive integer');

      // Missing hospital
      const emptyHospital = validateEmergencyRequestInput({
        bloodGroup: 'O+',
        component: 'Packed RBC',
        unitsRequired: 2,
        urgency: 'Critical',
        hospitalName: '   ',
        hospitalAddress: 'Punjagutta',
        city: 'Hyderabad',
        contactName: 'Robert',
        contactPhone: '9849000000',
        preferredContact: 'Phone',
      });
      expect(emptyHospital.valid).toBe(false);
      expect(emptyHospital.error).toContain('Hospital name is required');
    });

    it('1.3 Successfully creates an emergency request in Supabase and maps domain model', async () => {
      const mockInsertedRow = {
        id: 'req-uuid-101',
        reference_code: 'CL-8F42',
        blood_group: 'O+',
        component: 'Packed RBC',
        units_required: 2,
        units_coordinated: 0,
        urgency: 'Critical',
        hospital_name: 'NIMS Hyderabad',
        hospital_address: 'Punjagutta',
        city: 'Hyderabad',
        contact_name: 'Robert Taylor',
        contact_phone: '+91 98490 55123',
        contact_method: 'Phone',
        status: 'CREATED',
        escalation_level: 1,
        created_at: '2026-11-04T12:00:00Z',
        updated_at: '2026-11-04T12:00:00Z',
      };

      const qb = (supabase.from as any)();
      qb.single.mockResolvedValueOnce({ data: mockInsertedRow, error: null });

      const res = await createEmergencyRequest(
        {
          bloodGroup: 'O+',
          component: 'Packed RBC',
          unitsRequired: 2,
          urgency: 'Critical',
          hospitalName: 'NIMS Hyderabad',
          hospitalAddress: 'Punjagutta',
          city: 'Hyderabad',
          contactName: 'Robert Taylor',
          contactPhone: '+91 98490 55123',
          preferredContact: 'Phone',
        },
        'usr-patient-123'
      );

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.id).toBe('req-uuid-101');
      expect(res.data?.referenceCode).toBe('CL-8F42');
      expect(res.data?.status).toBe('CREATED');
    });

    it('1.4 Surfaces database error when remote table is missing and never fakes success', async () => {
      const qb = (supabase.from as any)();
      qb.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'relation "public.emergency_requests" does not exist', code: '42P01' },
      });

      const res = await createEmergencyRequest({
        bloodGroup: 'O+',
        component: 'Packed RBC',
        unitsRequired: 2,
        urgency: 'Critical',
        hospitalName: 'NIMS Hyderabad',
        hospitalAddress: 'Punjagutta',
        city: 'Hyderabad',
        contactName: 'Robert Taylor',
        contactPhone: '+91 98490 55123',
        preferredContact: 'Phone',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('relation "public.emergency_requests" does not exist');
      expect(res.data).toBeUndefined();
    });

    it('1.5 Retrieves emergency request details by ID and falls back to privacy view', async () => {
      const qb = (supabase.from as any)();
      // First attempt on emergency_requests returns null (e.g. donor without direct table select)
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // Second attempt on discoverable_emergency_requests view returns discoverable row
      qb.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'req-uuid-101',
          reference_code: 'CL-8F42',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 2,
          units_coordinated: 0,
          urgency: 'Critical',
          hospital_name: 'NIMS Hyderabad',
          hospital_address: 'Punjagutta',
          city: 'Hyderabad',
          status: 'AWAITING_RESPONSE',
          escalation_level: 1,
          created_at: '2026-11-04T12:00:00Z',
          updated_at: '2026-11-04T12:00:00Z',
        },
        error: null,
      });

      const res = await getEmergencyRequestById('req-uuid-101');
      expect(res.success).toBe(true);
      expect(res.data?.referenceCode).toBe('CL-8F42');
    });

    it('1.6 Returns not found error when request ID is non-existent', async () => {
      const qb = (supabase.from as any)();
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await getEmergencyRequestById('non-existent-id');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Emergency request not found.');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Privacy-Preserving Donor Discovery Service                              */
  /* -------------------------------------------------------------------------- */
  describe('Donor Discovery Service', () => {
    it('2.1 Queries discoverable_emergency_requests view with blood group filter', async () => {
      const qb = (supabase.from as any)();
      const mockDiscoverable = [
        {
          id: 'req-disc-1',
          reference_code: 'CL-A101',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 2,
          units_coordinated: 0,
          urgency: 'Critical',
          hospital_name: 'Apollo Jubilee',
          hospital_address: 'Road 72',
          city: 'Hyderabad',
          status: 'AWAITING_RESPONSE',
          escalation_level: 1,
          created_at: '2026-11-04T12:00:00Z',
          updated_at: '2026-11-04T12:00:00Z',
        },
      ];

      // Setup chaining mock for query
      qb._setResult({ data: mockDiscoverable, error: null });

      const res = await getDiscoverableRequests({ bloodGroup: 'O+', city: 'Hyderabad' });
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data![0].bloodGroup).toBe('O+');
      // Patient phone and notes are not leaked by discoverable view
      expect(res.data![0].contactPhone).toBe('');
      expect(res.data![0].notes).toBeUndefined();
    });

    it('2.2 Invokes discover_matching_donors RPC with radius bounds check', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: [
          {
            donor_id: 'donor-uuid-1',
            blood_group: 'O+',
            city: 'Hyderabad',
            district: 'Hyderabad',
            is_available: true,
            distance_km: 3.4,
          },
        ],
        error: null,
      });

      const res = await discoverMatchingDonors('req-uuid-101', 25.0);
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data![0].donorId).toBe('donor-uuid-1');
      expect(res.data![0].distanceKm).toBe(3.4);
      expect(supabase.rpc).toHaveBeenCalledWith('discover_matching_donors', {
        p_request_id: 'req-uuid-101',
        p_max_distance_km: 25.0,
      });
    });

    it('2.3 Rejects invalid distance radius', async () => {
      const res = await discoverMatchingDonors('req-uuid-101', -5);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Distance radius must be between 1 km and 500 km');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Donor Response & Atomic Acceptance RPC                                  */
  /* -------------------------------------------------------------------------- */
  describe('Donor Response Service', () => {
    it('3.1 Successfully accepts request via accept_request_and_create_conversation RPC', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          conversation_id: 'conv-uuid-999',
          request_id: 'req-uuid-101',
          donor_name: 'Sarah Jenkins',
          already_accepted: false,
        },
        error: null,
      });

      const result = await acceptRequestAndCreateConversation('req-uuid-101', 'donor-uuid-1');
      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-uuid-999');
      expect(result.alreadyAccepted).toBe(false);
      expect(supabase.rpc).toHaveBeenCalledWith('accept_request_and_create_conversation', {
        p_request_id: 'req-uuid-101',
        p_donor_id: 'donor-uuid-1',
      });
    });

    it('3.2 Correctly handles race condition where request is already accepted by another donor', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: false,
          already_accepted: true,
          message: 'This emergency request has already been accepted by another donor.',
        },
        error: null,
      });

      const result = await acceptRequestAndCreateConversation('req-uuid-101', 'donor-uuid-2');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already been accepted');
    });

    it('3.3 Successfully records donor decline without breaking channel', async () => {
      const qb = (supabase.from as any)();
      qb.upsert.mockResolvedValueOnce({ error: null });

      const res = await declineRequest('req-uuid-101', 'donor-uuid-1');
      expect(res.success).toBe(true);
      expect(qb.upsert).toHaveBeenCalledWith(
        {
          request_id: 'req-uuid-101',
          donor_id: 'donor-uuid-1',
          response_status: 'DECLINED',
          response_channel: 'WEB',
        },
        { onConflict: 'request_id,donor_id' }
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Conversation Service & Private Messaging                                */
  /* -------------------------------------------------------------------------- */
  describe('Conversation Service', () => {
    it('4.1 Retrieves user-scoped conversations with joined request and donor metadata', async () => {
      const qb = (supabase.from as any)();
      const mockConvRow = {
        id: 'conv-uuid-999',
        request_id: 'req-uuid-101',
        donor_id: 'donor-uuid-1',
        requester_id: 'usr-patient-123',
        status: 'ACTIVE',
        created_at: '2026-11-04T12:05:00Z',
        updated_at: '2026-11-04T12:10:00Z',
        emergency_requests: {
          reference_code: 'CL-8F42',
          hospital_name: 'NIMS Hyderabad',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 2,
          urgency: 'Critical',
          contact_name: 'Robert Taylor',
          contact_phone: '+91 98490 55123',
        },
        donors: {
          full_name: 'Sarah Jenkins',
          phone: '+91 98490 12345',
          blood_group: 'O+',
          city: 'Hyderabad',
        },
      };

      qb._setResult({ data: [mockConvRow], error: null });

      const res = await getConversationsForUser('usr-patient-123');
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      const conv = res.data![0];
      expect(conv.id).toBe('conv-uuid-999');
      expect(conv.referenceCode).toBe('CL-8F42');
      expect(conv.donorName).toBe('Sarah Jenkins');
      expect(conv.requesterName).toBe('Robert Taylor');
    });

    it('4.2 Sends chat message to private conversation and maps response', async () => {
      const qb = (supabase.from as any)();
      const mockMsgRow = {
        id: 'msg-uuid-501',
        conversation_id: 'conv-uuid-999',
        sender_id: 'usr-patient-123',
        sender_name: 'Robert Taylor',
        sender_role: 'patient',
        message_type: 'TEXT',
        content: 'We are waiting at NIMS Trauma Desk.',
        created_at: '2026-11-04T12:15:00Z',
      };

      qb.single.mockResolvedValueOnce({ data: mockMsgRow, error: null });

      const res = await sendChatMessage(
        '99999999-9999-9999-9999-999999999999',
        'usr-patient-123',
        'Robert Taylor',
        'patient',
        'We are waiting at NIMS Trauma Desk.'
      );

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('msg-uuid-501');
      expect(res.data?.content).toBe('We are waiting at NIMS Trauma Desk.');
      expect(res.data?.deliveryStatus).toBe('DELIVERED');
    });

    it('4.3 Rejects empty chat message', async () => {
      const res = await sendChatMessage(
        '99999999-9999-9999-9999-999999999999',
        'usr-patient-123',
        'Robert Taylor',
        'patient',
        '    '
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Message content cannot be empty.');
    });

    it('4.4 Subscribes to realtime Postgres changes on messages table', () => {
      const handler = vi.fn();
      const unsubscribe = subscribeToMessages('99999999-9999-9999-9999-999999999999', handler);

      expect(supabase.channel).toHaveBeenCalledWith('chat:99999999-9999-9999-9999-999999999999', {
        config: { broadcast: { self: false } },
      });
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });
});
