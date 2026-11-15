import React, { useState, useEffect, useMemo } from 'react';
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
  Activity,
  Droplet,
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
    conversations,
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
  } = useBloodStore();

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  const urlConversationId = searchParams.get('conversationId') || (location.state as any)?.conversationId || null;
  const urlRequestId = searchParams.get('requestId') || (location.state as any)?.requestId || null;

  const [selectedRequestId, setSelectedRequestId] = useState<string>(() => urlRequestId || requests[0]?.id || '');
  // Mobile dedicated view mode: 'list' (channel directory) | 'chat' (full-screen thread) | 'context' (clinical drawer)
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'context'>('chat');

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

  // Currently selected request (null if requests array is empty)
  const activeRequest = requests.find((r) => r.id === selectedRequestId) || requests[0] || null;

  // Active chat stream
  const activeMessages = activeConversation ? chatMessages[activeConversation.id] || [] : [];

  // Tracking items for Before-Acceptance state
  const trackingItems = activeRequest ? getDonorTrackingList(activeRequest.id) : [];
  const acceptedDonorsForRequest = trackingItems.filter(
    (t) => t.hasAccepted || t.status === 'ACCEPTED'
  );

  // Conversations already established for this specific request
  const conversationsForActiveRequest = activeRequest
    ? userConversations.filter((c) => c.requestId === activeRequest.id)
    : [];

  // Mark active conversation as read when selected
  useEffect(() => {
    if (activeConversationId) {
      markConversationAsRead(activeConversationId);
    }
  }, [activeConversationId, markConversationAsRead]);

  // Participant Identity Derivation:
  // Patient views Donor's actual name; Donor views Requester's actual name. Never own name.
  const isUserDonor = currentRole === 'donor' || (Boolean(currentUser?.id) && activeConversation?.donorId === currentUser?.id);
  const activeOtherPartyName = activeConversation
    ? isUserDonor
      ? (activeConversation.requesterName || 'Emergency Attendant')
      : (activeConversation.donorName || 'Volunteer Donor')
    : 'Emergency Responder';
  const activeOtherPartyInitials = getInitials(activeOtherPartyName, isUserDonor ? 'PA' : 'VD');
  const activeOtherPartySubtitle = activeConversation
    ? isUserDonor
      ? `Patient Attendant • Request #${activeConversation.referenceCode || 'Direct'}`
      : `Volunteer Donor (${activeConversation.donorBloodGroup || '—'}) • Request #${activeConversation.referenceCode || 'Direct'}`
    : 'Direct Coordination Channel';

  // Handle simulating a donor acceptance from the BeforeAcceptance tracker
  const handleSimulateAcceptance = async (donorId: string) => {
    if (!activeRequest) return;
    const res = await acceptRequestAndCreateConversation(activeRequest.id, donorId);
    if (res.success && res.conversationId) {
      setActiveConversationId(res.conversationId);
      navigate(`/communication?conversationId=${res.conversationId}`, { replace: true });
      setMobileView('chat');
    }
  };

  // Handle sending a chat message
  const handleSendMessage = async (content: string, attachments?: MessageAttachment[]) => {
    if (!activeConversation) return;
    await sendChatMessage(activeConversation.id, content, attachments);
  };

  // Handle submitting a coordination event milestone
  const handleSubmitMilestone = (
    eventType: CoordinationEventType,
    eventData?: Record<string, any>
  ) => {
    if (!activeConversation) return;
    submitCoordinationEvent(activeConversation.id, eventType, eventData);
  };

  // Handle starting a voice call
  const handleStartCall = async () => {
    if (!activeConversation) return;
    await initiateCall(activeConversation.id);
  };

  // Determine if we should show the Before-Acceptance tracker:
  // Requires a genuine activeRequest, non-donor role, zero accepted donors, and no opened conversations.
  const isBeforeAcceptance = Boolean(
    activeRequest &&
    currentRole !== 'donor' &&
    acceptedDonorsForRequest.length === 0 &&
    conversationsForActiveRequest.length === 0
  );

  return (
    <div className="max-w-7xl mx-auto py-3 sm:py-6 px-3 sm:px-6 lg:px-8 space-y-3 sm:space-y-4 animate-fade-in min-h-[calc(100dvh-4rem)] flex flex-col">
      {/* Top Clinical Header Bar with Request Selector */}
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

            {/* Simulation Button for testing if in Before-Acceptance mode */}
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
            {/* Left Pane: Conversation Directory Sidebar */}
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
                      {/* Mobile Back Button: Returns to Channel Directory */}
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
                          {isUserDonor ? activeOtherPartyInitials : activeConversation.donorBloodGroup || activeOtherPartyInitials}
                        </div>
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
                          title="Active private channel"
                        >
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-xs sm:text-sm font-bold text-[#202322] truncate">
                            {activeOtherPartyName}
                          </h2>
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                            <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                            <span>Connected</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-[#69716F] truncate">
                          {activeOtherPartySubtitle}
                          {activeConversation.hospitalName ? ` • ${activeConversation.hospitalName}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons: Voice Call & Mobile Context Drawer */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleStartCall}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover transition-colors shadow-xs"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Voice Call</span>
                      </button>

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

                  {/* Structured Coordination Milestone Action Bar */}
                  <CoordinationActionPanel
                    currentRole={currentRole}
                    onSubmitMilestone={handleSubmitMilestone}
                    hospitalName={activeConversation.hospitalName}
                  />

                  {/* Message Timeline with Deduplication & Date Separators */}
                  <ChatTimeline
                    messages={activeMessages}
                    currentUserId={currentUser?.id}
                    currentRole={currentRole}
                    isReconnecting={isOffline}
                  />

                  {/* Message Composer */}
                  <MessageComposer
                    onSendMessage={handleSendMessage}
                    isOffline={isOffline}
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
    </div>
  );
};
