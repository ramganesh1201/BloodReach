import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '../services/supabaseClient';
import {
  getMyEmergencyRequests,
  getAllEmergencyRequests,
  cancelEmergencyRequest,
  createEmergencyRequest,
} from '../services/emergencyRequestService';

vi.mock('../services/supabaseClient', () => {
  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

describe('CareLoop — Emergency Request Query Safety & Schema Alignment Suite', () => {
  const queryBuilder = (supabase.from as any)();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. getMyEmergencyRequests UUID Validation & Guard', () => {
    it('1.1 Rejects empty or missing userId with structured error', async () => {
      const res = await getMyEmergencyRequests('');
      expect(res.success).toBe(false);
      expect(res.error).toBe('User identifier is required.');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('1.2 Safely guards against non-UUID demo/mock userId (e.g. usr-patient) without triggering PostgreSQL 400 (22P02)', async () => {
      const nonUuidIds = ['usr-patient', 'usr-patient-test', 'demo-user-123', 'guest', 'null', 'undefined'];

      for (const nonUuid of nonUuidIds) {
        const res = await getMyEmergencyRequests(nonUuid);
        expect(res.success).toBe(true);
        expect(res.data).toEqual([]);
        // Verify no query was sent with invalid UUID syntax
        expect(supabase.from).not.toHaveBeenCalled();
      }
    });

    it('1.3 Executes query when valid UUID is provided and maps database records', async () => {
      const validUuid = '422e76d4-3525-428f-9d8b-160d36da4a62';
      const mockRows = [
        {
          id: 'b1234567-89ab-cdef-0123-456789abcdef',
          reference_code: 'CL-8F42',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 2,
          units_coordinated: 1,
          urgency: 'Critical',
          hospital_name: 'NIMS Hospital',
          hospital_address: 'Punjagutta',
          city: 'Hyderabad',
          status: 'AWAITING_RESPONSE',
          escalation_level: 1,
          created_by: validUuid,
          created_at: '2026-11-09T10:00:00Z',
          updated_at: '2026-11-09T10:05:00Z',
        },
      ];

      queryBuilder.order.mockResolvedValueOnce({ data: mockRows, error: null });

      const res = await getMyEmergencyRequests(validUuid);
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data![0].referenceCode).toBe('CL-8F42');
      expect(res.data![0].createdBy).toBe(validUuid);

      expect(supabase.from).toHaveBeenCalledWith('emergency_requests');
      expect(queryBuilder.select).toHaveBeenCalledWith('*');
      expect(queryBuilder.eq).toHaveBeenCalledWith('created_by', validUuid);
      expect(queryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('1.4 Surfaces database error safely if Supabase returns an error', async () => {
      const validUuid = '422e76d4-3525-428f-9d8b-160d36da4a62';
      queryBuilder.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection timeout', code: '57P01' },
      });

      const res = await getMyEmergencyRequests(validUuid);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Database connection timeout');
    });
  });

  describe('2. getAllEmergencyRequests for Clinical / Coordinator Staff', () => {
    it('2.1 Fetches all requests without created_by filter and maps rows correctly', async () => {
      const mockRows = [
        {
          id: 'c1234567-89ab-cdef-0123-456789abcdef',
          reference_code: 'CL-A101',
          blood_group: 'AB-',
          component: 'Platelets',
          units_required: 1,
          units_coordinated: 0,
          urgency: 'Today',
          hospital_name: 'Care Hospital',
          hospital_address: 'Banjara Hills',
          city: 'Hyderabad',
          status: 'CREATED',
          escalation_level: 1,
          created_at: '2026-11-09T11:00:00Z',
          updated_at: '2026-11-09T11:00:00Z',
        },
      ];

      queryBuilder.order.mockResolvedValueOnce({ data: mockRows, error: null });

      const res = await getAllEmergencyRequests();
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data![0].referenceCode).toBe('CL-A101');
      expect(supabase.from).toHaveBeenCalledWith('emergency_requests');
      expect(queryBuilder.select).toHaveBeenCalledWith('*');
      expect(queryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('3. cancelEmergencyRequest UUID Guard', () => {
    it('3.1 Rejects non-UUID request identifiers without firing malformed query', async () => {
      const res = await cancelEmergencyRequest('req-8f42', 'Patient discharged');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid emergency request identifier.');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('3.2 Executes update on emergency_requests for valid UUID', async () => {
      const validReqUuid = 'b1234567-89ab-cdef-0123-456789abcdef';
      queryBuilder.not.mockResolvedValueOnce({ error: null });

      const res = await cancelEmergencyRequest(validReqUuid, 'Condition resolved');
      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('emergency_requests');
      expect(queryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancellation_reason: 'Condition resolved',
        })
      );
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', validReqUuid);
    });
  });

  describe('4. createEmergencyRequest Schema Resiliency & Fallback', () => {
    it('4.1 Replaces non-UUID userId with null to prevent PostgreSQL 22P02 on created_by', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Function not found' },
      });

      queryBuilder.single.mockResolvedValueOnce({
        data: {
          id: '11111111-2222-3333-4444-555555555555',
          reference_code: 'CL-UUID',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 1,
          urgency: 'Critical',
          hospital_name: 'City Hospital',
          hospital_address: 'Main Road',
          city: 'Hyderabad',
          status: 'CREATED',
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });

      const res = await createEmergencyRequest(
        {
          bloodGroup: 'O+',
          component: 'Packed RBC',
          unitsRequired: 1,
          urgency: 'Critical',
          hospitalName: 'City Hospital',
          hospitalAddress: 'Main Road',
          city: 'Hyderabad',
          contactName: 'Ravi',
          contactPhone: '+91 98490 11111',
          preferredContact: 'Phone',
        },
        'usr-patient-mock' // Non-UUID user ID
      );

      expect(res.success).toBe(true);
      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: null, // Non-UUID was sanitized to null
        })
      );
    });

    it('4.2 Automatically handles missing tracking_token column (PGRST204) by retrying without it', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Function not found' },
      });

      // First insert attempt fails with PGRST204 because tracking_token does not exist on remote schema
      queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'tracking_token' column of 'emergency_requests' in the schema cache",
        },
      });

      // Second fallback insert attempt without tracking_token succeeds
      queryBuilder.single.mockResolvedValueOnce({
        data: {
          id: '22222222-3333-4444-5555-666666666666',
          reference_code: 'CL-FLBK',
          blood_group: 'A+',
          component: 'Whole Blood',
          units_required: 2,
          urgency: 'Today',
          hospital_name: 'Metro Hospital',
          hospital_address: 'Secunderabad',
          city: 'Hyderabad',
          status: 'CREATED',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });

      const res = await createEmergencyRequest({
        bloodGroup: 'A+',
        component: 'Whole Blood',
        unitsRequired: 2,
        urgency: 'Today',
        hospitalName: 'Metro Hospital',
        hospitalAddress: 'Secunderabad',
        city: 'Hyderabad',
        contactName: 'Suresh',
        contactPhone: '+91 98490 22222',
        preferredContact: 'Phone',
      });

      expect(res.success).toBe(true);
      expect(res.data?.referenceCode).toBe('CL-FLBK');
      expect(res.data?.trackingToken).toBeDefined(); // Token is preserved in domain model
      expect(queryBuilder.insert).toHaveBeenCalledTimes(2);
    });
  });
});
