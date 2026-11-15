import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { BeforeAcceptanceTracker } from '../components/communication/BeforeAcceptanceTracker';
import { ConversationSidebar } from '../components/communication/ConversationSidebar';
import { ChatTimeline } from '../components/communication/ChatTimeline';
import { MessageComposer } from '../components/communication/MessageComposer';
import { CoordinationActionPanel } from '../components/communication/CoordinationActionPanel';
import { ContextPanel } from '../components/communication/ContextPanel';
import { EmptyState } from '../components/common/EmptyState';
import {
  MessageSquare,
  ShieldCheck,
  PhoneCall,
  Radio,
  Sparkles,
  Info,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Archive,
  ArchiveRestore,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
} from 'lucide-react';
import { CoordinationEventType, MessageAttachment } from '../types';

function getInitials(name?: string, fallback = 'CL'): string {
  if (!name || name.trim().length === 0) return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const CommunicationView: React.FC = () => {
  const navigate = useNavigate();
  const {
    requests,
    activeConversationId,
    setActiveConversationId,
    chatMessages,
    sendChatMessage,
    markConversationAsRead,
    submitCoordinationEvent,
    initiateCall,
    getDonorTrackingList,
    getConversationsForUser,
    acceptRequestAndCreateConversation,
    escalateRequest,
    currentRole,
    currentUser,
    isOffline,
    refreshConversations,
    proposeCaseCompletion,
    confirmCaseCompletion,
    rejectCaseCompletion,
    coordinatorResolveCase,
    toggleConversationArchive,
    toggleConversationMute,
  } = useBloodStore();

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  const urlConversationId =
    searchParams.get('conversationId') || (location.state as any)?.conversationId || null;
  const urlRequestId = searchParams.get('requestId') || (location.state as any)?.requestId || null;

  const [selectedRequestId, setSelectedRequestId] = useState<string>(() => urlRequestId || requests[0]?.id || '');
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'context'>('chat');

  // Case Lifecycle Modals
  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [proposeReason, setProposeReason] = useState('');
  const [isProposing, setIsProposing] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // User-scoped conversations filtered strictly by authorization
  const userConversations = getConversationsForUser();

  // If conversationId is specified in URL but not yet loaded, trigger background refresh
  useEffect(() => {
    if (urlConversationId && !userConversations.some((c) => c.id === urlConversationId)) {
      if (typeof refreshConversations === 'function') {
        refreshConversations();
      }
    }
  }, [urlConversationId, userConversations, refreshConversations]);

  // Synchronize activeConversationId with URL query params or fallback to first permitted conversation
  useEffect(() => {
    if (urlConversationId) {
      if (activeConversationId !== urlConversationId) {
        setActiveConversationId(urlConversationId);
      }
      return;
    }

    if (userConversations.length > 0) {
      if (!activeConversationId || !userConversations.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(userConversations[0].id);
      }
    } else if (activeConversationId) {
      setActiveConversationId(null);
    }
  }, [urlConversationId, userConversations.length, activeConversationId, setActiveConversationId]);

  // Active conversation object strictly scoped to user's permitted conversations
  const activeConversation =
    userConversations.find((c) => c.id === activeConversationId) || userConversations[0] || null;

  // Synchronize selectedRequestId with active conversation or available requests
  useEffect(() => {
    if (activeConversation?.requestId) {
      if (selectedRequestId !== activeConversation.requestId) {
        setSelectedRequestId(activeConversation.requestId);
      }
      return;
    }

    if (requests.length > 0) {
      if (!selectedRequestId || !requests.some((r) => r.id === selectedRequestId)) {
        setSelectedRequestId(requests[0].id);
      }
    } else if (selectedRequestId) {
      setSelectedRequestId('');
    }
  }, [activeConversation?.requestId, requests, selectedRequestId]);

  const activeRequest = requests.find((r) => r.id === selectedRequestId) || requests[0] || null;
  const activeMessages = activeConversation ? chatMessages[activeConversation.id] || [] : [];
  const trackingItems = activeRequest ? getDonorTrackingList(activeRequest.id) : [];
  const acceptedDonorsForRequest = trackingItems.filter(
    (t) => t.hasAccepted || t.status === 'ACCEPTED'
  );
  const conversationsForActiveRequest = activeRequest
    ? userConversations.filter((c) => c.requestId === activeRequest.id)
    : [];

  useEffect(() => {
    if (activeConversationId) {
      markConversationAsRead(activeConversationId);
    }
  }, [activeConversationId, markConversationAsRead]);

  // Participant Identity Logic
  const isUserDonor =
    currentRole === 'donor' ||
    (Boolean(currentUser?.id) && activeConversation?.donorId === currentUser?.id);
  const activeOtherPartyName = activeConversation
    ? isUserDonor
      ? activeConversation.requesterName || 'Emergency Attendant'
      : activeConversation.donorName || 'Volunteer Donor'
    : 'Emergency Responder';
  const activeOtherPartyInitials = getInitials(activeOtherPartyName, isUserDonor ? 'PA' : 'VD');
  const activeOtherPartySubtitle = activeConversation
    ? isUserDonor
      ? `Patient Attendant • Request #${activeConversation.referenceCode || 'Direct'}`
      : `Volunteer Donor (${activeConversation.donorBloodGroup || '—'}) • Request #${activeConversation.referenceCode || 'Direct'}`
    : 'Direct Coordination Channel';

  const isCompleted = activeConversation?.lifecycleStatus === 'completed';
  const isPending = activeConversation?.lifecycleStatus === 'completion_pending';
  const isProposer = Boolean(
    currentUser?.id && activeConversation?.completionProposedBy === currentUser.id
  );
  const isCoordinatorOrAdmin = ['coordinator', 'admin'].includes(currentRole);

  const handleSimulateAcceptance = async (donorId: string) => {
    if (!activeRequest) return;
    const res = await acceptRequestAndCreateConversation(activeRequest.id, donorId);
    if (res.success && res.conversationId) {
      setActiveConversationId(res.conversationId);
      navigate(`/communication?conversationId=${res.conversationId}`, { replace: true });
      setMobileView('chat');
    }
  };

  const handleSendMessage = async (content: string, attachments?: MessageAttachment[]) => {
    if (!activeConversation) return;
    await sendChatMessage(activeConversation.id, content, attachments);
  };

  const handleSubmitMilestone = (
    eventType: CoordinationEventType,
    eventData?: Record<string, any>
  ) => {
    if (!activeConversation) return;
    submitCoordinationEvent(activeConversation.id, eventType, eventData);
  };

  const handleStartCall = async () => {
    if (!activeConversation || isCompleted) return;
    await initiateCall(activeConversation.id);
  };

  // Lifecycle action handlers
  const handlePropose = async () => {
    if (!activeConversation) return;
    setIsProposing(true);
    const res = await proposeCaseCompletion(activeConversation.id, proposeReason);
    setIsProposing(false);
    if (res.success) {
      setIsProposeModalOpen(false);
      setProposeReason('');
      setActionFeedback({ type: 'success', message: 'Completion proposed. Awaiting confirmation.' });
    } else {
      setActionFeedback({ type: 'error', message: res.error || 'Failed to propose completion.' });
    }
  };

  const handleConfirm = async () => {
    if (!activeConversation) return;
    setIsConfirming(true);
    const res = await confirmCaseCompletion(activeConversation.id, confirmNotes);
    setIsConfirming(false);
    if (res.success) {
      setIsConfirmModalOpen(false);
      setConfirmNotes('');
      setActionFeedback({ type: 'success', message: 'Case successfully completed and resolved!' });
    } else {
      setActionFeedback({ type: 'error', message: res.error || 'Failed to confirm completion.' });
    }
  };

  const handleReject = async () => {
    if (!activeConversation) return;
    const res = await rejectCaseCompletion(activeConversation.id, 'Participant declined completion');
    if (res.success) {
      setActionFeedback({ type: 'success', message: 'Completion proposal declined. Case remains active.' });
    } else {
      setActionFeedback({ type: 'error', message: res.error || 'Failed to decline completion.' });
    }
  };

  const handleResolve = async () => {
    if (!activeConversation) return;
    if (!resolveReason || resolveReason.trim().length < 5) {
      setResolveError('A mandatory resolution reason of at least 5 characters is required.');
      return;
    }
    setIsResolving(true);
    setResolveError(null);
    const res = await coordinatorResolveCase(activeConversation.id, resolveReason, resolveNotes);
    setIsResolving(false);
    if (res.success) {
      setIsResolveModalOpen(false);
      setResolveReason('');
      setResolveNotes('');
      setActionFeedback({ type: 'success', message: 'Case administratively resolved by coordinator.' });
    } else {
      setResolveError(res.error || 'Failed to resolve case.');
    }
  };

  const isBeforeAcceptance = Boolean(
    activeRequest &&
      currentRole !== 'donor' &&
      acceptedDonorsForRequest.length === 0 &&
      conversationsForActiveRequest.length === 0
  );

  return (
    <div className="max-w-7xl mx-auto py-3 sm:py-6 px-3 sm:px-6 lg:px-8 space-y-3 sm:space-y-4 animate-fade-in min-h-[calc(100dvh-4rem)] flex flex-col">
      {/* Top Header Bar */}
      <div className="bg-white rounded-xl border border-[#E6E9E7] p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-[#202322] tracking-tight font-display">
                CareLoop Connect — Emergency Communication Hub
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span className="hidden xs:inline">Protected Clinical Channel</span>
                <span className="xs:hidden">Protected</span>
              </span>
            </div>
            <p className="text-xs text-[#69716F] leading-tight">
              Direct, request-linked 1-on-1 channels activated between attending patients and verified blood donors.
            </p>
          </div>
        </div>

        {/* Request Selector & View Mode Switcher */}
        {requests.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#F8F9F8] border border-[#E6E9E7] rounded-lg p-1">
              <span className="text-[11px] font-bold text-[#69716F] px-1.5">Request:</span>
              {requests.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(r.id);
                    const conv = userConversations.find((c) => c.requestId === r.id);
                    if (conv) {
                      setActiveConversationId(conv.id);
                      navigate(`/communication?conversationId=${conv.id}`, { replace: true });
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                    selectedRequestId === r.id
                      ? 'bg-white text-[#202322] shadow-xs border border-[#E6E9E7]'
                      : 'text-[#69716F] hover:text-[#202322]'
                  }`}
                >
                  #{r.referenceCode || 'REQ'} ({r.bloodGroup || '—'})
                </button>
              ))}
            </div>

            {isBeforeAcceptance && activeRequest && (
              <button
                type="button"
                onClick={() => handleSimulateAcceptance('donor-1')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover shadow-xs transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulate Donor Acceptance</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-xs ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded hover:bg-black/5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Experience Display */}
      {isBeforeAcceptance && activeRequest ? (
        <BeforeAcceptanceTracker
          request={activeRequest}
          trackingItems={trackingItems}
          onSimulateAcceptance={handleSimulateAcceptance}
          onInitiateEscalation={() => {
            if (activeRequest) {
              escalateRequest(activeRequest.id);
            }
          }}
        />
      ) : userConversations.length > 0 ? (
        <div className="flex-1 bg-white rounded-xl border border-[#E6E9E7] shadow-xs overflow-hidden flex flex-col min-h-[580px]">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Pane: Conversation Directory Sidebar (3-View) */}
            <div
              className={`md:col-span-4 lg:col-span-3 h-full overflow-hidden ${
                mobileView === 'list' ? 'block' : 'hidden md:block'
              }`}
            >
              <ConversationSidebar
                conversations={userConversations}
                activeConversationId={activeConversation?.id || null}
                onSelectConversation={(id) => {
                  setActiveConversationId(id);
                  navigate(`/communication?conversationId=${id}`, { replace: true });
                  setMobileView('chat');
                }}
                currentRole={currentRole}
                currentUserId={currentUser?.id}
                onToggleArchive={toggleConversationArchive}
                onToggleMute={toggleConversationMute}
              />
            </div>

            {/* Middle Pane: Focused Chat Thread & Composer */}
            <div
              className={`md:col-span-8 lg:col-span-6 h-full flex flex-col border-r border-[#E6E9E7] overflow-hidden ${
                mobileView === 'chat' ? 'flex' : 'hidden md:flex'
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 sm:p-3.5 border-b border-[#E6E9E7] bg-white flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Mobile Back Button */}
                      <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        className="md:hidden p-1.5 rounded-lg border border-[#E6E9E7] text-[#202322] hover:bg-[#F8F9F8] transition-colors shrink-0"
                        aria-label="Back to channels"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      {/* Participant Initials Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold flex items-center justify-center text-xs tracking-wider border shadow-xs ${
                            isUserDonor
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-brand-light text-brand border-brand/20'
                          }`}
                        >
                          {isUserDonor
                            ? activeOtherPartyInitials
                            : activeConversation.donorBloodGroup || activeOtherPartyInitials}
                        </div>
                        {isCompleted ? (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center"
                            title="Completed"
                          >
                            <CheckCircle2 className="w-2 h-2 text-white" />
                          </span>
                        ) : isPending ? (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center"
                            title="Pending"
                          >
                            <Clock className="w-2 h-2 text-white" />
                          </span>
                        ) : (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
                            title="Active"
                          >
                            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-xs sm:text-sm font-bold text-[#202322] truncate">
                            {activeOtherPartyName}
                          </h2>
                          {isCompleted ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                              Completed
                            </span>
                          ) : isPending ? (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                              Completion Pending
                            </span>
                          ) : (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                              <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                              <span>Connected</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#69716F] truncate">
                          {activeOtherPartySubtitle}
                          {activeConversation.hospitalName ? ` • ${activeConversation.hospitalName}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons: Lifecycle, Voice Call & Details */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Propose Completion Button */}
                      {!isCompleted && !isPending && (
                        <button
                          type="button"
                          onClick={() => setIsProposeModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors shadow-xs"
                          title="Propose case completion upon successful blood donation"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">Propose Completion</span>
                        </button>
                      )}

                      {/* Coordinator / Admin Override Resolution */}
                      {isCoordinatorOrAdmin && !isCompleted && (
                        <button
                          type="button"
                          onClick={() => setIsResolveModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors shadow-xs"
                          title="Administratively resolve case with authorized audit note"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                          <span className="hidden sm:inline">Resolve Case</span>
                        </button>
                      )}

                      {/* Archive toggle if completed */}
                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => toggleConversationArchive(activeConversation.id, !activeConversation.isArchived)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#E6E9E7] text-[#69716F] hover:bg-[#F8F9F8] transition-colors"
                          title={activeConversation.isArchived ? 'Unarchive case' : 'Archive completed case'}
                        >
                          {activeConversation.isArchived ? (
                            <>
                              <ArchiveRestore className="w-3.5 h-3.5 text-brand" />
                              <span className="hidden sm:inline">Unarchive</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Archive</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Voice Call Button (Disabled when completed) */}
                      {!isCompleted ? (
                        <button
                          type="button"
                          onClick={handleStartCall}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover transition-colors shadow-xs"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Voice Call</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                          title="Voice calls disabled on completed cases"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Finished</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setMobileView('context')}
                        className="lg:hidden p-2 rounded-lg border border-[#E6E9E7] text-[#69716F] hover:bg-[#F8F9F8] transition-colors"
                        aria-label="Toggle details view"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Lifecycle Alert Banners */}
                  {isPending && (
                    <div className="p-3 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <p className="font-bold text-amber-900">
                            {isProposer
                              ? 'You proposed completing this emergency case.'
                              : `${activeOtherPartyName} proposed completing this case.`}
                          </p>
                          <p className="text-amber-800 text-[11px]">
                            {activeConversation.completionProposalReason
                              ? `Reason: ${activeConversation.completionProposalReason}`
                              : 'Confirming marks the emergency case fulfilled and archives the channel to read-only.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isProposer || isCoordinatorOrAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsConfirmModalOpen(true)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                            >
                              Confirm & Complete
                            </button>
                            <button
                              type="button"
                              onClick={handleReject}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-xs transition-colors"
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleReject}
                            className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-xs transition-colors"
                          >
                            Cancel Proposal
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="p-2.5 bg-emerald-50/70 border-b border-emerald-200 flex items-center justify-between gap-2 shrink-0 text-xs text-emerald-900">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          This emergency case is completed. All messages and call metadata are permanently preserved.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Coordination Milestone Action Bar */}
                  {!isCompleted && (
                    <CoordinationActionPanel
                      currentRole={currentRole}
                      onSubmitMilestone={handleSubmitMilestone}
                      hospitalName={activeConversation.hospitalName}
                    />
                  )}

                  {/* Message Timeline */}
                  <ChatTimeline
                    messages={activeMessages}
                    currentUserId={currentUser?.id}
                    currentRole={currentRole}
                    isReconnecting={isOffline}
                  />

                  {/* Message Composer (Read-only if completed) */}
                  <MessageComposer
                    onSendMessage={handleSendMessage}
                    isOffline={isOffline}
                    isReadOnly={isCompleted}
                    readOnlyMessage="This emergency case is completed. Message history is preserved in read-only mode."
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-center bg-[#F8F9F8]">
                  <div className="space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-xl bg-white border border-[#E6E9E7] text-brand flex items-center justify-center mx-auto shadow-xs">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-[#202322] font-display">
                      No Channel Selected
                    </h3>
                    <p className="text-xs text-[#69716F] leading-relaxed">
                      Choose an accepted responder from the directory on the left to coordinate dispatch.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMobileView('list')}
                      className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover shadow-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Open Channels</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Pane: Clinical Context & Transfusion Guidelines */}
            <div
              className={`lg:col-span-3 h-full overflow-hidden ${
                mobileView === 'context' ? 'block' : 'hidden lg:block'
              }`}
            >
              {activeConversation ? (
                <ContextPanel
                  conversation={activeConversation}
                  currentRole={currentRole}
                  onInitiateCall={handleStartCall}
                  onBackToChat={() => setMobileView('chat')}
                />
              ) : (
                <div className="p-6 text-center text-xs text-[#69716F]">
                  Select an active conversation to inspect request parameters.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title={
            currentRole === 'patient'
              ? 'No Active Emergency Requests'
              : currentRole === 'donor'
              ? 'No Active Coordination Channels'
              : 'No Active Communications'
          }
          description={
            currentRole === 'patient'
              ? 'You do not have any active emergency requests in coordination. Submit a request to initiate emergency dispatch and activate direct responder channels.'
              : currentRole === 'donor'
              ? 'Direct messaging unlocks automatically as soon as you accept an emergency dispatch call. Visit the Donor Hub to review and accept active calls.'
              : 'No active emergency requests or donor coordination channels are currently registered in this clinical workspace.'
          }
          action={
            currentRole === 'patient'
              ? {
                  label: 'Create Blood Request',
                  onClick: () => navigate('/request'),
                }
              : currentRole === 'donor'
              ? {
                  label: 'Go to Donor Hub',
                  onClick: () => navigate('/donor'),
                }
              : {
                  label: 'Coordinator Dashboard',
                  onClick: () => navigate('/coordinator'),
                }
          }
        />
      )}

      {/* MODAL 1: Propose Case Completion */}
      {isProposeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E6E9E7] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-[#202322]">Propose Case Completion</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProposeModalOpen(false)}
                className="p-1 rounded-lg text-[#69716F] hover:bg-[#F0F2F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#69716F] leading-relaxed">
              Propose closing this emergency coordination channel after blood donation/transfusion has concluded.
              The other participant will be prompted to confirm.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Completion Note / Reason (Optional)
              </label>
              <textarea
                value={proposeReason}
                onChange={(e) => setProposeReason(e.target.value)}
                placeholder="e.g. Donation completed successfully at hospital blood bank desk."
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E9E7]">
              <button
                type="button"
                onClick={() => setIsProposeModalOpen(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-[#69716F] hover:bg-[#F0F2F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePropose}
                disabled={isProposing}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
              >
                {isProposing ? 'Submitting...' : 'Propose Completion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm Case Completion */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E6E9E7] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-[#202322]">Confirm Case Completion</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded-lg text-[#69716F] hover:bg-[#F0F2F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#69716F] leading-relaxed">
              Confirm that emergency blood donation coordination is fulfilled. This action marks the case as
              <strong className="text-emerald-700"> Completed</strong> and preserves the channel in read-only mode.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Confirmation Notes (Optional)
              </label>
              <textarea
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="e.g. Unit received and validated by attending physician."
                rows={2}
                className="w-full p-2.5 text-xs rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E9E7]">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-[#69716F] hover:bg-[#F0F2F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isConfirming}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
              >
                {isConfirming ? 'Confirming...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Coordinator / Admin Override Resolution */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E6E9E7] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-[#202322]">Administrative Case Resolution</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="p-1 rounded-lg text-[#69716F] hover:bg-[#F0F2F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#69716F] leading-relaxed">
              Resolve this coordination case administratively. Requires an immutable audit reason for compliance.
            </p>

            {resolveError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {resolveError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Mandatory Resolution Reason * (min 5 chars)
              </label>
              <textarea
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                placeholder="e.g. Unit supplied via blood bank alternate stock; donor released from dispatch."
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Clinical Audit Notes (Optional)
              </label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Additional case metadata or reference numbers."
                rows={2}
                className="w-full p-2.5 text-xs rounded-xl bg-[#F8F9F8] border border-[#E6E9E7] text-[#202322] placeholder:text-[#69716F] focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E9E7]">
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-[#69716F] hover:bg-[#F0F2F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolve}
                disabled={isResolving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
              >
                {isResolving ? 'Resolving...' : 'Resolve & Complete Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
