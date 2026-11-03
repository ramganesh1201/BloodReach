import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { CheckCircle2, Share2, Copy, ArrowRight, ShieldCheck, Clock } from 'lucide-react';

export const RequestConfirmView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { requests } = useBloodStore();
  const [copied, setCopied] = useState(false);

  const req = requests.find((r) => r.id === id) || requests[0];

  const copyReference = () => {
    navigator.clipboard.writeText(req.referenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card text-center space-y-6">
        {/* Success Icon */}
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Emergency Request Created
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight font-mono">
            {req.referenceCode}
          </h1>
          <p className="text-xs text-slate-600">
            We are checking nearby resources and coordinating responses across blood centres and registered responders.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs text-slate-500 font-semibold">Current Status</span>
            <StatusBadge status={req.status} size="sm" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Requirement</span>
              <strong className="text-slate-900 font-bold">{req.bloodGroup} {req.component}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Units Required</span>
              <strong className="text-slate-900 font-bold">{req.unitsRequired} unit(s)</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Hospital</span>
              <strong className="text-slate-900 truncate block font-bold">{req.hospitalName}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Urgency</span>
              <strong className="text-red-700 font-bold">{req.urgency}</strong>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-900 flex items-center gap-2 border border-blue-200 text-left">
          <Clock className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            Resource search in progress: <strong>Shortage engine</strong> & <strong>Potential responder matching</strong> are running.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <Link
            to={`/request/track/${req.id}`}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Track Emergency Request <ArrowRight className="w-4 h-4" />
          </Link>

          <button
            type="button"
            onClick={copyReference}
            className="w-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            {copied ? 'Reference Code Copied!' : 'Share / Copy Reference Code'}
          </button>
        </div>
      </div>
    </div>
  );
};
