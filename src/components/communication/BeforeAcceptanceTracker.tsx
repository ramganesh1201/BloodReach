import React, { useState } from 'react';
import {
  EmergencyRequest,
  DonorTrackingItem,
  DonorTrackingCardStatus,
} from '../../types';
import {
  ShieldAlert,
  Clock,
  Radio,
  Lock,
  PhoneCall,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Hospital,
  MapPin,
  ChevronRight,
  Send,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface BeforeAcceptanceTrackerProps {
  request: EmergencyRequest;
  trackingItems: DonorTrackingItem[];
  onSimulateAcceptance?: (donorId: string) => void;
  onInitiateEscalation?: () => void;
}

export const BeforeAcceptanceTracker: React.FC<BeforeAcceptanceTrackerProps> = ({
  request,
  trackingItems,
  onSimulateAcceptance,
  onInitiateEscalation,
}) => {
  const [selectedDonorForDial, setSelectedDonorForDial] = useState<string | null>(null);

  const getStatusBadge = (status: DonorTrackingCardStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Accepted — Opening Channel
          </span>
        );
      case 'DECLINED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <XCircle className="w-3.5 h-3.5 text-zinc-400" />
            Unavailable
          </span>
        );
      case 'NOTIFICATION_DELIVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            Delivered to Phone
          </span>
        );
      case 'NOTIFICATION_SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Send className="w-3.5 h-3.5 text-sky-600" />
            Alert Dispatched
          </span>
        );
      case 'AWAITING_RESPONSE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            Awaiting Donor Response
          </span>
        );
      case 'RESPONSE_EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            Response Window Lapsed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-50 text-zinc-600 border border-zinc-200">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            Dispatch Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Request Overview Header */}
      <div className="bg-white rounded-2xl border border-[#E6E9E7] p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E6E9E7] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold bg-[#F0F2F0] text-[#202322] px-2.5 py-1 rounded-md border border-[#E6E9E7]">
                #{request.referenceCode}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  request.urgency === 'Critical'
                    ? 'bg-rose-50 text-[#C62828] border border-rose-200'
                    : 'bg-amber-50 text-[#C58A24] border border-amber-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {request.urgency} Priority
              </span>
            </div>
            <h2 className="text-xl font-bold text-[#202322] pt-1">
              {request.unitsRequired} Units of {request.bloodGroup} {request.component}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-[#69716F]">Dispatch Status</p>
              <p className="text-sm font-semibold text-[#202322] flex items-center gap-1.5 justify-end">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Contacting Matched Responders
              </p>
            </div>
          </div>
        </div>

        {/* Facility Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7]">
            <Hospital className="w-5 h-5 text-[#B42332] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[#69716F]">Hospital & Ward</p>
              <p className="text-sm font-semibold text-[#202322]">{request.hospitalName}</p>
              <p className="text-xs text-[#69716F]">{request.hospitalAddress}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7]">
            <MapPin className="w-5 h-5 text-[#3478B8] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[#69716F]">Location & Jurisdiction</p>
              <p className="text-sm font-semibold text-[#202322]">
                {request.city}, {request.district || 'Metro'}
              </p>
              <p className="text-xs text-[#69716F]">Telangana • PIN: {request.postalCode || '500082'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7]">
            <PhoneCall className="w-5 h-5 text-[#16845B] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[#69716F]">Attendant Contact</p>
              <p className="text-sm font-semibold text-[#202322]">{request.contactName}</p>
              <p className="text-xs text-[#69716F] font-mono">{request.contactPhone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Structured Communication Lock State Banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-800">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-base font-semibold text-amber-950">
              Direct Communication Activates on Donor Acceptance
            </h3>
            <p className="text-xs text-amber-800/90 leading-relaxed max-w-3xl">
              To preserve emergency focus and prevent distraction during urgent triage, CareLoop opens dedicated,
              private 1-on-1 coordination channels as soon as a medically cleared donor accepts the call. Track real-time
              notification delivery below.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Donor Candidate Tracking Cards */}
      <div className="bg-white rounded-2xl border border-[#E6E9E7] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E6E9E7] pb-4">
          <div>
            <h3 className="text-base font-bold text-[#202322]">
              Emergency Dispatch & Candidate Response Tracking
            </h3>
            <p className="text-xs text-[#69716F]">
              Live status of priority notifications dispatched to compatible local donors.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F0F2F0] text-[#202322] border border-[#E6E9E7]">
            {trackingItems.length} Responders Notified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trackingItems.map((item) => (
            <div
              key={item.donorId}
              className="p-4 rounded-xl border border-[#E6E9E7] bg-[#F8F9F8] hover:border-zinc-300 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#8F1928]/10 text-[#8F1928] font-bold flex items-center justify-center text-sm border border-[#8F1928]/20">
                    {item.donorBloodGroup}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#202322]">{item.donorName}</h4>
                    <p className="text-xs text-[#69716F]">
                      Approx. {item.approxDistanceKm} km away • {item.donor?.city || 'Hyderabad'}
                    </p>
                  </div>
                </div>

                <div>{getStatusBadge(item.status)}</div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#69716F] pt-2 border-t border-[#E6E9E7]">
                <span>
                  {item.notifiedAt ? `Dispatched ${new Date(item.notifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'In Queue'}
                </span>

                {item.status === 'ACCEPTED' ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> Channel Activated
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSimulateAcceptance?.(item.donorId)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B42332] hover:text-[#8F1928] hover:underline"
                  >
                    <Sparkles className="w-3 h-3" />
                    Simulate Acceptance
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Emergency Escalation & Hospital Helplines */}
      <div className="bg-white rounded-2xl border border-[#E6E9E7] p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#69716F] mb-4">
          Emergency Escalation & Direct Hospital Desk
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <a
            href="tel:+914023489000"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E6E9E7] bg-white hover:bg-[#F8F9F8] transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#202322] group-hover:text-[#B42332] truncate">
                Hospital Transfusion Desk
              </p>
              <p className="text-xs text-[#69716F] font-mono">+91 (40) 2348-9000</p>
            </div>
          </a>

          <a
            href="tel:+919849000108"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E6E9E7] bg-white hover:bg-[#F8F9F8] transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-[#C62828] flex items-center justify-center shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#202322] group-hover:text-[#B42332] truncate">
                24/7 CareLoop Medical Duty
              </p>
              <p className="text-xs text-[#69716F] font-mono">+91 98490 00108</p>
            </div>
          </a>

          <button
            type="button"
            onClick={onInitiateEscalation}
            className="flex items-center justify-between p-3.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#C62828] text-white flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#C62828]">Escalate Radius</p>
                <p className="text-[11px] text-[#C62828]/80">Level 2 (Expand to 20 km)</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#C62828] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

