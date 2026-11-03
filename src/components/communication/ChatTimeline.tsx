import React, { useEffect, useRef } from 'react';
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
  Radio,
  Car,
  Building,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';

interface ChatTimelineProps {
  messages: ChatMessage[];
  currentUserId?: string;
  currentRole: UserRole;
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({
  messages,
  currentUserId,
  currentRole,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderDeliveryStatus = (status: ChatMessageDeliveryStatus) => {
    switch (status) {
      case 'SENDING':
        return <Clock className="w-3 h-3 text-zinc-400 animate-spin" />;
      case 'SENT':
        return <Check className="w-3 h-3 text-zinc-400" />;
      case 'DELIVERED':
        return <CheckCheck className="w-3 h-3 text-zinc-400" />;
      case 'READ':
        return <CheckCheck className="w-3 h-3 text-emerald-400" />;
      case 'PENDING_SYNC':
        return (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-300">
            <CloudOff className="w-3 h-3" />
            <span>Pending sync</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-0.5 text-[10px] text-rose-300">
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F8F9F8]">
      {/* Security Banner at top of thread */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E6E9E7] text-[11px] text-[#69716F] shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>CareLoop Verified Emergency Channel • Request-Linked Audit Trail</span>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-center">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#202322]">No Messages Yet</p>
            <p className="text-[11px] text-[#69716F]">
              Start the coordination conversation or send hospital directions.
            </p>
          </div>
        </div>
      ) : (
        messages.map((msg) => {
          // System Notice
          if (msg.messageType === 'SYSTEM') {
            return (
              <div key={msg.id} className="flex justify-center my-3">
                <div className="max-w-md px-4 py-2 rounded-xl bg-zinc-100 border border-zinc-200 text-center space-y-0.5">
                  <p className="text-xs font-medium text-zinc-700">{msg.content}</p>
                  <p className="text-[10px] text-zinc-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          }

          // Structured Coordination Event Milestone
          if (msg.messageType === 'COORDINATION_EVENT') {
            const eventType = msg.metadata?.eventType;
            return (
              <div key={msg.id} className="flex justify-center my-3">
                <div className="w-full max-w-lg p-3.5 rounded-2xl bg-white border border-[#E6E9E7] shadow-sm flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                    {getMilestoneIcon(eventType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#202322]">
                        Milestone: {eventType?.replace(/_/g, ' ') || 'Coordination Update'}
                      </span>
                      <span className="text-[10px] text-[#69716F]">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-[#202322] mt-0.5">{msg.content}</p>
                    <p className="text-[10px] text-[#69716F] mt-1">
                      Logged by {msg.senderName} ({msg.senderRole})
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          // Normal Message Bubble
          const isSender = msg.senderRole === currentRole || (currentUserId && msg.senderId === currentUserId);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSender ? 'items-end' : 'items-start'} space-y-1`}
            >
              {!isSender && (
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-[11px] font-bold text-[#202322]">{msg.senderName}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-white text-[#69716F] border border-[#E6E9E7] capitalize">
                    {msg.senderRole}
                  </span>
                </div>
              )}

              <div
                className={`max-w-md md:max-w-lg rounded-2xl p-3.5 space-y-2 shadow-sm ${
                  isSender
                    ? 'bg-[#8F1928] text-white rounded-br-sm'
                    : 'bg-white text-[#202322] border border-[#E6E9E7] rounded-bl-sm'
                }`}
              >
                {/* Attachment if present */}
                {msg.attachment && (
                  <div className="rounded-xl overflow-hidden border border-black/10">
                    {msg.attachment.mimeType.startsWith('image/') ? (
                      <div className="space-y-1">
                        <img
                          src={msg.attachment.publicUrl || msg.attachment.storagePath}
                          alt={msg.attachment.fileName}
                          className="max-h-60 w-full object-cover rounded-lg"
                        />
                        <p className={`text-[10px] px-2 pb-1 ${isSender ? 'text-white/80' : 'text-[#69716F]'}`}>
                          {msg.attachment.fileName}
                        </p>
                      </div>
                    ) : (
                      <div className={`p-3 flex items-center justify-between gap-3 ${isSender ? 'bg-white/10' : 'bg-[#F8F9F8]'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className={`w-5 h-5 shrink-0 ${isSender ? 'text-white' : 'text-[#B42332]'}`} />
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
                            className={`p-1.5 rounded-lg ${isSender ? 'hover:bg-white/20 text-white' : 'hover:bg-zinc-200 text-[#202322]'}`}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Text Content */}
                {msg.content && (
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )}

                {/* Timestamp & Delivery Status */}
                <div
                  className={`flex items-center justify-end gap-1.5 text-[10px] pt-1 ${
                    isSender ? 'text-white/75' : 'text-[#69716F]'
                  }`}
                >
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isSender && renderDeliveryStatus(msg.deliveryStatus)}
                </div>
              </div>
            </div>
          );
        })
      )}

      <div ref={bottomRef} />
    </div>
  );
};

