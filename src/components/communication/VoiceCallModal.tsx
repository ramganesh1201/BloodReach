import React, { useState, useEffect } from 'react';
import { CallSession, UserRole } from '../../types';
import { webRtcService } from '../../services/webRtcService';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  X,
  Volume2,
  ExternalLink,
} from 'lucide-react';

interface VoiceCallModalProps {
  session: CallSession | null;
  isOpen: boolean;
  currentRole: UserRole;
  onAnswer: (sessionId: string) => void;
  onReject: (sessionId: string) => void;
  onEnd: (sessionId: string) => void;
  onClose: () => void;
  fallbackPhoneNumber?: string;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  session,
  isOpen,
  currentRole,
  onAnswer,
  onReject,
  onEnd,
  onClose,
  fallbackPhoneNumber = '+91 98490 55123',
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    let timer: any;
    if (session?.status === 'CONNECTED') {
      timer = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => clearInterval(timer);
  }, [session?.status]);

  if (!isOpen || !session) return null;

  const handleToggleMute = () => {
    const muted = webRtcService.toggleMute();
    setIsMuted(muted);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isIncoming = session.receiverId === currentRole && (session.status === 'INITIATING' || session.status === 'RINGING');
  const otherPartyName = currentRole === 'donor' ? session.callerName : session.receiverName;
  const otherPartyRole = currentRole === 'donor' ? 'Patient Attendant' : 'Volunteer Donor';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-[#202322] text-white rounded-3xl border border-white/10 max-w-sm w-full p-6 shadow-2xl relative space-y-6 text-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Security Stamp */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] text-white/80">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted WebRTC Audio Channel</span>
        </div>

        {/* Avatar & Calling Animation */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          {session.status === 'CONNECTED' ? (
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse">
              <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-2xl text-white">
                {otherPartyName[0] || 'C'}
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#B42332]/30 animate-ping" />
              <div className="w-24 h-24 rounded-full bg-[#8F1928] border-2 border-rose-400 flex items-center justify-center font-bold text-2xl text-white relative z-10 shadow-lg">
                {otherPartyName[0] || 'C'}
              </div>
            </div>
          )}
        </div>

        {/* Participant Details */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white">{otherPartyName}</h3>
          <p className="text-xs text-white/70">{otherPartyRole}</p>

          <div className="pt-2">
            {session.status === 'CONNECTED' ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {formatTimer(callSeconds)}
              </div>
            ) : (
              <p className="text-xs text-amber-300 font-medium flex items-center justify-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                Calling emergency responder...
              </p>
            )}
          </div>
        </div>

        {/* Call Controls */}
        <div className="flex items-center justify-center gap-4 pt-2">
          {session.status === 'CONNECTED' && (
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-4 rounded-full border transition-all ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {isIncoming ? (
            <>
              <button
                type="button"
                onClick={() => onAnswer(session.id)}
                className="p-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
              >
                <Phone className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => onReject(session.id)}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onEnd(session.id)}
              className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all hover:scale-105"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Stage 1 Native Phone Dialer Fallback Option */}
        <div className="pt-4 border-t border-white/10 space-y-2">
          <p className="text-[11px] text-white/60">Having audio or connection issues?</p>
          <a
            href={`tel:${fallbackPhoneNumber}`}
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            Switch to Direct Phone Dialer ({fallbackPhoneNumber})
            <ExternalLink className="w-3 h-3 ml-1 text-white/60" />
          </a>
        </div>
      </div>
    </div>
  );
};

