import React from 'react';
import { LocationDetails } from '../../types/location';
import { Building2, MapPin, CheckCircle2, Edit3, Navigation } from 'lucide-react';

interface LocationSummaryCardProps {
  location: {
    hospitalName: string;
    hospitalAddress: string;
    city: string;
    district?: string;
    state?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    source?: string;
  };
  onChangeHospital: () => void;
  onEditDetails: () => void;
}

export const LocationSummaryCard: React.FC<LocationSummaryCardProps> = ({
  location,
  onChangeHospital,
  onEditDetails,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Location Selected
              </span>
              {location.source && (
                <span className="text-[10px] text-slate-400 font-mono">({location.source})</span>
              )}
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mt-0.5">{location.hospitalName}</h3>
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeHospital}
          className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline shrink-0"
        >
          Change hospital
        </button>
      </div>

      <div className="space-y-2 text-xs text-slate-700">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">
            {location.hospitalAddress}
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-500 pl-6 text-[11px]">
          <span>City: <strong className="text-slate-900">{location.city}</strong></span>
          {location.state && <span>State: <strong className="text-slate-900">{location.state}</strong></span>}
          {location.postalCode && <span>PIN: <strong className="font-mono text-slate-900">{location.postalCode}</strong></span>}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        {location.latitude && location.longitude ? (
          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
            <Navigation className="w-3 h-3 text-emerald-600" />
            Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Structured location saved</span>
        )}

        <button
          type="button"
          onClick={onEditDetails}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          <Edit3 className="w-3.5 h-3.5" /> Edit details
        </button>
      </div>
    </div>
  );
};
