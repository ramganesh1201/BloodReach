import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { CoordinationEventType, MessageAttachment } from '../types';

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
  } = useBloodStore();

  const [selectedRequestId, setSelectedRequestId] = useState<string>(() => requests[0]?.id || '');
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'chat' | 'context'>('chat');

  // User-scoped conversations
  const userConversations = getConversationsForUser();

  // Synchronize selectedRequestId with available requests
  useEffect(() => {
    if (requests.length > 0) {
      if (!selectedRequestId || !requests.some((r) => r.id === selectedRequestId)) {
        setSelectedRequestId(requests[0].id);
      }
    } else if (selectedRequestId) {
      setSelectedRequestId('');
    }
  }, [requests, selectedRequestId]);

  // Synchronize activeConversationId with available userConversations
  useEffect(() => {
    if (userConversations.length > 0) {
      if (!activeConversationId || !userConversations.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(userConversations[0].id);
      }
    } else if (activeConversationId) {
      setActiveConversationId(null);
    }
  }, [userConversations, activeConversationId, setActiveConversationId]);

  // Currently selected request (null if requests array is empty)
  const activeRequest = requests.find((r) => r.id === selectedRequestId) || requests[0] || null;

  // Active conversation object strictly scoped to user's permitted conversations
  const activeConversation =
    userConversations.find((c) => c.id === activeConversationId) || userConversations[0] || null;

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

  // Handle simulating a donor acceptance from the BeforeAcceptance tracker
  const handleSimulateAcceptance = async (donorId: string) => {
    if (!activeRequest) return;
    const res = await acceptRequestAndCreateConversation(activeRequest.id, donorId);
    if (res.success && res.conversationId) {
      setActiveConversationId(res.conversationId);
      setMobileTab('chat');
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
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 animate-fade-in min-h-[calc(100vh-5rem)] flex flex-col">
      {/* Header Bar with Request Selector */}
      <div className="bg-app-surface rounded-xl border border-app-border p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-app-text tracking-tight font-display">
                Emergency Communication Hub
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-light text-success border border-success-border">
                <ShieldCheck className="w-3 h-3" />
                <span>End-to-End Relay</span>
              </span>
            </div>
            <p className="text-xs text-app-text-secondary leading-relaxed">
              Private 1-on-1 channels activated exclusively between hospital attendants and verified responders.
            </p>
          </div>
        </div>

        {/* Request Selector & View Mode Switcher */}
        {requests.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-app-muted/60 border border-app-border rounded-lg p-1">
              <span className="text-[11px] font-semibold text-app-text-secondary px-2">Request:</span>
              {requests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(r.id);
                    const conv = userConversations.find((c) => c.requestId === r.id);
                    if (conv) setActiveConversationId(conv.id);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    selectedRequestId === r.id
                      ? 'bg-app-surface text-app-text shadow-xs border border-app-border'
                      : 'text-app-text-secondary hover:text-app-text'
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
        <div className="flex-1 bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden flex flex-col min-h-[640px]">
          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex items-center justify-around border-b border-app-border bg-app-muted/40 p-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMobileTab('sidebar')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors ${
                mobileTab === 'sidebar'
                  ? 'bg-app-surface text-app-text shadow-xs font-bold'
                  : 'text-app-text-secondary font-medium'
              }`}
            >
              Conversations ({userConversations.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors ${
                mobileTab === 'chat'
                  ? 'bg-app-surface text-app-text shadow-xs font-bold'
                  : 'text-app-text-secondary font-medium'
              }`}
            >
              Live Chat
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('context')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors ${
                mobileTab === 'context'
                  ? 'bg-app-surface text-app-text shadow-xs font-bold'
                  : 'text-app-text-secondary font-medium'
              }`}
            >
              Details
            </button>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Pane: Conversation Sidebar */}
            <div
              className={`md:col-span-4 lg:col-span-3 h-full overflow-hidden ${
                mobileTab === 'sidebar' ? 'block' : 'hidden md:block'
              }`}
            >
              <ConversationSidebar
                conversations={userConversations}
                activeConversationId={activeConversation?.id || null}
                onSelectConversation={(id) => {
                  setActiveConversationId(id);
                  setMobileTab('chat');
                }}
                currentRole={currentRole}
              />
            </div>

            {/* Middle Pane: Main Chat Stream & Composer */}
            <div
              className={`md:col-span-8 lg:col-span-6 h-full flex flex-col border-r border-app-border overflow-hidden ${
                mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3.5 border-b border-app-border bg-app-surface flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-light text-brand font-bold flex items-center justify-center text-sm border border-brand/20 shrink-0 font-display">
                        {activeConversation.donorBloodGroup || '—'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-app-text truncate">
                            {currentRole === 'donor'
                              ? (activeConversation.requesterName || 'Emergency Attendant')
                              : (activeConversation.donorName || 'Responder')}
                          </h2>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success-light px-2 py-0.5 rounded-full border border-success-border shrink-0">
                            <Radio className="w-2.5 h-2.5 text-success animate-pulse" />
                            <span>Active Channel</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-app-text-secondary truncate">
                          {activeConversation.referenceCode
                            ? `Request #${activeConversation.referenceCode}`
                            : 'Direct Coordination Channel'}
                          {activeConversation.hospitalName ? ` • ${activeConversation.hospitalName}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                        onClick={() => setMobileTab('context')}
                        className="md:hidden p-2 rounded-lg border border-app-border text-app-text-secondary hover:bg-app-muted"
                        aria-label="Toggle details view"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Structured Coordination Action Bar */}
                  <CoordinationActionPanel
                    currentRole={currentRole}
                    onSubmitMilestone={handleSubmitMilestone}
                    hospitalName={activeConversation.hospitalName}
                  />

                  {/* Message Timeline */}
                  <ChatTimeline
                    messages={activeMessages}
                    currentUserId={currentUser?.id}
                    currentRole={currentRole}
                  />

                  {/* Message Composer */}
                  <MessageComposer
                    onSendMessage={handleSendMessage}
                    isOffline={isOffline}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-center bg-app-muted/30">
                  <div className="space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-xl bg-app-surface border border-app-border text-brand flex items-center justify-center mx-auto shadow-xs">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-app-text font-display">
                      No Conversation Selected
                    </h3>
                    <p className="text-xs text-app-text-secondary leading-relaxed">
                      Choose an accepted responder from the directory on the left to coordinate dispatch.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Pane: Context & Facility Guidelines */}
            <div
              className={`lg:col-span-3 h-full overflow-hidden ${
                mobileTab === 'context' ? 'block' : 'hidden lg:block'
              }`}
            >
              {activeConversation ? (
                <ContextPanel
                  conversation={activeConversation}
                  currentRole={currentRole}
                  onInitiateCall={handleStartCall}
                />
              ) : (
                <div className="p-6 text-center text-xs text-app-text-secondary">
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
