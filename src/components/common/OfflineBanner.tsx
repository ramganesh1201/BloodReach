import React, { useState, useEffect } from 'react';
import { useBloodStore } from '../../store/useBloodStore';
import { WifiOff, RefreshCw, CheckCircle2, Clock, AlertTriangle, ZapOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOffline, offlineQueue, syncOfflineQueue } = useBloodStore();
  const [isChecking, setIsChecking] = useState(false);
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    // Check for Save-Data header or slow connection
    const nav = navigator as any;
    if (nav.connection) {
      if (nav.connection.saveData || nav.connection.effectiveType === '2g' || nav.connection.effectiveType === 'slow-2g') {
        setIsLowBandwidth(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOffline && offlineQueue.length > 0) {
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, offlineQueue.length]);

  if (!isOffline && offlineQueue.length === 0 && !isLowBandwidth) return null;

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      if (navigator.onLine) {
        await syncOfflineQueue();
      }
    } finally {
      setTimeout(() => {
        setIsChecking(false);
      }, 500);
    }
  };

  return (
    <div
      className={`text-white text-xs py-2 px-4 shadow-sm font-medium z-50 sticky top-0 transition-colors ${
        isOffline ? 'bg-amber-600' : isLowBandwidth ? 'bg-slate-800' : 'bg-success'
      }`}
      role="alert"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isOffline ? (
            <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
          ) : isLowBandwidth ? (
            <ZapOff className="w-4 h-4 shrink-0 text-amber-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200" />
          )}

          <span>
            {isOffline ? (
              <>
                <strong>You're offline.</strong> Your request is saved as a draft and has not been submitted to the emergency responder network.
              </>
            ) : justReconnected ? (
              <>
                <strong>Connection Restored:</strong> Synchronizing {offlineQueue.length} queued action(s) with CareLoop servers...
              </>
            ) : isLowBandwidth ? (
              <>
                <strong>Low-Bandwidth Mode Active:</strong> Non-essential animations paused to prioritize vital emergency telemetry and messaging.
              </>
            ) : (
              <>
                <strong>All actions synchronized:</strong> Emergency dispatch connection is operational.
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {offlineQueue.length > 0 && (
            <span className="bg-black/20 px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border border-white/20">
              <Clock className="w-3 h-3" />
              {offlineQueue.length} Queued Locally
            </span>
          )}

          {isOffline && (
            <button
              type="button"
              onClick={handleManualCheck}
              disabled={isChecking}
              className="bg-black/25 hover:bg-black/40 px-2.5 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 border border-white/20"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Checking...' : 'Check Connection'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
