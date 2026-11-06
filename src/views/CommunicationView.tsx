import React, { useState, useEffect } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { BeforeAcceptanceTracker } from '../components/communication/BeforeAcceptanceTracker';
import { ConversationSidebar } from '../components/communication/ConversationSidebar';
import { ChatTimeline } from '../components/communication/ChatTimeline';
import { MessageComposer } from '../components/communication/MessageComposer';
import { CoordinationActionPanel } from '../components/communication/CoordinationActionPanel';
import { ContextPanel } from '../components/communication/ContextPanel';
import {
  MessageSquare,
  ShieldCheck,
  PhoneCall,
  Menu,
  Info,
  ChevronRight,
  Radio,
  Layers,
  ArrowLeft,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { CoordinationEventType, MessageAttachment } from '../types';

export const CommunicationView: React.FC = () => {
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

  const [selectedRequestId, setSelectedRequestId] = useState<string>(() => requests[0]?.id || 'req-8f42');
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'chat' | 'context'>('chat');

  // Currently selected request
  const activeRequest = requests.find((r) => r.id === selectedRequestId) || requests[0];

  // User-scoped conversations
  const userConversations = getConversationsForUser();

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || userConversations[0] || null;

  // Active chat stream
  const activeMessages = activeConversation ? (chatMessages[activeConversation.id] || []) : [];

  // Tracking items for Before-Acceptance state
  const trackingItems = activeRequest ? getDonorTrackingList(activeRequest.id) : [];
  const acceptedDonorsForRequest = trackingItems.filter((t) => t.hasAccepted || t.status === 'ACCEPTED');

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
  const handleSubmitMilestone = (eventType: CoordinationEventType, eventData?: Record<string, any>) => {
    if (!activeConversation) return;
    submitCoordinationEvent(activeConversation.id, eventType, eventData);
  };

  // Handle starting a voice call
  const handleStartCall = async () => {
    if (!activeConversation) return;
    await initiateCall(activeConversation.id);
  };

  // Determine if we should show the Before-Acceptance tracker
  // If the selected request has no accepted donors and the user is a requester/coordinator viewing it
  const isBeforeAcceptance = currentRole !== 'donor' && acceptedDonorsForRequest.length === 0;

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 space-y-4 animate-fade-in min-h-[calc(100vh-5rem)] flex flex-col">
      {/* 1. Header Bar with Request Selector & State Switcher */}
      <div className="bg-white rounded-2xl border border-[#E6E9E7] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#B42332]/10 text-[#B42332] flex items-center justify-center font-bold shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-[#202322] tracking-tight">
                Emergency Communication Hub
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3" />
                Encrypted & Isolated
              </span>
            </div>
            <p className="text-xs text-[#69716F]">
              Private 1-on-1 channels activated exclusively between patient attendant and accepted responders.
            </p>
          </div>
        </div>

        {/* Request Selector & View Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#F8F9F8] border border-[#E6E9E7] rounded-xl p-1">
            <span className="text-[11px] font-semibold text-[#69716F] px-2">Request:</span>
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedRequestId(r.id);
                  // Find if there's a conversation for this request
                  const conv = conversations.find((c) => c.requestId === r.id);
                  if (conv) setActiveConversationId(conv.id);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  selectedRequestId === r.id
                    ? 'bg-white text-[#202322] shadow-sm border border-[#E6E9E7]'
                    : 'text-[#69716F] hover:text-[#202322]'
                }`}
              >
                #{r.referenceCode} ({r.bloodGroup})
              </button>
            ))}
          </div>

          {/* Quick Simulation Button for Demo testing */}
          {isBeforeAcceptance && (
            <button
              type="button"
              onClick={() => handleSimulateAcceptance('donor-1')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#B42332] text-white hover:bg-[#8F1928] shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Simulate Donor Acceptance
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Experience Display */}
      {isBeforeAcceptance ? (
        /* ========================================================================= */
        /* EXPERIENCE A: BEFORE DONOR ACCEPTANCE (Tracking Interface)                */
        /* ========================================================================= */
        <BeforeAcceptanceTracker
          request={activeRequest}
          trackingItems={trackingItems}
          onSimulateAcceptance={handleSimulateAcceptance}
          onInitiateEscalation={() => escalateRequest(activeRequest.id)}
        />
      ) : (
        /* ========================================================================= */
        /* EXPERIENCE B: AFTER DONOR ACCEPTANCE (3-Pane Communication Layout)        */
        /* ========================================================================= */
        <div className="flex-1 bg-white rounded-2xl border border-[#E6E9E7] shadow-subtle overflow-hidden flex flex-col min-h-[640px]">
          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex items-center justify-around border-b border-[#E6E9E7] bg-[#F8F9F8] p-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMobileTab('sidebar')}
              className={`flex-1 py-1.5 rounded-lg text-center transition-colors ${
                mobileTab === 'sidebar' ? 'bg-white text-[#202322] shadow-xs' : 'text-[#69716F]'
              }`}
            >
              Conversations ({userConversations.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-1.5 rounded-lg text-center transition-colors ${
                mobileTab === 'chat' ? 'bg-white text-[#202322] shadow-xs' : 'text-[#69716F]'
              }`}
            >
              Live Chat
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('context')}
              className={`flex-1 py-1.5 rounded-lg text-center transition-colors ${
                mobileTab === 'context' ? 'bg-white text-[#202322] shadow-xs' : 'text-[#69716F]'
              }`}
            >
              Details
            </button>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Pane: Conversation Sidebar (3 cols on desktop) */}
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

            {/* Middle Pane: Main Chat Stream & Composer (6 cols on lg, 8 cols on md) */}
            <div
              className={`md:col-span-8 lg:col-span-6 h-full flex flex-col border-r border-[#E6E9E7] overflow-hidden ${
                mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3.5 border-b border-[#E6E9E7] bg-white flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#8F1928]/10 text-[#8F1928] font-bold flex items-center justify-center text-sm border border-[#8F1928]/20 shrink-0">
                        {activeConversation.donorBloodGroup}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-[#202322] truncate">
                            {currentRole === 'donor'
                              ? activeConversation.requesterName
                              : activeConversation.donorName}
                          </h2>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                            <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                            Active
                          </span>
                        </div>
                        <p className="text-[11px] text-[#69716F] truncate">
                          Request #{activeConversation.referenceCode} • {activeConversation.hospitalName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleStartCall}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#B42332] text-white hover:bg-[#8F1928] transition-colors shadow-xs"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Voice Call</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMobileTab('context')}
                        className="md:hidden p-2 rounded-xl border border-[#E6E9E7] text-[#69716F] hover:bg-[#F8F9F8]"
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
                <div className="flex-1 flex items-center justify-center p-8 text-center bg-[#F8F9F8]">
                  <div className="space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-[#E6E9E7] text-[#B42332] flex items-center justify-center mx-auto shadow-xs">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-[#202322]">No Conversation Selected</h3>
                    <p className="text-xs text-[#69716F]">
                      Choose an accepted responder from the directory on the left to start coordination.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Pane: Context & Facility Guidelines (3 cols on lg, hidden on md) */}
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
                <div className="p-6 text-center text-xs text-[#69716F]">
                  Select an active conversation to inspect request parameters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
