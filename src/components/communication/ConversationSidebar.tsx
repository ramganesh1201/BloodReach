import React, { useState } from 'react';
import { Conversation, UserRole } from '../../types';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  User,
  Heart,
  AlertCircle,
  Radio,
} from 'lucide-react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentRole: UserRole;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = conversations.filter((conv) => {
    const term = searchTerm.toLowerCase();
    return (
      conv.donorName.toLowerCase().includes(term) ||
      conv.referenceCode.toLowerCase().includes(term) ||
      conv.hospitalName.toLowerCase().includes(term) ||
      conv.requesterName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-full flex flex-col bg-white border-r border-[#E6E9E7]">
      {/* Header */}
      <div className="p-4 border-b border-[#E6E9E7] bg-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#B42332]/10 text-[#B42332] flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#202322]">
                {currentRole === 'donor' ? 'Emergency Coordination' : 'Accepted Responders'}
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
            placeholder="Search channels..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8F9F8] border border-[#E6E9E7] rounded-lg text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-[#B42332] focus:border-[#B42332]"
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
            <p className="text-xs font-semibold text-[#202322]">No Active Channels</p>
            <p className="text-[11px] text-[#69716F] max-w-xs mx-auto">
              {currentRole === 'donor'
                ? 'When you accept an emergency dispatch call, your private coordination channel with the attendant will appear here.'
                : 'Direct messaging unlocks automatically as soon as a donor accepts your emergency call.'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === activeConversationId;
            const displayName = currentRole === 'donor' ? conv.requesterName : conv.donorName;
            const subtitle = currentRole === 'donor' ? `Attendant • #${conv.referenceCode}` : `Donor (${conv.donorBloodGroup}) • #${conv.referenceCode}`;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full p-4 text-left transition-colors flex items-start gap-3 relative ${
                  isSelected
                    ? 'bg-[#B42332]/5 border-l-4 border-l-[#B42332]'
                    : 'hover:bg-[#F8F9F8]'
                }`}
              >
                {/* Avatar with Blood Group chip */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-[#8F1928]/10 text-[#8F1928] font-bold flex items-center justify-center text-sm border border-[#8F1928]/20">
                    {conv.donorBloodGroup}
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                    <Radio className="w-2 h-2 text-white animate-pulse" />
                  </span>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-xs font-bold text-[#202322] truncate">
                      {displayName}
                    </h3>
                    <span className="text-[10px] text-[#69716F] shrink-0">
                      {conv.lastMessageTimestamp
                        ? new Date(conv.lastMessageTimestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-[#69716F] truncate">
                    {subtitle}
                  </p>

                  <p className="text-xs text-[#69716F] truncate">
                    {conv.lastMessage || 'Channel activated'}
                  </p>

                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="font-mono text-[10px] bg-[#F0F2F0] text-[#202322] px-1.5 py-0.2 rounded border border-[#E6E9E7]">
                      {conv.referenceCode}
                    </span>
                    <span className="text-[10px] text-[#69716F] truncate">
                      {conv.hospitalName}
                    </span>
                  </div>
                </div>

                {conv.unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#B42332] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-1">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Role Context Pill */}
      <div className="p-3 border-t border-[#E6E9E7] bg-[#F8F9F8] flex items-center justify-between text-[11px] text-[#69716F]">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Strict Request-Linked Isolation</span>
        </div>
        <span className="font-semibold capitalize">{currentRole.replace(/_/g, ' ')}</span>
      </div>
    </div>
  );
};

