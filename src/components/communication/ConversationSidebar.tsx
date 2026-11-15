import React, { useState } from 'react';
import { Conversation, UserRole } from '../../types';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  Volume2,
  VolumeX,
  Archive,
  ArchiveRestore,
  AlertCircle,
} from 'lucide-react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentRole: UserRole;
  currentUserId?: string;
  onToggleArchive?: (id: string, isArchived: boolean) => void;
  onToggleMute?: (id: string, isMuted: boolean) => void;
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
  onToggleArchive,
  onToggleMute,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'archived'>('active');

  // Counts across categories
  const activeCount = conversations.filter(
    (c) => c.lifecycleStatus !== 'completed' && !c.isArchived
  ).length;
  const completedCount = conversations.filter(
    (c) => c.lifecycleStatus === 'completed' && !c.isArchived
  ).length;
  const archivedCount = conversations.filter((c) => Boolean(c.isArchived)).length;

  const tabFiltered = conversations.filter((conv) => {
    if (activeTab === 'archived') {
      return Boolean(conv.isArchived);
    }
    if (activeTab === 'completed') {
      return conv.lifecycleStatus === 'completed' && !conv.isArchived;
    }
    // Default 'active'
    return conv.lifecycleStatus !== 'completed' && !conv.isArchived;
  });

  const displayedConversations = tabFiltered.filter((conv) => {
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
            {tabFiltered.length}
          </span>
        </div>

        {/* 3-View Filter Tabs: Active Chats / Completed / Archived */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#F0F2F0] rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-white text-[#202322] shadow-xs font-bold'
                : 'text-[#69716F] hover:text-[#202322]'
            }`}
          >
            <span>Active</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'active' ? 'bg-brand/10 text-brand' : 'bg-black/5 text-[#69716F]'
              }`}
            >
              {activeCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'completed'
                ? 'bg-white text-[#202322] shadow-xs font-bold'
                : 'text-[#69716F] hover:text-[#202322]'
            }`}
          >
            <span>Completed</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-black/5 text-[#69716F]'
              }`}
            >
              {completedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'archived'
                ? 'bg-white text-[#202322] shadow-xs font-bold'
                : 'text-[#69716F] hover:text-[#202322]'
            }`}
          >
            <span>Archived</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'archived'
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-black/5 text-[#69716F]'
              }`}
            >
              {archivedCount}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#69716F]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${activeTab} channels, donors...`}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8F9F8] border border-[#E6E9E7] rounded-lg text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E6E9E7]">
        {displayedConversations.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#F0F2F0] text-[#69716F] flex items-center justify-center mx-auto">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#202322]">
              {activeTab === 'active'
                ? 'No Active Channels'
                : activeTab === 'completed'
                ? 'No Completed Cases'
                : 'No Archived Channels'}
            </p>
            <p className="text-[11px] text-[#69716F] max-w-xs mx-auto leading-relaxed">
              {activeTab === 'active'
                ? currentRole === 'donor'
                  ? 'When you accept an emergency dispatch call, your active coordination channel will appear here.'
                  : 'Active channels appear as soon as a donor accepts your emergency call.'
                : activeTab === 'completed'
                ? 'Resolved cases with confirmed completion or coordinator resolution appear here in preserved read-only mode.'
                : 'Archived cases you have personally stashed appear here. Unresolved active emergencies cannot be archived.'}
            </p>
          </div>
        ) : (
          displayedConversations.map((conv) => {
            const isSelected = conv.id === activeConversationId;

            // Participant Identity Logic:
            // For donor: other party is the requester (patient/attendant)
            // For patient: other party is the donor
            const isUserDonor =
              currentRole === 'donor' ||
              (Boolean(currentUserId) && conv.donorId === currentUserId);
            const otherPartyName = isUserDonor
              ? conv.requesterName || 'Emergency Attendant'
              : conv.donorName || 'Volunteer Donor';
            const initials = getInitials(otherPartyName, isUserDonor ? 'PA' : 'VD');
            const refDisplay = conv.referenceCode ? `#${conv.referenceCode}` : 'Direct Channel';
            const roleSubtitle = isUserDonor
              ? `Attendant • ${refDisplay}`
              : `Donor (${conv.donorBloodGroup || '—'}) • ${refDisplay}`;

            const isPending = conv.lifecycleStatus === 'completion_pending';
            const isCompleted = conv.lifecycleStatus === 'completed';

            return (
              <div
                key={conv.id}
                className={`relative group transition-colors ${
                  isSelected
                    ? 'bg-brand/5 border-l-4 border-l-brand'
                    : 'hover:bg-[#F8F9F8]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectConversation(conv.id)}
                  className="w-full p-4 text-left flex items-start gap-3"
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
                    {isCompleted ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center"
                        title="Completed Case"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                      </span>
                    ) : isPending ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center"
                        title="Completion Pending"
                      >
                        <Clock className="w-2.5 h-2.5 text-white" />
                      </span>
                    ) : (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
                        title="Active secure channel"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-xs font-bold text-[#202322] truncate group-hover:text-brand transition-colors">
                          {otherPartyName}
                        </h3>
                        {conv.isMuted && (
                          <span title="Notifications Muted" className="inline-flex items-center">
                            <VolumeX className="w-3 h-3 text-[#69716F] shrink-0" />
                          </span>
                        )}
                      </div>
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

                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[9px] font-bold bg-[#F0F2F0] text-[#202322] px-1.5 py-0.5 rounded border border-[#E6E9E7]">
                          {conv.referenceCode || 'Direct'}
                        </span>
                        <span className="text-[10px] text-[#69716F] truncate">
                          {conv.hospitalName || 'Emergency Hospital'}
                        </span>
                      </div>

                      {/* Case Status Pill */}
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Completed</span>
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          <Clock className="w-2.5 h-2.5 text-amber-600" />
                          <span>Pending</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {conv.unreadCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-brand text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-1 shadow-xs">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>

                {/* Per-User Quick Actions: Archive & Mute */}
                <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white/90 backdrop-blur-xs p-1 rounded-md border border-[#E6E9E7] shadow-xs">
                  {onToggleMute && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMute(conv.id, !conv.isMuted);
                      }}
                      className="p-1 text-[#69716F] hover:text-[#202322] rounded hover:bg-[#F0F2F0] transition-colors"
                      title={conv.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                    >
                      {conv.isMuted ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    </button>
                  )}
                  {onToggleArchive && isCompleted && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchive(conv.id, !conv.isArchived);
                      }}
                      className="p-1 text-[#69716F] hover:text-[#202322] rounded hover:bg-[#F0F2F0] transition-colors"
                      title={conv.isArchived ? 'Restore from Archive' : 'Archive Completed Chat'}
                    >
                      {conv.isArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
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
