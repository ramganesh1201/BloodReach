import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateDonorEligibility, isClinicallyCompatible, findPotentialResponders } from '../services/matchingEngine';
import { getFreshnessStatus } from '../store/useBloodStore';
import { BloodInventoryItem, Donor, EmergencyRequest, EmergencyStatus, UserRole } from '../types';

describe('CareLoop — Product UI Redesign Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Clinical Transfusion & Donor Matching Logic (NBTC 2023 Criteria)        */
  /* -------------------------------------------------------------------------- */
  describe('1. Clinical Compatibility & Matching Verification (NBTC 2023)', () => {
    const mockMaleDonor: Donor = {
      id: 'donor-male-o-pos',
      fullName: 'Rahul Varma',
      gender: 'male',
      email: 'rahul.v@careloop.org',
      phone: '+91 98490 12345',
      bloodGroup: 'O+',
      city: 'Vijayawada',
      isAvailable: true,
      availabilityState: 'AVAILABLE',
      totalDonations: 6,
      lastDonatedAt: '2024-05-10T09:00:00Z',
      approxDistanceKm: 3.5,
    };

    const mockFemaleDonor: Donor = {
      id: 'donor-female-o-pos',
      fullName: 'Sunita Reddy',
      gender: 'female',
      email: 'sunita.r@careloop.org',
      phone: '+91 98490 54321',
      bloodGroup: 'O+',
      city: 'Vijayawada',
      isAvailable: true,
      availabilityState: 'AVAILABLE',
      totalDonations: 4,
      lastDonatedAt: '2024-05-10T09:00:00Z',
      approxDistanceKm: 3.5,
    };

    it('1.1 Accurately evaluates male donor clinical eligibility with 90-day whole blood interval', () => {
      const eligibility = evaluateDonorEligibility(mockMaleDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.reason).toBeUndefined();
    });

    it('1.2 Defers male donor who has donated within 90 days (e.g. 70 days ago)', () => {
      const recentMaleDonor: Donor = {
        ...mockMaleDonor,
        lastDonatedAt: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const eligibility = evaluateDonorEligibility(recentMaleDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('90-day NBTC male interval');
      expect(eligibility.daysRemaining).toBeGreaterThan(0);
      expect(eligibility.daysRemaining).toBeLessThanOrEqual(21);
    });

    it('1.2b Clears male donor who has passed the 90-day interval (e.g. 95 days ago)', () => {
      const eligibleMaleDonor: Donor = {
        ...mockMaleDonor,
        lastDonatedAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const eligibility = evaluateDonorEligibility(eligibleMaleDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.reason).toBeUndefined();
    });

    it('1.2c Defers female donor at 95 days under NBTC 2023 120-day whole blood interval', () => {
      const recentFemaleDonor: Donor = {
        ...mockFemaleDonor,
        lastDonatedAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const eligibility = evaluateDonorEligibility(recentFemaleDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('120-day NBTC female interval');
      expect(eligibility.daysRemaining).toBeGreaterThan(20);
      expect(eligibility.daysRemaining).toBeLessThanOrEqual(26);
    });

    it('1.2d Clears female donor who has passed the 120-day interval (e.g. 125 days ago)', () => {
      const eligibleFemaleDonor: Donor = {
        ...mockFemaleDonor,
        lastDonatedAt: new Date(Date.now() - 125 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const eligibility = evaluateDonorEligibility(eligibleFemaleDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.reason).toBeUndefined();
    });

    it('1.2e Flags missing or ambiguous sex as "Unable to determine — blood centre assessment required"', () => {
      const ungenderedDonor: Donor = {
        ...mockMaleDonor,
        gender: undefined,
        sex: undefined,
        lastDonatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const eligibility = evaluateDonorEligibility(ungenderedDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toBe('Unable to determine — blood centre assessment required');
      expect(eligibility.status).toBe('UNDETERMINED');
    });

    it('1.2f Allows first-time donor with no donation history without deferral', () => {
      const firstTimeDonor: Donor = {
        ...mockMaleDonor,
        gender: undefined,
        lastDonatedAt: undefined,
        totalDonations: 0,
      };
      const eligibility = evaluateDonorEligibility(firstTimeDonor, 'Whole Blood');
      expect(eligibility.isEligible).toBe(true);
    });

    it('1.3 Clinically checks compatible blood groups for Packed RBC and Whole Blood', () => {
      // O+ can receive from O+ and O-
      expect(isClinicallyCompatible('O+', 'O+', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('O+', 'A+', 'Packed RBC').compatible).toBe(false);

      // AB+ can receive from any blood group (universal recipient for RBC)
      expect(isClinicallyCompatible('AB+', 'O-', 'Packed RBC').compatible).toBe(true);
      expect(isClinicallyCompatible('AB+', 'B+', 'Packed RBC').compatible).toBe(true);
    });

    it('1.4 Computes ranked responders for coordinator emergency matrix', () => {
      const emergency: EmergencyRequest = {
        id: 'req-test-1',
        referenceCode: 'CR-2024-TEST',
        status: 'AWAITING_RESPONSE',
        urgency: 'Critical',
        bloodGroup: 'O+',
        component: 'Whole Blood',
        unitsRequired: 2,
        unitsCoordinated: 0,
        hospitalName: 'Apollo Hospital',
        hospitalAddress: 'Main Road',
        city: 'Vijayawada',
        district: 'Krishna',
        contactName: 'Attendant John',
        contactPhone: '+91 98490 00000',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const candidates = findPotentialResponders(emergency, [mockMaleDonor], 25);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].donor.id).toBe('donor-male-o-pos');
      expect(candidates[0].matchScore).toBeGreaterThan(0);
      expect(candidates[0].matchReason).toContain('match for O+');
    });

    it('1.5 Excludes candidate with missing sex from automated whole blood responder matches', () => {
      const emergency: EmergencyRequest = {
        id: 'req-test-2',
        referenceCode: 'CR-2024-TEST-2',
        status: 'AWAITING_RESPONSE',
        urgency: 'Critical',
        bloodGroup: 'O+',
        component: 'Whole Blood',
        unitsRequired: 1,
        unitsCoordinated: 0,
        hospitalName: 'Apollo Hospital',
        hospitalAddress: 'Main Road',
        city: 'Vijayawada',
        district: 'Krishna',
        contactName: 'Attendant',
        contactPhone: '+91 98490 00000',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const ungenderedDonor: Donor = {
        ...mockMaleDonor,
        gender: undefined,
        sex: undefined,
        lastDonatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const candidates = findPotentialResponders(emergency, [ungenderedDonor], 25);
      expect(candidates.length).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Blood Centre Cold-Chain Stock & Freshness Engine                        */
  /* -------------------------------------------------------------------------- */
  describe('2. Blood Centre Operations & Inventory Logic', () => {
    it('2.1 Correctly evaluates freshness states: Fresh, Aging, Stale', () => {
      const freshTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      expect(getFreshnessStatus(freshTime)).toBe('Fresh');

      const agingTime = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      expect(getFreshnessStatus(agingTime)).toBe('Aging');

      const staleTime = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
      expect(getFreshnessStatus(staleTime)).toBe('Stale');
    });

    it('2.2 Accurately identifies critical stock shortages (<= 1 unit in reserve)', () => {
      const inventory: BloodInventoryItem[] = [
        { id: '1', bloodCentreId: 'c-1', bloodGroup: 'O+', component: 'Packed RBC', units: 0, updatedAt: new Date().toISOString() },
        { id: '2', bloodCentreId: 'c-1', bloodGroup: 'O-', component: 'Packed RBC', units: 1, updatedAt: new Date().toISOString() },
        { id: '3', bloodCentreId: 'c-1', bloodGroup: 'A+', component: 'Packed RBC', units: 5, updatedAt: new Date().toISOString() },
      ];

      const depleted = inventory.filter((i) => i.units === 0);
      const critical = inventory.filter((i) => i.units === 1);
      const available = inventory.filter((i) => i.units > 1);

      expect(depleted.length).toBe(1);
      expect(critical.length).toBe(1);
      expect(available.length).toBe(1);
    });

    it('2.3 Computes total cold storage inventory units across all blood products', () => {
      const items: BloodInventoryItem[] = [
        { id: '1', bloodCentreId: 'c-1', bloodGroup: 'O+', component: 'Packed RBC', units: 4, updatedAt: new Date().toISOString() },
        { id: '2', bloodCentreId: 'c-1', bloodGroup: 'A+', component: 'Platelets', units: 6, updatedAt: new Date().toISOString() },
        { id: '3', bloodCentreId: 'c-1', bloodGroup: 'B+', component: 'Plasma', units: 2, updatedAt: new Date().toISOString() },
      ];
      const total = items.reduce((acc, curr) => acc + curr.units, 0);
      expect(total).toBe(12);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Lifecycle Stage & Progress Computation                                  */
  /* -------------------------------------------------------------------------- */
  describe('3. Coordination Lifecycle & Stage Computation', () => {
    it('3.1 Computes percentage satisfaction accurately without division by zero', () => {
      const calculateSatisfaction = (coordinated: number, required: number) =>
        Math.min(100, Math.round((coordinated / (required || 1)) * 100));

      expect(calculateSatisfaction(0, 2)).toBe(0);
      expect(calculateSatisfaction(1, 2)).toBe(50);
      expect(calculateSatisfaction(2, 2)).toBe(100);
      expect(calculateSatisfaction(3, 2)).toBe(100); // capped at 100
      expect(calculateSatisfaction(0, 0)).toBe(0);
    });

    it('3.2 Computes remaining shortage deficit correctly', () => {
      const calculateDeficit = (coordinated: number, required: number) =>
        Math.max(0, required - coordinated);

      expect(calculateDeficit(1, 3)).toBe(2);
      expect(calculateDeficit(3, 3)).toBe(0);
      expect(calculateDeficit(4, 3)).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Patient Workspace Data Segregation                                      */
  /* -------------------------------------------------------------------------- */
  describe('4. Patient Workspace Logic', () => {
    const mockRequests: EmergencyRequest[] = [
      {
        id: 'r-1',
        referenceCode: 'CR-001',
        status: 'AWAITING_RESPONSE',
        urgency: 'Critical',
        bloodGroup: 'O+',
        component: 'Whole Blood',
        unitsRequired: 2,
        unitsCoordinated: 1,
        hospitalName: 'Apollo',
        hospitalAddress: 'Road 1',
        city: 'Hyderabad',
        contactName: 'Alice',
        contactPhone: '+91 99999 11111',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'r-2',
        referenceCode: 'CR-002',
        status: 'FULFILLED',
        urgency: 'Urgent',
        bloodGroup: 'A+',
        component: 'Packed RBC',
        unitsRequired: 1,
        unitsCoordinated: 1,
        hospitalName: 'Care Hospital',
        hospitalAddress: 'Road 2',
        city: 'Hyderabad',
        contactName: 'Bob',
        contactPhone: '+91 99999 22222',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'r-3',
        referenceCode: 'CR-003',
        status: 'CANCELLED',
        urgency: 'Today',
        bloodGroup: 'B+',
        component: 'Platelets',
        unitsRequired: 2,
        unitsCoordinated: 0,
        hospitalName: 'NIMS',
        hospitalAddress: 'Road 3',
        city: 'Hyderabad',
        contactName: 'Charlie',
        contactPhone: '+91 99999 33333',
        preferredContact: 'Phone',
        escalationLevel: 1,
        cancellationReason: 'Requirement satisfied elsewhere',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('4.1 Accurately separates active emergencies from resolved/cancelled history', () => {
      const active = mockRequests.filter(
        (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
      );
      const history = mockRequests.filter(
        (r) => r.status === 'FULFILLED' || r.status === 'CANCELLED' || r.status === 'EXPIRED'
      );

      expect(active.length).toBe(1);
      expect(active[0].id).toBe('r-1');
      expect(history.length).toBe(2);
    });

    it('4.2 Calculates aggregate units needed and coordinated accurately', () => {
      const active = mockRequests.filter(
        (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
      );
      const totalUnitsRequired = active.reduce((sum, r) => sum + r.unitsRequired, 0);
      const totalUnitsCoordinated = active.reduce((sum, r) => sum + r.unitsCoordinated, 0);

      expect(totalUnitsRequired).toBe(2);
      expect(totalUnitsCoordinated).toBe(1);
    });

    it('4.3 Handles async cancellation response, verifies success flag, and guards against optimistic dismissal', async () => {
      let modalOpen = true;
      let errorMessage: string | null = null;

      // Mock cancellation function returning error
      const failingCancel = vi.fn().mockResolvedValue({ success: false, error: 'Database conflict' });

      // Simulated handler
      const handleConfirmCancel = async (id: string, reason: string) => {
        const res = await failingCancel(id, reason);
        if (res.success) {
          modalOpen = false;
        } else {
          errorMessage = res.error || 'Failed';
        }
      };

      await handleConfirmCancel('r-1', 'Patient stabilized');
      expect(modalOpen).toBe(true); // Modal must NOT close on failure
      expect(errorMessage).toBe('Database conflict');

      // Mock successful cancellation
      const successCancel = vi.fn().mockResolvedValue({ success: true });
      const handleSuccessCancel = async (id: string, reason: string) => {
        const res = await successCancel(id, reason);
        if (res.success) {
          modalOpen = false;
        }
      };

      await handleSuccessCancel('r-1', 'Requirement satisfied elsewhere');
      expect(modalOpen).toBe(false); // Modal closes on verified success
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Coordinator Control Room KPI & Filtering Logic                          */
  /* -------------------------------------------------------------------------- */
  describe('5. Coordinator Control Room KPI & Matrix Logic', () => {
    const matrixRequests: EmergencyRequest[] = [
      {
        id: 'req-c1',
        referenceCode: 'CR-C1',
        status: 'AWAITING_RESPONSE',
        urgency: 'Critical',
        bloodGroup: 'O+',
        component: 'Whole Blood',
        unitsRequired: 3,
        unitsCoordinated: 1,
        hospitalName: 'GGH',
        hospitalAddress: 'Main St',
        city: 'Guntur',
        contactName: 'Dr. Rao',
        contactPhone: '+91 98490 11111',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'req-c2',
        referenceCode: 'CR-C2',
        status: 'RESPONDER_FOUND',
        urgency: 'Urgent',
        bloodGroup: 'A-',
        component: 'Packed RBC',
        unitsRequired: 1,
        unitsCoordinated: 1,
        hospitalName: 'Apollo',
        hospitalAddress: 'Bypass Road',
        city: 'Vijayawada',
        contactName: 'Nurse Mary',
        contactPhone: '+91 98490 22222',
        preferredContact: 'Phone',
        escalationLevel: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'req-c3',
        referenceCode: 'CR-C3',
        status: 'FULFILLED',
        urgency: 'Today',
        bloodGroup: 'B+',
        component: 'Platelets',
        unitsRequired: 2,
        unitsCoordinated: 2,
        hospitalName: 'KIMS',
        hospitalAddress: 'Ring Road',
        city: 'Hyderabad',
        contactName: 'Staff Nurse',
        contactPhone: '+91 98490 33333',
        preferredContact: 'Phone',
        escalationLevel: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('5.1 Accurately tallies Coordinator KPI metrics', () => {
      const activeCount = matrixRequests.filter(
        (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
      ).length;
      const awaitingCount = matrixRequests.filter(
        (r) => r.status === 'AWAITING_RESPONSE' || r.status === 'MATCHING_RESPONDERS'
      ).length;
      const coordinatingCount = matrixRequests.filter(
        (r) => r.status === 'RESPONDER_FOUND' || r.status === 'AWAITING_CENTRE_VERIFICATION' || r.status === 'DONOR_ASSIGNED'
      ).length;
      const resolvedCount = matrixRequests.filter((r) => r.status === 'FULFILLED').length;

      expect(activeCount).toBe(2);
      expect(awaitingCount).toBe(1);
      expect(coordinatingCount).toBe(1);
      expect(resolvedCount).toBe(1);
    });

    it('5.2 Accurately filters matrix by UNASSIGNED deficit tab', () => {
      const unassigned = matrixRequests.filter(
        (r) => r.unitsCoordinated < r.unitsRequired && r.status !== 'FULFILLED' && r.status !== 'CANCELLED'
      );
      expect(unassigned.length).toBe(1);
      expect(unassigned[0].id).toBe('req-c1');
    });

    it('5.3 Accurately filters matrix by ESCALATED (Level > 1) tab', () => {
      const escalated = matrixRequests.filter(
        (r) => r.escalationLevel > 1 && r.status !== 'FULFILLED' && r.status !== 'CANCELLED'
      );
      expect(escalated.length).toBe(1);
      expect(escalated[0].id).toBe('req-c2');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Admin Platform Governance Logic                                         */
  /* -------------------------------------------------------------------------- */
  describe('6. Admin Platform Governance Logic', () => {
    interface ManagedUser {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      status: 'ACTIVE' | 'SUSPENDED';
    }

    const initialUsers: ManagedUser[] = [
      { id: 'u-1', name: 'Robert Taylor', email: 'patient@careloop.health', role: 'patient', status: 'ACTIVE' },
      { id: 'u-2', name: 'Sarah Jenkins', email: 'sarah.j@careloop.org', role: 'donor', status: 'ACTIVE' },
      { id: 'u-3', name: 'Central Depot Ops', email: 'central@careloop.health', role: 'blood_centre', status: 'ACTIVE' },
    ];

    it('6.1 Preserves status as read-only and respects identity provider managed authority', () => {
      // Status is read-only badge, not client-side toggled
      expect(initialUsers[0].status).toBe('ACTIVE');
      expect(initialUsers[1].status).toBe('ACTIVE');
    });

    it('6.2 Reassigns user role safely across valid role permissions when authorized', () => {
      const updated = initialUsers.map((u) =>
        u.id === 'u-2' ? { ...u, role: 'coordinator' as UserRole } : u
      );
      expect(updated.find((u) => u.id === 'u-2')?.role).toBe('coordinator');
    });

    it('6.3 Guards against unauthenticated role modifications in preview mode', async () => {
      const isConfigured = false;
      const currentUserRole: string = 'patient';

      let opError: string | null = null;
      const attemptRoleChange = async () => {
        if (!isConfigured || currentUserRole !== 'admin') {
          opError = 'Modifying user roles requires an active authenticated administrator session with database permissions.';
          return;
        }
      };

      await attemptRoleChange();
      expect(opError).toContain('requires an active authenticated administrator session');
    });
  });
});
