import React from 'react';
import { Conversation, UserRole } from '../../types';
import {
  Hospital,
  MapPin,
  Phone,
  PhoneCall,
  ShieldCheck,
  Heart,
  Droplet,
  FileCheck2,
  ExternalLink,
  AlertTriangle,
  ArrowLeft,
  Calendar,
} from 'lucide-react';

interface ContextPanelProps {
  conversation: Conversation;
  currentRole: UserRole;
  onInitiateCall: () => void;
  onBackToChat?: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  conversation,
  currentRole,
  onInitiateCall,
  onBackToChat,
}) => {
  const isDonor = currentRole === 'donor';
  const otherPartyTitle = isDonor
    ? (conversation.requesterName || 'Emergency Attendant')
    : (conversation.donorName || 'Volunteer Donor');

  return (
    <div className="h-full flex flex-col bg-white border-l border-[#E6E9E7] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[#E6E9E7] bg-white space-y-2">
        {onBackToChat && (
          <button
            type="button"
            onClick={onBackToChat}
            className="lg:hidden inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Live Chat</span>
          </button>
        )}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#69716F]">
            Emergency Request Context
          </h3>
          <p className="text-sm font-bold text-[#202322] font-display mt-0.5">
            {conversation.referenceCode ? `Request #${conversation.referenceCode}` : 'Direct Coordination Channel'}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quick Voice Call Trigger */}
        <div className="p-3.5 rounded-xl bg-brand/5 border border-brand/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand">Live Voice Coordination</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              WebRTC Ready
            </span>
          </div>
          <p className="text-xs text-[#69716F] leading-relaxed">
            Connect directly with {otherPartyTitle} over private voice relay.
          </p>
          <button
            type="button"
            onClick={onInitiateCall}
            className="w-full py-2.5 px-4 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            Start Voice Call
          </button>
        </div>

        {/* Clinical Specification Card */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#202322]">Clinical Need</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                conversation.urgency === 'Critical'
                  ? 'bg-rose-100 text-[#C62828] border border-rose-200'
                  : 'bg-amber-100 text-[#C58A24] border border-amber-200'
              }`}
            >
              {conversation.urgency || 'Urgent'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7]">
              <p className="text-[10px] text-[#69716F]">Target Blood Group</p>
              <p className="text-sm font-bold text-brand">{conversation.donorBloodGroup || '—'}</p>
            </div>
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7]">
              <p className="text-[10px] text-[#69716F]">Component</p>
              <p className="text-xs font-bold text-[#202322] truncate">{conversation.component || 'Whole Blood'}</p>
            </div>
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7] col-span-2">
              <p className="text-[10px] text-[#69716F]">Quantity Required</p>
              <p className="text-xs font-bold text-[#202322]">{conversation.unitsRequired || 1} Unit(s)</p>
            </div>
          </div>
        </div>

        {/* Hospital Facility Coordinates */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#202322]">
            <Hospital className="w-4 h-4 text-brand" />
            <span>Facility Destination</span>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-bold text-[#202322]">{conversation.hospitalName || 'Emergency Hospital'}</p>
            <div className="flex items-start gap-1.5 text-[11px] text-[#69716F]">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
              <span>Direct coordination at hospital blood bank desk</span>
            </div>
          </div>
        </div>

        {/* Clinical Disclaimer */}
        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Hospital Blood-Bank Cross-Match</span>
          </div>
          <p className="text-[10px] text-amber-800/90 leading-relaxed">
            CareLoop facilitates candidate discovery. Official ABO/Rh cross-matching and hemoglobin screening must be performed at the transfusion facility before collection.
          </p>
        </div>
      </div>
    </div>
  );
};
