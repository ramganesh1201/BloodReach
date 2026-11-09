/**
 * CareLoop — Hospital Registration & Operations Service
 * 
 * Manages healthcare facility verification, hospital lifecycle states:
 * SUBMITTED -> UNDER_REVIEW -> APPROVED / REJECTED
 * 
 * Provides hospital-scoped inventory, staff authorization, and request coordination.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  RegisteredHospital,
  HospitalRegistrationInput,
  HospitalApprovalStatus,
  HospitalInventoryItem,
  HospitalInventoryTransaction,
  HospitalStaffMember,
} from '../types/hospital';
import { EmergencyRequest } from '../types';

export const INITIAL_REGISTERED_HOSPITALS: RegisteredHospital[] = [
  {
    id: 'hosp-nims-hyd',
    name: 'Nizam Institute of Medical Sciences (NIMS)',
    registrationNumber: 'AP-MED-2018-0941',
    facilityType: 'super_speciality',
    ownershipType: 'Government / Public',
    establishedYear: 1989,
    website: 'https://nims.edu.in',
    state: 'Telangana',
    district: 'Hyderabad',
    city: 'Hyderabad',
    address: 'Punjagutta, Emergency Trauma Ward 2A',
    postalCode: '500082',
    latitude: 17.4243,
    longitude: 78.4528,
    contactName: 'Dr. Evelyn Vance',
    contactDesignation: 'Head of Transfusion Medicine',
    contactEmail: 'transfusion.nims@careloop.health',
    contactPhone: '+91 40 2311 8899',
    emergencyPhone: '+91 40 2311 0108',
    hasBloodBank: true,
    bloodBankLicenseNumber: 'BB-TS-2019-0412',
    storageCapacityUnits: 650,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    approvalStatus: 'APPROVED',
    isVerified: true,
    authorizedUserIds: ['u-4'],
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: new Date().toISOString(),
    verifiedAt: '2024-01-12T10:00:00Z',
  },
  {
    id: 'hosp-apollo-hyd',
    name: 'Apollo Health City',
    registrationNumber: 'TS-MED-2016-1188',
    facilityType: 'super_speciality',
    ownershipType: 'Private / Corporate',
    establishedYear: 1988,
    website: 'https://apollohospitals.com',
    state: 'Telangana',
    district: 'Hyderabad',
    city: 'Hyderabad',
    address: 'Road No 72, Film Nagar, Jubilee Hills',
    postalCode: '500033',
    latitude: 17.4195,
    longitude: 78.4116,
    contactName: 'Dr. Michael Chen',
    contactDesignation: 'Medical Director',
    contactEmail: 'bloodbank.apollo@hospital.org',
    contactPhone: '+91 40 2360 7777',
    emergencyPhone: '+91 40 2360 0108',
    hasBloodBank: true,
    bloodBankLicenseNumber: 'BB-TS-2017-0988',
    storageCapacityUnits: 800,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    approvalStatus: 'APPROVED',
    isVerified: true,
    authorizedUserIds: ['u-6'],
    createdAt: '2024-02-15T09:00:00Z',
    updatedAt: new Date().toISOString(),
    verifiedAt: '2024-02-18T14:30:00Z',
  },
  {
    id: 'hosp-osmania-hyd',
    name: 'Osmania General Hospital',
    registrationNumber: 'TS-GOV-1925-0012',
    facilityType: 'government_hospital',
    ownershipType: 'Government / Public',
    establishedYear: 1925,
    website: 'https://osmaniahospital.org',
    state: 'Telangana',
    district: 'Hyderabad',
    city: 'Hyderabad',
    address: 'Afzal Gunj, High Court Road',
    postalCode: '500012',
    latitude: 17.3734,
    longitude: 78.4739,
    contactName: 'Dr. Ramesh Reddy',
    contactDesignation: 'Chief Medical Officer',
    contactEmail: 'trauma.ogh@telangana.gov.in',
    contactPhone: '+91 40 2460 0121',
    emergencyPhone: '+91 40 2460 0108',
    hasBloodBank: true,
    bloodBankLicenseNumber: 'BB-TS-2015-0021',
    storageCapacityUnits: 1200,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    approvalStatus: 'APPROVED',
    isVerified: true,
    authorizedUserIds: [],
    createdAt: '2024-01-05T06:00:00Z',
    updatedAt: new Date().toISOString(),
    verifiedAt: '2024-01-08T09:00:00Z',
  },
  {
    id: 'hosp-ggh-vijayawada',
    name: 'Government General Hospital (GGH) Vijayawada',
    registrationNumber: 'AP-MED-2019-3321',
    facilityType: 'government_hospital',
    ownershipType: 'Government / Public',
    establishedYear: 1962,
    website: 'https://gghvijayawada.ap.gov.in',
    state: 'Andhra Pradesh',
    district: 'NTR (Vijayawada)',
    city: 'Vijayawada',
    address: 'Hanumanpet, Near Railway Station',
    postalCode: '520003',
    latitude: 16.5162,
    longitude: 80.6279,
    contactName: 'Dr. Suresh Kumar',
    contactDesignation: 'Blood Bank Superintendent',
    contactEmail: 'ggh.bloodbank@ap.gov.in',
    contactPhone: '+91 866 257 2345',
    emergencyPhone: '+91 866 257 0108',
    hasBloodBank: true,
    bloodBankLicenseNumber: 'BB-AP-2019-0114',
    storageCapacityUnits: 500,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    approvalStatus: 'UNDER_REVIEW',
    isVerified: false,
    authorizedUserIds: [],
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'hosp-kgh-vizag',
    name: 'King George Hospital (KGH) Visakhapatnam',
    registrationNumber: 'AP-MED-2017-0498',
    facilityType: 'government_hospital',
    ownershipType: 'Government / Public',
    establishedYear: 1923,
    website: 'https://kghvizag.ap.gov.in',
    state: 'Andhra Pradesh',
    district: 'Visakhapatnam',
    city: 'Visakhapatnam',
    address: 'Collector Office Road, Maharanipeta',
    postalCode: '530002',
    latitude: 17.7089,
    longitude: 83.3032,
    contactName: 'Dr. Lakshmi Narayana',
    contactDesignation: 'Transfusion Officer',
    contactEmail: 'bloodbank.kgh@ap.gov.in',
    contactPhone: '+91 891 256 4891',
    emergencyPhone: '+91 891 256 0108',
    hasBloodBank: true,
    bloodBankLicenseNumber: 'BB-AP-2018-0521',
    storageCapacityUnits: 900,
    componentsSupported: ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'],
    operatingHours: '24/7 Emergency Operation',
    isEmergencyAvailable: true,
    approvalStatus: 'APPROVED',
    isVerified: true,
    authorizedUserIds: [],
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: new Date().toISOString(),
    verifiedAt: '2024-03-04T12:00:00Z',
  },
  {
    id: 'hosp-sunrise-guntur',
    name: 'Sunrise Emergency Trauma Hospital',
    registrationNumber: 'AP-PRV-2023-9912',
    facilityType: 'trauma_centre',
    ownershipType: 'Private / Corporate',
    establishedYear: 2021,
    state: 'Andhra Pradesh',
    district: 'Guntur',
    city: 'Guntur',
    address: 'Kaza Road, Nagarjuna Nagar',
    postalCode: '522510',
    latitude: 16.3688,
    longitude: 80.5255,
    contactName: 'K. Venkat Rao',
    contactDesignation: 'Hospital Administrator',
    contactEmail: 'admin@sunrisetrauma.com',
    contactPhone: '+91 863 234 5678',
    emergencyPhone: '+91 863 234 0108',
    hasBloodBank: false,
    componentsSupported: ['Packed RBC', 'Whole Blood'],
    operatingHours: '24/7 Emergency Ward',
    isEmergencyAvailable: true,
    approvalStatus: 'SUBMITTED',
    isVerified: false,
    authorizedUserIds: [],
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export const INITIAL_HOSPITAL_INVENTORY: Record<string, HospitalInventoryItem[]> = {
  'hosp-nims-hyd': [
    { id: 'hinv-1', hospitalId: 'hosp-nims-hyd', bloodGroup: 'O+', component: 'Packed RBC', units: 14, reservedUnits: 3, availableUnits: 11, updatedAt: new Date().toISOString() },
    { id: 'hinv-2', hospitalId: 'hosp-nims-hyd', bloodGroup: 'O-', component: 'Packed RBC', units: 4, reservedUnits: 2, availableUnits: 2, updatedAt: new Date().toISOString() },
    { id: 'hinv-3', hospitalId: 'hosp-nims-hyd', bloodGroup: 'A+', component: 'Packed RBC', units: 18, reservedUnits: 4, availableUnits: 14, updatedAt: new Date().toISOString() },
    { id: 'hinv-4', hospitalId: 'hosp-nims-hyd', bloodGroup: 'B+', component: 'Packed RBC', units: 12, reservedUnits: 2, availableUnits: 10, updatedAt: new Date().toISOString() },
    { id: 'hinv-5', hospitalId: 'hosp-nims-hyd', bloodGroup: 'AB+', component: 'Packed RBC', units: 6, reservedUnits: 1, availableUnits: 5, updatedAt: new Date().toISOString() },
    { id: 'hinv-6', hospitalId: 'hosp-nims-hyd', bloodGroup: 'O+', component: 'Platelets', units: 8, reservedUnits: 2, availableUnits: 6, updatedAt: new Date().toISOString() },
    { id: 'hinv-7', hospitalId: 'hosp-nims-hyd', bloodGroup: 'AB+', component: 'Plasma', units: 16, reservedUnits: 0, availableUnits: 16, updatedAt: new Date().toISOString() },
  ],
  'hosp-apollo-hyd': [
    { id: 'hinv-8', hospitalId: 'hosp-apollo-hyd', bloodGroup: 'O+', component: 'Packed RBC', units: 22, reservedUnits: 4, availableUnits: 18, updatedAt: new Date().toISOString() },
    { id: 'hinv-9', hospitalId: 'hosp-apollo-hyd', bloodGroup: 'O-', component: 'Packed RBC', units: 6, reservedUnits: 1, availableUnits: 5, updatedAt: new Date().toISOString() },
    { id: 'hinv-10', hospitalId: 'hosp-apollo-hyd', bloodGroup: 'A+', component: 'Packed RBC', units: 20, reservedUnits: 3, availableUnits: 17, updatedAt: new Date().toISOString() },
    { id: 'hinv-11', hospitalId: 'hosp-apollo-hyd', bloodGroup: 'B+', component: 'Platelets', units: 10, reservedUnits: 2, availableUnits: 8, updatedAt: new Date().toISOString() },
    { id: 'hinv-12', hospitalId: 'hosp-apollo-hyd', bloodGroup: 'AB+', component: 'Plasma', units: 15, reservedUnits: 1, availableUnits: 14, updatedAt: new Date().toISOString() },
  ],
};

const STORAGE_KEY_HOSPITALS = 'careloop_registered_hospitals';
const STORAGE_KEY_HOSPITAL_INVENTORY = 'careloop_hospital_inventory';
const STORAGE_KEY_HOSPITAL_TRANSACTIONS = 'careloop_hospital_transactions';

class HospitalService {
  private hospitals: RegisteredHospital[] = [];
  private inventory: Record<string, HospitalInventoryItem[]> = {};
  private transactions: HospitalInventoryTransaction[] = [];

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedHosp = localStorage.getItem(STORAGE_KEY_HOSPITALS);
        this.hospitals = savedHosp ? JSON.parse(savedHosp) : INITIAL_REGISTERED_HOSPITALS;

        const savedInv = localStorage.getItem(STORAGE_KEY_HOSPITAL_INVENTORY);
        this.inventory = savedInv ? JSON.parse(savedInv) : INITIAL_HOSPITAL_INVENTORY;

        const savedTx = localStorage.getItem(STORAGE_KEY_HOSPITAL_TRANSACTIONS);
        this.transactions = savedTx ? JSON.parse(savedTx) : [];
      } catch {
        this.hospitals = INITIAL_REGISTERED_HOSPITALS;
        this.inventory = INITIAL_HOSPITAL_INVENTORY;
      }
    } else {
      this.hospitals = INITIAL_REGISTERED_HOSPITALS;
      this.inventory = INITIAL_HOSPITAL_INVENTORY;
    }
  }

  private saveState() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_HOSPITALS, JSON.stringify(this.hospitals));
        localStorage.setItem(STORAGE_KEY_HOSPITAL_INVENTORY, JSON.stringify(this.inventory));
        localStorage.setItem(STORAGE_KEY_HOSPITAL_TRANSACTIONS, JSON.stringify(this.transactions));
      } catch {
        // storage quota
      }
    }
  }

  /**
   * Submit new hospital registration for admin verification
   */
  public async submitHospitalRegistration(
    input: HospitalRegistrationInput,
    userId?: string
  ): Promise<{ success: boolean; data?: RegisteredHospital; error?: string }> {
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'Hospital name is required.' };
    }
    if (!input.registrationNumber || input.registrationNumber.trim().length === 0) {
      return { success: false, error: 'Hospital registration / clinical license number is required.' };
    }
    if (!input.city || input.city.trim().length === 0) {
      return { success: false, error: 'City is required.' };
    }
    if (!input.contactPhone || input.contactPhone.trim().length < 7) {
      return { success: false, error: 'Valid authorized contact phone number is required.' };
    }
    if (!input.emergencyPhone || input.emergencyPhone.trim().length < 7) {
      return { success: false, error: '24/7 emergency contact telephone is required.' };
    }

    const hospitalId = `hosp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newHospital: RegisteredHospital = {
      ...input,
      id: hospitalId,
      approvalStatus: 'SUBMITTED',
      isVerified: false,
      authorizedUserIds: userId ? [userId] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Try inserting into Supabase public.hospitals if available
    if (isSupabaseConfigured) {
      try {
        await supabase.from('hospitals').insert({
          id: hospitalId,
          name: input.name.trim(),
          license_number: input.registrationNumber.trim(),
          facility_type: input.facilityType,
          address: input.address.trim(),
          city: input.city.trim(),
          district: input.district.trim(),
          state: input.state.trim() || 'Andhra Pradesh',
          postal_code: input.postalCode.trim(),
          emergency_phone: input.emergencyPhone.trim(),
          lat: input.latitude ?? null,
          lng: input.longitude ?? null,
          is_verified: false,
          source: 'CareLoop Hospital Registration Portal',
        });
      } catch (err: any) {
        console.warn('[HospitalService] Remote DB insert fallback:', err?.message);
      }
    }

    this.hospitals = [newHospital, ...this.hospitals];
    this.saveState();

    return { success: true, data: newHospital };
  }

  /**
   * Retrieve registered hospitals with optional filters
   */
  public async getHospitals(filters?: {
    status?: HospitalApprovalStatus | 'ALL';
    district?: string;
    query?: string;
  }): Promise<{ success: boolean; data: RegisteredHospital[] }> {
    let list = [...this.hospitals];

    if (filters?.status && filters.status !== 'ALL') {
      list = list.filter((h) => h.approvalStatus === filters.status);
    }
    if (filters?.district && filters.district !== 'ALL') {
      list = list.filter((h) => h.district.toLowerCase() === filters.district!.toLowerCase());
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.registrationNumber.toLowerCase().includes(q) ||
          h.city.toLowerCase().includes(q)
      );
    }

    return { success: true, data: list };
  }

  /**
   * Retrieve hospital by ID
   */
  public getHospitalById(id: string): RegisteredHospital | undefined {
    return this.hospitals.find((h) => h.id === id);
  }

  /**
   * Review hospital application: Approve, Reject, or Request Corrections
   */
  public async reviewHospitalApplication(
    id: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTIONS',
    reason?: string,
    reviewerId?: string
  ): Promise<{ success: boolean; hospital?: RegisteredHospital; error?: string }> {
    const index = this.hospitals.findIndex((h) => h.id === id);
    if (index === -1) {
      return { success: false, error: 'Hospital record not found.' };
    }

    const current = this.hospitals[index];
    let newStatus: HospitalApprovalStatus = current.approvalStatus;

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
    } else if (action === 'REQUEST_CORRECTIONS') {
      newStatus = 'NEEDS_CORRECTION';
    }

    const updated: RegisteredHospital = {
      ...current,
      approvalStatus: newStatus,
      isVerified: action === 'APPROVE',
      rejectionReason: action === 'REJECT' ? reason : undefined,
      correctionNotes: action === 'REQUEST_CORRECTIONS' ? reason : undefined,
      reviewedBy: reviewerId || 'System Administrator',
      reviewedAt: new Date().toISOString(),
      verifiedAt: action === 'APPROVE' ? new Date().toISOString() : current.verifiedAt,
      updatedAt: new Date().toISOString(),
    };

    this.hospitals[index] = updated;

    // Sync to Supabase `hospitals.is_verified` if configured
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('hospitals')
          .update({
            is_verified: action === 'APPROVE',
          })
          .eq('id', id);
      } catch (err: any) {
        console.warn('[HospitalService] Remote DB status update fallback:', err?.message);
      }
    }

    this.saveState();
    return { success: true, hospital: updated };
  }

  /**
   * Retrieve blood inventory for a specific authorized hospital
   */
  public getHospitalInventory(hospitalId: string): HospitalInventoryItem[] {
    return this.inventory[hospitalId] || [];
  }

  /**
   * Update hospital blood inventory item
   */
  public updateHospitalInventory(
    hospitalId: string,
    item: {
      bloodGroup: HospitalInventoryItem['bloodGroup'];
      component: HospitalInventoryItem['component'];
      unitsDelta: number;
      actionType: 'INTAKE' | 'TRANSFUSION' | 'DISPATCH' | 'EXPIRED' | 'DISCARDED';
      performedBy: string;
      referenceCode?: string;
      notes?: string;
    }
  ): { success: boolean; data?: HospitalInventoryItem; error?: string } {
    const currentList = this.inventory[hospitalId] || [];
    const index = currentList.findIndex(
      (i) => i.bloodGroup === item.bloodGroup && i.component === item.component
    );

    let updatedItem: HospitalInventoryItem;

    if (index >= 0) {
      const existing = currentList[index];
      const newTotal = Math.max(0, existing.units + item.unitsDelta);
      const newAvailable = Math.max(0, newTotal - existing.reservedUnits);
      updatedItem = {
        ...existing,
        units: newTotal,
        availableUnits: newAvailable,
        updatedAt: new Date().toISOString(),
      };
      currentList[index] = updatedItem;
    } else {
      const totalUnits = Math.max(0, item.unitsDelta);
      updatedItem = {
        id: `hinv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        hospitalId,
        bloodGroup: item.bloodGroup,
        component: item.component,
        units: totalUnits,
        reservedUnits: 0,
        availableUnits: totalUnits,
        updatedAt: new Date().toISOString(),
      };
      currentList.push(updatedItem);
    }

    this.inventory[hospitalId] = currentList;

    // Log transaction
    const tx: HospitalInventoryTransaction = {
      id: `htx-${Date.now()}`,
      hospitalId,
      bloodGroup: item.bloodGroup,
      component: item.component,
      units: Math.abs(item.unitsDelta),
      transactionType: item.actionType,
      referenceCode: item.referenceCode,
      performedBy: item.performedBy,
      notes: item.notes,
      timestamp: new Date().toISOString(),
    };
    this.transactions.unshift(tx);

    this.saveState();
    return { success: true, data: updatedItem };
  }

  /**
   * Retrieve inventory transactions for an authorized hospital
   */
  public getHospitalTransactions(hospitalId: string): HospitalInventoryTransaction[] {
    return this.transactions.filter((tx) => tx.hospitalId === hospitalId);
  }

  /**
   * Filter emergency requests associated with a specific hospital
   */
  public getHospitalRequests(
    hospital: RegisteredHospital,
    allRequests: EmergencyRequest[]
  ): EmergencyRequest[] {
    const cleanHospName = hospital.name.toLowerCase().trim();
    return allRequests.filter((r) => {
      const reqHosp = r.hospitalName.toLowerCase().trim();
      return reqHosp.includes(cleanHospName) || cleanHospName.includes(reqHosp);
    });
  }
}

export const hospitalService = new HospitalService();

