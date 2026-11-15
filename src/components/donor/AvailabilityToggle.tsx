import React, { useState, useEffect } from 'react';
import { DonorAvailabilityState } from '../../types';
import { Clock, CheckCircle2, AlertCircle, Moon, BellRing } from 'lucide-react';
import { fcmService } from '../../services/fcmService';

interface AvailabilityToggleProps {
  currentState: DonorAvailabilityState;
  updatedAt?: string;
  onSelectState: (state: DonorAvailabilityState) => void;
  userId?: string;
}

export const AvailabilityToggle: React.FC<AvailabilityToggleProps> = ({
  currentState = 'AVAILABLE',
  updatedAt,
  onSelectState,
  userId,
}) => {
  const [pushState, setPushState] = useState(fcmService.getState());

  useEffect(() => {
    const unsub = fcmService.subscribeToPushState((s) => setPushState(s));
    return unsub;
  }, []);

  const handleEnablePush = async () => {
    await fcmService.requestPermissionAndGetToken(userId);
  };

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

      {/* Push Notification Device Status & Quick Activation */}
      {pushState.isSupported && currentState === 'AVAILABLE' && (
        <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="text-app-text-secondary">Browser Push Alerts:</span>
            {pushState.permission === 'granted' ? (
              <span className="inline-flex items-center gap-1 text-success font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Active & Registered
              </span>
            ) : pushState.permission === 'denied' ? (
              <span className="inline-flex items-center gap-1 text-app-text-secondary font-medium">
                <AlertCircle className="w-3 h-3 text-warning" /> Blocked in browser settings
              </span>
            ) : (
              <span className="text-app-text-secondary font-medium">Not enabled on this device</span>
            )}
          </div>

          {pushState.permission !== 'granted' && pushState.permission !== 'denied' && (
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushState.loading}
              className="px-2.5 py-1 text-[10px] font-bold text-white bg-brand hover:bg-brand-dark rounded-md transition-colors shadow-2xs self-start sm:self-auto disabled:opacity-50"
            >
              {pushState.loading ? 'Activating...' : 'Enable Push Alerts'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
