import React from 'react';
import { EmergencyRequest } from '../../types';
import { Activity, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface KpiOverviewProps {
  requests: EmergencyRequest[];
}

export const KpiOverview: React.FC<KpiOverviewProps> = ({ requests }) => {
  const activeCount = requests.filter((r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED').length;
  const awaitingCount = requests.filter((r) => r.status === 'AWAITING_RESPONSE' || r.status === 'MATCHING_RESPONDERS').length;
  const coordinatingCount = requests.filter((r) => r.status === 'RESPONDER_FOUND' || r.status === 'AWAITING_CENTRE_VERIFICATION' || r.status === 'DONOR_ASSIGNED').length;
  const resolvedCount = requests.filter((r) => r.status === 'FULFILLED').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">
            Active Emergencies
          </span>
          <span className="text-2xl font-bold text-app-text mt-1 block">{activeCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold shrink-0">
          <Activity className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">
            Awaiting Responders
          </span>
          <span className="text-2xl font-bold text-warning-dark mt-1 block">{awaitingCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-warning-light text-warning-dark flex items-center justify-center font-bold shrink-0">
          <Clock className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">
            Coordinating Units
          </span>
          <span className="text-2xl font-bold text-info mt-1 block">{coordinatingCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-info-light text-info flex items-center justify-center font-bold shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">
            Fulfilled Records
          </span>
          <span className="text-2xl font-bold text-success mt-1 block">{resolvedCount}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-success-light text-success flex items-center justify-center font-bold shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
