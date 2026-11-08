import React from 'react';
import { EmergencyRequest } from '../../types';
import { StatCard } from '../common/StatCard';
import { Activity, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface KpiOverviewProps {
  requests: EmergencyRequest[];
}

export const KpiOverview: React.FC<KpiOverviewProps> = ({ requests }) => {
  const activeCount = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  ).length;
  const awaitingCount = requests.filter(
    (r) => r.status === 'AWAITING_RESPONSE' || r.status === 'MATCHING_RESPONDERS'
  ).length;
  const coordinatingCount = requests.filter(
    (r) =>
      r.status === 'RESPONDER_FOUND' ||
      r.status === 'AWAITING_CENTRE_VERIFICATION' ||
      r.status === 'DONOR_ASSIGNED' ||
      r.status === 'COORDINATION_IN_PROGRESS'
  ).length;
  const resolvedCount = requests.filter((r) => r.status === 'FULFILLED').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Active Emergencies"
        value={activeCount}
        subtext={activeCount > 0 ? 'Urgent calls under management' : 'No active alerts'}
        icon={Activity}
        variant={activeCount > 0 ? 'emergency' : 'neutral'}
      />
      <StatCard
        label="Awaiting Responders"
        value={awaitingCount}
        subtext={awaitingCount > 0 ? 'Dispatch broadcasts active' : 'All matched'}
        icon={Clock}
        variant={awaitingCount > 0 ? 'warning' : 'neutral'}
      />
      <StatCard
        label="In Coordination"
        value={coordinatingCount}
        subtext="Donors en-route / cross-matching"
        icon={AlertTriangle}
        variant={coordinatingCount > 0 ? 'info' : 'neutral'}
      />
      <StatCard
        label="Fulfilled Transfusions"
        value={resolvedCount}
        subtext="Completed clinical transfers"
        icon={CheckCircle2}
        variant="success"
      />
    </div>
  );
};
