import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hospitalService } from '../services/hospitalService';
import { adminService } from '../services/adminService';
import { HospitalRegistrationInput } from '../types/hospital';

describe('CareLoop — Hospital Operations & Admin Governance Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Hospital Registration & Validation                                      */
  /* -------------------------------------------------------------------------- */
  describe('1. Hospital Registration & Validation', () => {
    it('1.1 Rejects registration when mandatory fields are missing', async () => {
      const invalidInput: any = {
        name: '',
        registrationNumber: '',
        city: '',
      };

      const res = await hospitalService.submitHospitalRegistration(invalidInput);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Hospital name is required');
    });

    it('1.2 Rejects registration when valid telephone is missing', async () => {
      const invalidPhoneInput: any = {
        name: 'City Specialty Hospital',
        registrationNumber: 'MED-1234',
        city: 'Hyderabad',
        contactPhone: '123', // Too short
        emergencyPhone: '',
      };

      const res = await hospitalService.submitHospitalRegistration(invalidPhoneInput);
      expect(res.success).toBe(false);
      expect(res.error).toContain('contact phone number is required');
    });

    it('1.3 Successfully submits valid hospital registration with initial SUBMITTED state', async () => {
      const validInput: HospitalRegistrationInput = {
        name: 'CareLife Super Specialty Hospital',
        registrationNumber: 'CEA/TS/HYD/2026/0411',
        facilityType: 'super_speciality',
        ownershipType: 'Private / Corporate',
        establishedYear: 2012,
        state: 'Telangana',
        district: 'Hyderabad',
        city: 'Hyderabad',
        address: 'Banjara Hills, Road No 10',
        postalCode: '500034',
        contactName: 'Dr. Radhika Sharma',
        contactDesignation: 'Chief Medical Superintendent',
        contactEmail: 'transfusion@carelife.org',
        contactPhone: '+91 40 2345 1122',
        emergencyPhone: '+91 40 2345 0108',
        hasBloodBank: true,
        bloodBankLicenseNumber: 'BB-TS-2022-0988',
        storageCapacityUnits: 400,
        componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
        operatingHours: '24/7 Emergency Operation',
        isEmergencyAvailable: true,
        registrationCertificateUrl: 'DOC-REG-2026-991',
        bloodBankLicenseUrl: 'DOC-BB-2026-881',
      };

      const res = await hospitalService.submitHospitalRegistration(validInput, 'user-admin-123');
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.id).toMatch(/^hosp-/);
      expect(res.data?.approvalStatus).toBe('SUBMITTED');
      expect(res.data?.isVerified).toBe(false);
      expect(res.data?.authorizedUserIds).toContain('user-admin-123');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Hospital Administrative Review Workflow                                */
  /* -------------------------------------------------------------------------- */
  describe('2. Hospital Administrative Review Workflow', () => {
    it('2.1 Admin can approve a submitted hospital and activate verified state', async () => {
      const hospitalList = await hospitalService.getHospitals();
      const targetHospital = hospitalList.data[0];

      const reviewRes = await hospitalService.reviewHospitalApplication(
        targetHospital.id,
        'APPROVE',
        'All clinical documents verified against state registry',
        'admin-user-id'
      );

      expect(reviewRes.success).toBe(true);
      expect(reviewRes.hospital?.approvalStatus).toBe('APPROVED');
      expect(reviewRes.hospital?.isVerified).toBe(true);
      expect(reviewRes.hospital?.reviewedBy).toBe('admin-user-id');
      expect(reviewRes.hospital?.verifiedAt).toBeDefined();
    });

    it('2.2 Admin can request corrections with notes', async () => {
      const hospitalList = await hospitalService.getHospitals();
      const targetHospital = hospitalList.data[1];

      const reviewRes = await hospitalService.reviewHospitalApplication(
        targetHospital.id,
        'REQUEST_CORRECTIONS',
        'Please re-upload blood bank license renewal certificate',
        'admin-user-id'
      );

      expect(reviewRes.success).toBe(true);
      expect(reviewRes.hospital?.approvalStatus).toBe('NEEDS_CORRECTION');
      expect(reviewRes.hospital?.correctionNotes).toContain('blood bank license renewal');
    });

    it('2.3 Admin can reject invalid hospital with documented justification', async () => {
      const hospitalList = await hospitalService.getHospitals();
      const targetHospital = hospitalList.data[2];

      const reviewRes = await hospitalService.reviewHospitalApplication(
        targetHospital.id,
        'REJECT',
        'Clinical license expired and not recognized by state medical registry',
        'admin-user-id'
      );

      expect(reviewRes.success).toBe(true);
      expect(reviewRes.hospital?.approvalStatus).toBe('REJECTED');
      expect(reviewRes.hospital?.isVerified).toBe(false);
      expect(reviewRes.hospital?.rejectionReason).toContain('expired and not recognized');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Hospital Cold-Chain Inventory & Audit Transactions                      */
  /* -------------------------------------------------------------------------- */
  describe('3. Hospital Cold-Chain Inventory & Audit Transactions', () => {
    it('3.1 Successfully records inventory intake and updates available balance', () => {
      const hospitalId = 'hosp-nims-hyd';
      const initialInv = hospitalService.getHospitalInventory(hospitalId);
      const oPosInitial = initialInv.find((i) => i.bloodGroup === 'O+' && i.component === 'Packed RBC');
      const initialUnits = oPosInitial ? oPosInitial.availableUnits : 0;

      const intakeRes = hospitalService.updateHospitalInventory(hospitalId, {
        bloodGroup: 'O+',
        component: 'Packed RBC',
        unitsDelta: 5,
        actionType: 'INTAKE',
        performedBy: 'Senior Phlebotomist Kavitha',
        notes: 'Routine Central Depot Delivery',
      });

      expect(intakeRes.success).toBe(true);
      expect(intakeRes.data?.availableUnits).toBe(initialUnits + 5);

      // Verify transaction logged in audit stream
      const txs = hospitalService.getHospitalTransactions(hospitalId);
      expect(txs.length).toBeGreaterThan(0);
      expect(txs[0].transactionType).toBe('INTAKE');
      expect(txs[0].units).toBe(5);
      expect(txs[0].performedBy).toBe('Senior Phlebotomist Kavitha');
    });

    it('3.2 Successfully records emergency patient transfusion and decrements balance', () => {
      const hospitalId = 'hosp-apollo-hyd';
      const initialInv = hospitalService.getHospitalInventory(hospitalId);
      const aPosInitial = initialInv.find((i) => i.bloodGroup === 'A+' && i.component === 'Packed RBC');
      const initialUnits = aPosInitial ? aPosInitial.availableUnits : 10;

      const txRes = hospitalService.updateHospitalInventory(hospitalId, {
        bloodGroup: 'A+',
        component: 'Packed RBC',
        unitsDelta: -3,
        actionType: 'TRANSFUSION',
        performedBy: 'Dr. Michael Chen',
        referenceCode: 'CL-8F42',
        notes: 'Emergency ICU Surgical Transfusion',
      });

      expect(txRes.success).toBe(true);
      expect(txRes.data?.availableUnits).toBe(Math.max(0, initialUnits - 3));

      // Verify transaction logged
      const txs = hospitalService.getHospitalTransactions(hospitalId);
      expect(txs[0].transactionType).toBe('TRANSFUSION');
      expect(txs[0].referenceCode).toBe('CL-8F42');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Platform Administration & System Thresholds                             */
  /* -------------------------------------------------------------------------- */
  describe('4. Platform Administration & System Thresholds', () => {
    it('4.1 Retrieves user matrix with accurate role assignments', async () => {
      const res = await adminService.getUsers();
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);

      const roles = res.data.map((u) => u.role);
      expect(roles).toContain('patient');
      expect(roles).toContain('donor');
      expect(roles).toContain('admin');
    });

    it('4.2 Updates configurable clinical system thresholds', () => {
      const initial = adminService.getSettings();
      expect(initial.criticalStockThreshold).toBeDefined();

      const updated = adminService.updateSettings({
        criticalStockThreshold: 8,
        emergencyBroadcastRadiusKm: 50,
      });

      expect(updated.criticalStockThreshold).toBe(8);
      expect(updated.emergencyBroadcastRadiusKm).toBe(50);

      const reFetched = adminService.getSettings();
      expect(reFetched.criticalStockThreshold).toBe(8);
      expect(reFetched.emergencyBroadcastRadiusKm).toBe(50);
    });
  });
});

