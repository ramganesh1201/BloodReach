/**
 * CareLoop WebRTC Voice Calling Engine
 * Manages RTCPeerConnection, ICE candidates, local/remote audio streams,
 * and calling session states for authorized in-app emergency calls.
 */

export interface CallPeerConfig {
  iceServers: RTCIceServer[];
}

const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class WebRtcCallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isMuted: boolean = false;

  /**
   * Request microphone permission and acquire local audio stream
   */
  async acquireLocalAudio(): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          success: false,
          error: 'Microphone access is not supported on this browser or device.',
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      return { success: true, stream };
    } catch (err: any) {
      console.warn('Microphone permission denied or unavailable:', err);
      let errorMsg = 'Microphone permission was denied. Please allow audio access in your browser.';
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone device was detected on your hardware.';
      } else if (err.name === 'NotAllowedError') {
        errorMsg = 'Microphone permission was blocked. Please enable microphone permissions in your browser settings.';
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Initialize PeerConnection and attach audio tracks
   */
  initPeerConnection(onRemoteTrack?: (stream: MediaStream) => void): RTCPeerConnection {
    if (this.peerConnection) {
      this.close();
    }

    this.peerConnection = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    this.remoteStream = new MediaStream();

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        this.remoteStream?.addTrack(event.track);
      }
      if (onRemoteTrack && this.remoteStream) {
        onRemoteTrack(this.remoteStream);
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
      });
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error('Error creating WebRTC offer:', err);
      return null;
    }
  }

  /**
   * Toggle mute state of the local audio stream
   */
  toggleMute(): boolean {
    if (!this.localStream) return false;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });
    return this.isMuted;
  }

  async startLocalAudio(): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    return this.acquireLocalAudio();
  }

  createPeerConnection(onRemoteTrack?: (stream: MediaStream) => void): RTCPeerConnection {
    return this.initPeerConnection(onRemoteTrack);
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;
    try {
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      return answer;
    } catch (err) {
      console.error('Error creating WebRTC answer:', err);
      return null;
    }
  }

  cleanup(): void {
    this.close();
  }

  /**
   * Release media tracks and terminate peer connection
   */
  close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.isMuted = false;
  }
}

export const webRtcService = new WebRtcCallService();
