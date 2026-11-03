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
} from 'lucide-react';

interface ContextPanelProps {
  conversation: Conversation;
  currentRole: UserRole;
  onInitiateCall: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  conversation,
  currentRole,
  onInitiateCall,
}) => {
  const isDonor = currentRole === 'donor';

  return (
    <div className="h-full flex flex-col bg-white border-l border-[#E6E9E7] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[#E6E9E7] bg-white">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#69716F]">
          Emergency Request Context
        </h3>
        <p className="text-sm font-bold text-[#202322] mt-0.5">
          Request #{conversation.referenceCode}
        </p>
      </div>

      <div className="p-4 space-y-5">
        {/* Quick Voice Call Trigger */}
        <div className="p-3.5 rounded-2xl bg-[#B42332]/5 border border-[#B42332]/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8F1928]">Live Voice Coordination</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              WebRTC Ready
            </span>
          </div>
          <p className="text-xs text-[#69716F]">
            Connect instantly with {isDonor ? conversation.requesterName : conversation.donorName} via secure voice.
          </p>
          <button
            type="button"
            onClick={onInitiateCall}
            className="w-full py-2.5 px-4 rounded-xl bg-[#B42332] hover:bg-[#8F1928] text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            Start Voice Call
          </button>
        </div>

        {/* Clinical Spec Card */}
        <div className="p-3.5 rounded-2xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#202322]">Clinical Specification</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                conversation.urgency === 'Critical'
                  ? 'bg-rose-100 text-[#C62828]'
                  : 'bg-amber-100 text-[#C58A24]'
              }`}
            >
              {conversation.urgency}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7]">
              <p className="text-[10px] text-[#69716F]">Blood Group</p>
              <p className="text-sm font-bold text-[#B42332]">{conversation.donorBloodGroup}</p>
            </div>
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7]">
              <p className="text-[10px] text-[#69716F]">Component</p>
              <p className="text-xs font-bold text-[#202322] truncate">{conversation.component}</p>
            </div>
            <div className="p-2 rounded-lg bg-white border border-[#E6E9E7] col-span-2">
              <p className="text-[10px] text-[#69716F]">Quantity Required</p>
              <p className="text-xs font-bold text-[#202322]">{conversation.unitsRequired} Unit(s)</p>
            </div>
          </div>
        </div>

        {/* Hospital Facility Coordinates */}
        <div className="p-3.5 rounded-2xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#202322]">
            <Hospital className="w-4 h-4 text-[#B42332]" />
            <span>Facility Destination</span>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-semibold text-[#202322]">{conversation.hospitalName}</p>
            <p className="text-[#69716F]">Emergency Trauma Ward 2A, Transfusion Reception</p>
          </div>

          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(conversation.hospitalName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3478B8] hover:underline pt-1"
          >
            <MapPin className="w-3.5 h-3.5" />
            Open in Google Maps
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </div>

        {/* Contact Person Details */}
        <div className="p-3.5 rounded-2xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#202322]">
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>Emergency Attendant Contact</span>
          </div>

          <p className="text-xs font-semibold text-[#202322]">{conversation.requesterName}</p>
          <p className="text-xs text-[#69716F] font-mono">{conversation.requesterPhone || '+91 98490 55123'}</p>
        </div>

        {/* Clinical Pre-Donation Guidance */}
        <div className="p-3.5 rounded-2xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#202322]">
            <FileCheck2 className="w-4 h-4 text-[#C58A24]" />
            <span>Clinical Checklist for Donor</span>
          </div>

          <ul className="text-xs text-[#69716F] space-y-1.5 pl-4 list-disc">
            <li>Carry government-issued photo ID card (Aadhaar/Driver's License).</li>
            <li>Drink 500ml water and eat a light meal prior to arrival.</li>
            <li>No alcohol consumption in the past 24 hours.</li>
            <li>Physical screening (Hb & vitals) will be conducted at hospital desk.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

