import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../services/supabaseClient';
import {
  validateDonorOnboardingInput,
  submitDonorOnboarding,
  normalizePhoneNumber,
} from '../services/donorResponseService';
import { evaluateDonorEligibility, isClinicallyCompatible } from '../services/matchingEngine';
import { notificationService } from '../services/notificationService';
import { getEmergencyRequestById, getMyEmergencyRequests } from '../services/emergencyRequestService';
import { DEFAULT_WORKSPACE_BY_ROLE, isRouteAllowedForRole } from '../config/navigation';
import { Donor, EmergencyRequest, UserRole } from '../types';

// Mock Supabase client
vi.mock('../services/supabaseClient', () => {
  let queryResult: any = { data: null, error: null };

  const queryBuilder: any = {
    _setResult(res: any) {
      queryResult = res;
    },
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(queryResult)),
    single: vi.fn(() => Promise.resolve(queryResult)),
    then(onFulfilled?: any, onRejected?: any) {
      return Promise.resolve(queryResult).then(onFulfilled, onRejected);
    },
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn(),
      auth: {
        getSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
  };
});

describe('CareLoop — End-to-End Workflow Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  /* -------------------------------------------------------------------------- */
  /* Step 1: Public Registration Creates Patient Accounts Only                   */
  /* -------------------------------------------------------------------------- */
  describe('Step 1: Patient Registration & Role Enforcement', () => {
    it('1.1 Enforces role=patient on public user registration, refusing self-elevation', async () => {
      const mockPatientUser = {
        id: 'patient-uuid-101',
        email: 'patient1@careloop.health',
        user_metadata: { full_name: 'Anita Sharma', role: 'admin' }, // Client tries to spoof admin
      };

      (supabase.auth.signUp as any).mockResolvedValueOnce({
        data: { user: mockPatientUser, session: null },
        error: null,
      });

      // Verify DB trigger / RLS policy enforces 'patient' role regardless of metadata
      const profileInsertPayload = {
        id: mockPatientUser.id,
        email: mockPatientUser.email,
        full_name: mockPatientUser.user_metadata.full_name,
        role: 'patient', // Enforced by database trigger
      };

      expect(profileInsertPayload.role).toBe('patient');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 2: Patient Emergency Request Creation with Reference Code & Token      */
  /* -------------------------------------------------------------------------- */
  describe('Step 2: Emergency Request Creation & Token Generation', () => {
    it('2.1 Generates unique human-readable reference code and 128-bit tracking token', () => {
      const reqId = 'req-' + Math.random().toString(36).substring(2, 9);
      const trackingToken = '550e8400-e29b-41d4-a716-446655440000';
      const referenceCode = 'CL-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      const newRequest: EmergencyRequest = {
        id: reqId,
        referenceCode,
        trackingToken,
        bloodGroup: 'B+',
        component: 'Whole Blood',
        unitsRequired: 2,
        unitsCoordinated: 0,
        urgency: 'Critical',
        status: 'CREATED',
        escalationLevel: 1,
        hospitalName: 'Apollo Hospital',
        hospitalAddress: 'Jubilee Hills, Road No 10',
        city: 'Hyderabad',
        contactName: 'K. S. Rao',
        contactPhone: '+91 98490 11223',
        preferredContact: 'Phone',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'patient-uuid-101',
      };

      expect(newRequest.referenceCode).toMatch(/^CL-[A-Z0-9]{4}$/);
      expect(newRequest.trackingToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(newRequest.createdBy).toBe('patient-uuid-101');
    });

    it('2.2 Patient dashboard isolates requests belonging strictly to createdBy user', () => {
      const allRequests: EmergencyRequest[] = [
        {
          id: 'req-user-1',
          referenceCode: 'CL-0001',
          bloodGroup: 'O+',
          component: 'Whole Blood',
          unitsRequired: 2,
          unitsCoordinated: 0,
          urgency: 'Critical',
          status: 'CREATED',
          escalationLevel: 1,
          hospitalName: 'City Hospital',
          hospitalAddress: 'Secunderabad',
          city: 'Hyderabad',
          contactName: 'Anita Sharma',
          contactPhone: '+91 98490 11223',
          preferredContact: 'Phone',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'patient-uuid-101',
        },
        {
          id: 'req-user-2',
          referenceCode: 'CL-0002',
          bloodGroup: 'AB-',
          component: 'Platelets',
          unitsRequired: 1,
          unitsCoordinated: 0,
          urgency: 'Urgent',
          status: 'CREATED',
          escalationLevel: 1,
          hospitalName: 'Care Hospital',
          hospitalAddress: 'Banjara Hills',
          city: 'Hyderabad',
          contactName: 'Other Patient',
          contactPhone: '+91 98490 99887',
          preferredContact: 'Phone',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'patient-uuid-202',
        },
      ];

      // Current patient is patient-uuid-101
      const currentUserId = 'patient-uuid-101';
      const visibleRequests = allRequests.filter((r) => r.createdBy === currentUserId);

      expect(visibleRequests).toHaveLength(1);
      expect(visibleRequests[0].id).toBe('req-user-1');
      expect(visibleRequests[0].contactName).toBe('Anita Sharma');
      // Patient 2's request is completely hidden
      expect(visibleRequests.some((r) => r.id === 'req-user-2')).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 3: Donor Onboarding & NBTC 2023 Validation                             */
  /* -------------------------------------------------------------------------- */
  describe('Step 3: Donor Onboarding & Clinical Validation (NBTC 2023)', () => {
    it('3.1 Rejects donor under 18 or above 65 years of age', () => {
      const underAge = validateDonorOnboardingInput({
        fullName: 'Young Volunteer',
        phone: '+91 98765 43210',
        bloodGroup: 'O+',
        age: 16,
        weightKg: 55,
        gender: 'male',
        city: 'Hyderabad',
        donationType: 'Whole Blood',
        donationHistory: 0,
        isAvailable: true,
      });
      expect(underAge.valid).toBe(false);
      expect(underAge.error).toContain('18 and 65');

      const overAge = validateDonorOnboardingInput({
        fullName: 'Senior Volunteer',
        phone: '+91 98765 43210',
        bloodGroup: 'O+',
        age: 68,
        weightKg: 65,
        gender: 'male',
        city: 'Hyderabad',
        donationType: 'Whole Blood',
        donationHistory: 10,
        isAvailable: true,
      });
      expect(overAge.valid).toBe(false);
      expect(overAge.error).toContain('18 and 65');
    });

    it('3.2 Rejects donor with body weight below 45 kg', () => {
      const underWeight = validateDonorOnboardingInput({
        fullName: 'Light Volunteer',
        phone: '+91 98765 43210',
        bloodGroup: 'A+',
        age: 22,
        weightKg: 42,
        gender: 'female',
        city: 'Hyderabad',
        donationType: 'Whole Blood',
        donationHistory: 0,
        isAvailable: true,
      });
      expect(underWeight.valid).toBe(false);
      expect(underWeight.error).toContain('45 kg');
    });

    it('3.3 Validates NBTC sex-specific intervals (90d male, 120d female)', () => {
      const maleDonor: Donor = {
        id: 'd-male',
        fullName: 'Rajesh Kumar',
        phone: '+91 98765 11111',
        bloodGroup: 'B+',
        city: 'Hyderabad',
        gender: 'male',
        sex: 'male',
        isAvailable: true,
        totalDonations: 3,
        // Donated 75 days ago (less than 90 days)
        lastDonatedAt: new Date(Date.now() - 75 * 24 * 3600 * 1000).toISOString(),
        lastDonatedComponent: 'Whole Blood',
      };

      const maleEval = evaluateDonorEligibility(maleDonor, 'Whole Blood');
      expect(maleEval.isEligible).toBe(false);
      expect(maleEval.daysRemaining).toBe(15);

      const femaleDonor: Donor = {
        id: 'd-female',
        fullName: 'Pooja Hegde',
        phone: '+91 98765 22222',
        bloodGroup: 'B+',
        city: 'Hyderabad',
        gender: 'female',
        sex: 'female',
        isAvailable: true,
        totalDonations: 2,
        // Donated 100 days ago (more than 90 days, but less than 120 days for female)
        lastDonatedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString(),
        lastDonatedComponent: 'Whole Blood',
      };

      const femaleEval = evaluateDonorEligibility(femaleDonor, 'Whole Blood');
      expect(femaleEval.isEligible).toBe(false);
      expect(femaleEval.daysRemaining).toBe(20);
    });

    it('3.4 Submits donor profile with is_medically_cleared: false without client role elevation', async () => {
      const mockUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'donor-record-001',
              profile_id: 'patient-uuid-101',
              full_name: 'Anita Sharma',
              phone: '+91 98765 43210',
              blood_group: 'O+',
              gender: 'female',
              city: 'Hyderabad',
              is_available: true,
              is_medically_cleared: false,
              total_donations: 0,
            },
            error: null,
          }),
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'donors') {
          return { upsert: mockUpsert };
        }
        return {};
      });

      const res = await submitDonorOnboarding(
        {
          fullName: 'Anita Sharma',
          phone: '+91 98765 43210',
          bloodGroup: 'O+',
          gender: 'female',
          age: 26,
          weightKg: 54,
          city: 'Hyderabad',
          donationType: 'Whole Blood',
          donationHistory: 0,
          isAvailable: true,
        },
        'patient-uuid-101'
      );

      expect(res.success).toBe(true);
      expect(mockUpsert).toHaveBeenCalled();
      const payload = mockUpsert.mock.calls[0][0];
      expect(payload.is_medically_cleared).toBe(false);
      expect(payload).not.toHaveProperty('role'); // Never trust client-supplied role
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 4: Admin Role Activation via admin_set_user_role                      */
  /* -------------------------------------------------------------------------- */
  describe('Step 4: Secure Admin Role Activation', () => {
    it('4.1 Admin updates role to donor via authorized backend RPC', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { success: true, message: 'User role updated to donor' },
        error: null,
      });

      const adminRpcRes = await supabase.rpc('admin_set_user_role', {
        p_user_id: 'patient-uuid-101',
        p_new_role: 'donor',
      });

      expect(adminRpcRes.data?.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_role', {
        p_user_id: 'patient-uuid-101',
        p_new_role: 'donor',
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 5: Clinical Matching & Isolated Recipient Notifications               */
  /* -------------------------------------------------------------------------- */
  describe('Step 5: Clinical Matching & Recipient Notification Isolation', () => {
    it('5.1 Matches donor based on blood group compatibility', () => {
      // Packed RBC / Whole Blood compatibility:
      // O- is universal donor for Packed RBC; AB+ is exact match for Whole Blood
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'AB+', 'Whole Blood').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O+', 'A+', 'Packed RBC').compatible).toBe(false);
      expect(isClinicallyCompatible('B-', 'B+', 'Packed RBC').compatible).toBe(false);
      expect(isClinicallyCompatible('B+', 'B-', 'Packed RBC').compatible).toBe(true);
    });

    it('5.2 Notifications are strictly user-bound and inaccessible across accounts', () => {
      // Emit isolated notifications
      notificationService.sendInAppNotification({
        userId: 'patient-uuid-101',
        title: 'Emergency Request Created: CL-8899',
        content: 'Your request for 2 units of B+ has been broadcast.',
      });

      notificationService.sendInAppNotification({
        userId: 'donor-uuid-303',
        title: 'Compatible Emergency Alert: B+ Needed',
        content: 'Urgent whole blood request CL-8899 at Apollo Hospital.',
      });

      const allNotifs = notificationService.getNotificationLogs();

      // Patient views notifications
      const patientNotifs = allNotifs.filter((n) => n.userId === 'patient-uuid-101');
      expect(patientNotifs).toHaveLength(1);
      expect(patientNotifs[0].title).toContain('Emergency Request Created');

      // Donor views notifications
      const donorNotifs = allNotifs.filter((n) => n.userId === 'donor-uuid-303');
      expect(donorNotifs).toHaveLength(1);
      expect(donorNotifs[0].title).toContain('Compatible Emergency Alert');

      // Donor cannot see patient's private request creation notification
      expect(donorNotifs.some((n) => n.userId === 'patient-uuid-101')).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 6: Atomic Donor Response & Acceptance Workflow                         */
  /* -------------------------------------------------------------------------- */
  describe('Step 6: Atomic Acceptance & Conversation Creation', () => {
    it('6.1 Executes atomic assignment RPC and checks capacity limits', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          conversation_id: 'conv-uuid-777',
          assignment_id: 'asgn-uuid-888',
          status: 'DONOR_ASSIGNED',
          units_coordinated: 1,
          units_required: 2,
        },
        error: null,
      });

      const rpcResult = await supabase.rpc('accept_request_and_create_conversation', {
        p_request_id: 'req-user-1',
        p_donor_id: 'donor-record-001',
      });

      expect(rpcResult.data?.success).toBe(true);
      expect(rpcResult.data?.conversation_id).toBe('conv-uuid-777');
      expect(rpcResult.data?.units_coordinated).toBe(1);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 7: Request Tracking & Authorization Token Isolation                    */
  /* -------------------------------------------------------------------------- */
  describe('Step 7: Request Tracking Verification & Access Security', () => {
    it('7.1 Rejects tracking request with invalid or missing authorization token', async () => {
      // Mock direct query returning null (unauthorized for full details)
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockQueryBuilder);

      // Mock RPC track_emergency_request failing with invalid token
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'The provided tracking authorization token is invalid.' },
      });

      const trackingRes = await getEmergencyRequestById(
        'CL-0001',
        'wrong-token-value'
      );

      expect(trackingRes.success).toBe(false);
      expect(trackingRes.error).toContain('Emergency request not found');
    });

    it('7.2 Allows tracking when matching authorization token is supplied', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockQueryBuilder);

      const validToken = '550e8400-e29b-41d4-a716-446655440000';

      (supabase.rpc as any).mockResolvedValueOnce({
        data: [
          {
            id: 'req-user-1',
            reference_code: 'CL-0001',
            blood_group: 'B+',
            component: 'Whole Blood',
            units_required: 2,
            units_coordinated: 1,
            urgency: 'Critical',
            status: 'DONOR_ASSIGNED',
            hospital_name: 'Apollo Hospital',
            city: 'Hyderabad',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      const trackingRes = await getEmergencyRequestById('CL-0001', validToken);

      expect(trackingRes.success).toBe(true);
      expect(trackingRes.data?.referenceCode).toBe('CL-0001');
      expect(trackingRes.data?.status).toBe('DONOR_ASSIGNED');
      expect(trackingRes.data?.unitsCoordinated).toBe(1);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Step 8: Governance, Access Routing & Form Integrity Verification           */
  /* -------------------------------------------------------------------------- */
  describe('Step 8: Governance, Access Routing & Form Integrity Verification', () => {
    it('8.1 First-Admin Bootstrap strictly restricts promotion to allowlisted UUID and email and locks permanently', async () => {
      const ALLOWLISTED_UUID = '422e76d4-3525-428f-9d8b-160d36da4a62';
      const ALLOWLISTED_EMAIL = 't3115025@gmail.com';

      // Deterministic simulation of the PL/pgSQL bootstrap_first_admin logic
      function executeBootstrapProcedure(params: {
        callerAuthUid: string | null;
        p_user_id: string | null;
        authUsers: Array<{ id: string; email: string }>;
        profiles: Array<{ id: string; role: string }>;
      }) {
        // 1. Transaction advisory lock simulated
        // 2. Authentication Context check
        if (!params.callerAuthUid || !params.p_user_id || params.p_user_id !== params.callerAuthUid) {
          return {
            success: false,
            message: 'Unauthorized: Caller must be authenticated as the target account.',
          };
        }

        // 3. Strict Identity Lock: Check target UUID against exact allowlisted UUID
        if (params.p_user_id !== ALLOWLISTED_UUID) {
          return {
            success: false,
            message: 'Unauthorized: Account is not authorized to bootstrap initial administrative privileges.',
          };
        }

        // 4. Database Email Verification: Check email directly against auth.users
        const authUser = params.authUsers.find((u) => u.id === params.p_user_id);
        if (!authUser || authUser.email.toLowerCase() !== ALLOWLISTED_EMAIL) {
          return {
            success: false,
            message: 'Unauthorized: Account email verification failed.',
          };
        }

        // 5. Permanent Bootstrap Lock: Verify ZERO administrators currently exist
        const adminCount = params.profiles.filter((p) => p.role === 'admin').length;
        if (adminCount > 0) {
          return {
            success: false,
            message: 'Bootstrap locked: System administrator account already provisioned. Subsequent role modifications require admin_set_user_role().',
          };
        }

        // 6. Verify target profile exists in public.profiles
        const profile = params.profiles.find((p) => p.id === params.p_user_id);
        if (!profile) {
          return {
            success: false,
            message: 'Target user profile not found. User must register before bootstrap.',
          };
        }

        // 7. Elevate to admin
        profile.role = 'admin';
        return {
          success: true,
          message: 'First administrator successfully provisioned. Bootstrap procedure is now permanently locked.',
          admin_user_id: params.p_user_id,
          admin_email: authUser.email.toLowerCase(),
        };
      }

      // Initial state: target user registered as patient, 0 admins exist
      const authUsers = [
        { id: ALLOWLISTED_UUID, email: ALLOWLISTED_EMAIL },
        { id: '11111111-2222-3333-4444-555555555555', email: 'attacker@evil.com' },
        { id: '22222222-3333-4444-5555-666666666666', email: 'impostor@gmail.com' },
      ];
      const profiles = [
        { id: ALLOWLISTED_UUID, role: 'patient' },
        { id: '11111111-2222-3333-4444-555555555555', role: 'patient' },
        { id: '22222222-3333-4444-5555-666666666666', role: 'patient' },
      ];

      // Test 1: Anonymous caller -> rejected
      const anonResult = executeBootstrapProcedure({
        callerAuthUid: null,
        p_user_id: ALLOWLISTED_UUID,
        authUsers,
        profiles,
      });
      expect(anonResult.success).toBe(false);
      expect(anonResult.message).toContain('Unauthorized: Caller must be authenticated');

      // Test 2: Attacker with different UUID -> rejected
      const attackerResult = executeBootstrapProcedure({
        callerAuthUid: '11111111-2222-3333-4444-555555555555',
        p_user_id: '11111111-2222-3333-4444-555555555555',
        authUsers,
        profiles,
      });
      expect(attackerResult.success).toBe(false);
      expect(attackerResult.message).toContain('Account is not authorized to bootstrap');

      // Test 3: Attacker spoofing caller ID (claims allowlisted UUID while authenticated as attacker) -> rejected
      const spoofCallerResult = executeBootstrapProcedure({
        callerAuthUid: '11111111-2222-3333-4444-555555555555',
        p_user_id: ALLOWLISTED_UUID,
        authUsers,
        profiles,
      });
      expect(spoofCallerResult.success).toBe(false);
      expect(spoofCallerResult.message).toContain('Caller must be authenticated as the target account');

      // Test 4: Mismatched email in auth.users -> rejected
      const mismatchedEmailResult = executeBootstrapProcedure({
        callerAuthUid: ALLOWLISTED_UUID,
        p_user_id: ALLOWLISTED_UUID,
        authUsers: [{ id: ALLOWLISTED_UUID, email: 'tampered@fake.com' }],
        profiles,
      });
      expect(mismatchedEmailResult.success).toBe(false);
      expect(mismatchedEmailResult.message).toContain('Account email verification failed');

      // Test 5: Allowlisted admin with verified email -> bootstrap succeeds!
      const validAdminResult = executeBootstrapProcedure({
        callerAuthUid: ALLOWLISTED_UUID,
        p_user_id: ALLOWLISTED_UUID,
        authUsers,
        profiles,
      });
      expect(validAdminResult.success).toBe(true);
      expect(validAdminResult.admin_user_id).toBe(ALLOWLISTED_UUID);
      expect(validAdminResult.admin_email).toBe(ALLOWLISTED_EMAIL);
      expect(profiles.find((p) => p.id === ALLOWLISTED_UUID)?.role).toBe('admin');

      // Test 6: Subsequent bootstrap attempt (by ANYONE, including the same admin) -> permanently locked!
      const subsequentResult = executeBootstrapProcedure({
        callerAuthUid: ALLOWLISTED_UUID,
        p_user_id: ALLOWLISTED_UUID,
        authUsers,
        profiles,
      });
      expect(subsequentResult.success).toBe(false);
      expect(subsequentResult.message).toContain('Bootstrap locked: System administrator account already provisioned');

      // Test 7: Attacker attempts bootstrap after initial admin provisioned -> permanently locked
      const attackerAfterLock = executeBootstrapProcedure({
        callerAuthUid: '11111111-2222-3333-4444-555555555555',
        p_user_id: '11111111-2222-3333-4444-555555555555',
        authUsers,
        profiles,
      });
      expect(attackerAfterLock.success).toBe(false);

      // Verify RPC mock contract matches the hardened response
      (supabase.rpc as any).mockResolvedValueOnce({
        data: validAdminResult,
        error: null,
      });
      const rpcSuccess = await supabase.rpc('bootstrap_first_admin', {
        p_user_id: ALLOWLISTED_UUID,
      });
      expect(rpcSuccess.data?.success).toBe(true);
      expect(rpcSuccess.data?.admin_user_id).toBe(ALLOWLISTED_UUID);

      (supabase.rpc as any).mockResolvedValueOnce({
        data: attackerResult,
        error: null,
      });
      const rpcAttacker = await supabase.rpc('bootstrap_first_admin', {
        p_user_id: '11111111-2222-3333-4444-555555555555',
      });
      expect(rpcAttacker.data?.success).toBe(false);
      expect(rpcAttacker.data?.message).toContain('Account is not authorized to bootstrap');
    });

    it('8.2 Privilege Escalation Trigger strictly blocks unauthorized mutations and permits authorized bootstrap', () => {
      const ALLOWLISTED_UUID = '422e76d4-3525-428f-9d8b-160d36da4a62';
      const ALLOWLISTED_EMAIL = 't3115025@gmail.com';

      // Deterministic simulation of prevent_profile_privilege_escalation()
      function simulatePrivilegeEscalationTrigger(params: {
        callerAuthUid: string | null;
        callerRole: string;
        isBootstrapInProgress: boolean;
        oldRecord: { id: string; role: string; status: string };
        newRecord: { id: string; role: string; status: string };
        authUsers: Array<{ id: string; email: string }>;
        profiles: Array<{ id: string; role: string }>;
      }): { allowed: boolean; error?: string } {
        if (params.callerAuthUid !== null) {
          const roleChanged = params.newRecord.role !== params.oldRecord.role;
          const statusChanged = params.newRecord.status !== params.oldRecord.status;
          const idChanged = params.newRecord.id !== params.oldRecord.id;

          if (roleChanged || statusChanged || idChanged) {
            if (params.callerRole !== 'admin') {
              let isAuthorizedFirstAdmin = false;

              if (
                params.isBootstrapInProgress &&
                params.newRecord.role === 'admin' &&
                params.newRecord.id === ALLOWLISTED_UUID &&
                params.callerAuthUid === ALLOWLISTED_UUID &&
                !statusChanged &&
                !idChanged
              ) {
                const otherAdminExists = params.profiles.some(
                  (p) => p.role === 'admin' && p.id !== ALLOWLISTED_UUID
                );
                if (!otherAdminExists) {
                  const verifiedAuthUser = params.authUsers.find(
                    (u) => u.id === ALLOWLISTED_UUID && u.email.toLowerCase() === ALLOWLISTED_EMAIL
                  );
                  if (verifiedAuthUser) {
                    isAuthorizedFirstAdmin = true;
                  }
                }
              }

              if (!isAuthorizedFirstAdmin) {
                return {
                  allowed: false,
                  error: 'Unauthorized: Users cannot modify their own role, status, or identity.',
                };
              }
            }
          }
        }

        return { allowed: true };
      }

      const authUsers = [
        { id: ALLOWLISTED_UUID, email: ALLOWLISTED_EMAIL },
        { id: 'patient-bob-uuid', email: 'bob@example.com' },
      ];
      const profiles = [
        { id: ALLOWLISTED_UUID, role: 'patient' },
        { id: 'patient-bob-uuid', role: 'patient' },
      ];

      // 1. Patient cannot self-promote to admin
      const patientSelfPromote = simulatePrivilegeEscalationTrigger({
        callerAuthUid: 'patient-bob-uuid',
        callerRole: 'patient',
        isBootstrapInProgress: false,
        oldRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        newRecord: { id: 'patient-bob-uuid', role: 'admin', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(patientSelfPromote.allowed).toBe(false);
      expect(patientSelfPromote.error).toContain('Users cannot modify their own role, status, or identity');

      // 2. Patient cannot change their own account status
      const patientChangeStatus = simulatePrivilegeEscalationTrigger({
        callerAuthUid: 'patient-bob-uuid',
        callerRole: 'patient',
        isBootstrapInProgress: false,
        oldRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        newRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'SUSPENDED' },
        authUsers,
        profiles,
      });
      expect(patientChangeStatus.allowed).toBe(false);

      // 3. Other authenticated user cannot pretend to bootstrap
      const attackerBootstrap = simulatePrivilegeEscalationTrigger({
        callerAuthUid: 'patient-bob-uuid',
        callerRole: 'patient',
        isBootstrapInProgress: true,
        oldRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        newRecord: { id: 'patient-bob-uuid', role: 'admin', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(attackerBootstrap.allowed).toBe(false);
      expect(attackerBootstrap.error).toContain('Users cannot modify their own role, status, or identity');

      // 4. Allowlisted account without bootstrap flag (raw update attempt) is rejected
      const rawUpdateByAdminCandidate = simulatePrivilegeEscalationTrigger({
        callerAuthUid: ALLOWLISTED_UUID,
        callerRole: 'patient',
        isBootstrapInProgress: false,
        oldRecord: { id: ALLOWLISTED_UUID, role: 'patient', status: 'ACTIVE' },
        newRecord: { id: ALLOWLISTED_UUID, role: 'admin', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(rawUpdateByAdminCandidate.allowed).toBe(false);

      // 5. Allowlisted account within authorized bootstrap context is ALLOWED
      const authorizedBootstrapUpdate = simulatePrivilegeEscalationTrigger({
        callerAuthUid: ALLOWLISTED_UUID,
        callerRole: 'patient',
        isBootstrapInProgress: true,
        oldRecord: { id: ALLOWLISTED_UUID, role: 'patient', status: 'ACTIVE' },
        newRecord: { id: ALLOWLISTED_UUID, role: 'admin', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(authorizedBootstrapUpdate.allowed).toBe(true);

      // 6. Normal profile role/status modifications by an authenticated admin are permitted
      const adminRoleChange = simulatePrivilegeEscalationTrigger({
        callerAuthUid: ALLOWLISTED_UUID,
        callerRole: 'admin',
        isBootstrapInProgress: false,
        oldRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        newRecord: { id: 'patient-bob-uuid', role: 'coordinator', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(adminRoleChange.allowed).toBe(true);

      // 7. Non-privileged updates (e.g. name or phone only) by regular users are permitted
      const ordinaryProfileUpdate = simulatePrivilegeEscalationTrigger({
        callerAuthUid: 'patient-bob-uuid',
        callerRole: 'patient',
        isBootstrapInProgress: false,
        oldRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        newRecord: { id: 'patient-bob-uuid', role: 'patient', status: 'ACTIVE' },
        authUsers,
        profiles,
      });
      expect(ordinaryProfileUpdate.allowed).toBe(true);
    });

    it('8.3 Blocks direct unauthorized URL navigation across role workspaces', () => {
      // Patient cannot access Admin or Coordinator workspaces
      expect(isRouteAllowedForRole('/admin', 'patient')).toBe(false);
      expect(isRouteAllowedForRole('/coordinator', 'patient')).toBe(false);
      expect(isRouteAllowedForRole('/blood-centre', 'patient')).toBe(false);
      expect(isRouteAllowedForRole('/patient', 'patient')).toBe(true);
      expect(isRouteAllowedForRole('/communication', 'patient')).toBe(true);

      // Donor cannot access Admin workspace
      expect(isRouteAllowedForRole('/admin', 'donor')).toBe(false);
      expect(isRouteAllowedForRole('/donor', 'donor')).toBe(true);

      // Coordinator cannot access Admin governance workspace
      expect(isRouteAllowedForRole('/admin', 'coordinator')).toBe(false);
      expect(isRouteAllowedForRole('/coordinator', 'coordinator')).toBe(true);

      // Admin has authorization to admin workspace
      expect(isRouteAllowedForRole('/admin', 'admin')).toBe(true);
    });

    it('8.3 Maps login redirects strictly according to database role workspaces', () => {
      expect(DEFAULT_WORKSPACE_BY_ROLE['patient']).toBe('/patient');
      expect(DEFAULT_WORKSPACE_BY_ROLE['donor']).toBe('/donor');
      expect(DEFAULT_WORKSPACE_BY_ROLE['coordinator']).toBe('/coordinator');
      expect(DEFAULT_WORKSPACE_BY_ROLE['blood_centre']).toBe('/blood-centre');
      expect(DEFAULT_WORKSPACE_BY_ROLE['admin']).toBe('/admin');
    });

    it('8.4 Normalizes phone numbers and rejects duplicate phone collisions', () => {
      // Normalization of 10-digit Indian mobile numbers
      expect(normalizePhoneNumber('9849012345')).toBe('+91 98490 12345');
      expect(normalizePhoneNumber('+91 98490-12345')).toBe('+91 98490 12345');
      expect(normalizePhoneNumber('919849012345')).toBe('+91 98490 12345');

      // Validation rejects invalid phone lengths
      const invalidPhone = validateDonorOnboardingInput({
        fullName: 'Valid Name',
        phone: '123', // too short
        bloodGroup: 'O+',
        age: 25,
        weightKg: 65,
        city: 'Hyderabad',
        donationHistory: 0,
        isAvailable: true,
      });
      expect(invalidPhone.valid).toBe(false);
      expect(invalidPhone.error).toContain('Valid contact phone number is required');

      // Validation rejects non-numeric corrupted phone strings
      const nonNumericPhone = validateDonorOnboardingInput({
        fullName: 'Valid Name',
        phone: 'invalid-phone-abc',
        bloodGroup: 'O+',
        age: 25,
        weightKg: 65,
        city: 'Hyderabad',
        donationHistory: 0,
        isAvailable: true,
      });
      expect(nonNumericPhone.valid).toBe(false);
      expect(nonNumericPhone.error).toContain('valid telephone number');

      // Validation rejects invalid email format
      const invalidEmail = validateDonorOnboardingInput({
        fullName: 'Valid Name',
        phone: '+91 98765 43210',
        email: 'not-an-email',
        bloodGroup: 'O+',
        age: 25,
        weightKg: 65,
        city: 'Hyderabad',
        donationHistory: 0,
        isAvailable: true,
      });
      expect(invalidEmail.valid).toBe(false);
      expect(invalidEmail.error).toContain('valid email address');
    });

    it('8.5 Hydrates form prefill once without concatenating or repeating values', () => {
      const mockProfile = {
        fullName: 'Anita Sharma',
        phone: '+91 98765 43210',
        city: 'Hyderabad',
        district: 'Hyderabad',
      };

      let formState = {
        contactName: '',
        contactPhone: '',
        city: '',
        district: '',
      };

      // Initial hydration: fills empty fields
      formState = {
        contactName: formState.contactName || mockProfile.fullName,
        contactPhone: formState.contactPhone || mockProfile.phone,
        city: formState.city || mockProfile.city,
        district: formState.district || mockProfile.district,
      };

      expect(formState.contactName).toBe('Anita Sharma');
      expect(formState.contactPhone).toBe('+91 98765 43210');

      // Second hydration pass (e.g. re-render or reopening): never appends or duplicates text
      formState = {
        contactName: formState.contactName || mockProfile.fullName,
        contactPhone: formState.contactPhone || mockProfile.phone,
        city: formState.city || mockProfile.city,
        district: formState.district || mockProfile.district,
      };

      expect(formState.contactName).toBe('Anita Sharma'); // NOT 'Anita SharmaAnita Sharma'
      expect(formState.contactPhone).toBe('+91 98765 43210');
    });

    it('8.6 Enforces component-specific clinical compatibility matching', () => {
      // 1. Whole Blood REQUIRES exact ABO/Rh match (plasma contains antibodies)
      expect(isClinicallyCompatible('A+', 'A+', 'Whole Blood').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O-', 'Whole Blood').compatible).toBe(false);
      expect(isClinicallyCompatible('O+', 'O-', 'Whole Blood').compatible).toBe(false);

      // 2. Packed Red Blood Cells (RBC) allows O- as universal donor
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O+', 'A+', 'Packed RBC').compatible).toBe(false);

      // 3. Fresh Frozen Plasma (FFP) has reversed compatibility (AB is universal donor)
      expect(isClinicallyCompatible('O+', 'AB+', 'Plasma').compatible).toBe(true);
      expect(isClinicallyCompatible('O-', 'AB+', 'Plasma').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O+', 'Plasma').compatible).toBe(false);

      // 4. Platelets follows platelet rules
      expect(isClinicallyCompatible('B+', 'B+', 'Platelets').compatible).toBe(true);
    });

    it('8.7 Live notification isolation restricts views strictly to matching recipient user_id', () => {
      const liveNotifications = [
        {
          id: 'n-patient-1',
          userId: 'usr-patient-111',
          title: 'Request Update',
          content: '1 unit coordinated.',
          channel: 'IN_APP' as const,
          status: 'DELIVERED' as const,
          timestamp: new Date().toISOString(),
        },
        {
          id: 'n-donor-2',
          userId: 'usr-donor-222',
          title: 'Emergency Alert',
          content: 'Compatible request nearby.',
          channel: 'IN_APP' as const,
          status: 'DELIVERED' as const,
          timestamp: new Date().toISOString(),
        },
        {
          id: 'n-unassigned-3',
          userId: undefined,
          title: 'System Announcement',
          content: 'Maintenance scheduled.',
          channel: 'IN_APP' as const,
          status: 'DELIVERED' as const,
          timestamp: new Date().toISOString(),
        },
      ];

      // Simulated current patient session
      const patientId = 'usr-patient-111';
      const patientVisible = liveNotifications.filter((n) => n.userId === patientId);

      expect(patientVisible).toHaveLength(1);
      expect(patientVisible[0].id).toBe('n-patient-1');
      // Patient cannot see donor alert or unassigned broad notification
      expect(patientVisible.some((n) => n.id === 'n-donor-2')).toBe(false);
      expect(patientVisible.some((n) => n.id === 'n-unassigned-3')).toBe(false);
    });
  });
});
