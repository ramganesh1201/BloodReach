import React from 'react';
import { useBloodStore } from '../../store/useBloodStore';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { VoiceCallModal } from './VoiceCallModal';

/**
 * GlobalCallManager provides app-wide WebRTC call interface orchestration.
 * Renders both the incoming call notification overlay and the active voice
 * call modal across all views (Patient, Donor, Blood Centre, Coordinator, Admin).
 */
export const GlobalCallManager: React.FC = () => {
  const {
    activeCallSession,
    isCallModalOpen,
    currentRole,
    audioLevel,
    callConnectionState,
    isMicrophoneMuted,
    callError,
    toggleMicrophoneMute,
    answerCall,
    rejectCall,
    cancelCall,
    endCall,
    closeCallModal,
    setAudioOutputSink,
    conversations,
  } = useBloodStore();

  const currentConv = conversations.find(
    (c) => c.id === activeCallSession?.conversationId
  );
  const fallbackPhone =
    currentConv?.donorPhone ||
    currentConv?.requesterPhone ||
    activeCallSession?.metadata?.fallback_phone ||
    '+91 98490 55123';

  return (
    <>
      <IncomingCallOverlay />
      <VoiceCallModal
        session={activeCallSession}
        isOpen={isCallModalOpen}
        currentRole={currentRole}
        audioLevel={audioLevel}
        connectionState={callConnectionState}
        isMuted={isMicrophoneMuted}
        callError={callError}
        onToggleMute={toggleMicrophoneMute}
        onAnswer={answerCall}
        onReject={rejectCall}
        onCancel={cancelCall}
        onEnd={endCall}
        onClose={closeCallModal}
        onSetAudioOutputSink={setAudioOutputSink}
        fallbackPhoneNumber={fallbackPhone}
      />
    </>
  );
};

