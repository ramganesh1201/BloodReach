import React, { useState } from 'react';
import { Conversation, UserRole } from '../../types';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  Radio,
  User,
  Activity,
  Droplet,
} from 'lucide-react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentRole: UserRole;
  currentUserId?: string;
}

function getInitials(name?: string, fallback = 'CL'): string {
  if (!name || name.trim().length === 0) return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatConversationTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentRole,
  currentUserId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = conversations.filter((conv) => {
    const term = searchTerm.toLowerCase();
    const donorName = conv.donorName || '';
    const refCode = conv.referenceCode || '';
    const hospitalName = conv.hospitalName || '';
    const requesterName = conv.requesterName || '';
    const bloodGroup = conv.donorBloodGroup || '';

    return (
      donorName.toLowerCase().includes(term) ||
      refCode.toLowerCase().includes(term) ||
      hospitalName.toLowerCase().includes(term) ||
      requesterName.toLowerCase().includes(term) ||
      bloodGroup.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-full flex flex-col bg-white border-r border-[#E6E9E7]">
      {/* Header */}
      <div className="p-4 border-b border-[#E6E9E7] bg-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#202322] font-display">
                {currentRole === 'donor' ? 'Emergency Coordination' : 'Assigned Responders'}
              </h2>
              <p className="text-[11px] text-[#69716F]">
                {currentRole === 'donor'
                  ? 'Private channel with patient attendant'
                  : '1-on-1 private donor channels'}
              </p>
            </div>
          </div>

          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F0F2F0] text-[#202322] border border-[#E6E9E7]">
            {filteredConversations.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#69716F]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search channels, donors, requests..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8F9F8] border border-[#E6E9E7] rounded-lg text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E6E9E7]">
        {filteredConversations.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#F0F2F0] text-[#69716F] flex items-center justify-center mx-auto">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#202322]">No Active Channels</p>
            <p className="text-[11px] text-[#69716F] max-w-xs mx-auto leading-relaxed">
              {currentRole === 'donor'
                ? 'When you accept an emergency dispatch call, your private coordination channel with the attendant will appear here.'
                : 'Direct messaging unlocks automatically as soon as a donor accepts your emergency call.'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === activeConversationId;

            // Participant Identity Logic:
            // For donor: other party is the requester (patient/attendant)
            // For patient: other party is the donor
            const isUserDonor = currentRole === 'donor' || (Boolean(currentUserId) && conv.donorId === currentUserId);
            const otherPartyName = isUserDonor
              ? (conv.requesterName || 'Emergency Attendant')
              : (conv.donorName || 'Volunteer Donor');
            const initials = getInitials(otherPartyName, isUserDonor ? 'PA' : 'VD');
            const refDisplay = conv.referenceCode ? `#${conv.referenceCode}` : 'Direct Channel';
            const roleSubtitle = isUserDonor
              ? `Attendant • ${refDisplay}`
              : `Donor (${conv.donorBloodGroup || '—'}) • ${refDisplay}`;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full p-4 text-left transition-colors flex items-start gap-3 relative group ${
                  isSelected
                    ? 'bg-brand/5 border-l-4 border-l-brand'
                    : 'hover:bg-[#F8F9F8]'
                }`}
              >
                {/* Avatar with Status indicator */}
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full font-bold flex items-center justify-center text-xs tracking-wider border shadow-xs ${
                      isUserDonor
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-brand-light text-brand border-brand/20'
                    }`}
                  >
                    {isUserDonor ? initials : conv.donorBloodGroup || initials}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
                    title="Active secure channel"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  </span>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-xs font-bold text-[#202322] truncate group-hover:text-brand transition-colors">
                      {otherPartyName}
                    </h3>
                    <span className="text-[10px] text-[#69716F] shrink-0 font-medium">
                      {formatConversationTime(conv.lastMessageTimestamp || conv.updatedAt)}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-[#69716F] truncate">
                    {roleSubtitle}
                  </p>

                  <p className="text-xs text-[#202322]/80 truncate font-normal">
                    {conv.lastMessage || 'Channel activated. Coordinate dispatch.'}
                  </p>

                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="font-mono text-[9px] font-bold bg-[#F0F2F0] text-[#202322] px-1.5 py-0.5 rounded border border-[#E6E9E7]">
                      {conv.referenceCode || 'Direct'}
                    </span>
                    <span className="text-[10px] text-[#69716F] truncate">
                      {conv.hospitalName || 'Emergency Hospital'}
                    </span>
                  </div>
                </div>

                {conv.unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-brand text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-1 shadow-xs">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Security & Role Footer */}
      <div className="p-3 border-t border-[#E6E9E7] bg-[#F8F9F8] flex items-center justify-between text-[11px] text-[#69716F]">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Patient-Donor Protected Channel</span>
        </div>
        <span className="font-bold capitalize text-xs text-[#202322]">
          {currentRole.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
};
