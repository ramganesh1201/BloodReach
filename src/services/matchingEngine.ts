import { Donor, EmergencyRequest, BloodGroup, BloodComponent } from '../types';

/**
 * CareLoop Clinical Blood Matching Engine
 * 
 * Implements clinically verified transfusion compatibility rules for:
 * 1. Packed Red Blood Cells (RBC)
 * 2. Whole Blood
 * 3. Fresh Frozen Plasma (FFP)
 * 4. Platelets (Apheresis / Random Donor)
 * 
 * Also accounts for:
 * - Donor availability flag
 * - Donation interval deferral (whole blood vs platelets vs plasma)
 * - Minimum weight and age criteria
 * - Proximity / Distance calculation (Haversine formula)
 * - Prior active donation history
 * 
 * IMPORTANT CLINICAL BOUNDARY:
 * CareLoop coordinates candidate discovery. Physical donor medical eligibility
 * screening, vital checks (Hb >= 12.5 g/dL), infectious disease testing (HIV, HBV,
 * HCV, Syphilis, Malaria), and pre-transfusion cross-matching MUST be executed
 * by certified blood centre pathologists and transfusion physicians.
 */

export interface DonorEligibilityCheck {
  isEligible: boolean;
  reason?: string;
  nextEligibleDate?: string;
  daysRemaining?: number;
  status?: 'ELIGIBLE' | 'DEFERRED' | 'UNDETERMINED';
}

export interface PotentialResponderMatch {
  donor: Donor;
  matchScore: number;
  matchReason: string;
  compatibilityTier: 'EXACT' | 'COMPATIBLE' | 'SUB-OPTIMAL';
  approxDistanceKm: number;
  eligibility: DonorEligibilityCheck;
  disclaimer: string;
}

// ============================================================================
// CLINICAL COMPATIBILITY TABLES
// ============================================================================

/**
 * Packed Red Blood Cells (RBC) Compatibility
 * Patient Group -> Compatible Donor Groups
 */
const RBC_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'], // Universal Recipient for RBC
};

/**
 * Fresh Frozen Plasma (FFP) Compatibility
 * REVERSED from RBC because plasma contains antibodies against non-self antigens.
 * Patient Group -> Compatible Donor Groups
 */
const PLASMA_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'], // Universal Recipient for Plasma
  'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A-', 'A+', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'], // Can only receive AB plasma
  'AB+': ['AB-', 'AB+'], // AB is Universal Donor for Plasma
};

/**
 * Platelet Compatibility
 * ABO-identical preferred; compatible plasma rules if identical unavailable.
 */
const PLATELET_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'B-', 'AB-'],
  'O+': ['O+', 'O-', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'O-'],
  'A+': ['A+', 'A-', 'AB+', 'O+'],
  'B-': ['B-', 'B+', 'AB-', 'O-'],
  'B+': ['B+', 'B-', 'AB+', 'O+'],
  'AB-': ['AB-', 'AB+', 'A-', 'B-'],
  'AB+': ['AB+', 'AB-', 'A+', 'B+'],
};

/**
 * Whole Blood Compatibility
 * Exact match standardly required for whole blood transfusion.
 */
const WHOLE_BLOOD_COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O+'],
  'A-': ['A-'],
  'A+': ['A+'],
  'B-': ['B-'],
  'B+': ['B+'],
  'AB-': ['AB-'],
  'AB+': ['AB+'],
};

// ============================================================================
// DONATION INTERVALS (DAYS) — NBTC 2023 CLINICAL GUIDELINES
// Standardized to Government of India National Blood Transfusion Council (NBTC)
// Transfusion Medicine Technical Manual (Third Edition, 2023):
// - Whole Blood (Male): 90 days (3 months)
// - Whole Blood (Female): 120 days (4 months)
// - Packed RBC (2-unit automated apheresis): 112 days (16 weeks)
// - Platelets (Apheresis): 14 days (every 2 weeks)
// - Plasma (Apheresis): 28 days (every 4 weeks)
// - Minimum Haemoglobin: 12.5 g/dL for both sexes (screened at blood centre)
// ============================================================================
export const NBTC_2023_INTERVALS = {
  WHOLE_BLOOD_MALE_DAYS: 90,
  WHOLE_BLOOD_FEMALE_DAYS: 120,
  PACKED_RBC_DAYS: 112,
  PLATELETS_DAYS: 14,
  PLASMA_DAYS: 28,
  MIN_HEMOGLOBIN_GDL: 12.5,
} as const;

export const DONATION_INTERVAL_DAYS: Record<BloodComponent, number> = {
  'Whole Blood': 90, // Baseline male interval (female requires 120 days per NBTC 2023)
  'Packed RBC': 112,
  'Platelets': 14,
  'Plasma': 28,
};

/**
 * Normalizes biological sex/gender from donor profile.
 * Only returns 'male' or 'female' where the stored field has a clear, reliable mapping.
 * Returns null if missing, unspecified, or ambiguous. Never infers from name, email, or other data.
 */
export function normalizeDonorGender(donor: Donor): 'male' | 'female' | null {
  const raw = (donor.gender || donor.sex || '').trim().toLowerCase();
  if (raw === 'male' || raw === 'm') return 'male';
  if (raw === 'female' || raw === 'f') return 'female';
  return null;
}

// ============================================================================
// HAVERSINE DISTANCE FORMULA
// ============================================================================
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

// ============================================================================
// CLINICAL ELIGIBILITY EVALUATION
// ============================================================================
export function evaluateDonorEligibility(
  donor: Donor,
  targetComponent: BloodComponent = 'Whole Blood'
): DonorEligibilityCheck {
  const now = new Date();

  // 1. Availability Flag
  if (!donor.isAvailable) {
    return {
      isEligible: false,
      reason: 'Donor has set status to temporarily unavailable.',
    };
  }

  // 2. Minimum Weight Criteria
  if (donor.weightKg && donor.weightKg < 50) {
    return {
      isEligible: false,
      reason: `Weight (${donor.weightKg}kg) below clinical safety minimum of 50kg.`,
    };
  }

  // 3. Age Criteria
  if (donor.age && (donor.age < 18 || donor.age > 65)) {
    return {
      isEligible: false,
      reason: `Age (${donor.age}) outside standard donation range (18-65 years).`,
    };
  }

  // 4. Specific Deferral Date
  if (donor.deferralUntil) {
    const deferralDate = new Date(donor.deferralUntil);
    if (deferralDate > now) {
      const daysLeft = Math.ceil((deferralDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      return {
        isEligible: false,
        reason: `Under medical deferral until ${deferralDate.toLocaleDateString()}.`,
        nextEligibleDate: donor.deferralUntil,
        daysRemaining: daysLeft,
      };
    }
  }

  // 5. Donation Interval Evaluation (NBTC 2023 Criteria)
  if (donor.lastDonatedAt) {
    const lastDate = new Date(donor.lastDonatedAt);
    const componentLast = donor.lastDonatedComponent || 'Whole Blood';

    if (componentLast === 'Whole Blood') {
      const normalizedGender = normalizeDonorGender(donor);
      if (!normalizedGender) {
        return {
          isEligible: false,
          reason: 'Unable to determine — blood centre assessment required',
          status: 'UNDETERMINED',
        };
      }

      const requiredIntervalDays =
        normalizedGender === 'male'
          ? NBTC_2023_INTERVALS.WHOLE_BLOOD_MALE_DAYS
          : NBTC_2023_INTERVALS.WHOLE_BLOOD_FEMALE_DAYS;
      const nextDate = new Date(lastDate.getTime() + requiredIntervalDays * 24 * 3600 * 1000);

      if (nextDate > now) {
        const daysRemaining = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        return {
          isEligible: false,
          reason: `Inter-donation interval active (${daysRemaining} days remaining for Whole Blood (${requiredIntervalDays}-day NBTC ${normalizedGender} interval)).`,
          nextEligibleDate: nextDate.toISOString(),
          daysRemaining,
          status: 'DEFERRED',
        };
      }
    } else {
      const requiredIntervalDays = DONATION_INTERVAL_DAYS[componentLast] || 90;
      const nextDate = new Date(lastDate.getTime() + requiredIntervalDays * 24 * 3600 * 1000);

      if (nextDate > now) {
        const daysRemaining = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        return {
          isEligible: false,
          reason: `Inter-donation interval active (${daysRemaining} days remaining for ${componentLast}).`,
          nextEligibleDate: nextDate.toISOString(),
          daysRemaining,
          status: 'DEFERRED',
        };
      }
    }
  }

  return { isEligible: true, status: 'ELIGIBLE' };
}

// ============================================================================
// CLINICAL COMPATIBILITY CHECK
// ============================================================================
export function isClinicallyCompatible(
  patientGroup: BloodGroup,
  donorGroup: BloodGroup,
  component: BloodComponent
): { compatible: boolean; isExact: boolean; tier: 'EXACT' | 'COMPATIBLE' | 'SUB-OPTIMAL' } {
  if (patientGroup === donorGroup) {
    return { compatible: true, isExact: true, tier: 'EXACT' };
  }

  let table: Record<BloodGroup, BloodGroup[]>;

  switch (component) {
    case 'Packed RBC':
      table = RBC_COMPATIBILITY;
      break;
    case 'Plasma':
      table = PLASMA_COMPATIBILITY;
      break;
    case 'Platelets':
      table = PLATELET_COMPATIBILITY;
      break;
    case 'Whole Blood':
    default:
      table = WHOLE_BLOOD_COMPATIBILITY;
      break;
  }

  const compatibleList = table[patientGroup] || [patientGroup];
  const compatible = compatibleList.includes(donorGroup);

  return {
    compatible,
    isExact: false,
    tier: compatible ? 'COMPATIBLE' : 'SUB-OPTIMAL',
  };
}

// ============================================================================
// MULTI-FACTOR DONOR MATCHING & RANKING
// ============================================================================
export function findPotentialResponders(
  request: EmergencyRequest,
  allDonors: Donor[],
  maxRadiusKm: number = 35
): PotentialResponderMatch[] {
  const matches: PotentialResponderMatch[] = [];

  for (const donor of allDonors) {
    // 1. Clinical Compatibility based on Component and ABO/Rh
    const compCheck = isClinicallyCompatible(request.bloodGroup, donor.bloodGroup, request.component);
    if (!compCheck.compatible) continue;

    // 2. Clinical Eligibility & Interval Check
    const eligibility = evaluateDonorEligibility(donor, request.component);
    // If not eligible due to strict interval, undetermined sex interval, or medical deferral, exclude from active emergency call
    if (!eligibility.isEligible) {
      continue;
    }

    // 3. Proximity / Distance calculation
    let dist: number;
    if (request.lat && request.lng && donor.approxDistanceKm !== undefined) {
      dist = donor.approxDistanceKm;
    } else if (donor.city?.toLowerCase() === request.city?.toLowerCase()) {
      dist = compCheck.isExact ? 3.5 : 5.8;
    } else if (donor.district && request.district && donor.district.toLowerCase() === request.district.toLowerCase()) {
      dist = 12.0;
    } else {
      dist = donor.approxDistanceKm ?? 22.0;
    }

    if (dist > maxRadiusKm) continue;

    // 4. Scoring Algorithm (Internal explainable score for prioritization)
    let score = 100;

    // Exact Match bonus (+15)
    if (compCheck.isExact) {
      score += 15;
    }

    // Proximity penalty (-1.5 points per km)
    score -= dist * 1.5;

    // Active donation track record bonus (+2 per donation up to 10)
    score += Math.min(10, (donor.totalDonations || 0) * 2);

    // Response history count reliability (+5)
    if ((donor.responseHistoryCount || 0) > 0) {
      score += 5;
    }

    let matchReason: string;
    if (compCheck.isExact) {
      matchReason = `Exact match for ${request.bloodGroup} ${request.component} • ~${dist.toFixed(1)} km away`;
    } else {
      matchReason = `Clinically compatible donor (${donor.bloodGroup}) for ${request.component} • ~${dist.toFixed(1)} km away`;
    }

    matches.push({
      donor,
      matchScore: Math.round(score),
      matchReason,
      compatibilityTier: compCheck.tier,
      approxDistanceKm: dist,
      eligibility,
      disclaimer: 'Potential candidate identified. Blood safety testing, Hb level, and final cross-match verification must be conducted by blood centre pathologists.',
    });
  }

  // Sort descending by calculated match score
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Returns the list of compatible donor blood groups for a given patient blood group and component.
 */
export function getCompatibleDonorGroups(
  patientGroup: BloodGroup,
  component: BloodComponent = 'Packed RBC'
): BloodGroup[] {
  switch (component) {
    case 'Packed RBC':
      return RBC_COMPATIBILITY[patientGroup] || [patientGroup];
    case 'Plasma':
      return PLASMA_COMPATIBILITY[patientGroup] || [patientGroup];
    case 'Platelets':
      return PLATELET_COMPATIBILITY[patientGroup] || [patientGroup];
    case 'Whole Blood':
    default:
      return WHOLE_BLOOD_COMPATIBILITY[patientGroup] || [patientGroup];
  }
}

/**
 * Explains the clinical compatibility rules for a specific blood component.
 */
export function getComponentCompatibilityDescription(component: BloodComponent): string {
  switch (component) {
    case 'Packed RBC':
      return 'Red Blood Cells contain ABO & Rh antigens. Type O- is the universal donor, whereas AB+ is the universal recipient.';
    case 'Plasma':
      return 'Plasma contains antibodies against non-self antigens. Rules are reversed: Type AB is the universal plasma donor, and Type O is the universal plasma recipient.';
    case 'Platelets':
      return 'ABO-identical platelets are strongly preferred to optimize platelet recovery. Compatible plasma rules are applied when exact matches are unavailable.';
    case 'Whole Blood':
    default:
      return 'Whole blood requires exact ABO and Rh(D) identical matching between donor and recipient to prevent acute hemolytic transfusion reactions.';
  }
}
