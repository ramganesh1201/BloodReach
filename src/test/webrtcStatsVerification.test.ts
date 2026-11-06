/**
 * CareLoop Phase 3.1 — WebRTC getStats() Acceptance Criteria Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { webRtcService, WebRtcCallStats } from '../services/webRtcService';

describe('WebRtcVoiceEngine getDetailedCallStats() verification', () => {
  it('returns null if peerConnection is not initialized', async () => {
    webRtcService.cleanup();
    const stats = await webRtcService.getDetailedCallStats();
    expect(stats).toBeNull();
  });

  it('correctly parses transport, nominated candidate-pair, and relay candidate types', async () => {
    const mockReports = new Map<string, any>();

    // 1. Transport report
    mockReports.set('transport-1', {
      id: 'transport-1',
      type: 'transport',
      selectedCandidatePairId: 'pair-relay-1',
    });

    // 2. Candidate pair report
    mockReports.set('pair-relay-1', {
      id: 'pair-relay-1',
      type: 'candidate-pair',
      state: 'succeeded',
      nominated: true,
      localCandidateId: 'cand-local-relay',
      remoteCandidateId: 'cand-remote-host',
    });

    // 3. Local relay candidate report (Coturn TURNS)
    mockReports.set('cand-local-relay', {
      id: 'cand-local-relay',
      type: 'local-candidate',
      candidateType: 'relay',
      protocol: 'udp',
      address: '198.51.100.10',
      port: 50124,
    });

    // 4. Remote host candidate report
    mockReports.set('cand-remote-host', {
      id: 'cand-remote-host',
      type: 'remote-candidate',
      candidateType: 'host',
      protocol: 'udp',
      address: '203.0.113.50',
      port: 54320,
    });

    // 5. Inbound RTP report
    mockReports.set('inbound-audio-1', {
      id: 'inbound-audio-1',
      type: 'inbound-rtp',
      kind: 'audio',
      bytesReceived: 124500,
      packetsReceived: 2490,
      packetsLost: 2,
      jitter: 0.012,
      audioLevel: 0.75,
    });

    // 6. Outbound RTP report
    mockReports.set('outbound-audio-1', {
      id: 'outbound-audio-1',
      type: 'outbound-rtp',
      kind: 'audio',
      bytesSent: 132000,
      packetsSent: 2640,
    });

    const mockStatsResult = {
      forEach: (cb: (val: any, key: string) => void) => {
        mockReports.forEach((val, key) => cb(val, key));
      },
      get: (id: string) => mockReports.get(id),
    };

    const mockPc: any = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      iceGatheringState: 'complete',
      getStats: vi.fn().mockResolvedValue(mockStatsResult),
      close: vi.fn(),
    };

    // Inject mock peerConnection
    (webRtcService as any).peerConnection = mockPc;

    const stats = await webRtcService.getDetailedCallStats();

    expect(stats).not.toBeNull();
    expect(stats?.connectionState).toBe('connected');
    expect(stats?.selectedPair).not.toBeNull();
    expect(stats?.selectedPair?.id).toBe('pair-relay-1');
    expect(stats?.selectedPair?.state).toBe('succeeded');
    expect(stats?.selectedPair?.nominated).toBe(true);
    expect(stats?.selectedPair?.localCandidateType).toBe('relay');
    expect(stats?.selectedPair?.remoteCandidateType).toBe('host');
    expect(stats?.selectedPair?.isRelayed).toBe(true);

    // Audio metrics
    expect(stats?.audio.inboundBytesReceived).toBe(124500);
    expect(stats?.audio.inboundPacketsReceived).toBe(2490);
    expect(stats?.audio.inboundPacketsLost).toBe(2);
    expect(stats?.audio.inboundJitter).toBe(0.012);
    expect(stats?.audio.outboundBytesSent).toBe(132000);
    expect(stats?.audio.outboundPacketsSent).toBe(2640);
    expect(stats?.audio.audioLevel).toBe(0.75);

    webRtcService.cleanup();
  });
});

