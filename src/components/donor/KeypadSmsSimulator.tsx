import React, { useState } from 'react';
import { useBloodStore } from '../../store/useBloodStore';
import { Smartphone, Send, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface KeypadSmsSimulatorProps {
  referenceCode?: string;
  donorPhone?: string;
}

export const KeypadSmsSimulator: React.FC<KeypadSmsSimulatorProps> = ({
  referenceCode = 'BR-8F42',
  donorPhone = '+15550101',
}) => {
  const { requests, processSmsReply } = useBloodStore();
  const [phoneInput, setPhoneInput] = useState(donorPhone);
  const [refInput, setRefInput] = useState(referenceCode);
  const [customReply, setCustomReply] = useState('1');
  const [lastLog, setLastLog] = useState<{ success: boolean; isDuplicate: boolean; message: string } | null>(null);

  const activeReq = requests.find((r) => r.referenceCode.toUpperCase() === refInput.trim().toUpperCase()) || requests[0];

  const handleSendReply = (replyCode: string) => {
    const res = processSmsReply(phoneInput, refInput, replyCode);
    setLastLog(res);
  };

  return (
    <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-sm tracking-tight">Keypad Feature Phone SMS Simulator</span>
        </div>
        <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-2 py-0.5 rounded border border-amber-500/30">
          DEMO SMS WEBHOOK
        </span>
      </div>

      {/* Feature Phone Screen Graphic */}
      <div className="bg-emerald-950 text-emerald-300 font-mono text-xs p-4 rounded-xl border border-emerald-800/60 space-y-2 shadow-inner">
        <div className="flex justify-between text-[10px] text-emerald-500 border-b border-emerald-900/60 pb-1">
          <span>[ 4G SMS ]</span>
          <span>10:45 AM</span>
        </div>

        <div className="text-emerald-100 whitespace-pre-wrap leading-relaxed py-1">
          {`BLOODREACH ALERT\n\n${activeReq ? activeReq.bloodGroup : 'O+'} ${activeReq ? activeReq.component : 'Packed RBC'} urgently needed.\nHospital: ${activeReq ? activeReq.hospitalName : 'City General Hospital'}\nNeed: ${activeReq ? activeReq.unitsRequired : 2} unit(s)\nRef: ${activeReq ? activeReq.referenceCode : 'BR-8F42'}\n\nReply 1 if able to help.\nReply 2 if unavailable.`}
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Donor Phone Number</label>
          <input
            type="text"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white px-2.5 py-1.5 rounded text-xs"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Emergency Ref Code</label>
          <input
            type="text"
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white px-2.5 py-1.5 rounded text-xs font-mono"
          />
        </div>
      </div>

      {/* Interactive SMS Reply Buttons */}
      <div className="space-y-2">
        <span className="block text-xs font-semibold text-slate-300">Simulate Keypad Reply:</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSendReply('1')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send Reply "1" (Can Help)
          </button>
          <button
            type="button"
            onClick={() => handleSendReply('2')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            Send Reply "2" (Unavailable)
          </button>
        </div>
      </div>

      {/* Log Output */}
      {lastLog && (
        <div className={`p-3 rounded-lg text-xs border ${
          lastLog.isDuplicate
            ? 'bg-amber-950/40 text-amber-200 border-amber-800/60'
            : lastLog.success
            ? 'bg-emerald-950/40 text-emerald-200 border-emerald-800/60'
            : 'bg-red-950/40 text-red-200 border-red-800/60'
        }`}>
          <div className="font-bold flex items-center gap-1.5 mb-1">
            {lastLog.isDuplicate ? (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>Webhook Result:</span>
          </div>
          <p className="leading-tight">{lastLog.message}</p>
        </div>
      )}
    </div>
  );
};
