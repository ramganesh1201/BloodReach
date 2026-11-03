import React, { useState } from 'react';
import { BloodInventoryItem, BloodCentre, BloodGroup, BloodComponent } from '../../types';
import { getFreshnessStatus } from '../../store/useBloodStore';
import { Clock, AlertTriangle, ShieldCheck, Plus, Minus, RefreshCw } from 'lucide-react';

interface InventoryTableProps {
  centre: BloodCentre;
  inventory: BloodInventoryItem[];
  onUpdateInventory: (centreId: string, group: BloodGroup, comp: BloodComponent, newUnits: number) => void;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  centre,
  inventory,
  onUpdateInventory,
}) => {
  const freshness = getFreshnessStatus(centre.inventoryUpdatedAt);
  const diffMins = Math.floor((Date.now() - new Date(centre.inventoryUpdatedAt).getTime()) / (1000 * 60));

  const centreItems = inventory.filter((item) => item.bloodCentreId === centre.id);

  let freshnessBadge = (
    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold">
      <ShieldCheck className="w-3.5 h-3.5" />
      Verified Fresh ({diffMins}m ago)
    </span>
  );

  if (freshness === 'Aging') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
        <Clock className="w-3.5 h-3.5" />
        Aging ({diffMins}m ago)
      </span>
    );
  } else if (freshness === 'Stale' || freshness === 'Unknown') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-300 font-semibold">
        <AlertTriangle className="w-3.5 h-3.5" />
        Outdated (Last verified {Math.floor(diffMins / 60)}h ago)
      </span>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{centre.name}</h3>
            {centre.verified && (
              <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded">
                Verified Bank
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-0.5">{centre.address} • Phone: {centre.phone}</p>
        </div>

        <div>{freshnessBadge}</div>
      </div>

      {/* Warning banner if stale */}
      {(freshness === 'Stale' || freshness === 'Unknown') && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Availability may be outdated:</strong> Inventory data was last updated more than 2 hours ago. Please update units below to ensure accurate coordination.
          </span>
        </div>
      )}

      {/* Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-100 text-slate-900 uppercase tracking-wider font-semibold border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Blood Group</th>
              <th className="py-3 px-4">Component</th>
              <th className="py-3 px-4">Available Units</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Update Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {centreItems.map((item) => {
              const isLow = item.units <= 1;
              return (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-extrabold text-sm text-slate-900">{item.bloodGroup}</td>
                  <td className="py-3 px-4 font-medium">{item.component}</td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                    {item.units} unit(s)
                  </td>
                  <td className="py-3 px-4">
                    {isLow ? (
                      <span className="text-[11px] font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                        Critical Shortage
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        In Reserve
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateInventory(centre.id, item.bloodGroup, item.component, Math.max(0, item.units - 1))
                        }
                        className="w-6 h-6 rounded bg-white text-slate-800 hover:bg-slate-200 flex items-center justify-center font-bold"
                        aria-label="Decrease stock"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs">{item.units}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateInventory(centre.id, item.bloodGroup, item.component, item.units + 1)
                        }
                        className="w-6 h-6 rounded bg-white text-slate-800 hover:bg-slate-200 flex items-center justify-center font-bold"
                        aria-label="Increase stock"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
