import React, { useEffect, useRef, useMemo } from 'react';
import {
  ChatMessage,
  ChatMessageDeliveryStatus,
  UserRole,
} from '../../types';
import {
  Check,
  CheckCheck,
  Clock,
  CloudOff,
  AlertCircle,
  FileText,
  Download,
  ShieldCheck,
  Car,
  Building,
  CheckCircle2,
  XCircle,
  Calendar,
} from 'lucide-react';

interface ChatTimelineProps {
  messages: ChatMessage[];
  currentUserId?: string;
  currentRole: UserRole;
  isReconnecting?: boolean;
}

/**
 * Format timestamp into conversational date divider label
 */
function getDateDividerLabel(timestamp: string): string {
  try {
    const msgDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (msgDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return msgDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: msgDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return 'Recent';
  }
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({
  messages,
  currentUserId,
  currentRole,
  isReconnecting = false,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Strict presentation-layer deduplication by stable database ID and clientMessageId
  // Guarantee: Each message appears exactly once without merging distinct messages with identical text
  const deduplicatedMessages = useMemo(() => {
    const seenIds = new Set<string>();
    const seenClientIds = new Set<string>();
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      if (!msg) continue;
      // Skip if database UUID is already rendered
      if (msg.id && seenIds.has(msg.id)) {
        continue;
      }
      // Skip if clientMessageId is already rendered
      if (msg.clientMessageId && seenClientIds.has(msg.clientMessageId)) {
        continue;
      }

      if (msg.id) seenIds.add(msg.id);
      if (msg.clientMessageId) seenClientIds.add(msg.clientMessageId);
      result.push(msg);
    }

    return result;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deduplicatedMessages.length]);

  const renderDeliveryStatus = (status: ChatMessageDeliveryStatus) => {
    switch (status) {
      case 'SENDING':
        return <Clock className="w-3 h-3 text-white/70 animate-spin" aria-label="Sending" />;
      case 'SENT':
        return <Check className="w-3 h-3 text-white/70" aria-label="Sent" />;
      case 'DELIVERED':
        return <CheckCheck className="w-3 h-3 text-white/90" aria-label="Delivered" />;
      case 'READ':
        return <CheckCheck className="w-3 h-3 text-emerald-300" aria-label="Read" />;
      case 'PENDING_SYNC':
        return (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-200">
            <CloudOff className="w-3 h-3" />
            <span>Queued</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-0.5 text-[10px] text-rose-200">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  const getMilestoneIcon = (eventType?: string) => {
    switch (eventType) {
      case 'ON_THE_WAY':
        return <Car className="w-4 h-4 text-sky-600" />;
      case 'REACHED_HOSPITAL':
      case 'CONFIRMED_ARRIVAL':
        return <Building className="w-4 h-4 text-emerald-600" />;
      case 'UNABLE_TO_PROCEED':
      case 'WITHDRAWN':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#F8F9F8]">
      {/* Reconnection Banner */}
      {isReconnecting && (
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
            <Clock className="w-3.5 h-3.5 animate-spin text-amber-600" />
            <span>Reconnecting to live channel...</span>
          </div>
        </div>
      )}

      {/* Security Banner at top of thread */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E6E9E7] text-[11px] text-[#69716F] shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>CareLoop Verified Emergency Channel • Request-Linked Audit Trail</span>
        </div>
      </div>

      {deduplicatedMessages.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-center">
          <div className="space-y-1.5 max-w-sm">
            <div className="w-10 h-10 rounded-full bg-white border border-[#E6E9E7] text-brand flex items-center justify-center mx-auto shadow-xs">
              <Calendar className="w-5 h-5 text-brand" />
            </div>
            <p className="text-xs font-bold text-[#202322]">No Messages Yet</p>
            <p className="text-[11px] text-[#69716F] leading-relaxed">
              Start the coordination conversation, share estimated arrival time, or confirm blood bank paperwork.
            </p>
          </div>
        </div>
      ) : (
        deduplicatedMessages.map((msg, index) => {
          // Check date divider relative to previous message
          const prevMsg = index > 0 ? deduplicatedMessages[index - 1] : null;
          const currentDateDivider = getDateDividerLabel(msg.timestamp);
          const prevDateDivider = prevMsg ? getDateDividerLabel(prevMsg.timestamp) : null;
          const showDateDivider = currentDateDivider !== prevDateDivider;

          // Message grouping: group consecutive messages from same sender within 2 minutes
          const isSender =
            msg.senderRole === currentRole || (Boolean(currentUserId) && msg.senderId === currentUserId);
          const isSameSenderAsPrev =
            prevMsg &&
            !showDateDivider &&
            prevMsg.messageType === 'TEXT' &&
            msg.messageType === 'TEXT' &&
            prevMsg.senderId === msg.senderId &&
            Math.abs(new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 120000;

          return (
            <React.Fragment key={msg.id || msg.clientMessageId || `msg-${index}`}>
              {/* Date Separator */}
              {showDateDivider && (
                <div className="flex items-center justify-center py-2">
                  <span className="px-3 py-0.5 rounded-full bg-white border border-[#E6E9E7] text-[10px] font-bold text-[#69716F] tracking-wide shadow-xs uppercase">
                    {currentDateDivider}
                  </span>
                </div>
              )}

              {/* System Notice */}
              {msg.messageType === 'SYSTEM' ? (
                <div className="flex justify-center my-2">
                  <div className="max-w-md px-3.5 py-1.5 rounded-full bg-white border border-[#E6E9E7] text-center space-y-0.5 shadow-xs">
                    <p className="text-[11px] font-medium text-[#202322]">{msg.content}</p>
                    <p className="text-[9px] text-[#69716F]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ) : msg.messageType === 'COORDINATION_EVENT' ? (
                /* Structured Coordination Event Milestone */
                <div className="flex justify-center my-3">
                  <div className="w-full max-w-lg p-3.5 rounded-xl bg-white border border-[#E6E9E7] shadow-xs flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-zinc-50 border border-zinc-200/80 flex items-center justify-center shrink-0">
                      {getMilestoneIcon(msg.metadata?.eventType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#202322]">
                          Milestone: {msg.metadata?.eventType?.replace(/_/g, ' ') || 'Coordination Update'}
                        </span>
                        <span className="text-[10px] font-medium text-[#69716F]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#202322] mt-0.5 font-normal leading-relaxed">{msg.content}</p>
                      <p className="text-[10px] text-[#69716F] mt-1 font-medium">
                        Logged by {msg.senderName} ({msg.senderRole})
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Standard Chat Bubble */
                <div
                  className={`flex flex-col ${isSender ? 'items-end' : 'items-start'} ${
                    isSameSenderAsPrev ? 'mt-0.5' : 'mt-2.5'
                  }`}
                >
                  {/* Sender Header (shown only on first message of group) */}
                  {!isSender && !isSameSenderAsPrev && (
                    <div className="flex items-center gap-1.5 px-1 pb-1">
                      <span className="text-[11px] font-bold text-[#202322]">{msg.senderName}</span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-white text-[#69716F] border border-[#E6E9E7] capitalize">
                        {msg.senderRole}
                      </span>
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl px-3.5 py-2.5 space-y-1.5 shadow-xs transition-shadow ${
                      isSender
                        ? 'bg-[#8F1928] text-white rounded-br-sm'
                        : 'bg-white text-[#202322] border border-[#E6E9E7] rounded-bl-sm'
                    }`}
                  >
                    {/* Attachment if present */}
                    {msg.attachment && (
                      <div className="rounded-xl overflow-hidden border border-black/10 my-1">
                        {msg.attachment.mimeType.startsWith('image/') ? (
                          <div className="space-y-1">
                            <img
                              src={msg.attachment.publicUrl || msg.attachment.storagePath}
                              alt={msg.attachment.fileName}
                              className="max-h-60 w-full object-cover rounded-lg"
                              loading="lazy"
                            />
                            <p className={`text-[10px] px-2 pb-1 ${isSender ? 'text-white/80' : 'text-[#69716F]'}`}>
                              {msg.attachment.fileName}
                            </p>
                          </div>
                        ) : (
                          <div
                            className={`p-2.5 flex items-center justify-between gap-3 ${
                              isSender ? 'bg-white/10' : 'bg-[#F8F9F8]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className={`w-4 h-4 shrink-0 ${isSender ? 'text-white' : 'text-brand'}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{msg.attachment.fileName}</p>
                                <p className={`text-[10px] ${isSender ? 'text-white/70' : 'text-[#69716F]'}`}>
                                  {(msg.attachment.fileSize / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                            {msg.attachment.publicUrl && (
                              <a
                                href={msg.attachment.publicUrl}
                                download={msg.attachment.fileName}
                                target="_blank"
                                rel="noreferrer"
                                className={`p-1.5 rounded-lg ${
                                  isSender ? 'hover:bg-white/20 text-white' : 'hover:bg-zinc-200 text-[#202322]'
                                }`}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Text Content */}
                    {msg.content && (
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-normal">
                        {msg.content}
                      </p>
                    )}

                    {/* Timestamp & Delivery Status */}
                    <div
                      className={`flex items-center justify-end gap-1.5 text-[10px] ${
                        isSender ? 'text-white/75' : 'text-[#69716F]'
                      }`}
                    >
                      <span className="tabular-nums font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isSender && renderDeliveryStatus(msg.deliveryStatus)}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })
      )}

      <div ref={bottomRef} />
    </div>
  );
};
