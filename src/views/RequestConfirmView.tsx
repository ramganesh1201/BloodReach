import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { CheckCircle2, Copy, ArrowRight, ShieldCheck, Clock, MessageSquare, ArrowLeft, Building2, MapPin } from 'lucide-react';

export const RequestConfirmView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { requests } = useBloodStore();
  const [copied, setCopied] = useState(false);

  const req = requests.find((r) => r.id === id) || requests[0];

  const copyReference = () => {
    if (!req) return;
    navigator.clipboard.writeText(req.referenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!req) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <p className="text-sm text-app-text-secondary">Request not found.</p>
        <Link to="/patient" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Patient Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 space-y-6">
      <div className="bg-app-surface rounded-xl border border-app-border p-6 sm:p-8 shadow-card text-center space-y-6">
        {/* Success Icon */}
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-success flex items-center justify-center mx-auto border border-emerald-200">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="text-caption font-semibold text-success uppercase tracking-wider">
            Emergency Request Dispatched to Responders
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-app-text-primary tracking-tight font-mono">
            {req.referenceCode}
          </h1>
          <p className="text-secondary text-app-text-secondary max-w-md mx-auto">
            Your emergency request has entered the CareLoop coordination pipeline. Compatible blood banks and verified nearby donors are being notified.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-app-bg p-4 sm:p-5 rounded-lg border border-app-border text-left space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <span className="text-xs text-app-text-secondary font-medium">Lifecycle Stage</span>
            <StatusBadge status={req.status} size="sm" />
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-app-text-secondary block text-[11px] mb-0.5">Component & Group</span>
              <strong className="text-app-text-primary font-bold text-sm">
                {req.bloodGroup} <span className="text-app-text-secondary font-normal font-sans">({req.component})</span>
              </strong>
            </div>
            <div>
              <span className="text-app-text-secondary block text-[11px] mb-0.5">Units Required</span>
              <strong className="text-app-text-primary font-bold text-sm">
                {req.unitsRequired} unit(s)
              </strong>
            </div>
            <div>
              <span className="text-app-text-secondary block text-[11px] mb-0.5">Hospital & Location</span>
              <div className="flex items-center gap-1 text-app-text-primary font-medium">
                <Building2 className="w-3.5 h-3.5 text-app-text-secondary shrink-0" />
                <span className="truncate">{req.hospitalName}</span>
              </div>
              <div className="text-[11px] text-app-text-secondary pl-4.5 truncate">
                {req.district}
              </div>
            </div>
            <div>
              <span className="text-app-text-secondary block text-[11px] mb-0.5">Urgency Level</span>
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                req.urgency === 'Critical' ? 'bg-red-50 text-emergency border border-red-200' : 'bg-amber-50 text-warning border border-amber-200'
              }`}>
                {req.urgency}
              </span>
            </div>
          </div>
        </div>

        {/* Search Engine Feedback */}
        <div className="bg-sky-50/80 p-3.5 rounded-lg text-xs text-info flex items-start gap-2.5 border border-sky-200 text-left">
          <Clock className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-sky-950 block">Next Expected Action</span>
            <p className="text-sky-900 text-[11px] leading-relaxed">
              Nearby certified donors with compatible antigen profiles ({req.bloodGroup}) are receiving emergency notifications. When a donor accepts, their response will appear here for verification and coordinator assignment.
            </p>
          </div>
        </div>

        {/* Clinical Notice */}
        <div className="flex items-start gap-2 text-left bg-app-muted p-3 rounded-lg border border-app-border text-[11px] text-app-text-secondary">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Safety Protocol:</strong> Blood is not guaranteed until laboratory cross-matching is verified at the hospital transfusion facility.
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <Link
            to={`/request/track/${req.id}`}
            className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 px-6 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Open Live Tracking Console <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link
              to={`/communication?requestId=${req.id}`}
              className="w-full bg-app-surface border border-app-border text-app-text-primary hover:bg-app-muted font-medium py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-4 h-4 text-app-text-secondary" />
              Open Communication Hub
            </Link>

            <button
              type="button"
              onClick={copyReference}
              className="w-full bg-app-surface border border-app-border text-app-text-primary hover:bg-app-muted font-medium py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-app-text-secondary" />}
              {copied ? 'Reference Code Copied!' : 'Copy Reference Code'}
            </button>
          </div>

          <div className="pt-2 text-center">
            <Link
              to="/patient"
              className="text-xs text-app-text-secondary hover:text-app-text-primary font-medium inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Patient Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
