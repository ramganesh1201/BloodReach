import React from 'react';
import { EmergencyRequest } from '../../types';
import { Activity, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface KpiOverviewProps {
  requests: EmergencyRequest[];
}

export const KpiOverview: React.FC<KpiOverviewProps> = ({ requests }) => {
  const activeCount = requests.filter((r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED').length;
  const awaitingCount = requests.filter((r) => r.status === 'AWAITING_RESPONSE' || r.status === 'MATCHING_RESPONDERS').length;
  const coordinatingCount = requests.filter((r) => r.status === 'RESPONDER_FOUND' || r.status === 'AWAITING_CENTRE_VERIFICATION').length;
  const resolvedCount = requests.filter((r) => r.status === 'FULFILLED').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Active Emergencies
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{activeCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold shrink-0">
          <Activity className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Awaiting Response
          </span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{awaitingCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0">
          <Clock className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Coordinating
          </span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{coordinatingCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Resolved Today
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{resolvedCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
