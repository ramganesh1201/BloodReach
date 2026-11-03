import { EscalationConfig, EmergencyRequest } from '../types';

export const ESCALATION_LEVELS: EscalationConfig[] = [
  {
    level: 1,
    name: 'Level 1 — Immediate Proximity',
    description: 'Notifying registered responders within 5 km and checking nearby verified blood-centre inventory.',
    radiusKm: 5,
    autoEscalateMinutes: 10,
  },
  {
    level: 2,
    name: 'Level 2 — Expanded Local Area',
    description: 'Expanding notification radius to 15 km across active registered volunteer network.',
    radiusKm: 15,
    autoEscalateMinutes: 20,
  },
  {
    level: 3,
    name: 'Level 3 — Regional Network Alert',
    description: 'Broadcasting SMS & web emergency alerts to all registered responders in city region (up to 35 km).',
    radiusKm: 35,
    autoEscalateMinutes: 30,
  },
  {
    level: 4,
    name: 'Level 4 — Coordinator & Emergency Blood Bank Escalation',
    description: 'Direct coordinator manual override, blood centre reserve transfer, and emergency dispatch.',
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
      reason: `Shortage of ${shortage} unit(s) remaining. Escalating to ${config.name} (${config.radiusKm} km radius).`,
    };
  }

  return {
    shouldEscalate: false,
    nextLevel: 4,
    reason: `Request is already at maximum escalation Level 4. Coordinator control room active.`,
  };
}
