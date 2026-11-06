/**
 * CareLoop — SQL Security Remediation & Workflow Readiness Tests
 * 
 * Verifies the database security policies, immutable triggers, least-privilege grants,
 * privacy-preserving views, and state-machine transitions across migrations 1-4 and schema.sql.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_1_PATH = path.resolve(__dirname, '../../supabase/migrations/20261103000001_core_schema.sql');
const MIGRATION_2_PATH = path.resolve(__dirname, '../../supabase/migrations/20261103000002_communication_system.sql');
const MIGRATION_3_PATH = path.resolve(__dirname, '../../supabase/migrations/20261103000003_secure_voice_calling.sql');
const MIGRATION_4_PATH = path.resolve(__dirname, '../../supabase/migrations/20261103000004_notifications_and_storage.sql');
const SCHEMA_SQL_PATH = path.resolve(__dirname, '../../supabase/schema.sql');

describe('CareLoop SQL Security Remediation — Static Architecture & Schema Assertions', () => {
  const mig1 = fs.readFileSync(MIGRATION_1_PATH, 'utf-8');
  const mig2 = fs.readFileSync(MIGRATION_2_PATH, 'utf-8');
  const mig3 = fs.readFileSync(MIGRATION_3_PATH, 'utf-8');
  const mig4 = fs.readFileSync(MIGRATION_4_PATH, 'utf-8');
  const schema = fs.readFileSync(SCHEMA_SQL_PATH, 'utf-8');

  it('Issue 1: Donor acceptance and system message authorization are protected and decoupled', () => {
    // Both mig2 and schema must use the transaction-local system_message_allowed setting
    expect(mig2).toContain("current_setting('careloop.system_message_allowed', true)");
    expect(schema).toContain("current_setting('careloop.system_message_allowed', true)");

    expect(mig2).toContain("set_config('careloop.system_message_allowed', 'true', true)");
    expect(schema).toContain("set_config('careloop.system_message_allowed', 'true', true)");

    expect(mig2).toContain("set_config('careloop.system_message_allowed', 'false', true)");
    expect(schema).toContain("set_config('careloop.system_message_allowed', 'false', true)");

    // validate_message_sender must still reject ordinary users trying to emit system messages
    expect(mig2).toContain("Only system processes or administrators can emit SYSTEM messages");
    expect(schema).toContain("Only system processes or administrators can emit SYSTEM messages");
  });

  it('Issue 2: Emergency request columns are protected from direct donor scraping via discoverable view', () => {
    // mig1 and schema must define discoverable_emergency_requests VIEW
    expect(mig1).toContain('CREATE OR REPLACE VIEW public.discoverable_emergency_requests AS');
    expect(schema).toContain('CREATE OR REPLACE VIEW public.discoverable_emergency_requests AS');

    // Sensitive columns (contact_name, contact_phone, contact_method, notes) must NOT be in the view
    const viewRegex = /CREATE OR REPLACE VIEW public\.discoverable_emergency_requests AS\s+SELECT\s+([\s\S]+?)\s+FROM public\.emergency_requests/i;
    const match1 = mig1.match(viewRegex);
    expect(match1).not.toBeNull();
    const viewColumns = match1![1];
    expect(viewColumns).not.toContain('contact_phone');
    expect(viewColumns).not.toContain('contact_name');
    expect(viewColumns).not.toContain('contact_method');
    expect(viewColumns).not.toContain('notes');

    // The emergency_requests RLS policy must NOT allow broad donor SELECT
    expect(mig1).not.toMatch(/public\.get_user_role\(\)\s*=\s*'donor'\s+AND\s+status IN/);
    expect(schema).not.toMatch(/public\.get_user_role\(\)\s*=\s*'donor'\s+AND\s+status IN/);

    // Explicit grants for discoverable_emergency_requests to authenticated & anon
    expect(mig1).toContain('GRANT SELECT ON public.discoverable_emergency_requests TO authenticated, anon;');
    expect(schema).toContain('GRANT SELECT ON public.discoverable_emergency_requests TO authenticated, anon;');
  });

  it('Issue 3: discover_matching_donors validates guest requests, distance clamp, and acos bounds', () => {
    // Caller authentication check
    expect(mig1).toContain('IF v_caller_id IS NULL THEN');
    expect(schema).toContain('IF v_caller_id IS NULL THEN');

    // Distance clamping: > 0 and <= 500 km
    expect(mig1).toContain('IF p_max_distance_km IS NULL OR p_max_distance_km <= 0 OR p_max_distance_km > 500 THEN');
    expect(schema).toContain('IF p_max_distance_km IS NULL OR p_max_distance_km <= 0 OR p_max_distance_km > 500 THEN');

    // Terminal status check: do not search donors for fulfilled, cancelled, or expired requests
    expect(mig1).toContain("IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN");
    expect(schema).toContain("IF v_req.status IN ('FULFILLED', 'CANCELLED', 'EXPIRED') THEN");

    // Guest request authorization: when created_by IS NULL, only staff can search donors
    expect(mig1).toContain("IF v_caller_role NOT IN ('coordinator', 'admin', 'blood_centre') THEN");
    expect(schema).toContain("IF v_caller_role NOT IN ('coordinator', 'admin', 'blood_centre') THEN");

    // acos numerical bounds protection: LEAST(1.0, GREATEST(-1.0, ...))
    expect(mig1).toContain('LEAST(1.0::numeric, GREATEST(-1.0::numeric');
    expect(schema).toContain('LEAST(1.0::numeric, GREATEST(-1.0::numeric');
  });

  it('Issue 4: Call-session updates are locked down with immutability triggers and revoked privileges', () => {
    // Immutability trigger defined in mig3 and schema
    expect(mig3).toContain('CREATE OR REPLACE FUNCTION public.enforce_call_session_immutability()');
    expect(schema).toContain('CREATE OR REPLACE FUNCTION public.enforce_call_session_immutability()');

    expect(mig3).toContain('CREATE TRIGGER trg_enforce_call_session_immutability');
    expect(schema).toContain('CREATE TRIGGER trg_enforce_call_session_immutability');

    // Direct UPDATE revoked from public/authenticated/anon
    expect(mig3).toContain('REVOKE UPDATE ON public.call_sessions FROM PUBLIC, authenticated, anon;');
    expect(schema).toContain('REVOKE UPDATE ON public.call_sessions FROM PUBLIC, authenticated, anon;');

    // Direct update disallowed in RLS
    expect(mig3).toContain('CREATE POLICY "Direct call session update disallowed" ON public.call_sessions');
    expect(schema).toContain('CREATE POLICY "Direct call session update disallowed" ON public.call_sessions');

    // Terminal states cannot be revived
    expect(mig3).toContain("OLD.status IN ('ENDED', 'REJECTED', 'TIMEOUT', 'FAILED')");
    expect(schema).toContain("OLD.status IN ('ENDED', 'REJECTED', 'TIMEOUT', 'FAILED')");
  });

  it('Issue 5: Messages update RLS has explicit WITH CHECK and prevent_message_tampering guards roles/types', () => {
    // Senders update own message content only WITH CHECK
    expect(mig2).toContain('CREATE POLICY "Senders update own message content only" ON public.messages');
    expect(mig2).toContain('WITH CHECK (\n        sender_id = auth.uid()\n        AND public.is_conversation_participant(conversation_id)\n    );');

    expect(schema).toContain('CREATE POLICY "Senders update own message content only" ON public.messages');
    expect(schema).toContain('WITH CHECK (\n        sender_id = auth.uid()\n        AND public.is_conversation_participant(conversation_id)\n    );');

    // prevent_message_tampering protects sender_role, message_type, and system messages
    expect(mig2).toContain('NEW.sender_role IS DISTINCT FROM OLD.sender_role');
    expect(mig2).toContain('NEW.message_type IS DISTINCT FROM OLD.message_type');
    expect(mig2).toContain("OLD.message_type = 'SYSTEM' OR OLD.sender_role = 'system'");

    expect(schema).toContain('NEW.sender_role IS DISTINCT FROM OLD.sender_role');
    expect(schema).toContain('NEW.message_type IS DISTINCT FROM OLD.message_type');
    expect(schema).toContain("OLD.message_type = 'SYSTEM' OR OLD.sender_role = 'system'");
  });

  it('Issue 6: Coordinator assignment attribution in assign_donor_atomic is securely derived', () => {
    // Coordinator attribution must derive acting coordinator from auth.uid() rather than blind coalesce
    expect(mig1).toContain("ELSIF v_caller_role = 'coordinator' THEN");
    expect(mig1).toContain('v_acting_coordinator_id := v_caller_id;');
    expect(mig1).toContain('v_acting_coordinator_id := NULL;');

    expect(schema).toContain("ELSIF v_caller_role = 'coordinator' THEN");
    expect(schema).toContain('v_acting_coordinator_id := v_caller_id;');
    expect(schema).toContain('v_acting_coordinator_id := NULL;');
  });

  it('Issue 7: Audit log integrity is guaranteed via validate_audit_log_actor trigger and least-privilege', () => {
    // Trigger ensures authenticated user_id cannot be spoofed
    expect(mig1).toContain('CREATE OR REPLACE FUNCTION public.validate_audit_log_actor()');
    expect(schema).toContain('CREATE OR REPLACE FUNCTION public.validate_audit_log_actor()');

    expect(mig1).toContain('NEW.user_id := auth.uid();');
    expect(schema).toContain('NEW.user_id := auth.uid();');

    // Immutable audit logs: UPDATE and DELETE are prohibited
    expect(mig1).toContain("RAISE EXCEPTION 'Audit logs are strictly immutable and cannot be updated.';");
    expect(schema).toContain("RAISE EXCEPTION 'Audit logs are strictly immutable and cannot be updated.';");

    expect(mig1).toContain('REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, authenticated, anon;');
    expect(schema).toContain('REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, authenticated, anon;');
  });
});

describe('CareLoop State Machine & Attribution Logic Simulations', () => {
  // Pure logic simulation of enforce_call_session_immutability
  function simulateCallSessionTransition(
    oldState: { id: string; callerId: string; receiverId: string; status: string },
    newState: { id: string; callerId: string; receiverId: string; status: string }
  ): { allowed: boolean; error?: string } {
    if (oldState.id !== newState.id || oldState.callerId !== newState.callerId || oldState.receiverId !== newState.receiverId) {
      return { allowed: false, error: 'Call session identity is immutable.' };
    }

    if (oldState.status === newState.status) {
      return { allowed: true };
    }

    if (['ENDED', 'REJECTED', 'TIMEOUT', 'FAILED'].includes(oldState.status)) {
      return { allowed: false, error: `Call session is in terminal state ${oldState.status} and cannot be modified.` };
    }

    if (oldState.status === 'INITIATING' && !['RINGING', 'FAILED', 'TIMEOUT', 'ENDED'].includes(newState.status)) {
      return { allowed: false, error: `Illegal transition from INITIATING to ${newState.status}` };
    }

    if (oldState.status === 'RINGING' && !['ACCEPTED', 'REJECTED', 'TIMEOUT', 'FAILED', 'ENDED'].includes(newState.status)) {
      return { allowed: false, error: `Illegal transition from RINGING to ${newState.status}` };
    }

    if (oldState.status === 'ACCEPTED' && !['CONNECTED', 'ENDED', 'FAILED'].includes(newState.status)) {
      return { allowed: false, error: `Illegal transition from ACCEPTED to ${newState.status}` };
    }

    if (oldState.status === 'CONNECTED' && !['ENDED', 'FAILED'].includes(newState.status)) {
      return { allowed: false, error: `Illegal transition from CONNECTED to ${newState.status}` };
    }

    return { allowed: true };
  }

  it('permits valid linear call lifecycle transitions', () => {
    const session = { id: 'call-1', callerId: 'user-a', receiverId: 'user-b', status: 'INITIATING' };

    // INITIATING -> RINGING
    expect(simulateCallSessionTransition(session, { ...session, status: 'RINGING' }).allowed).toBe(true);

    // RINGING -> ACCEPTED
    const ringing = { ...session, status: 'RINGING' };
    expect(simulateCallSessionTransition(ringing, { ...session, status: 'ACCEPTED' }).allowed).toBe(true);

    // ACCEPTED -> CONNECTED
    const accepted = { ...session, status: 'ACCEPTED' };
    expect(simulateCallSessionTransition(accepted, { ...session, status: 'CONNECTED' }).allowed).toBe(true);

    // CONNECTED -> ENDED
    const connected = { ...session, status: 'CONNECTED' };
    expect(simulateCallSessionTransition(connected, { ...session, status: 'ENDED' }).allowed).toBe(true);
  });

  it('strictly rejects illegal transitions from terminal states', () => {
    const ended = { id: 'call-1', callerId: 'user-a', receiverId: 'user-b', status: 'ENDED' };
    expect(simulateCallSessionTransition(ended, { ...ended, status: 'CONNECTED' }).allowed).toBe(false);

    const rejected = { id: 'call-1', callerId: 'user-a', receiverId: 'user-b', status: 'REJECTED' };
    expect(simulateCallSessionTransition(rejected, { ...rejected, status: 'ACCEPTED' }).allowed).toBe(false);

    const timeout = { id: 'call-1', callerId: 'user-a', receiverId: 'user-b', status: 'TIMEOUT' };
    expect(simulateCallSessionTransition(timeout, { ...timeout, status: 'RINGING' }).allowed).toBe(false);
  });

  it('strictly rejects tampering with caller or receiver identity', () => {
    const session = { id: 'call-1', callerId: 'user-a', receiverId: 'user-b', status: 'INITIATING' };
    const tampered = { ...session, callerId: 'hacker-c', status: 'RINGING' };
    expect(simulateCallSessionTransition(session, tampered).allowed).toBe(false);
  });

  // Pure logic simulation of coordinator attribution derivation in assign_donor_atomic
  function deriveCoordinatorAttribution(
    callerRole: string,
    callerId: string,
    inputCoordinatorId: string | null,
    registeredCoordinators: Set<string>
  ): string | null {
    if (callerRole === 'admin') {
      if (inputCoordinatorId && registeredCoordinators.has(inputCoordinatorId)) {
        return inputCoordinatorId;
      }
      return callerId;
    } else if (callerRole === 'coordinator') {
      return callerId; // Strictly bounded to self
    } else {
      return null; // Ordinary users cannot forge coordinator attribution
    }
  }

  it('prevents coordinators and patients from spoofing attribution in donor assignment', () => {
    const coordinators = new Set(['coord-1', 'coord-2']);

    // Coordinator 1 attempts to attribute to Coordinator 2 -> must be bound to Coordinator 1
    const result1 = deriveCoordinatorAttribution('coordinator', 'coord-1', 'coord-2', coordinators);
    expect(result1).toBe('coord-1');

    // Patient attempts to claim coordinator attribution -> must be null
    const result2 = deriveCoordinatorAttribution('patient', 'patient-x', 'coord-1', coordinators);
    expect(result2).toBeNull();

    // Admin without specific coordinator -> defaults to admin ID
    const result3 = deriveCoordinatorAttribution('admin', 'admin-master', null, coordinators);
    expect(result3).toBe('admin-master');

    // Admin assigning to valid coordinator -> allowed
    const result4 = deriveCoordinatorAttribution('admin', 'admin-master', 'coord-2', coordinators);
    expect(result4).toBe('coord-2');
  });

  // Pure logic simulation of discover_matching_donors parameter validation
  function validateDiscoveryParameters(
    callerId: string | null,
    callerRole: string,
    request: { createdBy: string | null; status: string },
    maxDistanceKm: number
  ): { valid: boolean; reason?: string } {
    if (!callerId) return { valid: false, reason: 'Authentication required' };
    if (maxDistanceKm <= 0 || maxDistanceKm > 500) return { valid: false, reason: 'Invalid distance clamp' };
    if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(request.status)) return { valid: false, reason: 'Terminal request' };

    if (request.createdBy !== null) {
      if (request.createdBy !== callerId && !['coordinator', 'admin', 'blood_centre'].includes(callerRole)) {
        return { valid: false, reason: 'Unauthorized creator mismatch' };
      }
    } else {
      if (!['coordinator', 'admin', 'blood_centre'].includes(callerRole)) {
        return { valid: false, reason: 'Guest request restricted to staff' };
      }
    }

    return { valid: true };
  }

  it('enforces discovery guardrails for distance, status, and guest request authorization', () => {
    const activeReq = { createdBy: 'patient-1', status: 'AWAITING_RESPONSE' };
    const guestReq = { createdBy: null, status: 'AWAITING_RESPONSE' };
    const fulfilledReq = { createdBy: 'patient-1', status: 'FULFILLED' };

    // Unauthenticated caller -> rejected
    expect(validateDiscoveryParameters(null, 'patient', activeReq, 25).valid).toBe(false);

    // Negative distance -> rejected
    expect(validateDiscoveryParameters('patient-1', 'patient', activeReq, -5).valid).toBe(false);

    // Distance > 500 -> rejected
    expect(validateDiscoveryParameters('patient-1', 'patient', activeReq, 1000).valid).toBe(false);

    // Fulfilled request -> rejected
    expect(validateDiscoveryParameters('patient-1', 'patient', fulfilledReq, 25).valid).toBe(false);

    // Guest request queried by random patient -> rejected
    expect(validateDiscoveryParameters('patient-2', 'patient', guestReq, 25).valid).toBe(false);

    // Guest request queried by coordinator -> allowed
    expect(validateDiscoveryParameters('coord-1', 'coordinator', guestReq, 25).valid).toBe(true);

    // Creator querying own active request -> allowed
    expect(validateDiscoveryParameters('patient-1', 'patient', activeReq, 25).valid).toBe(true);
  });
});

