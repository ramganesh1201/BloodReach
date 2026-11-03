import React from 'react';
import { EmergencyStatus } from '../../types';
import { AlertTriangle, Clock, CheckCircle2, Search, ShieldCheck, XCircle } from 'lucide-react';

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
      text = 'Verifying Request';
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-300';
      Icon = Clock;
      break;
    case 'CHECKING_RESOURCES':
      text = 'Checking Resources';
      colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      Icon = Search;
      break;
    case 'SHORTAGE_IDENTIFIED':
      text = 'Shortage Identified';
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
      Icon = AlertTriangle;
      break;
    case 'MATCHING_RESPONDERS':
    case 'AWAITING_RESPONSE':
      text = 'Awaiting Response';
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
      Icon = Clock;
      break;
    case 'RESPONDER_FOUND':
      text = 'Responder Found';
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-300';
      Icon = CheckCircle2;
      break;
    case 'AWAITING_CENTRE_VERIFICATION':
      text = 'Centre Verification Pending';
      colorClasses = 'bg-blue-50 text-blue-800 border-blue-300';
      Icon = ShieldCheck;
      break;
    case 'FULFILLED':
      text = 'Request Fulfilled';
      colorClasses = 'bg-emerald-100 text-emerald-900 border-emerald-400 font-semibold';
      Icon = CheckCircle2;
      break;
    case 'CANCELLED':
    case 'EXPIRED':
      text = status === 'CANCELLED' ? 'Request Cancelled' : 'Expired';
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
      Icon = XCircle;
      break;
    default:
      text = status;
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-300';
      Icon = Clock;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs md:text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-medium px-3 py-1.5 gap-2',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-md border ${colorClasses} ${sizeClasses}`}
      role="status"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};
