import React, { useState } from 'react';
import { EmergencyRequest } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { Search, Filter, ChevronRight, AlertOctagon } from 'lucide-react';

interface EmergencyMatrixProps {
  requests: EmergencyRequest[];
  onSelectRequest: (request: EmergencyRequest) => void;
  selectedRequestId?: string;
}

export const EmergencyMatrix: React.FC<EmergencyMatrixProps> = ({
  requests,
  onSelectRequest,
  selectedRequestId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('ALL');

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.referenceCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.bloodGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.hospitalName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesUrgency = filterUrgency === 'ALL' || r.urgency === filterUrgency;

    return matchesSearch && matchesUrgency;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      {/* Controls Bar */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter Ref ID, Group, Hospital..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <label className="text-xs text-slate-500 flex items-center gap-1 font-medium">
            <Filter className="w-3.5 h-3.5" />
            Urgency:
          </label>
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-red-600"
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
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-100 text-slate-900 uppercase tracking-wider font-semibold border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Ref ID</th>
              <th className="py-3 px-4">Requirement</th>
              <th className="py-3 px-4">Hospital</th>
              <th className="py-3 px-4">Coordinated</th>
              <th className="py-3 px-4">Level</th>
              <th className="py-3 px-4">Current Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredRequests.map((req) => {
              const isSelected = selectedRequestId === req.id;
              const percentCoordinated = Math.min(100, Math.round((req.unitsCoordinated / req.unitsRequired) * 100));

              return (
                <tr
                  key={req.id}
                  onClick={() => onSelectRequest(req)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-red-50/70 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                    {req.referenceCode}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-extrabold text-red-600 text-sm">{req.bloodGroup}</span>
                    <span className="text-slate-500 ml-1 font-medium">({req.component})</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800 truncate max-w-[180px]">
                    {req.hospitalName}
                  </td>
                  <td className="py-3 px-4">
                    <div className="w-32">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-800 mb-1">
                        <span>{req.unitsCoordinated} / {req.unitsRequired} Units</span>
                        <span>{percentCoordinated}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-red-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${percentCoordinated}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white">
                      L{req.escalationLevel}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={req.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRequest(req);
                      }}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
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
