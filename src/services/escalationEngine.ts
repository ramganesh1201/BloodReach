import { EscalationConfig, EmergencyRequest } from '../types';

export const ESCALATION_LEVELS: EscalationConfig[] = [
  {
    level: 1,
    name: 'Level 1 — Immediate Vicinity',
    description: 'Alerting registered compatible donors within 10 km and cross-checking verified partner blood centre stock.',
    radiusKm: 10,
    autoEscalateMinutes: 15,
  },
  {
    level: 2,
    name: 'Level 2 — District & Extended Radius',
    description: 'Expanding notification radius to 25 km across active district network and regional blood storage depots.',
    radiusKm: 25,
    autoEscalateMinutes: 25,
  },
  {
    level: 3,
    name: 'Level 3 — Regional Emergency Mobilization',
    description: 'Multi-channel emergency alerts dispatched up to 50 km radius. Alerting assigned on-call coordinator.',
    radiusKm: 50,
    autoEscalateMinutes: 35,
  },
  {
    level: 4,
    name: 'Level 4 — Coordinator Intervention & Central Reserve Release',
    description: 'Full regional priority mobilization (up to 100 km), coordinator manual override, and hospital emergency liaison.',
    radiusKm: 100,
    autoEscalateMinutes: 0,
  },
];

export function getEscalationConfig(level: number): EscalationConfig {
  return ESCALATION_LEVELS.find((l) => l.level === level) || ESCALATION_LEVELS[0];
}

export function evaluateEscalationNeed(
  request: EmergencyRequest,
  unitsCoordinatedFromInventory: number,
  unitsCoordinatedFromDonors: number
): { shouldEscalate: boolean; nextLevel: number; reason: string } {
  const totalCoordinated = unitsCoordinatedFromInventory + unitsCoordinatedFromDonors;
  const shortage = request.unitsRequired - totalCoordinated;

  if (shortage <= 0) {
    return {
      shouldEscalate: false,
      nextLevel: request.escalationLevel,
      reason: 'All required units have been successfully coordinated.',
    };
  }

  if (request.escalationLevel < 4) {
    const nextLevel = request.escalationLevel + 1;
    const config = getEscalationConfig(nextLevel);
    return {
      shouldEscalate: true,
      nextLevel,
      reason: `Unresolved shortage of ${shortage} unit(s). Progressively expanding to ${config.name} (${config.radiusKm} km radius).`,
    };
  }

  return {
    shouldEscalate: false,
    nextLevel: 4,
    reason: `Request is at maximum Level 4 escalation. Direct coordinator intervention active.`,
  };
}
