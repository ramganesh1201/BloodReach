import React from 'react';
import { DonorAvailabilityState } from '../../types';
import { Power, Clock, CheckCircle2, AlertCircle, Moon } from 'lucide-react';

interface AvailabilityToggleProps {
  currentState: DonorAvailabilityState;
  updatedAt?: string;
  onSelectState: (state: DonorAvailabilityState) => void;
}

export const AvailabilityToggle: React.FC<AvailabilityToggleProps> = ({
  currentState = 'AVAILABLE',
  updatedAt,
  onSelectState,
}) => {
  const states: { key: DonorAvailabilityState; label: string; desc: string; icon: any }[] = [
    {
      key: 'AVAILABLE',
      label: 'Available',
      desc: 'Active & ready for nearby emergency calls',
      icon: CheckCircle2,
    },
    {
      key: 'TEMPORARILY_UNAVAILABLE',
      label: 'Temporarily Paused',
      desc: 'Busy or traveling. Resumes upon switch',
      icon: Clock,
    },
    {
      key: 'NOT_ACCEPTING',
      label: 'Not Accepting',
      desc: 'Do not dispatch alerts to this device',
      icon: Moon,
    },
  ];

  return (
    <div className="bg-app-surface rounded-xl border border-app-border p-4 shadow-subtle space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                currentState === 'AVAILABLE'
                  ? 'bg-success animate-pulse'
                  : currentState === 'TEMPORARILY_UNAVAILABLE'
                  ? 'bg-warning'
                  : 'bg-app-text-secondary'
              }`}
            />
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              Donor Availability Status: <span className="text-brand capitalize">{currentState.replace(/_/g, ' ').toLowerCase()}</span>
            </h3>
          </div>
          <p className="text-[11px] text-app-text-secondary mt-0.5">
            Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'} • Controls whether multi-channel emergency SMS alerts reach your device.
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {states.map(({ key, label, icon: Icon }) => {
            const isSelected = currentState === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectState(key)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? key === 'AVAILABLE'
                      ? 'bg-success text-white shadow-xs'
                      : key === 'TEMPORARILY_UNAVAILABLE'
                      ? 'bg-warning text-white shadow-xs'
                      : 'bg-app-text text-white shadow-xs'
                    : 'bg-app-muted text-app-text-secondary hover:text-app-text hover:bg-app-border'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
