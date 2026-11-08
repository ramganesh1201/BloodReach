import React from 'react';
import { BloodInventoryItem, BloodCentre, BloodGroup, BloodComponent } from '../../types';
import { getFreshnessStatus } from '../../store/useBloodStore';
import { Clock, AlertTriangle, ShieldCheck, Plus, Minus, Database } from 'lucide-react';

interface InventoryTableProps {
  centre: BloodCentre;
  inventory: BloodInventoryItem[];
  onUpdateInventory: (centreId: string, group: BloodGroup, comp: BloodComponent, newUnits: number) => void;
  isLiveSync?: boolean;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  centre,
  inventory,
  onUpdateInventory,
  isLiveSync = false,
}) => {
  const freshness = getFreshnessStatus(centre.inventoryUpdatedAt);
  const diffMins = Math.max(
    0,
    Math.floor((Date.now() - new Date(centre.inventoryUpdatedAt).getTime()) / (1000 * 60))
  );

  const centreItems = inventory.filter((item) => item.bloodCentreId === centre.id);

  let freshnessBadge = (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-success-light text-success border border-success-border font-semibold">
      <ShieldCheck className="w-3.5 h-3.5" />
      <span>Verified Fresh ({diffMins}m ago)</span>
    </span>
  );

  if (freshness === 'Aging') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-warning-light text-warning-dark border border-warning-border font-semibold">
        <Clock className="w-3.5 h-3.5" />
        <span>Aging ({diffMins}m ago)</span>
      </span>
    );
  } else if (freshness === 'Stale' || freshness === 'Unknown') {
    freshnessBadge = (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emergency-light text-emergency border border-emergency-border font-semibold">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Outdated ({Math.floor(diffMins / 60)}h ago)</span>
      </span>
    );
  }

  return (
    <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden">
      {/* Table Header Banner */}
      <div className="p-4 sm:p-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-muted/30">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-app-text font-display">{centre.name}</h3>
            {centre.verified && (
              <span className="text-[10px] bg-info text-white font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
                Certified Facility
              </span>
            )}
          </div>
          <p className="text-xs text-app-text-secondary">
            {centre.address} • Cold-chain compliant storage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLiveSync ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success-light px-2.5 py-1 rounded-full border border-success-border">
              <Database className="w-3 h-3" />
              <span>Database Sync Active</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-text-secondary bg-app-muted px-2.5 py-1 rounded-full border border-app-border">
              <Database className="w-3 h-3" />
              <span>Local Preview Mode</span>
            </span>
          )}
          {freshnessBadge}
        </div>
      </div>

      {/* Warning banner if stale */}
      {(freshness === 'Stale' || freshness === 'Unknown') && (
        <div className="bg-warning-light border-b border-warning-border p-3 text-xs text-warning-dark flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <span>
            <strong>Availability verification required:</strong> Physical inventory data was last confirmed over 2 hours ago. Cross-verify physical storage before issuing clearance.
          </span>
        </div>
      )}

      {/* Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-app-text">
          <thead className="bg-app-muted/70 text-app-text-secondary font-bold uppercase tracking-wider text-[11px] border-b border-app-border">
            <tr>
              <th scope="col" className="py-3 px-4 font-semibold">Blood Group</th>
              <th scope="col" className="py-3 px-4 font-semibold">Component</th>
              <th scope="col" className="py-3 px-4 font-semibold">Units In Reserve</th>
              <th scope="col" className="py-3 px-4 font-semibold">Stock Status</th>
              <th scope="col" className="py-3 px-4 text-right font-semibold">Adjust Reserve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {centreItems.map((item) => {
              const isUnavailable = item.units === 0;
              const isLow = item.units === 1;

              return (
                <tr key={item.id} className="hover:bg-app-muted/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-base text-brand font-display">
                    {item.bloodGroup}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-app-text">
                    {item.component}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-app-text text-sm">
                    {item.units} <span className="text-app-text-secondary font-normal text-xs">U</span>
                  </td>
                  <td className="py-3.5 px-4">
                    {isUnavailable ? (
                      <span className="inline-flex items-center text-[11px] font-semibold bg-app-muted text-app-text-secondary px-2.5 py-0.5 rounded border border-app-border">
                        Depleted (0 Units)
                      </span>
                    ) : isLow ? (
                      <span className="inline-flex items-center text-[11px] font-semibold bg-warning-light text-warning-dark px-2.5 py-0.5 rounded border border-warning-border">
                        Critical Shortage (1 Unit)
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[11px] font-semibold bg-success-light text-success px-2.5 py-0.5 rounded border border-success-border">
                        Available ({item.units} Units)
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5 bg-app-muted p-1 rounded-lg border border-app-border">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateInventory(
                            centre.id,
                            item.bloodGroup,
                            item.component,
                            Math.max(0, item.units - 1)
                          )
                        }
                        className="w-7 h-7 rounded bg-app-surface text-app-text hover:bg-app-border flex items-center justify-center font-bold shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand"
                        aria-label={`Decrease ${item.bloodGroup} ${item.component} stock`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs font-mono">{item.units}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateInventory(
                            centre.id,
                            item.bloodGroup,
                            item.component,
                            item.units + 1
                          )
                        }
                        className="w-7 h-7 rounded bg-app-surface text-app-text hover:bg-app-border flex items-center justify-center font-bold shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand"
                        aria-label={`Increase ${item.bloodGroup} ${item.component} stock`}
                      >
                        <Plus className="w-3.5 h-3.5" />
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
