import React, { useState, useEffect } from 'react';
import { Conversation, UserRole, CallHistoryRecord } from '../../types';
import { useBloodStore } from '../../store/useBloodStore';
import {
  Hospital,
  MapPin,
  PhoneCall,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Calendar,
  Lock,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Info,
  Archive,
} from 'lucide-react';

interface ContextPanelProps {
  conversation: Conversation;
  currentRole: UserRole;
  onInitiateCall: () => void;
  onBackToChat?: () => void;
}

function formatCallDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatCallTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  conversation,
  currentRole,
  onInitiateCall,
  onBackToChat,
}) => {
  const { getConversationCallHistory, currentUser } = useBloodStore();
  const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (conversation?.id && typeof getConversationCallHistory === 'function') {
      setIsLoadingCalls(true);
      getConversationCallHistory(conversation.id)
        .then((calls) => {
          if (isMounted) {
            setCallHistory(calls || []);
            setIsLoadingCalls(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsLoadingCalls(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [conversation?.id, getConversationCallHistory]);

  const isDonor = currentRole === 'donor';
  const otherPartyTitle = isDonor
    ? conversation.requesterName || 'Emergency Attendant'
    : conversation.donorName || 'Volunteer Donor';

  const isCompleted = conversation.lifecycleStatus === 'completed';
  const isPending = conversation.lifecycleStatus === 'completion_pending';

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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#69716F]">
              Emergency Request Context
            </h3>
            <p className="text-sm font-bold text-[#202322] font-display mt-0.5">
              {conversation.referenceCode
                ? `Request #${conversation.referenceCode}`
                : 'Direct Coordination Channel'}
            </p>
          </div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Resolved</span>
            </span>
          ) : isPending ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              <Clock className="w-3 h-3 text-amber-600" />
              <span>Pending</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Active</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quick Voice Call Trigger */}
        {!isCompleted ? (
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
              <span>Start Voice Call</span>
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-1.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#202322]">
              <Lock className="w-3.5 h-3.5 text-[#69716F]" />
              <span>Case Completed</span>
            </div>
            <p className="text-[11px] text-[#69716F] leading-relaxed">
              This case has reached its clinical conclusion. Direct voice calling is preserved as finished.
            </p>
          </div>
        )}

        {/* Case Lifecycle Audit Summary Card */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#202322]">Case Lifecycle</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                isCompleted
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : isPending
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}
            >
              {conversation.lifecycleStatus || 'active'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-[#69716F]">
            {isCompleted && (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Completed at:</span>
                  <span className="font-semibold text-[#202322]">
                    {formatCallTime(conversation.completedAt || conversation.closedAt)}
                  </span>
                </div>
                {conversation.closureReason && (
                  <div className="p-2 rounded bg-white border border-[#E6E9E7] text-[11px]">
                    <p className="font-semibold text-[#202322]">Resolution note:</p>
                    <p className="text-[#69716F] mt-0.5">{conversation.closureReason}</p>
                  </div>
                )}
                {conversation.coordinatorResolutionReason && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px]">
                    <p className="font-semibold text-amber-900">Coordinator Override:</p>
                    <p className="text-amber-800 mt-0.5">{conversation.coordinatorResolutionReason}</p>
                  </div>
                )}
              </>
            )}

            {isPending && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] space-y-1">
                <div className="flex items-center gap-1 font-bold text-amber-900">
                  <Clock className="w-3 h-3 text-amber-700" />
                  <span>Completion Pending Confirmation</span>
                </div>
                {conversation.completionProposalReason && (
                  <p className="text-amber-800">Reason: {conversation.completionProposalReason}</p>
                )}
              </div>
            )}

            {!isCompleted && !isPending && (
              <p className="text-[11px] text-[#69716F]">
                Active coordination channel in progress. Either participant can propose completion upon donation fulfillment.
              </p>
            )}
          </div>
        </div>

        {/* Real Call Session History Card */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#202322]">Call History</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#E6E9E7] text-[#69716F]">
              {callHistory.length}
            </span>
          </div>

          {isLoadingCalls ? (
            <p className="text-[11px] text-[#69716F] text-center py-2">Loading call sessions...</p>
          ) : callHistory.length === 0 ? (
            <div className="text-center py-3 space-y-1">
              <PhoneCall className="w-5 h-5 text-zinc-300 mx-auto" />
              <p className="text-[11px] text-[#69716F]">No voice calls logged for this case.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto divide-y divide-[#E6E9E7]">
              {callHistory.map((call) => {
                const isCaller = currentUser?.id && call.callerId === currentUser.id;
                const isMissed = ['REJECTED', 'TIMEOUT', 'FAILED'].includes(call.status);
                const isConnected = ['CONNECTED', 'ENDED', 'ACCEPTED'].includes(call.status);

                return (
                  <div key={call.id} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isMissed
                            ? 'bg-rose-50 text-rose-600'
                            : isConnected
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {isMissed ? (
                          <PhoneMissed className="w-3 h-3" />
                        ) : isCaller ? (
                          <PhoneOutgoing className="w-3 h-3" />
                        ) : (
                          <PhoneIncoming className="w-3 h-3" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#202322] truncate">
                          {isCaller ? 'Outgoing Call' : 'Incoming Call'}
                        </p>
                        <p className="text-[10px] text-[#69716F]">
                          {formatCallTime(call.startedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          isMissed
                            ? 'bg-rose-100 text-rose-800'
                            : isConnected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {call.status}
                      </span>
                      {call.durationSeconds && call.durationSeconds > 0 ? (
                        <p className="text-[10px] text-[#69716F] font-mono mt-0.5">
                          {formatCallDuration(call.durationSeconds)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
