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
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Archive,
  ArchiveRestore,
  Info,
  X,
  AlertTriangle,
  Heart,
  Droplet,
  ChevronRight,
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
  const location = useLocation();
  const {
    requests = [],
    activeConversationId,
    setActiveConversationId,
    chatMessages = {},
    sendChatMessage,
    markConversationAsRead,
    submitCoordinationEvent,
    initiateCall,
    getDonorTrackingList,
    getConversationsForUser,
    acceptRequestAndCreateConversation,
    escalateRequest,
    currentRole = 'patient',
    currentUser,
    userDonorProfile,
    isOffline = false,
    refreshConversations,
    proposeCaseCompletion,
    confirmCaseCompletion,
    rejectCaseCompletion,
    coordinatorResolveCase,
    toggleConversationArchive,
    toggleConversationMute,
  } = useBloodStore();

  const searchParams = new URLSearchParams(location.search);
  const urlConversationId =
    searchParams.get('conversationId') || (location.state as any)?.conversationId || null;

  // Mobile switchable view: 'list' (thread directory) or 'chat' (active thread)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() =>
    urlConversationId ? 'chat' : 'list'
  );

  // Info drawer state for secondary clinical context
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);

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

  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Strict user-scoped conversations
  const userConversations = typeof getConversationsForUser === 'function' ? getConversationsForUser() : [];

  // If conversationId is specified in URL but not loaded yet, refresh in background
  useEffect(() => {
    if (urlConversationId && !userConversations.some((c) => c.id === urlConversationId)) {
      if (typeof refreshConversations === 'function') {
        refreshConversations();
      }
    }
  }, [urlConversationId, userConversations, refreshConversations]);

  // Synchronize active conversation with URL or fallback to first permitted conversation
  useEffect(() => {
    if (urlConversationId) {
      const match = userConversations.find((c) => c.id === urlConversationId);
      if (match) {
        if (activeConversationId !== match.id) {
          setActiveConversationId(match.id);
        }
        setMobileView('chat');
        return;
      }
    }

    if (userConversations.length > 0) {
      if (!activeConversationId || !userConversations.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(userConversations[0].id);
      }
    } else if (activeConversationId) {
      setActiveConversationId(null);
    }
  }, [urlConversationId, userConversations, activeConversationId, setActiveConversationId]);

  // Active conversation object strictly scoped to permitted user conversations
  const activeConversation =
    userConversations.find((c) => c.id === activeConversationId) ||
    (userConversations.length > 0 ? userConversations[0] : null);

  const activeMessages = activeConversation ? chatMessages[activeConversation.id] || [] : [];

  // Active request and tracking for patient before-acceptance flow
  const activeRequest = requests[0] || null;
  const trackingItems =
    activeRequest && typeof getDonorTrackingList === 'function'
      ? getDonorTrackingList(activeRequest.id)
      : [];

  const isBeforeAcceptance = Boolean(
    !urlConversationId &&
      !activeConversation &&
      activeRequest &&
      currentRole === 'patient' &&
      userConversations.length === 0
  );

  useEffect(() => {
    if (activeConversationId && typeof markConversationAsRead === 'function') {
      markConversationAsRead(activeConversationId);
    }
  }, [activeConversationId, markConversationAsRead]);

  // Participant Identity & Label Logic
  const isUserDonor =
    currentRole === 'donor' ||
    (Boolean(userDonorProfile?.id) && activeConversation?.donorId === userDonorProfile?.id) ||
    (Boolean(currentUser?.id) &&
      (activeConversation?.donorId === currentUser?.id ||
        (activeConversation as any)?.donorProfileId === currentUser?.id)) ||
    (Boolean(currentUser?.id) &&
      Boolean(userDonorProfile) &&
      activeConversation?.requesterId !== currentUser?.id);

  const otherPartyName = activeConversation
    ? isUserDonor
      ? `${activeConversation.requesterName || 'Emergency Attendant'} (Patient Attendant)`
      : activeConversation.donorName || 'Volunteer Donor'
    : 'Emergency Responder';

  const otherPartyInitials = getInitials(otherPartyName, isUserDonor ? 'PA' : 'VD');

  const otherPartySubtitle = activeConversation
    ? activeConversation.referenceCode
      ? isUserDonor
        ? `Patient Attendant • Request #${activeConversation.referenceCode}${
            activeConversation.hospitalName ? ` • ${activeConversation.hospitalName}` : ''
          }`
        : `Volunteer Donor (${activeConversation.donorBloodGroup || '—'}) • Request #${
            activeConversation.referenceCode
          }${activeConversation.hospitalName ? ` • ${activeConversation.hospitalName}` : ''}`
      : 'Direct Coordination Channel'
    : 'Direct Coordination Channel';

  const isCompleted = activeConversation?.lifecycleStatus === 'completed';
  const isPending = activeConversation?.lifecycleStatus === 'completion_pending';
  const isProposer = Boolean(
    currentUser?.id && activeConversation?.completionProposedBy === currentUser.id
  );
  const isCoordinatorOrAdmin = ['coordinator', 'admin'].includes(currentRole);

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    navigate(`/communication?conversationId=${id}`, { replace: true });
    setMobileView('chat');
  };

  const handleBackToList = () => {
    setMobileView('list');
    navigate('/communication', { replace: true });
  };

  const handleSendMessage = async (content: string, attachments?: MessageAttachment[]) => {
    if (!activeConversation || typeof sendChatMessage !== 'function') return;
    await sendChatMessage(activeConversation.id, content, attachments);
  };

  const handleSubmitMilestone = (
    eventType: CoordinationEventType,
    eventData?: Record<string, any>
  ) => {
    if (!activeConversation || typeof submitCoordinationEvent !== 'function') return;
    submitCoordinationEvent(activeConversation.id, eventType, eventData);
  };

  const handleStartCall = async () => {
    if (!activeConversation || isCompleted || typeof initiateCall !== 'function') return;
    await initiateCall(activeConversation.id);
  };

  const handleSimulateAcceptance = async (donorId: string) => {
    if (!activeRequest || typeof acceptRequestAndCreateConversation !== 'function') return;
    const res = await acceptRequestAndCreateConversation(activeRequest.id, donorId);
    if (res?.success && res.conversationId) {
      setActiveConversationId(res.conversationId);
      navigate(`/communication?conversationId=${res.conversationId}`, { replace: true });
      setMobileView('chat');
    }
  };

  const handlePropose = async () => {
    if (!activeConversation || typeof proposeCaseCompletion !== 'function') return;
    setIsProposing(true);
    const res = await proposeCaseCompletion(activeConversation.id, proposeReason);
    setIsProposing(false);
    if (res?.success) {
      setIsProposeModalOpen(false);
      setProposeReason('');
      setActionFeedback({
        type: 'success',
        message: 'Completion proposed. Awaiting confirmation from attending party.',
      });
    } else {
      setActionFeedback({ type: 'error', message: res?.error || 'Failed to propose completion.' });
    }
  };

  const handleConfirm = async () => {
    if (!activeConversation || typeof confirmCaseCompletion !== 'function') return;
    setIsConfirming(true);
    const res = await confirmCaseCompletion(activeConversation.id, confirmNotes);
    setIsConfirming(false);
    if (res?.success) {
      setIsConfirmModalOpen(false);
      setConfirmNotes('');
      setActionFeedback({ type: 'success', message: 'Case completed and safely resolved!' });
    } else {
      setActionFeedback({ type: 'error', message: res?.error || 'Failed to confirm completion.' });
    }
  };

  const handleReject = async () => {
    if (!activeConversation || typeof rejectCaseCompletion !== 'function') return;
    const res = await rejectCaseCompletion(activeConversation.id, 'Participant declined completion');
    if (res?.success) {
      setActionFeedback({
        type: 'success',
        message: 'Completion proposal declined. Case remains active.',
      });
    } else {
      setActionFeedback({ type: 'error', message: res?.error || 'Failed to decline completion.' });
    }
  };

  const handleResolve = async () => {
    if (!activeConversation || typeof coordinatorResolveCase !== 'function') return;
    if (!resolveReason || resolveReason.trim().length < 5) {
      setResolveError('A mandatory resolution reason of at least 5 characters is required.');
      return;
    }
    setIsResolving(true);
    setResolveError(null);
    const res = await coordinatorResolveCase(activeConversation.id, resolveReason, resolveNotes);
    setIsResolving(false);
    if (res?.success) {
      setIsResolveModalOpen(false);
      setResolveReason('');
      setResolveNotes('');
      setActionFeedback({
        type: 'success',
        message: 'Case administratively resolved by coordinator.',
      });
    } else {
      setResolveError(res?.error || 'Failed to resolve case.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-3 h-[calc(100dvh-4.25rem)] flex flex-col animate-fade-in overflow-hidden">
      {/* Top Header Bar / Brand Identifier */}
      <div className="hidden sm:flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold">
            <MessageSquare className="w-3.5 h-3.5 text-[#B42332]" />
          </div>
          <h1 className="text-sm font-bold text-[#202322] font-display">
            Emergency Communication Hub
          </h1>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Encrypted Channel
          </span>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`mb-2 p-2.5 sm:p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-xs shrink-0 ${
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
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Experience View */}
      {isBeforeAcceptance && activeRequest ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#E6E9E7] shadow-xs">
            <span className="text-xs font-semibold text-[#69716F]">Emergency Dispatch in Progress</span>
            <button
              type="button"
              onClick={() => handleSimulateAcceptance('donor-1')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#B42332] text-white hover:bg-[#8F1928] shadow-xs transition-all"
            >
              <span>Simulate Donor Acceptance</span>
            </button>
          </div>
          <BeforeAcceptanceTracker
            request={activeRequest}
            trackingItems={trackingItems}
            onSimulateAcceptance={handleSimulateAcceptance}
            onInitiateEscalation={() => {
              if (activeRequest && typeof escalateRequest === 'function') {
                escalateRequest(activeRequest.id);
              }
            }}
          />
        </div>
      ) : userConversations.length > 0 ? (
        <div className="flex-1 bg-white rounded-2xl border border-[#E6E9E7] shadow-xs overflow-hidden flex min-h-0 relative">
          {/* LEFT PANEL: WhatsApp / Instagram-style Directory */}
          <div
            className={`w-full md:w-80 lg:w-96 shrink-0 h-full border-r border-[#E6E9E7] flex flex-col ${
              mobileView === 'list' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ConversationSidebar
              conversations={userConversations}
              activeConversationId={activeConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              currentRole={currentRole}
              currentUserId={currentUser?.id}
              onToggleArchive={toggleConversationArchive}
              onToggleMute={toggleConversationMute}
            />
          </div>

          {/* RIGHT PANEL: Active 1-on-1 Chat Window */}
          <div
            className={`flex-1 h-full flex flex-col overflow-hidden bg-[#FAFBFA] ${
              mobileView === 'chat' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {activeConversation ? (
              <>
                {/* Chat Top Header */}
                <div className="p-3 sm:p-3.5 border-b border-[#E6E9E7] bg-white flex items-center justify-between gap-3 shrink-0 shadow-xs z-10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Mobile Back Button */}
                    <button
                      type="button"
                      onClick={handleBackToList}
                      className="md:hidden p-2 -ml-1 rounded-xl border border-[#E6E9E7] text-[#202322] hover:bg-[#F8F9F8] transition-colors shrink-0"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>

                    {/* Participant Avatar */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold flex items-center justify-center text-xs tracking-wider border shadow-xs ${
                          isUserDonor
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-brand-light text-brand border-brand/20'
                        }`}
                      >
                        {isUserDonor
                          ? otherPartyInitials
                          : activeConversation.donorBloodGroup || otherPartyInitials}
                      </div>

                      {/* Status indicator dot */}
                      {isCompleted ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center shadow-xs"
                          title="Case completed"
                        >
                          <CheckCircle2 className="w-2 h-2 text-white" />
                        </span>
                      ) : isPending ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center shadow-xs"
                          title="Completion pending"
                        >
                          <Clock className="w-2 h-2 text-white" />
                        </span>
                      ) : (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs"
                          title="Active connection"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        </span>
                      )}
                    </div>

                    {/* Header Text & Badges */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-xs sm:text-sm font-bold text-[#202322] truncate">
                          {otherPartyName}
                        </h2>
                        {/* Request Reference Chip */}
                        {activeConversation.referenceCode && (
                          <span className="text-[10px] font-mono font-bold bg-[#F0F2F0] text-[#202322] px-1.5 py-0.5 rounded-md border border-[#E6E9E7] shrink-0">
                            #{activeConversation.referenceCode}
                          </span>
                        )}
                        {isCompleted ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                            Completed
                          </span>
                        ) : isPending ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                            Pending Close
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                            <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                            <span>Live Chat</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#69716F] truncate">{otherPartySubtitle}</p>
                    </div>
                  </div>

                  {/* Header Actions: Lifecycle, Call & Clinical Info Sheet */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Propose Completion */}
                    {!isCompleted && !isPending && (
                      <button
                        type="button"
                        onClick={() => setIsProposeModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors shadow-xs"
                        title="Propose case completion upon successful blood donation"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden lg:inline">Complete Case</span>
                      </button>
                    )}

                    {/* Coordinator Override */}
                    {isCoordinatorOrAdmin && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => setIsResolveModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors shadow-xs"
                        title="Administratively resolve case"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                        <span className="hidden lg:inline">Resolve</span>
                      </button>
                    )}

                    {/* Archive toggle if completed */}
                    {isCompleted && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleConversationArchive?.(
                            activeConversation.id,
                            !activeConversation.isArchived
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-[#E6E9E7] text-[#69716F] hover:bg-[#F8F9F8] transition-colors"
                        title={
                          activeConversation.isArchived ? 'Unarchive case' : 'Archive completed case'
                        }
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

                    {/* WebRTC Voice Call */}
                    {!isCompleted ? (
                      <button
                        type="button"
                        onClick={handleStartCall}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#B42332] text-white hover:bg-[#8F1928] transition-colors shadow-xs active:scale-95"
                        title="Encrypted Voice Call (WebRTC Ready)"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Voice Call</span>
                        <span className="hidden lg:inline text-[10px] font-normal opacity-90 border-l border-white/30 pl-1.5">
                          WebRTC Ready
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                        title="Voice calls disabled on completed cases"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Finished</span>
                      </button>
                    )}

                    {/* Clinical Details Drawer Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)}
                      className={`p-2 rounded-xl border transition-colors ${
                        isInfoDrawerOpen
                          ? 'bg-[#B42332]/10 border-[#B42332]/30 text-[#B42332]'
                          : 'border-[#E6E9E7] bg-white text-[#69716F] hover:bg-[#F8F9F8]'
                      }`}
                      title="Case parameters & transfusion details"
                      aria-label="Toggle clinical details drawer"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Completion Pending Alert Banner */}
                {isPending && (
                  <div className="p-3 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 text-xs z-10">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-bold text-amber-900">
                          {isProposer
                            ? 'You proposed completing this emergency case.'
                            : `${otherPartyName} proposed completing this case.`}
                        </p>
                        <p className="text-amber-800 text-[11px]">
                          {activeConversation.completionProposalReason
                            ? `Reason: ${activeConversation.completionProposalReason}`
                            : 'Confirming marks the emergency case fulfilled and archives the channel in read-only mode.'}
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

                {/* Case Completed Banner */}
                {isCompleted && (
                  <div className="p-2.5 bg-emerald-50/80 border-b border-emerald-200 flex items-center justify-between gap-2 shrink-0 text-xs text-emerald-900 z-10">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        This emergency coordination case is completed. Message history and call records are permanently preserved.
                      </span>
                    </div>
                  </div>
                )}

                {/* Coordination Milestone Quick Actions (Compact scroll bar) */}
                {!isCompleted && (
                  <div className="shrink-0 z-10">
                    <CoordinationActionPanel
                      currentRole={currentRole}
                      onSubmitMilestone={handleSubmitMilestone}
                      hospitalName={activeConversation.hospitalName}
                    />
                  </div>
                )}

                {/* Message Timeline (flex-1 scrollable) */}
                <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                  <ChatTimeline
                    messages={activeMessages}
                    currentUserId={currentUser?.id}
                    currentRole={currentRole}
                    isReconnecting={isOffline}
                  />
                </div>

                {/* Fixed Bottom Message Composer */}
                <div className="shrink-0 bg-white z-10">
                  <MessageComposer
                    onSendMessage={handleSendMessage}
                    isOffline={isOffline}
                    isReadOnly={isCompleted}
                    readOnlyMessage="This emergency case is completed. Message history is preserved in read-only mode."
                  />
                </div>
              </>
            ) : (
              /* No Active Channel Selected Placeholder */
              <div className="flex-1 flex items-center justify-center p-8 text-center bg-[#F8F9F8]">
                <div className="space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-[#E6E9E7] text-brand flex items-center justify-center mx-auto shadow-xs">
                    <MessageSquare className="w-6 h-6 text-[#B42332]" />
                  </div>
                  <h3 className="text-sm font-bold text-[#202322] font-display">
                    Select a Conversation
                  </h3>
                  <p className="text-xs text-[#69716F] leading-relaxed">
                    Choose an emergency responder from the list on the left to coordinate dispatch.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="md:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#B42332] text-white hover:bg-[#8F1928] shadow-xs transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Open Conversations</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SLIDE-OVER CLINICAL DETAILS DRAWER (replaces rigid 3rd column) */}
          {isInfoDrawerOpen && activeConversation && (
            <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-80 md:w-96 bg-white border-l border-[#E6E9E7] shadow-xl flex flex-col animate-slide-left">
              <div className="p-3 border-b border-[#E6E9E7] flex items-center justify-between bg-[#F8F9F8]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#B42332]" />
                  <span className="text-xs font-bold text-[#202322]">Clinical Case Details</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInfoDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[#69716F] hover:bg-black/5 transition-colors"
                  aria-label="Close details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <ContextPanel
                  conversation={activeConversation}
                  currentRole={currentRole}
                  onInitiateCall={handleStartCall}
                  onBackToChat={() => setIsInfoDrawerOpen(false)}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* REASSURING EMPTY STATE (strictly role-tailored with zero mock leaks) */
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
              The attending party will be prompted to confirm.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Completion Note / Reason (Optional)
              </label>
              <textarea
                value={proposeReason}
                onChange={(e) => setProposeReason(e.target.value)}
                placeholder="e.g. Blood unit verified and donation concluded at hospital blood bank."
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
              <strong className="text-emerald-700"> Completed</strong> and archives the channel in read-only mode.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#202322] mb-1">
                Confirmation Notes (Optional)
              </label>
              <textarea
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="e.g. Unit received and cross-match verified by attending physician."
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

      {/* MODAL 3: Coordinator / Admin Case Resolution */}
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
                placeholder="e.g. Unit supplied via blood bank alternate inventory; donor released."
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
                placeholder="Additional audit tracking notes."
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
