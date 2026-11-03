import { BloodInventoryItem, EmergencyRequest } from '../types';

export interface ShortageAnalysisResult {
  unitsRequired: number;
  unitsInStock: number;
  shortageUnits: number;
  hasShortage: boolean;
  matchingInventoryItems: {
    centreId: string;
    unitsAvailable: number;
    unitsAllocated: number;
  }[];
}

export function detectShortage(
  request: EmergencyRequest,
  inventories: BloodInventoryItem[]
): ShortageAnalysisResult {
  // Find matching blood group and component in verified inventories
  const matchingItems = inventories.filter(
    (inv) => inv.bloodGroup === request.bloodGroup && inv.component === request.component
  );

  let totalInStock = 0;
  const allocations: { centreId: string; unitsAvailable: number; unitsAllocated: number }[] = [];

  let remainingNeeded = request.unitsRequired;

  for (const item of matchingItems) {
    totalInStock += item.units;
    const allocated = Math.min(item.units, remainingNeeded);
    remainingNeeded -= allocated;

    allocations.push({
      centreId: item.bloodCentreId,
      unitsAvailable: item.units,
      unitsAllocated: allocated,
    });
  }

  const shortageUnits = Math.max(0, request.unitsRequired - totalInStock);

  return {
    unitsRequired: request.unitsRequired,
    unitsInStock: totalInStock,
    shortageUnits,
    hasShortage: shortageUnits > 0,
    matchingInventoryItems: allocations,
  };
}
