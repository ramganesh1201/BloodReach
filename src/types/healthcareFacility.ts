export type FacilityType =
  | 'government_hospital'
  | 'district_hospital'
  | 'area_hospital'
  | 'community_health_centre'
  | 'primary_health_centre'
  | 'teaching_hospital'
  | 'medical_college_hospital'
  | 'private_hospital'
  | 'speciality_hospital'
  | 'clinic'
  | 'nursing_home'
  | 'other';

export type VerificationStatus =
  | 'source_listed'
  | 'unverified'
  | 'pending'
  | 'verified';

export interface HealthcareFacility {
  id: string;
  name: string;
  normalizedName: string;
  state: 'Andhra Pradesh';
  district: string;
  city?: string;
  town?: string;
  locality?: string;
  address?: string;
  postalCode?: string;
  facilityType: FacilityType;
  latitude?: number;
  longitude?: number;
  source?: string;
  sourceUrl?: string;
  verificationStatus: VerificationStatus;
  lastCheckedAt?: string;
}

export interface DistrictInfo {
  id: string;
  name: string;
  headquarters: string;
  region: 'North Coastal' | 'Coastal Andhra' | 'Rayalaseema';
}

export interface FacilitySearchOptions {
  district?: string;
  city?: string;
  locality?: string;
  query?: string;
  facilityType?: FacilityType;
  limit?: number;
}
