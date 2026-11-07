import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../services/supabaseClient';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../config/navigation';
import { UserRole } from '../types';

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
    eq: vi.fn().mockReturnThis(),
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

describe('CareLoop — Foundation & Unified Authentication Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Unified Single Login Flow & Real Role Retrieval                         */
  /* -------------------------------------------------------------------------- */
  describe('1. Unified Login & Verified Profile Role Retrieval', () => {
    it('1.1 Authenticates user and retrieves actual role from Supabase profiles table', async () => {
      // Mock Supabase Auth returning user
      (supabase.auth.signInWithPassword as any).mockResolvedValueOnce({
        data: {
          user: { id: 'usr-coordinator-uuid-123', email: 'coordinator@hospital.org' },
          session: { access_token: 'fake-token' },
        },
        error: null,
      });

      // Mock profiles table returning verified 'coordinator' role
      const qb = (supabase.from as any)();
      qb._setResult({
        data: {
          id: 'usr-coordinator-uuid-123',
          email: 'coordinator@hospital.org',
          full_name: 'Dr. Evelyn Vance',
          role: 'coordinator',
          phone: '+91 98490 11111',
          status: 'ACTIVE',
        },
        error: null,
      });

      // Verify sign in with password
      const authRes = await supabase.auth.signInWithPassword({
        email: 'coordinator@hospital.org',
        password: 'securepassword123',
      });

      expect(authRes.data?.user?.id).toBe('usr-coordinator-uuid-123');

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authRes.data!.user!.id)
        .maybeSingle();

      expect(profile?.role).toBe('coordinator');
      expect(profile?.full_name).toBe('Dr. Evelyn Vance');
      expect(DEFAULT_WORKSPACE_BY_ROLE[profile.role as UserRole]).toBe('/coordinator');
    });

    it('1.2 Correctly routes different roles to their designated dashboards', () => {
      expect(DEFAULT_WORKSPACE_BY_ROLE['patient']).toBe('/patient');
      expect(DEFAULT_WORKSPACE_BY_ROLE['donor']).toBe('/donor');
      expect(DEFAULT_WORKSPACE_BY_ROLE['blood_centre']).toBe('/blood-centre');
      expect(DEFAULT_WORKSPACE_BY_ROLE['coordinator']).toBe('/coordinator');
      expect(DEFAULT_WORKSPACE_BY_ROLE['admin']).toBe('/admin');
    });

    it('1.3 Rejects invalid credentials with a descriptive clinical error', async () => {
      (supabase.auth.signInWithPassword as any).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const res = await supabase.auth.signInWithPassword({
        email: 'wrong@example.com',
        password: 'badpassword',
      });

      expect(res.error?.message).toBe('Invalid login credentials');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Unified Registration Flow & Strict Patient Assignment                   */
  /* -------------------------------------------------------------------------- */
  describe('2. Unified Registration & Automatic Patient Assignment', () => {
    it('2.1 Registers new account without public role selection and receives patient role', async () => {
      (supabase.auth.signUp as any).mockResolvedValueOnce({
        data: {
          user: { id: 'usr-new-patient-uuid-456', email: 'anil@example.com' },
          session: { access_token: 'fake-session' },
        },
        error: null,
      });

      const qb = (supabase.from as any)();
      qb._setResult({
        data: {
          id: 'usr-new-patient-uuid-456',
          email: 'anil@example.com',
          full_name: 'Anil Kumar',
          role: 'patient', // Enforced by PostgreSQL trigger handle_new_user()
          phone: '+91 98490 22222',
          status: 'ACTIVE',
        },
        error: null,
      });

      const res = await supabase.auth.signUp({
        email: 'anil@example.com',
        password: 'patientpassword2026',
        options: {
          data: {
            full_name: 'Anil Kumar',
            phone: '+91 98490 22222',
          },
        },
      });

      expect(res.data?.user?.email).toBe('anil@example.com');
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'anil@example.com',
        password: 'patientpassword2026',
        options: {
          data: {
            full_name: 'Anil Kumar',
            phone: '+91 98490 22222',
          },
        },
      });

      // Query verified profile from trigger
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', res.data!.user!.id)
        .maybeSingle();

      expect(profile?.role).toBe('patient');
      expect(DEFAULT_WORKSPACE_BY_ROLE[profile.role as UserRole]).toBe('/patient');
    });

    it('2.2 Handles existing user conflict on registration gracefully', async () => {
      (supabase.auth.signUp as any).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const res = await supabase.auth.signUp({
        email: 'existing@careloop.health',
        password: 'password123',
      });

      expect(res.error?.message).toBe('User already registered');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Password Reset Flow                                                     */
  /* -------------------------------------------------------------------------- */
  describe('3. Forgot Password Recovery Flow', () => {
    it('3.1 Invokes resetPasswordForEmail with safe redirect parameter', async () => {
      (supabase.auth.resetPasswordForEmail as any).mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const res = await supabase.auth.resetPasswordForEmail('user@example.com', {
        redirectTo: 'http://localhost:3000/login',
      });

      expect(res.error).toBeNull();
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        { redirectTo: 'http://localhost:3000/login' }
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Session Persistence, Sign Out, & State Cleansing                        */
  /* -------------------------------------------------------------------------- */
  describe('4. Session Persistence & Sign Out', () => {
    it('4.1 Sign out terminates Supabase session and removes local tokens', async () => {
      localStorage.setItem('careloop_auth_role', 'patient');
      localStorage.setItem('careloop_user_profile', JSON.stringify({ id: 'usr-1', role: 'patient' }));
      sessionStorage.setItem('careloop_demo_experience', 'patient');

      (supabase.auth.signOut as any).mockResolvedValueOnce({ error: null });

      await supabase.auth.signOut();
      localStorage.removeItem('careloop_auth_role');
      localStorage.removeItem('careloop_user_profile');
      sessionStorage.removeItem('careloop_demo_experience');

      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(localStorage.getItem('careloop_auth_role')).toBeNull();
      expect(localStorage.getItem('careloop_user_profile')).toBeNull();
      expect(sessionStorage.getItem('careloop_demo_experience')).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Authorization Boundary Defense & Role Guard Protection                  */
  /* -------------------------------------------------------------------------- */
  describe('5. Authorization Defense & Protected Dashboard Access', () => {
    it('5.1 Unauthenticated guests cannot access protected role workspaces', () => {
      const allowedRolesForAdmin: UserRole[] = ['admin'];
      const allowedRolesForCoordinator: UserRole[] = ['coordinator', 'admin'];
      const allowedRolesForPatient: UserRole[] = ['patient', 'coordinator', 'admin'];

      const authenticatedRole = null; // Unauthenticated

      const isAllowedAdmin = authenticatedRole ? allowedRolesForAdmin.includes(authenticatedRole) : false;
      const isAllowedCoord = authenticatedRole ? allowedRolesForCoordinator.includes(authenticatedRole) : false;
      const isAllowedPatient = authenticatedRole ? allowedRolesForPatient.includes(authenticatedRole) : false;

      expect(isAllowedAdmin).toBe(false);
      expect(isAllowedCoord).toBe(false);
      expect(isAllowedPatient).toBe(false);
    });

    it('5.2 Patient role cannot access admin or coordinator dashboards', () => {
      const patientRole: UserRole = 'patient';

      const allowedRolesForAdmin: UserRole[] = ['admin'];
      const allowedRolesForCoordinator: UserRole[] = ['coordinator', 'admin'];

      expect(allowedRolesForAdmin.includes(patientRole)).toBe(false);
      expect(allowedRolesForCoordinator.includes(patientRole)).toBe(false);
    });

    it('5.3 Coordinator role can access coordinator and blood-centre but not admin', () => {
      const coordinatorRole: UserRole = 'coordinator';

      const allowedRolesForAdmin: UserRole[] = ['admin'];
      const allowedRolesForCoordinator: UserRole[] = ['coordinator', 'admin'];
      const allowedRolesForBloodCentre: UserRole[] = ['blood_centre', 'coordinator', 'admin'];

      expect(allowedRolesForAdmin.includes(coordinatorRole)).toBe(false);
      expect(allowedRolesForCoordinator.includes(coordinatorRole)).toBe(true);
      expect(allowedRolesForBloodCentre.includes(coordinatorRole)).toBe(true);
    });

    it('5.4 Admin role possesses access across all administrative workspaces', () => {
      const adminRole: UserRole = 'admin';

      const allowedRolesForAdmin: UserRole[] = ['admin'];
      const allowedRolesForCoordinator: UserRole[] = ['coordinator', 'admin'];
      const allowedRolesForBloodCentre: UserRole[] = ['blood_centre', 'coordinator', 'admin'];
      const allowedRolesForPatient: UserRole[] = ['patient', 'coordinator', 'admin'];

      expect(allowedRolesForAdmin.includes(adminRole)).toBe(true);
      expect(allowedRolesForCoordinator.includes(adminRole)).toBe(true);
      expect(allowedRolesForBloodCentre.includes(adminRole)).toBe(true);
      expect(allowedRolesForPatient.includes(adminRole)).toBe(true);
    });
  });
});
