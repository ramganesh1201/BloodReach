import React from 'react';
import { Power } from 'lucide-react';

interface AvailabilityToggleProps {
  isAvailable: boolean;
  onToggle: () => void;
}

export const AvailabilityToggle: React.FC<AvailabilityToggleProps> = ({ isAvailable, onToggle }) => {
  return (
    <div className={`p-4 rounded-xl border transition-colors flex items-center justify-between ${
      isAvailable ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-100 border-slate-300'
    }`}>
      <div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
          <span className="text-sm font-bold text-slate-900">
            {isAvailable ? 'Available for Emergency Dispatch' : 'Currently Unavailable'}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-0.5">
          {isAvailable
            ? 'You may receive urgent SMS & web alerts when matching blood is needed nearby.'
            : 'You will not receive emergency alerts until you toggle availability back on.'}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
          isAvailable
            ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
            : 'bg-slate-800 hover:bg-slate-900 text-white'
        }`}
      >
        <Power className="w-3.5 h-3.5" />
        {isAvailable ? 'Active' : 'Set Available'}
      </button>
    </div>
  );
};
