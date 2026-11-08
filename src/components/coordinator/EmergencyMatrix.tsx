import React, { useState } from 'react';
import { EmergencyRequest } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { Search, Filter, ChevronRight } from 'lucide-react';

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
      (r.district && r.district.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.city.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesUrgency = filterUrgency === 'ALL' || r.urgency === filterUrgency;

    let matchesTab = true;
    if (activeFilterTab === 'UNASSIGNED') {
      matchesTab =
        r.unitsCoordinated < r.unitsRequired &&
        r.status !== 'FULFILLED' &&
        r.status !== 'CANCELLED' &&
        r.status !== 'EXPIRED';
    } else if (activeFilterTab === 'AWAITING_ASSIGNMENT') {
      matchesTab = r.status === 'RESPONDER_FOUND' || r.status === 'AWAITING_CENTRE_VERIFICATION';
    } else if (activeFilterTab === 'ESCALATED') {
      matchesTab =
        r.escalationLevel > 1 &&
        r.status !== 'FULFILLED' &&
        r.status !== 'CANCELLED' &&
        r.status !== 'EXPIRED';
    } else if (activeFilterTab === 'COMPLETED') {
      matchesTab = r.status === 'FULFILLED';
    }

    return matchesSearch && matchesUrgency && matchesTab;
  });

  return (
    <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden">
      {/* Controls Bar */}
      <div className="p-3.5 sm:p-4 border-b border-app-border bg-app-muted/30 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Reference, Group, Hospital..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text placeholder:text-app-text-secondary focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-app-text-secondary absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <label htmlFor="urgency-filter" className="text-xs text-app-text-secondary flex items-center gap-1 font-semibold whitespace-nowrap">
            <Filter className="w-3.5 h-3.5" />
            <span>Urgency:</span>
          </label>
          <select
            id="urgency-filter"
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface text-app-text font-semibold focus:outline-none focus:ring-1 focus:ring-brand"
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
          <thead className="bg-app-muted/70 text-app-text-secondary font-bold uppercase tracking-wider text-[11px] border-b border-app-border">
            <tr>
              <th scope="col" className="py-3 px-4 font-semibold">Ref Code</th>
              <th scope="col" className="py-3 px-4 font-semibold">Requirement</th>
              <th scope="col" className="py-3 px-4 font-semibold">Hospital & Facility</th>
              <th scope="col" className="py-3 px-4 font-semibold">Coordinated Units</th>
              <th scope="col" className="py-3 px-4 font-semibold">Level</th>
              <th scope="col" className="py-3 px-4 font-semibold">Current Status</th>
              <th scope="col" className="py-3 px-4 text-right font-semibold">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-app-text-secondary">
                  No matching emergency requests in this view filter.
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const isSelected = selectedRequestId === req.id;
                const percentCoordinated = Math.min(
                  100,
                  Math.round((req.unitsCoordinated / (req.unitsRequired || 1)) * 100)
                );

                return (
                  <tr
                    key={req.id}
                    onClick={() => onSelectRequest(req)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-brand-light/60 font-medium'
                        : 'hover:bg-app-muted/40'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-app-text text-xs whitespace-nowrap">
                      {req.referenceCode}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-extrabold text-brand text-sm font-display">{req.bloodGroup}</span>
                      <span className="text-app-text-secondary ml-1 font-medium text-[11px]">
                        ({req.component})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-app-text truncate max-w-[190px]">
                      <div className="font-semibold truncate">{req.hospitalName}</div>
                      <div className="text-[11px] text-app-text-secondary truncate">
                        {req.district || req.city}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-app-text">
                          <span>{req.unitsCoordinated} / {req.unitsRequired} U</span>
                          <span className="text-success">{percentCoordinated}%</span>
                        </div>
                        <div className="w-full bg-app-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-brand h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${percentCoordinated}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-app-text text-white">
                        L{req.escalationLevel}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={req.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
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
