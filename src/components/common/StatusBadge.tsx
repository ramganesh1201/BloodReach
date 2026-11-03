import React from 'react';
import { EmergencyStatus } from '../../types';
import { AlertTriangle, Clock, CheckCircle2, Search, ShieldCheck, XCircle, UserCheck, Activity } from 'lucide-react';

interface StatusBadgeProps {
  status: EmergencyStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let text = '';
  let colorClasses = '';
  let Icon = Clock;

  switch (status) {
    case 'CREATED':
    case 'VERIFYING':
      text = '1. Request Submitted';
      colorClasses = 'bg-app-muted text-app-text-secondary border-app-border font-medium';
      Icon = Clock;
      break;
    case 'CHECKING_RESOURCES':
      text = '2. Checking Depository';
      colorClasses = 'bg-info-light text-info border-info-border font-semibold';
      Icon = Search;
      break;
    case 'SHORTAGE_IDENTIFIED':
      text = '3. Shortage Identified';
      colorClasses = 'bg-warning-light text-warning border-warning-border font-bold';
      Icon = AlertTriangle;
      break;
    case 'MATCHING_RESPONDERS':
    case 'AWAITING_RESPONSE':
      text = '4. Awaiting Donor Response';
      colorClasses = 'bg-warning-light text-warning border-warning-border font-bold';
      Icon = Clock;
      break;
    case 'RESPONDER_FOUND':
      text = '5. Donor Accepted';
      colorClasses = 'bg-success-light text-success border-success-border font-bold';
      Icon = CheckCircle2;
      break;
    case 'COORDINATION_IN_PROGRESS':
      text = '6. Coordination Active';
      colorClasses = 'bg-info-light text-info border-info-border font-bold';
      Icon = Activity;
      break;
    case 'DONOR_ASSIGNED':
      text = '7. Donor Assigned';
      colorClasses = 'bg-brand-light text-brand border-brand/30 font-bold';
      Icon = UserCheck;
      break;
    case 'AWAITING_CENTRE_VERIFICATION':
      text = '8. Awaiting Centre Clearance';
      colorClasses = 'bg-info-light text-info border-info-border font-bold';
      Icon = ShieldCheck;
      break;
    case 'FULFILLED':
      text = '9. Fulfilled & Issued';
      colorClasses = 'bg-success-light text-success border-success-border font-bold';
      Icon = CheckCircle2;
      break;
    case 'CANCELLED':
    case 'EXPIRED':
      text = status === 'CANCELLED' ? 'Cancelled' : 'Expired';
      colorClasses = 'bg-app-muted text-app-text-secondary border-app-border font-medium';
      Icon = XCircle;
      break;
    default:
      text = status;
      colorClasses = 'bg-app-muted text-app-text border-app-border';
      Icon = Clock;
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 rounded-sm',
    md: 'text-xs px-2.5 py-1 gap-1.5 rounded-md',
    lg: 'text-xs md:text-sm px-3 py-1.5 gap-2 rounded-lg',
  }[size];

  return (
    <span
      className={`inline-flex items-center border ${colorClasses} ${sizeClasses}`}
      role="status"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};
