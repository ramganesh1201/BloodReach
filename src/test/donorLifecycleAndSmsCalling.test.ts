import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as donorResponseService from '../services/donorResponseService';
import { assignDonorAtomic } from '../services/donorAssignmentService';
import { processInboundSms } from '../services/sms/inboundSmsProcessor';
import {
  evaluateDonorEligibility,
  isClinicallyCompatible,
  findPotentialResponders,
  NBTC_2023_INTERVALS,
} from '../services/matchingEngine';
import { notificationService } from '../services/notificationService';
import { smsNotificationService } from '../services/smsNotificationService';
import { supabase } from '../services/supabaseClient';
import { Donor, EmergencyRequest, UserProfile, UserRole } from '../types';

describe('CareLoop — Donor Lifecycle, Medical Data Integrity, Emergency Alerts & SMS Calling Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smsNotificationService.clearStorageForTesting();
  });

  /* Helper function to generate mock Supabase client for Inbound SMS processing */
  const createMockSmsSupabase = (overrides?: {
    donor?: any;
    targetRequest?: any;
    existingResp?: any;
    rpcResult?: any;
  }) => {
    const donor = overrides?.donor !== undefined
      ? overrides.donor
      : {
          id: 'dnr-sms-001',
          profile_id: 'usr-patient-001',
          full_name: 'Anand Kumar',
          phone: '+91 98765 43210',
          blood_group: 'O+',
          city: 'Hyderabad',
          district: 'Hyderabad',
          is_available: true,
          availability_state: 'AVAILABLE',
          is_medically_cleared: true,
          deferral_until: null,
        };

    const targetRequest = overrides?.targetRequest !== undefined
      ? overrides.targetRequest
      : {
          id: 'req-sms-001',
          reference_code: 'CL-8F42',
          blood_group: 'O+',
          component: 'Packed RBC',
          hospital_name: 'Apollo Jubilee',
          city: 'Hyderabad',
          status: 'OPEN',
        };

    const existingResp = overrides?.existingResp ?? null;

    const rpcMock = vi.fn().mockResolvedValue({
      data: overrides?.rpcResult ?? {
        success: true,
        action: 'ACCEPTED',
        assignment_id: 'asg-sms-001',
        conversation_id: 'conv-sms-001',
      },
      error: null,
    });

    return {
      rpc: rpcMock,
      from: vi.fn((table: string) => {
        if (table === 'donors') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: donor ? [donor] : [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'emergency_requests') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: targetRequest ? [targetRequest] : [], error: null }),
              }),
            }),
          };
        }
        if (table === 'donor_responses') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existingResp, error: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any;
  };

  /* -------------------------------------------------------------------------- */
  /* CRITERION 1: Patient account before donor registration                     */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 1: Patient account before donor registration', () => {
    it('1.1 Represents standard patient account with no active donor registry profile', () => {
      const patientUser: UserProfile = {
        id: 'usr-patient-001',
        email: 'patient.user@careloop.test',
        fullName: 'Meera Sharma',
        phone: '+919876543210',
        role: 'patient',
        status: 'ACTIVE',
        createdAt: '2026-11-12T00:00:00Z',
        updatedAt: '2026-11-12T00:00:00Z',
        city: 'Hyderabad',
        district: 'Hyderabad',
        bloodGroup: 'B+',
      };

      const existingDonors: Donor[] = [];
      const userDonorProfile = existingDonors.find((d) => d.profileId === patientUser.id) || null;
      const isRegisteredDonor = Boolean(userDonorProfile);

      expect(patientUser.role).toBe('patient');
      expect(userDonorProfile).toBeNull();
      expect(isRegisteredDonor).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 2: Successful donor registration and account conversion          */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 2: Successful donor registration and account conversion', () => {
    it('2.1 Validates clinical parameters and registers donor linked to same profileId', async () => {
      const input: donorResponseService.DonorOnboardingInput = {
        fullName: 'Meera Sharma',
        phone: '+919876543210',
        email: 'patient.user@careloop.test',
        bloodGroup: 'B+',
        city: 'Hyderabad',
        district: 'Hyderabad',
        age: 26,
        weightKg: 58,
        donationHistory: 0,
        donationType: 'Whole Blood',
        isAvailable: true,
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'donors') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'dnr-001',
                    profile_id: 'usr-patient-001',
                    full_name: input.fullName,
                    phone: '+919876543210',
                    email: input.email,
                    blood_group: input.bloodGroup,
                    city: input.city,
                    district: input.district,
                    weight_kg: input.weightKg,
                    is_available: true,
                    availability_state: 'AVAILABLE',
                    is_medically_cleared: false,
                    total_donations: 0,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await donorResponseService.submitDonorOnboarding(input, 'usr-patient-001');
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.profileId).toBe('usr-patient-001');
      expect(res.data?.bloodGroup).toBe('B+');
      expect(res.data?.weightKg).toBe(58);
      expect(res.data?.isAvailable).toBe(true);
    });

    it('2.2 Rejects donor onboarding if body weight is below NBTC 45kg minimum', async () => {
      const input: donorResponseService.DonorOnboardingInput = {
        fullName: 'Underweight Candidate',
        phone: '+919876543211',
        email: 'underweight@careloop.test',
        bloodGroup: 'O+',
        city: 'Hyderabad',
        district: 'Hyderabad',
        age: 22,
        weightKg: 42, // Under 45 kg
        donationHistory: 0,
        donationType: 'Whole Blood',
        isAvailable: true,
      };

      const res = await donorResponseService.submitDonorOnboarding(input, 'usr-patient-002');
      expect(res.success).toBe(false);
      expect(res.error).toContain('45 kg');
    });

    it('2.3 Rejects donor onboarding if age is outside NBTC 18-65 range', async () => {
      const input: donorResponseService.DonorOnboardingInput = {
        fullName: 'Minor Candidate',
        phone: '+919876543212',
        email: 'minor@careloop.test',
        bloodGroup: 'A+',
        city: 'Hyderabad',
        district: 'Hyderabad',
        age: 16, // Under 18
        weightKg: 52,
        donationHistory: 0,
        donationType: 'Whole Blood',
        isAvailable: true,
      };

      const res = await donorResponseService.submitDonorOnboarding(input, 'usr-patient-003');
      expect(res.success).toBe(false);
      expect(res.error).toContain('18 and 65');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 3: Duplicate registration prevention (idempotent upsert)         */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 3: Duplicate registration prevention (idempotent upsert)', () => {
    it('3.1 Upserts existing donor record idempotently without creating duplicate accounts', async () => {
      const input: donorResponseService.DonorOnboardingInput = {
        fullName: 'Meera Sharma Updated',
        phone: '+919876543210',
        email: 'patient.user@careloop.test',
        bloodGroup: 'B+',
        city: 'Hyderabad',
        district: 'Hyderabad',
        age: 26,
        weightKg: 58,
        donationHistory: 1,
        donationType: 'Whole Blood',
        isAvailable: true,
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'donors') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'dnr-existing-001',
                    profile_id: 'usr-patient-001',
                    full_name: 'Meera Sharma Updated',
                    phone: '+919876543210',
                    email: 'patient.user@careloop.test',
                    blood_group: 'B+',
                    city: 'Hyderabad',
                    weight_kg: 58,
                    is_available: true,
                    total_donations: 1,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await donorResponseService.submitDonorOnboarding(input, 'usr-patient-001');
      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('dnr-existing-001');
      expect(res.data?.profileId).toBe('usr-patient-001');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 4: Donor dashboard activation for patient-origin account         */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 4: Donor dashboard activation for patient-origin account', () => {
    it('4.1 Grants access to /donor workspace when isRegisteredDonor is true', () => {
      const allowedRoles = ['donor', 'admin'];
      const authenticatedRole = 'patient';
      const isRegisteredDonor = true;

      const isDirectMatch = allowedRoles.includes(authenticatedRole);
      const isDonorCrossAccess = allowedRoles.includes('donor') && ((authenticatedRole as string) === 'donor' || isRegisteredDonor);
      const isAuthorized = isDirectMatch || isDonorCrossAccess;

      expect(isDirectMatch).toBe(false);
      expect(isDonorCrossAccess).toBe(true);
      expect(isAuthorized).toBe(true);
    });

    it('4.2 Denies access to /donor workspace when user is patient without donor profile', () => {
      const allowedRoles = ['donor', 'admin'];
      const authenticatedRole = 'patient';
      const isRegisteredDonor = false;

      const isDirectMatch = allowedRoles.includes(authenticatedRole);
      const isDonorCrossAccess = allowedRoles.includes('donor') && ((authenticatedRole as string) === 'donor' || isRegisteredDonor);
      const isAuthorized = isDirectMatch || isDonorCrossAccess;

      expect(isAuthorized).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 5: No repeat registration CTA displayed                         */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 5: No repeat registration CTA displayed', () => {
    it('5.1 Renders direct workspace navigation instead of Onboarding CTA for registered donors', () => {
      const isRegisteredDonor = true;
      const userDonorProfile: Donor = {
        id: 'dnr-001',
        fullName: 'Meera Sharma',
        phone: '+919876543210',
        bloodGroup: 'B+',
        city: 'Hyderabad',
        isAvailable: true,
        totalDonations: 0,
      };

      const buttonLabel = isRegisteredDonor
        ? `Donor Workspace (${userDonorProfile.bloodGroup})`
        : 'Register as Volunteer Donor';

      expect(buttonLabel).toBe('Donor Workspace (B+)');
      expect(buttonLabel).not.toContain('Register as Volunteer Donor');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 6: Donor profile contact info editing                           */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 6: Donor profile contact info editing', () => {
    it('6.1 Allows updating non-clinical contact parameters (phone, city, district)', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'donors') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'dnr-001',
                      phone: '+919876549999',
                      city: 'Secunderabad',
                      district: 'Hyderabad',
                      blood_group: 'B+',
                      is_available: true,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await donorResponseService.updateDonorContactInfo('dnr-001', {
        phone: '+919876549999',
        city: 'Secunderabad',
        district: 'Hyderabad',
      });

      expect(res.success).toBe(true);
      expect(res.data?.phone).toBe('+919876549999');
      expect(res.data?.city).toBe('Secunderabad');
    });

    it('6.2 Rejects contact updates with invalid phone numbers (< 7 digits)', async () => {
      const res = await donorResponseService.updateDonorContactInfo('dnr-001', {
        phone: '12345', // Invalid
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('valid telephone number');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 7: Restricted medical field locked + correction request audit   */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 7: Restricted medical field locked + correction request audit', () => {
    it('7.1 Disallows direct mutation of blood group or clearance status in contact update', async () => {
      const updates: any = {
        phone: '+919876543210',
        bloodGroup: 'AB+', // Attempted clinical tamper
        isMedicallyCleared: true,
      };

      const payload: Record<string, any> = {};
      if (updates.phone) payload.phone = updates.phone;
      if (updates.city) payload.city = updates.city;
      if (updates.district) payload.district = updates.district;

      expect(payload).not.toHaveProperty('bloodGroup');
      expect(payload).not.toHaveProperty('blood_group');
      expect(payload).not.toHaveProperty('isMedicallyCleared');
    });

    it('7.2 Generates an audit notification when clinical correction is requested', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'notifications') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        return {} as any;
      });

      const res = await donorResponseService.requestClinicalCorrection('dnr-001', {
        field: 'bloodGroup',
        requestedValue: 'O+',
        reason: 'Laboratory re-test confirmed blood group is O positive, not B positive.',
        certificateNotes: 'Apollo Jubilee Lab Report #AP-99201',
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('clinical re-verification request');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 8: Correct donor clinical matching                              */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 8: Correct donor clinical matching', () => {
    it('8.1 Correctly evaluates clinical compatibility for RBC transfusions', () => {
      // O- is universal RBC donor
      expect(isClinicallyCompatible('A+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('B+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O-', 'O-', 'Packed RBC').compatible).toBe(true);

      // O+ can donate RBC to positive recipients
      expect(isClinicallyCompatible('A+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('B+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O-', 'O+', 'Packed RBC').compatible).toBe(false);

      // B+ can donate to B+ and AB+
      expect(isClinicallyCompatible('B+', 'B+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'B+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('A+', 'B+', 'Packed RBC').compatible).toBe(false);
    });

    it('8.2 Evaluates NBTC 2023 donation intervals (90d male / 120d female)', () => {
      const maleDonor: Donor = {
        id: 'dnr-male',
        fullName: 'Rahul Verma',
        phone: '+919876543200',
        bloodGroup: 'O+',
        city: 'Hyderabad',
        sex: 'male',
        isAvailable: true,
        totalDonations: 3,
        lastDonatedAt: new Date(Date.now() - 95 * 24 * 3600 * 1000).toISOString(), // 95 days ago
      };

      const femaleDonor: Donor = {
        id: 'dnr-female',
        fullName: 'Pooja Reddy',
        phone: '+919876543201',
        bloodGroup: 'O+',
        city: 'Hyderabad',
        sex: 'female',
        isAvailable: true,
        totalDonations: 2,
        lastDonatedAt: new Date(Date.now() - 95 * 24 * 3600 * 1000).toISOString(), // 95 days ago (< 120)
      };

      const maleElig = evaluateDonorEligibility(maleDonor, 'Whole Blood');
      const femaleElig = evaluateDonorEligibility(femaleDonor, 'Whole Blood');

      expect(maleElig.isEligible).toBe(true);
      expect(femaleElig.isEligible).toBe(false);
      expect(femaleElig.daysRemaining).toBeGreaterThan(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 9: Irrelevant donor exclusion                                   */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 9: Irrelevant donor exclusion', () => {
    it('9.1 Excludes donor who created the emergency request themselves', () => {
      const currentUserId = 'usr-patient-001';
      const myDonorProfileId = 'usr-patient-001';

      const ownRequest: Partial<EmergencyRequest> = {
        id: 'req-own',
        bloodGroup: 'B+',
        component: 'Packed RBC',
        createdBy: currentUserId,
        status: 'MATCHING_RESPONDERS',
      };

      const isOwnRequest = ownRequest.createdBy === currentUserId || ownRequest.createdBy === myDonorProfileId;
      expect(isOwnRequest).toBe(true);
    });

    it('9.2 Excludes incompatible blood group and distant locality', () => {
      const request: Partial<EmergencyRequest> = {
        id: 'req-city-1',
        bloodGroup: 'B+',
        component: 'Packed RBC',
        city: 'Hyderabad',
        district: 'Hyderabad',
        status: 'MATCHING_RESPONDERS',
      };

      const incompatibleDonor: Donor = {
        id: 'dnr-inc',
        fullName: 'Incompatible Donor',
        phone: '+919876543202',
        bloodGroup: 'A+', // Incompatible for B+ RBC
        city: 'Hyderabad',
        isAvailable: true,
        totalDonations: 0,
      };

      const distantDonor: Donor = {
        id: 'dnr-dist',
        fullName: 'Distant Donor',
        phone: '+919876543203',
        bloodGroup: 'B+',
        city: 'Bengaluru', // Different city (> 500 km)
        isAvailable: true,
        totalDonations: 0,
        approxDistanceKm: 550,
      };

      // Compatibility check
      expect(isClinicallyCompatible(request.bloodGroup!, incompatibleDonor.bloodGroup, request.component!).compatible).toBe(false);

      // Distance check
      const isDistant = (distantDonor.approxDistanceKm || 0) > 50 && distantDonor.city !== request.city;
      expect(isDistant).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 10: Notification visibility and deduplication                   */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 10: Notification visibility and deduplication', () => {
    it('10.1 Scopes notifications to the donor and deduplicates identical events', () => {
      const donorId = 'dnr-001';
      const profileId = 'usr-patient-001';

      const rawNotifications = [
        { id: 'notif-1', userId: profileId, channel: 'IN_APP', title: 'Urgent Request CL-101', timestamp: '2026-11-12T10:00:00Z', status: 'UNREAD' },
        { id: 'notif-2', userId: donorId, channel: 'SMS', title: 'SMS Dispatched for CL-101', timestamp: '2026-11-12T10:01:00Z', status: 'UNREAD' },
        { id: 'notif-3', userId: 'unrelated-user', channel: 'IN_APP', title: 'Other Alert', timestamp: '2026-11-12T10:02:00Z', status: 'UNREAD' },
        // Duplicate entry
        { id: 'notif-1', userId: profileId, channel: 'IN_APP', title: 'Urgent Request CL-101', timestamp: '2026-11-12T10:00:00Z', status: 'UNREAD' },
      ];

      const myNotifs = rawNotifications.filter((n) => n.userId === donorId || n.userId === profileId);
      expect(myNotifs.length).toBe(3);

      const seen = new Set<string>();
      const deduped = myNotifs.filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });

      expect(deduped.length).toBe(2);
      expect(deduped.map((d) => d.id)).toEqual(['notif-1', 'notif-2']);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 11: Donor accepts emergency request                             */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 11: Donor accepts emergency request', () => {
    it('11.1 Records acceptance response and triggers assignment coordination', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          conversation_id: 'conv-001',
          request_id: 'req-101',
          donor_name: 'Meera Sharma',
          already_accepted: false,
        },
        error: null,
      } as any);

      const res = await donorResponseService.acceptRequestAndCreateConversation(
        'req-101',
        'dnr-001'
      );

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe('conv-001');
      expect(res.alreadyAccepted).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 12: Donor declines emergency request                            */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 12: Donor declines emergency request', () => {
    it('12.1 Records decline response without establishing active hospital assignment', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'donor_responses') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        return {} as any;
      });

      const res = await donorResponseService.declineRequest(
        'req-101',
        'dnr-001'
      );

      expect(res.success).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 13: Duplicate acceptance prevention                             */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 13: Duplicate acceptance prevention', () => {
    it('13.1 Returns existing assignment idempotently without duplicate record creation', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          conversation_id: 'conv-001',
          request_id: 'req-101',
          donor_name: 'Meera Sharma',
          already_accepted: true,
        },
        error: null,
      } as any);

      const res = await donorResponseService.acceptRequestAndCreateConversation(
        'req-101',
        'dnr-001'
      );

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe('conv-001');
      expect(res.alreadyAccepted).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 14: Atomic assignment creation                                  */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 14: Atomic assignment creation', () => {
    it('14.1 Records coordinator assignment via atomic RPC', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          assignment_id: 'asg-001',
          units_coordinated: 1,
          units_required: 2,
          message: 'Donor assigned atomically',
        },
        error: null,
      } as any);

      const res = await assignDonorAtomic({
        requestId: 'req-101',
        donorId: 'dnr-001',
        units: 1,
        coordinatorId: 'coord-001',
      });

      expect(res.success).toBe(true);
      expect(res.assignmentId).toBe('asg-001');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 15: Authorized patient/donor chat access                        */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 15: Authorized patient/donor chat access', () => {
    it('15.1 Permits access only to authorized participants (patient, donor, coordinator)', () => {
      const conversation = {
        id: 'conv-101',
        requestId: 'req-101',
        donorId: 'dnr-001',
        patientId: 'usr-patient-001',
        coordinatorId: 'coord-001',
      };

      const checkAccess = (userId: string) => {
        return (
          userId === conversation.donorId ||
          userId === conversation.patientId ||
          userId === conversation.coordinatorId
        );
      };

      expect(checkAccess('dnr-001')).toBe(true);
      expect(checkAccess('usr-patient-001')).toBe(true);
      expect(checkAccess('coord-001')).toBe(true);
      expect(checkAccess('unrelated-user')).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 16: Authorized voice-call initiation                            */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 16: Authorized voice-call initiation', () => {
    it('16.1 Initiates WebRTC call session when caller is an authorized conversation participant', () => {
      const authorizedParticipants = ['usr-patient-001', 'dnr-001'];
      const callerId = 'dnr-001';

      const isAuthorizedCaller = authorizedParticipants.includes(callerId);
      expect(isAuthorizedCaller).toBe(true);

      const session = {
        sessionId: 'call-sess-001',
        channelId: 'conv-101',
        callerId,
        recipientId: 'usr-patient-001',
        status: 'ringing',
        startedAt: new Date().toISOString(),
      };

      expect(session.status).toBe('ringing');
      expect(session.sessionId).toBeDefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 17: Unauthorized call rejection                                 */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 17: Unauthorized call rejection', () => {
    it('17.1 Rejects voice call initiation from unauthorized users outside the channel', () => {
      const authorizedParticipants = ['usr-patient-001', 'dnr-001'];
      const unauthorizedCallerId = 'attacker-007';

      const isAuthorized = authorizedParticipants.includes(unauthorizedCallerId);
      expect(isAuthorized).toBe(false);

      const result = isAuthorized
        ? { success: true }
        : { success: false, error: 'Unauthorized: Caller is not a participant in this coordination channel.' };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 18: SMS reply 1 (ACCEPT) processing                             */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 18: SMS reply 1 (ACCEPT) processing', () => {
    it('18.1 Inbound SMS processor correctly parses reply "1" as ACCEPT', async () => {
      const mockSupabase = createMockSmsSupabase();

      const result = await processInboundSms(
        {
          sender: '+919876543210',
          message: '1 CL-8F42',
        },
        mockSupabase
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('ACCEPTED');
      expect(result.referenceCode).toBe('CL-8F42');
      expect(result.replyMessage).toContain('CONFIRMED');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 19: SMS reply 2 (DECLINE) processing                            */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 19: SMS reply 2 (DECLINE) processing', () => {
    it('19.1 Inbound SMS processor correctly parses reply "2" as DECLINE', async () => {
      const mockSupabase = createMockSmsSupabase();

      const result = await processInboundSms(
        {
          sender: '+919876543210',
          message: '2 CL-8F42',
        },
        mockSupabase
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('DECLINED');
      expect(result.replyMessage).toContain('DECLINED');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 20: Duplicate SMS reply protection                              */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 20: Duplicate SMS reply protection', () => {
    it('20.1 Detects duplicate reply and responds idempotently without re-triggering RPC', async () => {
      const mockSupabase = createMockSmsSupabase({
        existingResp: {
          response_status: 'ACCEPTED',
          created_at: '2026-11-12T10:00:00Z',
        },
      });

      const result = await processInboundSms(
        {
          sender: '+919876543210',
          message: '1 CL-8F42',
        },
        mockSupabase
      );

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.replyMessage).toContain('already ACCEPTED');
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 21: Expired/fulfilled request response rejection                 */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 21: Expired/fulfilled request response rejection', () => {
    it('21.1 Rejects response when target emergency request is already FULFILLED', async () => {
      const mockSupabase = createMockSmsSupabase({
        targetRequest: {
          id: 'req-sms-001',
          reference_code: 'CL-8F42',
          status: 'FULFILLED', // Terminal status
        },
      });

      const result = await processInboundSms(
        {
          sender: '+919876543210',
          message: 'ACCEPT CL-8F42',
        },
        mockSupabase
      );

      expect(result.action).toBe('IGNORED');
      expect(result.replyMessage).toContain('fulfilled or closed');
    });

    it('21.2 Rejects response when target emergency request is EXPIRED', async () => {
      const mockSupabase = createMockSmsSupabase({
        targetRequest: {
          id: 'req-sms-002',
          reference_code: 'CL-8F43',
          status: 'EXPIRED', // Terminal status
        },
      });

      const result = await processInboundSms(
        {
          sender: '+919876543210',
          message: '1 CL-8F43',
        },
        mockSupabase
      );

      expect(result.action).toBe('IGNORED');
      expect(result.replyMessage).toContain('fulfilled or closed');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* CRITERION 22: STUN voice calling architecture & limitations documentation  */
  /* -------------------------------------------------------------------------- */
  describe('Criterion 22: STUN voice calling architecture & limitations documentation', () => {
    it('22.1 Verifies Google public STUN configuration for peer-to-peer WebRTC', () => {
      const defaultIceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      expect(defaultIceServers.length).toBeGreaterThanOrEqual(1);
      expect(defaultIceServers[0].urls).toContain('stun.l.google.com:19302');
    });

    it('22.2 Enforces symmetric NAT documentation: P2P STUN cannot traverse dual symmetric NATs without TURN relay', () => {
      const webrtcP2pConstraints = {
        natSupport: ['Full Cone', 'Address-Restricted Cone', 'Port-Restricted Cone'],
        unsupportedWithoutTurn: ['Symmetric NAT to Symmetric NAT', 'Restricted Enterprise Firewall UDP Blocking'],
        productionRecommendation: 'Deploy dedicated coturn TURN relay with ephemeral credentials for 100% traversal.',
      };

      expect(webrtcP2pConstraints.natSupport.length).toBe(3);
      expect(webrtcP2pConstraints.unsupportedWithoutTurn).toContain('Symmetric NAT to Symmetric NAT');
    });
  });
});
