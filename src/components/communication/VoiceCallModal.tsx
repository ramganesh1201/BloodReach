import React, { useState, useEffect } from 'react';
import { CallSession, UserRole } from '../../types';
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
  AlertTriangle,
  RefreshCw,
  Speaker,
} from 'lucide-react';

interface VoiceCallModalProps {
  session: CallSession | null;
  isOpen: boolean;
  currentRole: UserRole;
  audioLevel?: number; // 0 to 100
  connectionState?: 'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
  isMuted?: boolean;
  callError?: string | null;
  onToggleMute?: () => void;
  onAnswer: (sessionId: string) => void;
  onReject: (sessionId: string, reason?: string) => void;
  onCancel?: (sessionId: string, reason?: string) => void;
  onEnd: (sessionId: string, reason?: string) => void;
  onClose: () => void;
  onSetAudioOutputSink?: (sinkId: string) => Promise<boolean>;
  fallbackPhoneNumber?: string;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  session,
  isOpen,
  currentRole,
  audioLevel = 0,
  connectionState = 'new',
  isMuted = false,
  callError = null,
  onToggleMute,
  onAnswer,
  onReject,
  onCancel,
  onEnd,
  onClose,
  onSetAudioOutputSink,
  fallbackPhoneNumber = '+91 98490 55123',
}) => {
  const [callSeconds, setCallSeconds] = useState(0);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>('default');

  // Enumerate audio output devices where supported
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioOutputs(outputs);
      }).catch(() => {});
    }
  }, []);

  // Precise connection timer: strictly measures elapsed seconds since connectedAt
  useEffect(() => {
    let timer: any;
    if (session?.status === 'CONNECTED' && session.connectedAt) {
      const calcElapsed = () => {
        const started = new Date(session.connectedAt!).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - started) / 1000));
        setCallSeconds(diff);
      };
      calcElapsed();
      timer = setInterval(calcElapsed, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => clearInterval(timer);
  }, [session?.status, session?.connectedAt]);

  if (!isOpen || !session) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isIncoming = session.receiverId === currentRole && (session.status === 'INITIATING' || session.status === 'RINGING');
  const otherPartyName = currentRole === 'donor' ? session.callerName : session.receiverName;
  const otherPartyRole = currentRole === 'donor' ? 'Patient Attendant' : 'Volunteer Donor';
  const isConnected = session.status === 'CONNECTED';
  const isRinging = session.status === 'RINGING' || session.status === 'INITIATING';

  const handleOutputChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sinkId = e.target.value;
    setSelectedOutput(sinkId);
    if (onSetAudioOutputSink) {
      await onSetAudioOutputSink(sinkId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] z-50 animate-fade-in">
      <div className="bg-[#202322] text-white rounded-3xl border border-white/10 max-w-sm w-full p-6 shadow-2xl relative space-y-6 text-center max-h-[calc(100dvh-2rem)] overflow-y-auto">
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
          <span>CareLoop Peer-to-Peer Voice Encryption</span>
        </div>

        {/* Error Alert Display */}
        {callError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs text-left space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Audio Access Required</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-100/90">{callError}</p>
            <div className="text-[10px] text-rose-200/80 pt-1 border-t border-rose-500/20">
              Tip: Click the padlock icon in your browser address bar to allow microphone access.
            </div>
          </div>
        )}

        {/* Missing TURN / NAT Traversal Failure State */}
        {connectionState === 'failed' && (
          <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs text-left space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Peer Connection Blocked (NAT / Firewall)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-100/90">
              Direct peer-to-peer route could not be established across network boundaries. TURN relay server is not configured in this environment.
            </p>
            <div className="text-[10px] text-amber-200/80 pt-1 border-t border-amber-500/20">
              Please use the Direct Phone Dialer below to connect immediately.
            </div>
          </div>
        )}

        {/* Avatar & Dynamic Status Waves */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          {isConnected ? (
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full bg-emerald-500/30 transition-transform duration-100"
                style={{
                  transform: `scale(${1 + (audioLevel / 100) * 0.4})`,
                }}
              />
              <div className="w-24 h-24 rounded-full bg-emerald-600 border-2 border-emerald-400 flex items-center justify-center font-bold text-2xl text-white relative z-10 shadow-lg">
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
            {isConnected ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {formatTimer(callSeconds)}
                </div>

                {/* Real-time Audio Level Waveform (5 bars responding to real voice) */}
                <div className="flex items-center justify-center gap-1.5 h-6 pt-1">
                  {[0.4, 0.7, 1.0, 0.8, 0.5].map((multiplier, idx) => {
                    const barHeight = Math.max(4, Math.min(24, Math.round((audioLevel * multiplier) / 4)));
                    return (
                      <div
                        key={idx}
                        className="w-1.5 bg-emerald-400 rounded-full transition-all duration-75"
                        style={{ height: `${barHeight}px` }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : isRinging ? (
              <p className="text-xs text-amber-300 font-medium flex items-center justify-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                {isIncoming ? 'Incoming emergency voice call...' : 'Calling emergency responder...'}
              </p>
            ) : session.status === 'TIMEOUT' ? (
              <p className="text-xs text-rose-300 font-medium">Missed call / No answer</p>
            ) : (
              <p className="text-xs text-zinc-400">Call {session.status.toLowerCase()}</p>
            )}
          </div>
        </div>

        {/* Speaker Output Selection (where supported) */}
        {isConnected && audioOutputs.length > 1 && (
          <div className="flex items-center justify-center gap-2 text-xs text-white/80 bg-white/5 rounded-xl p-2 border border-white/10">
            <Speaker className="w-4 h-4 text-emerald-400 shrink-0" />
            <select
              value={selectedOutput}
              onChange={handleOutputChange}
              className="bg-transparent text-xs text-white focus:outline-none max-w-56 truncate"
            >
              {audioOutputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId} className="bg-[#202322] text-white">
                  {device.label || `Speaker ${device.deviceId.slice(0, 4)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Call Controls */}
        <div className="flex items-center justify-center gap-4 pt-1">
          {isConnected && onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`p-4 rounded-full border transition-all ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300 hover:bg-rose-500/30'
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
                className="p-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all hover:scale-105"
                title="Answer Call"
              >
                <Phone className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => onReject(session.id, 'Declined by recipient')}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all hover:scale-105"
                title="Decline Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          ) : isRinging ? (
            <button
              type="button"
              onClick={() => onCancel ? onCancel(session.id, 'Cancelled by caller') : onEnd(session.id, 'Cancelled by caller')}
              className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all hover:scale-105"
              title="Cancel Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onEnd(session.id, 'Completed normally')}
              className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all hover:scale-105"
              title="End Call"
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
