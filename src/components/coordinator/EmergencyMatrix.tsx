import React, { useState } from 'react';
import { EmergencyRequest } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { Search, Filter, ChevronRight, AlertOctagon } from 'lucide-react';

interface EmergencyMatrixProps {
  requests: EmergencyRequest[];
  onSelectRequest: (request: EmergencyRequest) => void;
  selectedRequestId?: string;
  activeFilterTab?: string;
}

export const EmergencyMatrix: React.FC<EmergencyMatrixProps> = ({
  requests,
  onSelectRequest,
  selectedRequestId,
  activeFilterTab = 'ALL',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('ALL');

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.referenceCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.bloodGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.district && r.district.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesUrgency = filterUrgency === 'ALL' || r.urgency === filterUrgency;

    let matchesTab = true;
    if (activeFilterTab === 'UNASSIGNED') {
      matchesTab = r.unitsCoordinated < r.unitsRequired && r.status !== 'FULFILLED' && r.status !== 'CANCELLED';
    } else if (activeFilterTab === 'AWAITING_ASSIGNMENT') {
      matchesTab = r.status === 'RESPONDER_FOUND';
    } else if (activeFilterTab === 'ESCALATED') {
      matchesTab = r.escalationLevel > 1 && r.status !== 'FULFILLED' && r.status !== 'CANCELLED';
    } else if (activeFilterTab === 'COMPLETED') {
      matchesTab = r.status === 'FULFILLED';
    }

    return matchesSearch && matchesUrgency && matchesTab;
  });

  return (
    <div className="bg-app-surface rounded-xl border border-app-border shadow-card overflow-hidden">
      {/* Controls Bar */}
      <div className="p-4 border-b border-app-border bg-app-muted/30 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Reference, Group, Hospital..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <Search className="w-3.5 h-3.5 text-app-text-secondary absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <label className="text-xs text-app-text-secondary flex items-center gap-1 font-medium">
            <Filter className="w-3.5 h-3.5" />
            Urgency:
          </label>
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface text-app-text font-medium focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="ALL">All Urgencies</option>
            <option value="Critical">Critical</option>
            <option value="Urgent">Urgent</option>
            <option value="Today">Today</option>
          </select>
        </div>
      </div>

      {/* Table Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-app-text">
          <thead className="bg-app-muted text-app-text font-bold uppercase tracking-wider text-[11px] border-b border-app-border">
            <tr>
              <th className="py-3 px-4">Ref Code</th>
              <th className="py-3 px-4">Requirement</th>
              <th className="py-3 px-4">Hospital & District</th>
              <th className="py-3 px-4">Coordinated Units</th>
              <th className="py-3 px-4">Radius Level</th>
              <th className="py-3 px-4">Current Status</th>
              <th className="py-3 px-4 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-app-text-secondary">
                  No matching emergency requests in this view.
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const isSelected = selectedRequestId === req.id;
                const percentCoordinated = Math.min(100, Math.round((req.unitsCoordinated / req.unitsRequired) * 100));

                return (
                  <tr
                    key={req.id}
                    onClick={() => onSelectRequest(req)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-light/70 font-medium' : 'hover:bg-app-muted/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-app-text text-xs">
                      {req.referenceCode}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-brand text-xs">{req.bloodGroup}</span>
                      <span className="text-app-text-secondary ml-1 font-medium">({req.component})</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-app-text truncate max-w-[180px]">
                      <div>{req.hospitalName}</div>
                      <div className="text-[10px] text-app-text-secondary">{req.district || req.city}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-28">
                        <div className="flex justify-between text-[10px] font-semibold text-app-text mb-1">
                          <span>{req.unitsCoordinated} / {req.unitsRequired} U</span>
                          <span>{percentCoordinated}%</span>
                        </div>
                        <div className="w-full bg-app-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-brand h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${percentCoordinated}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-app-text text-white">
                        L{req.escalationLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={req.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ChevronRight className="w-4 h-4 text-app-text-secondary inline-block" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
