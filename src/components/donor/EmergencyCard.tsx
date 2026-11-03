import React from 'react';
import { EmergencyRequest } from '../../types';
import { MapPin, Building, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';

interface EmergencyCardProps {
  request: EmergencyRequest;
  approxDistanceKm?: number;
  hasResponded?: 'ACCEPTED' | 'DECLINED';
  onRespond: (status: 'ACCEPTED' | 'DECLINED') => void;
}

export const EmergencyCard: React.FC<EmergencyCardProps> = ({
  request,
  approxDistanceKm = 3.2,
  hasResponded,
  onRespond,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-card space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-red-600 tracking-tight">{request.bloodGroup}</span>
            <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded">
              {request.component}
            </span>
            <span className="text-xs bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded">
              {request.unitsRequired} Unit(s) Needed
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">Ref: {request.referenceCode}</p>
        </div>

        <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full font-semibold">
          ~{approxDistanceKm.toFixed(1)} km away
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-slate-700 border-t border-b border-slate-100 py-3">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-900">{request.hospitalName}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-slate-600">{request.hospitalAddress}</span>
        </div>
      </div>

      <div className="bg-slate-50 p-3 rounded-lg text-[11px] text-slate-600 flex items-start gap-2 border border-slate-200">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <span>
          <strong>Medical Safety Notice:</strong> BloodReach coordinates initial response. Final donor eligibility and blood compatibility testing will be performed at the blood centre.
        </span>
      </div>

      {hasResponded ? (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
          hasResponded === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            {hasResponded === 'ACCEPTED' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-500" />}
            <span>{hasResponded === 'ACCEPTED' ? 'Response Submitted: You indicated you can help.' : 'Response Submitted: Unavailable.'}</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Recorded</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => onRespond('DECLINED')}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
          >
            Can't Help
          </button>
          <button
            type="button"
            onClick={() => onRespond('ACCEPTED')}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Can Help
          </button>
        </div>
      )}
    </div>
  );
};
