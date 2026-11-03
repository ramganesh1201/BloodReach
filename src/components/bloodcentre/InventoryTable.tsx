import React from 'react';
import { BloodInventoryItem, BloodCentre, BloodGroup, BloodComponent } from '../../types';
import { getFreshnessStatus } from '../../store/useBloodStore';
import { Clock, AlertTriangle, ShieldCheck, Plus, Minus, RefreshCw, CheckCircle2 } from 'lucide-react';

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
    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-success-light text-success border border-success-border font-semibold">
      <ShieldCheck className="w-3.5 h-3.5" />
      Verified Fresh ({diffMins}m ago)
    </span>
  );

  if (freshness === 'Aging') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-warning-light text-warning-dark border border-warning-border font-semibold">
        <Clock className="w-3.5 h-3.5" />
        Aging ({diffMins}m ago)
      </span>
    );
  } else if (freshness === 'Stale' || freshness === 'Unknown') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emergency-light text-emergency border border-emergency-border font-semibold">
        <AlertTriangle className="w-3.5 h-3.5" />
        Outdated (Last verified {Math.floor(diffMins / 60)}h ago)
      </span>
    );
  }

  return (
    <div className="bg-app-surface rounded-xl border border-app-border shadow-card overflow-hidden">
      {/* Table Header */}
      <div className="p-4 sm:p-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-muted/30">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-app-text">{centre.name}</h3>
            {centre.verified && (
              <span className="text-[10px] bg-info text-white font-bold px-1.5 py-0.2 rounded-sm">
                Certified Facility
              </span>
            )}
          </div>
          <p className="text-xs text-app-text-secondary mt-0.5">{centre.address} • 24/7 Transfusion Wing</p>
        </div>

        <div>{freshnessBadge}</div>
      </div>

      {/* Warning banner if stale */}
      {(freshness === 'Stale' || freshness === 'Unknown') && (
        <div className="bg-warning-light border-b border-warning-border p-3 text-xs text-warning-dark flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <span>
            <strong>Availability may be outdated:</strong> Inventory data was last verified over 2 hours ago. Verify actual physical cold-chain stock before clearance.
          </span>
        </div>
      )}

      {/* Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-app-text">
          <thead className="bg-app-muted text-app-text font-bold uppercase tracking-wider text-[11px] border-b border-app-border">
            <tr>
              <th className="py-3 px-4">Blood Group</th>
              <th className="py-3 px-4">Component</th>
              <th className="py-3 px-4">Available Units</th>
              <th className="py-3 px-4">Stock Category</th>
              <th className="py-3 px-4 text-right">Update Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {centreItems.map((item) => {
              const isUnavailable = item.units === 0;
              const isLow = item.units === 1;

              return (
                <tr key={item.id} className="hover:bg-app-muted/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-sm text-brand">{item.bloodGroup}</td>
                  <td className="py-3 px-4 font-medium text-app-text">{item.component}</td>
                  <td className="py-3 px-4 font-bold text-app-text text-sm">
                    {item.units} unit(s)
                  </td>
                  <td className="py-3 px-4">
                    {isUnavailable ? (
                      <span className="text-[10px] font-bold bg-app-muted text-app-text-secondary px-2 py-0.5 rounded border border-app-border">
                        Unavailable (0 Units)
                      </span>
                    ) : isLow ? (
                      <span className="text-[10px] font-bold bg-warning-light text-warning-dark px-2 py-0.5 rounded border border-warning-border">
                        Critical Shortage (1 Unit)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-success-light text-success px-2 py-0.5 rounded border border-success-border">
                        Available Stock ({item.units} Units)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1 bg-app-muted p-1 rounded-lg border border-app-border">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateInventory(centre.id, item.bloodGroup, item.component, Math.max(0, item.units - 1))
                        }
                        className="w-6 h-6 rounded bg-app-surface text-app-text hover:bg-app-border flex items-center justify-center font-bold shadow-xs transition-colors"
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
                        className="w-6 h-6 rounded bg-app-surface text-app-text hover:bg-app-border flex items-center justify-center font-bold shadow-xs transition-colors"
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
