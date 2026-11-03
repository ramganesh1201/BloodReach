import { Donor, EmergencyRequest, BloodGroup } from '../types';

/**
 * Potential Responder Matching Engine
 * 
 * IMPORTANT DISCLAIMER:
 * BloodReach does NOT perform clinical medical eligibility or transfusion compatibility tests.
 * This engine identifies potential registered volunteer responders based solely on
 * ABO group matching, geographic proximity, and availability.
 * Final donor eligibility and blood compatibility MUST be verified by qualified medical/blood-centre staff.
 */

export interface PotentialResponderMatch {
  donor: Donor;
  matchScore: number;
  matchReason: string;
  approxDistanceKm: number;
  disclaimer: string;
}

// ABO Blood Group Search Matching (for coordination search prioritization only)
const EXACT_OR_UNIVERSAL_GROUPS: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

export function findPotentialResponders(
  request: EmergencyRequest,
  allDonors: Donor[],
  maxRadiusKm: number = 25
): PotentialResponderMatch[] {
  // 1. Filter only available donors
  const availableDonors = allDonors.filter((d) => d.isAvailable);

  // 2. Compatible search groups
  const searchableGroups = EXACT_OR_UNIVERSAL_GROUPS[request.bloodGroup] || [request.bloodGroup];

  const matches: PotentialResponderMatch[] = [];

  for (const donor of availableDonors) {
    // Check group match
    const isExactMatch = donor.bloodGroup === request.bloodGroup;
    const isGroupCompatible = searchableGroups.includes(donor.bloodGroup);

    if (!isGroupCompatible) continue;

    // Estimate approximate distance (mock or calculated)
    const dist = donor.approxDistanceKm ?? (isExactMatch ? 3.2 : 5.8);

    if (dist > maxRadiusKm) continue;

    // Calculate internal explainable ranking score (NOT exposed as a percentage rating to users)
    let score = 100;
    if (!isExactMatch) score -= 20; // Exact match preferred
    score -= dist * 2; // Closer proximity preferred
    if (donor.totalDonations > 0) score += 5; // Previous active donor

    let matchReason = isExactMatch
      ? `Exact group match (${donor.bloodGroup}) ~${dist.toFixed(1)} km away`
      : `Compatible donor group (${donor.bloodGroup}) ~${dist.toFixed(1)} km away`;

    matches.push({
      donor,
      matchScore: score,
      matchReason,
      approxDistanceKm: dist,
      disclaimer: 'Potential responder identified. Final donor eligibility & blood compatibility must be verified by blood centre staff.',
    });
  }

  // Sort by internal score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}
