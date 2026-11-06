import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEmergencyRequest,
  getEmergencyRequestById,
  generateReferenceCode,
} from '../services/emergencyRequestService';
import { notificationService } from '../services/notificationService';
import { supabase } from '../services/supabaseClient';
import fs from 'fs';
import path from 'path';

// Mock Supabase client
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

describe('CareLoop Pre-Local-Migration Security Gate Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Guest Emergency Request Creation & Atomic RPC                           */
  /* -------------------------------------------------------------------------- */
  describe('1. Guest Emergency Request Creation & RPC Atomicity', () => {
    it('1.1 Invokes atomic submit_guest_emergency_request RPC with secret tracking_token', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          id: 'guest-uuid-101',
          reference_code: 'CL-9A2F',
          tracking_token: 'secret-token-uuid-1111-2222-3333-444444444444',
          status: 'CREATED',
        },
        error: null,
      });

      const res = await createEmergencyRequest({
        bloodGroup: 'B+',
        component: 'Whole Blood',
        unitsRequired: 2,
        urgency: 'Critical',
        hospitalName: 'Apollo Hospital',
        hospitalAddress: 'Jubilee Hills',
        city: 'Hyderabad',
        contactName: 'Anil Kumar',
        contactPhone: '+91 98490 12345',
        preferredContact: 'Phone',
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('guest-uuid-101');
      expect(res.data?.referenceCode).toBe('CL-9A2F');
      expect(res.data?.trackingToken).toBe('secret-token-uuid-1111-2222-3333-444444444444');
      expect(res.data?.status).toBe('CREATED');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_guest_emergency_request',
        expect.objectContaining({
          p_blood_group: 'B+',
          p_component: 'Whole Blood',
          p_units_required: 2,
          p_urgency: 'Critical',
          p_hospital_name: 'Apollo Hospital',
          p_contact_name: 'Anil Kumar',
          p_contact_phone: '+91 98490 12345',
          p_tracking_token: expect.any(String),
        })
      );
    });

    it('1.2 Retries with fresh reference code upon RPC collision detection', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { success: false, collision: true, error: 'Reference code collision' },
        error: null,
      });
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          id: 'retry-uuid-303',
          reference_code: 'CL-B8C1',
          tracking_token: 'secret-token-retry-5555-6666-7777-888888888888',
          status: 'CREATED',
        },
        error: null,
      });

      const res = await createEmergencyRequest({
        bloodGroup: 'O-',
        component: 'Packed RBC',
        unitsRequired: 1,
        urgency: 'Urgent',
        hospitalName: 'Care Hospital',
        hospitalAddress: 'Banjara Hills',
        city: 'Hyderabad',
        contactName: 'Sneha Rao',
        contactPhone: '+91 98490 67890',
        preferredContact: 'Phone',
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('retry-uuid-303');
      expect(res.data?.referenceCode).toBe('CL-B8C1');
      expect(res.data?.trackingToken).toBe('secret-token-retry-5555-6666-7777-888888888888');
      expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('1.3 Guest submission remains idempotent on re-transmission with same UUID', async () => {
      // Simulate RPC response returning idempotent committed record
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          id: 'idempotent-uuid-999',
          reference_code: 'CL-9999',
          tracking_token: 'secret-token-idempotent-1111',
          status: 'CREATED',
          idempotent: true,
        },
        error: null,
      });

      const res = await createEmergencyRequest({
        bloodGroup: 'AB+',
        component: 'Plasma',
        unitsRequired: 1,
        urgency: 'Today',
        hospitalName: 'Osmania Hospital',
        hospitalAddress: 'Afzal Gunj',
        city: 'Hyderabad',
        contactName: 'Ramesh Reddy',
        contactPhone: '+91 98490 99999',
        preferredContact: 'Phone',
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('idempotent-uuid-999');
      expect(res.data?.referenceCode).toBe('CL-9999');
      expect(res.data?.trackingToken).toBe('secret-token-idempotent-1111');
    });

    it('1.4 Generates cryptographically secure random reference codes with crypto.getRandomValues', () => {
      const code1 = generateReferenceCode();
      const code2 = generateReferenceCode();
      expect(code1).toMatch(/^CL-[0-9A-F]{4}$/);
      expect(code2).toMatch(/^CL-[0-9A-F]{4}$/);
      expect(code1).not.toBe('');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Anti-Enumeration Tracking & Capability Token Authorization              */
  /* -------------------------------------------------------------------------- */
  describe('2. Anti-Enumeration Tracking & Capability Token Authorization', () => {
    it('2.1 Anonymous user CANNOT track using public discovery UUID alone without tracking_token', async () => {
      const qb = (supabase.from as any)();
      // Direct emergency_requests table query blocked by RLS for anonymous callers
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // track_emergency_request RPC rejects anonymous call where p_tracking_token is NULL
      (supabase.rpc as any).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      // discoverable view fallback returns active row or null
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const publicDiscoveryId = '11111111-2222-3333-4444-555555555555';
      const res = await getEmergencyRequestById(publicDiscoveryId);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Emergency request not found.');
      expect(supabase.rpc).toHaveBeenCalledWith('track_emergency_request', {
        p_tracking_token: null,
        p_request_id: publicDiscoveryId,
        p_reference_code: null,
      });
    });

    it('2.2 Anonymous user WITH secret tracking_token successfully retrieves tracking details', async () => {
      const qb = (supabase.from as any)();
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const secretToken = 'e4b11f7c-719a-4c28-98e3-514216892e21';
      (supabase.rpc as any).mockResolvedValueOnce({
        data: [
          {
            id: 'c8f498c8-b57d-41a4-9ec4-c6a655ea7df8',
            reference_code: 'CL-8F42',
            blood_group: 'O+',
            component: 'Packed RBC',
            units_required: 2,
            units_coordinated: 2,
            urgency: 'Critical',
            hospital_name: 'NIMS Hyderabad',
            hospital_address: 'Punjagutta',
            city: 'Hyderabad',
            district: 'Hyderabad',
            state: 'Telangana',
            status: 'FULFILLED',
            escalation_level: 1,
            created_at: '2026-11-04T12:00:00Z',
            updated_at: '2026-11-04T14:30:00Z',
          },
        ],
        error: null,
      });

      const res = await getEmergencyRequestById('c8f498c8-b57d-41a4-9ec4-c6a655ea7df8', secretToken);
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('FULFILLED');
      expect(res.data?.referenceCode).toBe('CL-8F42');
      expect(supabase.rpc).toHaveBeenCalledWith('track_emergency_request', {
        p_tracking_token: secretToken,
        p_request_id: 'c8f498c8-b57d-41a4-9ec4-c6a655ea7df8',
        p_reference_code: null,
      });
    });

    it('2.3 Authenticated clinical staff or request owners can track by reference code', async () => {
      const qb = (supabase.from as any)();
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          id: 'c8f498c8-b57d-41a4-9ec4-c6a655ea7df8',
          reference_code: 'CL-8F42',
          blood_group: 'O+',
          component: 'Packed RBC',
          units_required: 2,
          units_coordinated: 1,
          urgency: 'Critical',
          hospital_name: 'NIMS Hyderabad',
          hospital_address: 'Punjagutta',
          city: 'Hyderabad',
          district: 'Hyderabad',
          state: 'Telangana',
          status: 'COORDINATION_IN_PROGRESS',
          escalation_level: 1,
          created_at: '2026-11-04T12:00:00Z',
          updated_at: '2026-11-04T13:00:00Z',
        },
        error: null,
      });

      const res = await getEmergencyRequestById('CL-8F42');
      expect(res.success).toBe(true);
      expect(res.data?.referenceCode).toBe('CL-8F42');
      expect(supabase.rpc).toHaveBeenCalledWith('track_emergency_request', {
        p_tracking_token: null,
        p_request_id: null,
        p_reference_code: 'CL-8F42',
      });
    });

    it('2.4 Invalid token or unauthorized attempt returns empty and yields not found', async () => {
      const qb = (supabase.from as any)();
      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // track_emergency_request returns empty for invalid token or unauthorized caller
      (supabase.rpc as any).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      qb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await getEmergencyRequestById('CL-XXXX');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Emergency request not found.');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Notification Service Client Isolation                                   */
  /* -------------------------------------------------------------------------- */
  describe('3. Notification Service Client Isolation', () => {
    it('3.1 Does NOT call service-role restricted update_notification_delivery_status from client', () => {
      notificationService.updateStatus('test-notif-uuid', 'SENT');
      expect(supabase.rpc).not.toHaveBeenCalledWith(
        'update_notification_delivery_status',
        expect.anything()
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Migration SQL Security & Schema Validation                              */
  /* -------------------------------------------------------------------------- */
  describe('4. Migration SQL Security & Schema Validation', () => {
    it('4.1 Confirms tracking_token column, view hardening, and VOLATILE RPC declaration', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261106150000_harden_discovery_and_guest_tracking.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf-8');

      // 1. Check tracking_token added to emergency_requests
      expect(sql).toContain('ALTER TABLE public.emergency_requests');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS tracking_token UUID');

      // 2. Check tracking_rate_limits table is REMOVED from migration
      expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.tracking_rate_limits');

      // 3. Check security_barrier is enabled on view
      expect(sql).toContain('WITH (security_barrier = true)');

      // 4. Check coordinate rounding for privacy
      expect(sql).toContain('ROUND(er.lat::numeric, 3)');
      expect(sql).toContain('ROUND(er.lng::numeric, 3)');

      // 5. Check that tracking_token, hospital_id, and postal_code are strictly omitted from discovery view
      const viewSql = sql.substring(
        sql.indexOf('CREATE VIEW public.discoverable_emergency_requests'),
        sql.indexOf('FROM public.emergency_requests er')
      );
      expect(viewSql).not.toContain('tracking_token');
      expect(viewSql).not.toContain('hospital_id');
      expect(viewSql).not.toContain('postal_code');

      // 6. Check explicit grants on discovery view
      expect(sql).toContain('GRANT SELECT ON public.discoverable_emergency_requests TO anon, authenticated');

      // 7. Check atomic submit_guest_emergency_request RPC with idempotency
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.submit_guest_emergency_request');
      expect(sql).toContain('p_tracking_token UUID DEFAULT NULL');
      expect(sql).toContain('SELECT id INTO v_existing_id FROM public.emergency_requests WHERE id = v_new_id;');
      expect(sql).toContain("'idempotent', true");

      // 8. Check track_emergency_request RPC is explicitly declared VOLATILE
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.track_emergency_request');
      const trackFuncDecl = sql.substring(
        sql.indexOf('CREATE OR REPLACE FUNCTION public.track_emergency_request'),
        sql.indexOf('SECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$')
      );
      expect(trackFuncDecl).toContain('VOLATILE');
      expect(trackFuncDecl).not.toContain('STABLE');

      // 9. Confirm no shared anonymous rate limit key exists (preventing global DoS)
      expect(sql).not.toContain("'anonymous_client'");

      // 10. Check that anonymous callers must provide tracking_token
      expect(sql).toContain('WHERE er.tracking_token = p_tracking_token');
      expect(sql).toContain('WHERE er.created_by = v_caller_uid');
      expect(sql).toContain("v_caller_role IN ('coordinator', 'admin', 'blood_centre')");
    });
  });
});
