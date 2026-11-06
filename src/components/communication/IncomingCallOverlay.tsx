import React from 'react';
import { useBloodStore } from '../../store/useBloodStore';
import {
  Phone,
  PhoneOff,
  Radio,
  ShieldAlert,
  Hospital,
} from 'lucide-react';

export const IncomingCallOverlay: React.FC = () => {
  const {
    incomingCallSession,
    answerCall,
    rejectCall,
    currentRole,
  } = useBloodStore();

  if (!incomingCallSession) return null;

  const callerRole = incomingCallSession.callerRole === 'donor' ? 'Volunteer Donor' : 'Patient Attendant';
  const hospitalName = incomingCallSession.metadata?.hospital_name || 'Hospital Transfusion Desk';
  const referenceCode = incomingCallSession.metadata?.reference_code || 'Emergency';

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-60 animate-bounce-subtle">
      <div className="bg-[#202322] text-white rounded-2xl border border-white/20 p-4 shadow-2xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-[#B42332] flex items-center justify-center font-bold text-lg text-white shadow-md">
                {incomingCallSession.callerName[0] || 'C'}
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#202322] flex items-center justify-center">
                <Radio className="w-2.5 h-2.5 text-white animate-pulse" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">{incomingCallSession.callerName}</h4>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono">
                  #{referenceCode}
                </span>
              </div>
              <p className="text-xs text-white/70">{callerRole}</p>
            </div>
          </div>

          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Urgent
          </span>
        </div>

        <div className="text-xs text-white/80 bg-white/5 rounded-xl p-2 flex items-center gap-2 border border-white/5">
          <Hospital className="w-3.5 h-3.5 text-[#B42332] shrink-0" />
          <span className="truncate">{hospitalName}</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => answerCall(incomingCallSession.id)}
            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <Phone className="w-4 h-4" />
            Accept Call
          </button>
          <button
            type="button"
            onClick={() => rejectCall(incomingCallSession.id, 'Declined by recipient')}
            className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <PhoneOff className="w-4 h-4" />
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

