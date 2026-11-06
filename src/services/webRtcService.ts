/**
 * CareLoop Production-Grade WebRTC Voice Engine
 * 
 * Standards & Protocol Specifications:
 * - RFC 8489: Session Traversal Utilities for NAT (STUN) — direct peer-to-peer reflexive NAT binding (obsoletes RFC 5389)
 * - RFC 8656: Traversal Using Relays around NAT (TURN) — packet relay traversal when P2P is blocked (obsoletes RFC 5766)
 * - draft-uberti-behave-turn-rest-00: REST API for temporary time-limited HMAC-SHA1 credentials
 *   * Generated dynamically via PostgreSQL RPC `get_ephemeral_turn_credentials` with strict 600s (10-minute) TTL
 *   * Evaluated by Coturn daemon using `use-auth-secret` and `static-auth-secret`
 *   * Format: username = `<expiry_epoch>:<user_id>`, credential = `Base64(HMAC-SHA1(secret, username))`
 * - Demarcation: STUN provides NAT binding discovery for direct P2P. TURN provides relayed fallback packet transport.
 * 
 * Implements:
 * - Audio-only RTCPeerConnection with STUN & dynamic TURN credentials
 * - Strict user-gesture microphone acquisition (echoCancellation, noiseSuppression, autoGainControl)
 * - Safe candidate queuing before remote SDP is applied
 * - Speaker output sink routing (setSinkId) where supported
 * - Real-time Web Audio API sound-level analyzer for live visualizer
 * - Complete teardown and track termination on call completion
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type WebRtcConnectionState = 'new' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed' | 'closed';

export interface WebRtcEngineCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: WebRtcConnectionState) => void;
  onAudioLevel?: (level: number) => void; // 0 to 100 for live visualizer
}

export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface WebRtcCallStats {
  timestamp: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  selectedPair: {
    id: string;
    state: string;
    nominated: boolean;
    localCandidateId: string;
    remoteCandidateId: string;
    localCandidateType?: string;
    remoteCandidateType?: string;
    localProtocol?: string;
    remoteProtocol?: string;
    localAddress?: string;
    remoteAddress?: string;
    isRelayed: boolean;
  } | null;
  audio: {
    inboundBytesReceived: number;
    inboundPacketsReceived: number;
    inboundPacketsLost: number;
    inboundJitter: number;
    outboundBytesSent: number;
    outboundPacketsSent: number;
    audioLevel?: number;
  };
}

export class WebRtcVoiceEngine {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;

  // Candidate queue for candidates arriving before remote description
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet: boolean = false;

  // Web Audio Level Analysis
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  // Callbacks
  private callbacks: WebRtcEngineCallbacks = {};

  /**
   * Configure ICE servers (STUN + temporary TURN credentials)
   * Validates and sanitizes input to ensure only structurally valid entries are applied
   */
  setIceServers(servers: RTCIceServer[]): void {
    if (servers && servers.length > 0) {
      const valid = servers.filter(
        (s) =>
          s &&
          s.urls &&
          (typeof s.urls === 'string'
            ? s.urls.trim().length > 0
            : Array.isArray(s.urls) && s.urls.length > 0)
      );
      if (valid.length > 0) {
        this.iceServers = valid;
      }
    }
  }

  /**
   * Retrieve active ICE servers configuration
   */
  getIceServers(): RTCIceServer[] {
    return [...this.iceServers];
  }

  /**
   * Reset ICE servers back to default STUN configuration
   */
  resetIceServers(): void {
    this.iceServers = [...DEFAULT_STUN_SERVERS];
  }

  /**
   * Acquire local audio stream with medical triage audio filters
   * NEVER called before explicit user interaction
   */
  async acquireLocalAudio(): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          success: false,
          error: 'Microphone access is not supported on this browser or platform.',
        };
      }

      // Explicit audio-only constraint
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1, // Mono audio for optimized emergency bandwidth
        },
        video: false,
      });

      this.localStream = stream;
      this.isMuted = false;

      // Start local audio level analysis
      this.initAudioAnalyser(stream);

      return { success: true, stream };
    } catch (err: any) {
      console.warn('[WebRTC] Microphone permission denied or device error:', err);
      let errorMsg = 'Microphone permission was denied. Please allow audio access in your browser settings to proceed.';
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone device was detected on your hardware.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Microphone access was blocked. Please enable microphone permissions in your site settings.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Microphone is currently in use by another application.';
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Initialize Peer Connection
   */
  initPeerConnection(callbacks: WebRtcEngineCallbacks): RTCPeerConnection {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.callbacks = callbacks;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];

    const config: RTCConfiguration = {
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };

    this.peerConnection = new RTCPeerConnection(config);
    this.remoteStream = new MediaStream();

    // Attach local audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate handler
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    // Remote Track handler
    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else if (event.track) {
        this.remoteStream?.addTrack(event.track);
      }

      this.ensureRemoteAudioPlayback(this.remoteStream!);

      if (this.callbacks.onRemoteStream && this.remoteStream) {
        this.callbacks.onRemoteStream(this.remoteStream);
      }
    };

    // Connection State Change Monitoring
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.info(`[WebRTC] PeerConnection state: ${state}`);
      switch (state) {
        case 'connected':
          this.callbacks.onConnectionStateChange?.('connected');
          break;
        case 'connecting':
          this.callbacks.onConnectionStateChange?.('connecting');
          break;
        case 'disconnected':
          this.callbacks.onConnectionStateChange?.('reconnecting');
          break;
        case 'failed':
          this.callbacks.onConnectionStateChange?.('failed');
          break;
        case 'closed':
          this.callbacks.onConnectionStateChange?.('closed');
          break;
        default:
          this.callbacks.onConnectionStateChange?.('new');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState;
      console.info(`[WebRTC] ICE connection state: ${iceState}`);
      if (iceState === 'disconnected') {
        this.callbacks.onConnectionStateChange?.('reconnecting');
      } else if (iceState === 'failed') {
        this.callbacks.onConnectionStateChange?.('failed');
      }
    };

    return this.peerConnection;
  }

  /**
   * Create SDP Offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
      return null;
    }
  }

  /**
   * Create SDP Answer - strictly guarded by remote description state
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;
    if (this.peerConnection.signalingState !== 'have-remote-offer') {
      console.warn(`[WebRTC] Cannot create answer in signaling state: ${this.peerConnection.signalingState}. Awaiting remote offer.`);
      return null;
    }
    try {
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      return answer;
    } catch (err) {
      console.error('[WebRTC] Error creating answer:', err);
      return null;
    }
  }

  /**
   * Set Remote SDP Description and flush queued candidates
   */
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<boolean> {
    if (!this.peerConnection) return false;
    try {
      if (this.peerConnection.signalingState === 'closed') return false;
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
      this.remoteDescriptionSet = true;

      // Flush queued candidates safely
      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        if (candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('[WebRTC] Error adding buffered ICE candidate:', e);
          }
        }
      }

      return true;
    } catch (err) {
      console.error('[WebRTC] Error setting remote description:', err);
      return false;
    }
  }

  /**
   * Add ICE Candidate with safety queueing
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection || !this.remoteDescriptionSet || !this.peerConnection.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  /**
   * Toggle Mute State
   */
  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Set speaker output device sink (where supported)
   */
  async setAudioOutputDevice(sinkId: string): Promise<boolean> {
    if (this.remoteAudioElement && typeof (this.remoteAudioElement as any).setSinkId === 'function') {
      try {
        await (this.remoteAudioElement as any).setSinkId(sinkId);
        return true;
      } catch (err) {
        console.warn('[WebRTC] Failed to set sink ID:', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Ensure remote audio element is playing
   */
  private ensureRemoteAudioPlayback(stream: MediaStream): void {
    if (typeof document === 'undefined') return;

    if (!this.remoteAudioElement) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.remoteAudioElement = audio;
    }

    this.remoteAudioElement.srcObject = stream;
    this.remoteAudioElement.play().catch((err) => {
      console.warn('[WebRTC] Remote audio autoplay deferred, will play upon user interaction:', err);
    });
  }

  /**
   * Web Audio API Level Visualizer
   */
  private initAudioAnalyser(stream: MediaStream): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.5;

      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!this.analyser || this.isMuted) {
          this.callbacks.onAudioLevel?.(0);
          this.animFrameId = requestAnimationFrame(updateLevel);
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        // Normalize 0..255 to 0..100
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        this.callbacks.onAudioLevel?.(normalized);

        this.animFrameId = requestAnimationFrame(updateLevel);
      };

      this.animFrameId = requestAnimationFrame(updateLevel);
    } catch (e) {
      console.warn('[WebRTC] Audio analyser setup notice:', e);
    }
  }

  /**
   * Terminate media tracks, peer connection, and audio element
   */
  cleanup(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.srcObject = null;
      if (this.remoteAudioElement.parentNode) {
        this.remoteAudioElement.parentNode.removeChild(this.remoteAudioElement);
      }
      this.remoteAudioElement = null;
    }

    this.remoteStream = null;
    this.isMuted = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.resetIceServers();
  }

  close(): void {
    this.cleanup();
  }

  /**
   * Inspect detailed WebRTC metrics via getStats() per RFC 8445 / W3C WebRTC Stats
   */
  async getDetailedCallStats(): Promise<WebRtcCallStats | null> {
    if (!this.peerConnection) return null;

    try {
      const stats = await this.peerConnection.getStats();
      let selectedPairReport: any = null;
      let selectedPairId: string | null = null;

      // 1. Locate active transport
      stats.forEach((report) => {
        if (report.type === 'transport' && (report as any).selectedCandidatePairId) {
          selectedPairId = (report as any).selectedCandidatePairId;
        }
      });

      // 2. Locate nominated / succeeded candidate pair
      if (selectedPairId) {
        selectedPairReport = stats.get(selectedPairId);
      } else {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report.selected || (report as any).nominated || report.state === 'succeeded')) {
            selectedPairReport = report;
          }
        });
      }

      let selectedPairData: WebRtcCallStats['selectedPair'] = null;
      if (selectedPairReport) {
        const localCand = selectedPairReport.localCandidateId ? stats.get(selectedPairReport.localCandidateId) : null;
        const remoteCand = selectedPairReport.remoteCandidateId ? stats.get(selectedPairReport.remoteCandidateId) : null;
        const localType = (localCand as any)?.candidateType;
        const remoteType = (remoteCand as any)?.candidateType;
        const isRelayed = localType === 'relay' || remoteType === 'relay';

        selectedPairData = {
          id: selectedPairReport.id,
          state: selectedPairReport.state,
          nominated: selectedPairReport.nominated ?? selectedPairReport.selected ?? false,
          localCandidateId: selectedPairReport.localCandidateId,
          remoteCandidateId: selectedPairReport.remoteCandidateId,
          localCandidateType: localType,
          remoteCandidateType: remoteType,
          localProtocol: (localCand as any)?.protocol,
          remoteProtocol: (remoteCand as any)?.protocol,
          localAddress: (localCand as any)?.address || (localCand as any)?.ip,
          remoteAddress: (remoteCand as any)?.address || (remoteCand as any)?.ip,
          isRelayed
        };
      }

      // 3. Audio RTP metrics
      let inboundBytes = 0;
      let inboundPackets = 0;
      let inboundLost = 0;
      let inboundJitter = 0;
      let outboundBytes = 0;
      let outboundPackets = 0;
      let audioLevel: number | undefined;

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && (report.kind === 'audio' || (report as any).mediaType === 'audio')) {
          inboundBytes = (report as any).bytesReceived ?? 0;
          inboundPackets = (report as any).packetsReceived ?? 0;
          inboundLost = (report as any).packetsLost ?? 0;
          inboundJitter = (report as any).jitter ?? 0;
          if ((report as any).audioLevel !== undefined) audioLevel = (report as any).audioLevel;
        }
        if (report.type === 'outbound-rtp' && (report.kind === 'audio' || (report as any).mediaType === 'audio')) {
          outboundBytes = (report as any).bytesSent ?? 0;
          outboundPackets = (report as any).packetsSent ?? 0;
        }
      });

      return {
        timestamp: Date.now(),
        connectionState: this.peerConnection.connectionState,
        iceConnectionState: this.peerConnection.iceConnectionState,
        iceGatheringState: this.peerConnection.iceGatheringState,
        selectedPair: selectedPairData,
        audio: {
          inboundBytesReceived: inboundBytes,
          inboundPacketsReceived: inboundPackets,
          inboundPacketsLost: inboundLost,
          inboundJitter: inboundJitter,
          outboundBytesSent: outboundBytes,
          outboundPacketsSent: outboundPackets,
          audioLevel
        }
      };
    } catch (err) {
      console.warn('[WebRTC] getStats inspection error:', err);
      return null;
    }
  }

  /**
   * Sample call statistics across multiple intervals to verify continuous audio throughput
   */
  async sampleCallStats(intervals: number = 3, intervalMs: number = 1000): Promise<WebRtcCallStats[]> {
    const samples: WebRtcCallStats[] = [];
    for (let i = 0; i < intervals; i++) {
      const stat = await this.getDetailedCallStats();
      if (stat) samples.push(stat);
      if (i < intervals - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return samples;
  }

  // Compatibility aliases
  async startLocalAudio() {
    return this.acquireLocalAudio();
  }

  createPeerConnection(callbacks?: WebRtcEngineCallbacks) {
    return this.initPeerConnection(callbacks || {});
  }
}

export const webRtcService = new WebRtcVoiceEngine();
