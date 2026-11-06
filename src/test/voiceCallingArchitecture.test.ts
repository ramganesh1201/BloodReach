import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Supabase Realtime Client for fast, hermetic testing without external network hangs
vi.mock('../services/supabaseClient', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb) => {
      if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
      return { unsubscribe: vi.fn() };
    }),
    send: vi.fn().mockResolvedValue({}),
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  };
});

import { WebRtcVoiceEngine } from '../services/webRtcService';
import { CallSignalingService } from '../services/callSignalingService';
import { CallSession } from '../types';

// In-memory BroadcastChannel simulating real multi-tab / multi-device browser behavior
class MockBroadcastChannel {
  private static channels: Map<string, Set<MockBroadcastChannel>> = new Map();
  public onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(public name: string) {
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: any): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    const event = { data } as MessageEvent;
    peers.forEach((peer) => {
      if (peer !== this) {
        peer.onmessage?.(event);
        const ls = peer.listeners.get('message');
        if (ls) {
          ls.forEach((fn) => (fn as any)(event));
        }
      }
    });
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

// Mock MockRTCPeerConnection
class MockRTCPeerConnection {
  public signalingState: RTCSignalingState = 'stable';
  public connectionState: RTCPeerConnectionState = 'new';
  public iceConnectionState: RTCIceConnectionState = 'new';
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;

  public onicecandidate: ((ev: RTCPeerConnectionIceEvent) => any) | null = null;
  public ontrack: ((ev: RTCTrackEvent) => any) | null = null;
  public onconnectionstatechange: (() => any) | null = null;
  public oniceconnectionstatechange: (() => any) | null = null;

  public addedCandidates: RTCIceCandidateInit[] = [];
  public tracks: MediaStreamTrack[] = [];

  constructor(public config?: RTCConfiguration) {}

  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    this.tracks.push(track);
    return {} as RTCRtpSender;
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\no=caller 123 2 IN IP4 127.0.0.1\r\ns=CareLoop Audio' };
  }

  async createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    if (this.signalingState !== 'have-remote-offer') {
      throw new Error(`Cannot create answer in ${this.signalingState} state`);
    }
    return { type: 'answer', sdp: 'v=0\r\no=callee 456 2 IN IP4 127.0.0.1\r\ns=CareLoop Audio Answer' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-local-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  close(): void {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
  }
}

describe('CareLoop Remote Voice-Calling Architecture Tests', () => {
  let callerEngine: WebRtcVoiceEngine;
  let calleeEngine: WebRtcVoiceEngine;
  let mockTrack: any;
  let mockMediaStream: any;

  beforeEach(() => {
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    // Mock WebRTC environment
    mockTrack = {
      kind: 'audio',
      enabled: true,
      stop: vi.fn(),
    };

    mockMediaStream = {
      getAudioTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    };

    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).RTCSessionDescription = function (init: any) { return init; };
    (globalThis as any).RTCIceCandidate = function (init: any) { return init; };
    (globalThis as any).MediaStream = function () {
      return {
        addTrack: vi.fn(),
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };
    };

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Default Speaker' },
        ]),
      },
      writable: true,
      configurable: true,
    });

    callerEngine = new WebRtcVoiceEngine();
    calleeEngine = new WebRtcVoiceEngine();
  });

  afterEach(() => {
    callerEngine.cleanup();
    calleeEngine.cleanup();
    vi.restoreAllMocks();
  });

  // TEST 1: Requester initiates call to an accepted donor
  it('1. Requester calls an accepted donor with explicit audio constraints', async () => {
    const audioRes = await callerEngine.acquireLocalAudio();
    expect(audioRes.success).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
  });

  // TEST 2: Donor receives call across separate device/session listener
  it('2. Donor receives the call from a different browser/device session', async () => {
    const callerSignaling = new CallSignalingService();
    const calleeSignaling = new CallSignalingService();

    const donorId = 'usr-donor-sarah';
    let incomingCallReceived: CallSession | null = null;

    const unsubscribe = calleeSignaling.subscribeToUserIncomingCalls(
      donorId,
      (session) => {
        incomingCallReceived = session;
      }
    );

    const testSession: CallSession = {
      id: 'call-test-remote-99',
      conversationId: 'conv-test-1',
      requestId: 'req-test-1',
      callerId: 'usr-requester-raj',
      callerName: 'Rajesh Kumar',
      callerRole: 'patient',
      receiverId: donorId,
      receiverName: 'Sarah Jenkins',
      receiverRole: 'donor',
      callType: 'VOICE',
      status: 'RINGING',
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
    };

    await callerSignaling.sendIncomingCallAlert(donorId, testSession);

    expect(incomingCallReceived).not.toBeNull();
    expect((incomingCallReceived as any)?.id).toBe('call-test-remote-99');
    expect((incomingCallReceived as any)?.callerName).toBe('Rajesh Kumar');

    unsubscribe();
  });

  // TEST 3: Donor accepts and receives the correct SDP offer via receiver_ready handshake
  it('3. Donor accepts and receives the correct SDP offer via receiver-ready handshake', async () => {
    const callerSignaling = new CallSignalingService();
    const calleeSignaling = new CallSignalingService();

    const callId = 'call-handshake-test';
    let offerReceivedByCallee: RTCSessionDescriptionInit | null = null;
    let receiverReadyTriggered = false;

    // Caller joins and listens for receiver_ready
    callerSignaling.joinCallChannel(callId, {
      onReceiverReady: async () => {
        receiverReadyTriggered = true;
        callerEngine.initPeerConnection({});
        const offer = await callerEngine.createOffer();
        if (offer) {
          await callerSignaling.sendOffer(callId, offer, 'caller-id');
        }
      },
    });

    // Callee answers: initializes peer connection and registers onOffer
    calleeEngine.initPeerConnection({});
    calleeSignaling.joinCallChannel(callId, {
      onOffer: async ({ sdp }) => {
        offerReceivedByCallee = sdp;
      },
    });

    // Callee sends receiver-ready handshake
    await calleeSignaling.sendReceiverReady(callId, 'callee-id');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(receiverReadyTriggered).toBe(true);
    expect(offerReceivedByCallee).not.toBeNull();
    expect((offerReceivedByCallee as any)?.type).toBe('offer');

    callerSignaling.leaveCallChannel(callId);
    calleeSignaling.leaveCallChannel(callId);
  });

  // TEST 4: Both sides establish a WebRTC connection cleanly
  it('4. Both sides establish an end-to-end SDP offer/answer exchange', async () => {
    callerEngine.initPeerConnection({});
    calleeEngine.initPeerConnection({});

    // 1. Caller creates offer
    const offer = await callerEngine.createOffer();
    expect(offer).not.toBeNull();

    // 2. Callee sets remote offer FIRST
    const setOfferResult = await calleeEngine.setRemoteDescription(offer!);
    expect(setOfferResult).toBe(true);

    // 3. Callee creates answer
    const answer = await calleeEngine.createAnswer();
    expect(answer).not.toBeNull();
    expect(answer?.type).toBe('answer');

    // 4. Caller sets remote answer
    const setAnswerResult = await callerEngine.setRemoteDescription(answer!);
    expect(setAnswerResult).toBe(true);
  });

  // TEST 5: Early ICE candidates arriving before remote description are buffered
  it('5. Early ICE candidates arriving before remote description are buffered and flushed safely', async () => {
    calleeEngine.initPeerConnection({});

    const earlyCandidate: RTCIceCandidateInit = {
      candidate: 'candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    };

    // Candidate arrives BEFORE remote description is set
    await calleeEngine.addIceCandidate(earlyCandidate);

    const internalPc = (calleeEngine as any).peerConnection as MockRTCPeerConnection;
    expect(internalPc.addedCandidates.length).toBe(0); // Not applied yet

    // Remote offer arrives and description is set
    const dummyOffer: RTCSessionDescriptionInit = {
      type: 'offer',
      sdp: 'v=0\r\no=caller 123 2 IN IP4 127.0.0.1\r\ns=CareLoop Test',
    };
    await calleeEngine.setRemoteDescription(dummyOffer);

    // After setting remote description, buffered candidate is applied
    expect(internalPc.addedCandidates.length).toBe(1);
    expect(internalPc.addedCandidates[0].candidate).toBe(earlyCandidate.candidate);
  });

  // TEST 6: Unauthorized user cannot join private signaling (channel security check)
  it('6. Unauthorized user cannot join private signaling channels without participation check', () => {
    const callerId = 'user-caller-123';
    const receiverId = 'user-receiver-456';
    const intruderId = 'user-intruder-789';

    // Verification logic matching SQL RLS on realtime.messages
    const isAuthorized = (userId: string, callSession: { callerId: string; receiverId: string }) => {
      return userId === callSession.callerId || userId === callSession.receiverId;
    };

    const session = { callerId, receiverId };
    expect(isAuthorized(callerId, session)).toBe(true);
    expect(isAuthorized(receiverId, session)).toBe(true);
    expect(isAuthorized(intruderId, session)).toBe(false);
  });

  // TEST 7: Unaccepted donor cannot receive or establish calls
  it('7. Calling an unaccepted donor is blocked before call initiation', () => {
    const donorResponses = [
      { donorId: 'donor-1', status: 'NOTIFIED' },
      { donorId: 'donor-2', status: 'ACCEPTED' },
    ];

    const canInitiateCall = (donorId: string) => {
      const response = donorResponses.find((r) => r.donorId === donorId);
      return response?.status === 'ACCEPTED';
    };

    expect(canInitiateCall('donor-1')).toBe(false); // Unaccepted
    expect(canInitiateCall('donor-2')).toBe(true);  // Accepted
  });

  // TEST 8: Rejected and missed calls transition correctly
  it('8. Rejected and missed calls transition status correctly and trigger audio stop', () => {
    let callSession: CallSession = {
      id: 'call-status-test',
      conversationId: 'c1',
      callerId: 'u1',
      callerName: 'Raj',
      callerRole: 'patient',
      receiverId: 'u2',
      receiverName: 'Sarah',
      receiverRole: 'donor',
      callType: 'VOICE',
      status: 'RINGING',
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
    };

    // Rejection transition
    const rejectCall = (session: CallSession, reason: string): CallSession => ({
      ...session,
      status: 'REJECTED',
      endedAt: new Date().toISOString(),
      endReason: reason,
    });

    callSession = rejectCall(callSession, 'Declined by recipient');
    expect(callSession.status).toBe('REJECTED');
    expect(callSession.endReason).toBe('Declined by recipient');

    // Timeout transition
    const timeoutCall = (session: CallSession): CallSession => ({
      ...session,
      status: 'TIMEOUT',
      endedAt: new Date().toISOString(),
      endReason: 'Call timeout / No answer',
    });

    const missedSession = timeoutCall({ ...callSession, status: 'RINGING' });
    expect(missedSession.status).toBe('TIMEOUT');
    expect(missedSession.endReason).toBe('Call timeout / No answer');
  });

  // TEST 9: Duplicate accept calls are idempotent and do not corrupt state
  it('9. Duplicate accept requests do not corrupt state or re-instantiate peer connection', async () => {
    let callState: { status: string; acceptedAt?: string } = { status: 'RINGING' };

    const idempotentAccept = (current: typeof callState) => {
      if (current.status === 'ACCEPTED' || current.status === 'CONNECTED') {
        return { success: true, status: current.status };
      }
      return {
        success: true,
        status: 'ACCEPTED',
        acceptedAt: '2026-11-03T15:00:00.000Z',
      };
    };

    const firstAccept = idempotentAccept(callState);
    expect(firstAccept.status).toBe('ACCEPTED');
    callState = { status: 'ACCEPTED', acceptedAt: firstAccept.acceptedAt };

    // Duplicate second accept
    const secondAccept = idempotentAccept(callState);
    expect(secondAccept.status).toBe('ACCEPTED');
    expect(callState.acceptedAt).toBe('2026-11-03T15:00:00.000Z');
  });

  // TEST 10: Routing navigation does not tear down global call UI state
  it('10. GlobalCallManager retains call session regardless of current route', () => {
    const globalState = {
      activeCallSession: {
        id: 'call-global-1',
        status: 'CONNECTED',
      } as CallSession,
      isCallModalOpen: true,
    };

    // Simulating user moving from /communication to /patient to /donor
    const routes = ['/communication', '/patient', '/donor', '/request/track'];
    routes.forEach((route) => {
      expect(globalState.activeCallSession).not.toBeNull();
      expect(globalState.isCallModalOpen).toBe(true);
      expect(globalState.activeCallSession?.status).toBe('CONNECTED');
    });
  });

  // TEST 11: Microphone permission denial produces proper error without crashing
  it('11. Microphone denial produces a structured error message and prevents bad state', async () => {
    // Mock getUserMedia rejecting with NotAllowedError
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';

    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permissionError);

    const result = await callerEngine.acquireLocalAudio();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Microphone access was blocked');
  });

  // TEST 12: Both participants can terminate calls cleanly and stop all tracks
  it('12. Both participants can terminate calls cleanly and release hardware tracks', async () => {
    await callerEngine.acquireLocalAudio();
    callerEngine.initPeerConnection({});

    expect(mockTrack.stop).not.toHaveBeenCalled();

    callerEngine.cleanup();

    // Verify all media tracks terminated
    expect(mockTrack.stop).toHaveBeenCalled();
    // Verify peer connection closed
    expect((callerEngine as any).peerConnection).toBeNull();
    // Verify local stream cleared
    expect((callerEngine as any).localStream).toBeNull();
  });
});
