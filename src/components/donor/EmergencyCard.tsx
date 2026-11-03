import React from 'react';
import { EmergencyRequest } from '../../types';
import { MapPin, Building, ShieldCheck, CheckCircle2, XCircle, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

interface EmergencyCardProps {
  request: EmergencyRequest;
  approxDistanceKm?: number;
  hasResponded?: 'ACCEPTED' | 'DECLINED';
  isAssigned?: boolean;
  onRespond: (status: 'ACCEPTED' | 'DECLINED') => void;
}

export const EmergencyCard: React.FC<EmergencyCardProps> = ({
  request,
  approxDistanceKm = 3.2,
  hasResponded,
  isAssigned = false,
  onRespond,
}) => {
  return (
    <div className="bg-app-surface rounded-xl border border-app-border p-5 shadow-card space-y-4 hover:border-brand/30 transition-all">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-brand tracking-tight">{request.bloodGroup}</span>
            <span className="text-xs bg-brand-light text-brand font-bold px-2 py-0.5 rounded-md border border-brand/20">
              {request.component}
            </span>
            <span className="text-xs bg-app-muted text-app-text font-bold px-2 py-0.5 rounded-md border border-app-border">
              {request.unitsRequired} Unit(s) Needed
            </span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${request.urgency === 'Critical' ? 'bg-emergency-light text-emergency font-black' : 'bg-warning-light text-warning-dark'
              }`}>
              {request.urgency}
            </span>
          </div>
          <p className="text-xs text-app-text-secondary font-mono mt-1">
            Reference: <strong>{request.referenceCode}</strong> • Verification: Source-Verified Hospital
          </p>
        </div>

        <span className="text-xs bg-warning-light text-warning-dark border border-warning-border px-2.5 py-1 rounded-full font-bold shrink-0">
          ~{approxDistanceKm.toFixed(1)} km away
        </span>
      </div>

      {/* Hospital, District, & Timing */}
      <div className="space-y-1.5 text-xs text-app-text border-t border-b border-app-border py-3">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-app-text-secondary shrink-0" />
          <span className="font-bold text-app-text">{request.hospitalName}</span>
          <span className="text-[11px] text-app-text-secondary">({request.district || request.city} District)</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-app-text-secondary shrink-0" />
          <span className="text-app-text-secondary">{request.hospitalAddress}</span>
        </div>
        <div className="flex items-center gap-2 text-app-text-secondary pt-0.5">
          <Calendar className="w-4 h-4 text-app-text-secondary shrink-0" />
          <span>
            Required Date: <strong>{request.requiredDateTime ? new Date(request.requiredDateTime).toLocaleString() : 'Immediate emergency dispatch (< 2 hours)'}</strong>
          </span>
        </div>
      </div>

      {/* Clinical Compatibility Explanation */}
      <div className="bg-app-muted/50 p-3 rounded-lg text-[11px] text-app-text-secondary space-y-1 border border-app-border">
        <div className="flex items-center gap-1.5 text-app-text font-bold text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span>Why you match this request:</span>
        </div>
        <p className="leading-relaxed">
          Compatible for {request.bloodGroup} {request.component} • Proximity (~{approxDistanceKm.toFixed(1)} km) within active Level {request.escalationLevel} search radius • Medically eligible with no active deferral period.
        </p>
      </div>

      {/* Response Action or Confirmed Status */}
      {isAssigned ? (
        <div className="p-3.5 rounded-lg text-xs bg-success-light border border-success-border text-success-dark space-y-1">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>Formally Assigned by Coordinator</span>
            </span>
            <span className="text-[10px] uppercase font-mono bg-success/10 text-success px-2 py-0.5 rounded">Active Assignment</span>
          </div>
          <p className="text-[11px] text-app-text leading-relaxed">
            Please report to <strong>{request.hospitalName}</strong> Transfusion Center. Quote reference <strong>{request.referenceCode}</strong> upon arrival. Carry a government photo ID.
          </p>
        </div>
      ) : hasResponded ? (
        <div className={`p-3.5 rounded-lg text-xs font-semibold flex flex-col gap-1 border ${hasResponded === 'ACCEPTED'
          ? 'bg-success-light/60 text-success-dark border-success-border'
          : 'bg-app-muted text-app-text-secondary border-app-border'
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasResponded === 'ACCEPTED' ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-app-text-secondary" />
              )}
              <span className="font-bold text-app-text">
                {hasResponded === 'ACCEPTED'
                  ? 'Response Confirmed: Available to Donate'
                  : 'Response Recorded: Marked Unavailable'}
              </span>
            </div>
            <span className="text-[10px] text-app-text-secondary font-mono">Recorded</span>
          </div>
          {hasResponded === 'ACCEPTED' && (
            <p className="text-[11px] text-app-text-secondary mt-0.5">
              Your availability has been dispatched to the clinical coordinator. Final assignment confirmation is pending coordinator review to prevent over-assignment.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => onRespond('DECLINED')}
            className="w-full py-2.5 px-4 rounded-lg border border-app-border text-app-text font-bold text-xs hover:bg-app-muted transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => onRespond('ACCEPTED')}
            className="w-full py-2.5 px-4 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Accept Call</span>
          </button>
        </div>
      )}
    </div>
  );
};
