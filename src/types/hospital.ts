import { BloodGroup, BloodComponent } from './index';

export type HospitalFacilityType =
  | 'government_hospital'
  | 'private_hospital'
  | 'medical_college'
  | 'trauma_centre'
  | 'super_speciality';

export type HospitalOwnershipType =
  | 'Government / Public'
  | 'Private / Corporate'
  | 'Trust / Charitable'
  | 'Semi-Government';

export type HospitalApprovalStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_CORRECTION';

export interface HospitalRegistrationInput {
  // 1. Basic Information
  name: string;
  registrationNumber: string;
  facilityType: HospitalFacilityType;
  ownershipType: HospitalOwnershipType;
  establishedYear: number;
  website?: string;

  // 2. Address & Location
  state: string;
  district: string;
  city: string;
  address: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;

  // 3. Authorized Contact
  contactName: string;
  contactDesignation: string;
  contactEmail: string;
  contactPhone: string;
  emergencyPhone: string;

  // 4. Blood Bank Facilities
  hasBloodBank: boolean;
  bloodBankLicenseNumber?: string;
  storageCapacityUnits?: number;
  componentsSupported: BloodComponent[];
  operatingHours: string;
  isEmergencyAvailable: boolean;

  // 5. Verification Documents
  registrationCertificateUrl?: string;
  bloodBankLicenseUrl?: string;
  authorizedIdProofUrl?: string;
}

export interface RegisteredHospital extends HospitalRegistrationInput {
  id: string;
  approvalStatus: HospitalApprovalStatus;
  rejectionReason?: string;
  correctionNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  verifiedAt?: string;
  isVerified: boolean;
  authorizedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HospitalStaffMember {
  id: string;
  hospitalId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  role: 'medical_director' | 'transfusion_officer' | 'blood_bank_technician' | 'staff';
  isApproved: boolean;
  joinedAt: string;
}

export interface HospitalInventoryItem {
  id: string;
  hospitalId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  reservedUnits: number;
  availableUnits: number;
  updatedAt: string;
}

export interface HospitalInventoryTransaction {
  id: string;
  hospitalId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  transactionType: 'INTAKE' | 'TRANSFUSION' | 'DISPATCH' | 'EXPIRED' | 'DISCARDED';
  referenceCode?: string;
  performedBy: string;
  notes?: string;
  timestamp: string;
}

