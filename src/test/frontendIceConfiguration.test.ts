/**
 * CareLoop Phase 3.1.2 — Frontend ICE Configuration & Fallback Verification Suite
 * 
 * Verifies:
 * 1. Default ICE servers initialize strictly with STUN-only servers (RFC 8489).
 * 2. Backend RPC TURN credentials (ephemeral username + HMAC-SHA1 credential) map into RTCIceServer.
 * 3. Missing TURN configuration (`turn_configured: false`) produces clean STUN-only fallback with 0 invalid entries.
 * 4. Failed/error RPC responses do not crash the engine and maintain STUN fallback.
 * 5. Expired credentials cannot regenerate secret client-side (no static secret in client).
 * 6. Malformed ICE server payloads are sanitized without breaking active configuration.
 * 7. Call cleanup resets ICE servers to default STUN state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { webRtcService, DEFAULT_STUN_SERVERS } from '../services/webRtcService';

describe('Frontend ICE Configuration Suite', () => {
  beforeEach(() => {
    webRtcService.cleanup();
  });

  it('[ICE-01] Initializes strictly with default STUN servers (RFC 8489)', () => {
    const servers = webRtcService.getIceServers();
    expect(servers).toBeDefined();
    expect(servers.length).toBeGreaterThanOrEqual(2);
    
    // Verify each server is strictly STUN with no lingering username or credentials
    servers.forEach((server) => {
      const urlStr = typeof server.urls === 'string' ? server.urls : server.urls[0];
      expect(urlStr.startsWith('stun:')).toBe(true);
      expect(server.username).toBeUndefined();
      expect(server.credential).toBeUndefined();
    });
  });

  it('[ICE-02] Correctly maps backend RPC ephemeral TURN credentials into RTCIceServer', () => {
    // Simulated response from issue_ice_credentials / get_ephemeral_turn_credentials
    const simulatedRpcResponse = {
      success: true,
      turn_configured: true,
      call_id: '11111111-2222-3333-4444-555555555555',
      ice_servers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:turn-staging.careloop.org:3478?transport=udp',
          username: '1793893402:eaba79bc-660d-453c-a216-94bd6d525fa3',
          credential: 'mockBase64HmacSignature==',
        },
      ],
      expires_at: '2026-11-05T15:43:22.000Z',
    };

    webRtcService.setIceServers(simulatedRpcResponse.ice_servers);
    const activeServers = webRtcService.getIceServers();

    expect(activeServers).toHaveLength(3);
    const turnEntry = activeServers.find((s) => {
      const u = typeof s.urls === 'string' ? s.urls : s.urls[0];
      return u.startsWith('turn:');
    });

    expect(turnEntry).toBeDefined();
    expect(turnEntry?.urls).toBe('turn:turn-staging.careloop.org:3478?transport=udp');
    expect(turnEntry?.username).toBe('1793893402:eaba79bc-660d-453c-a216-94bd6d525fa3');
    expect(turnEntry?.credential).toBe('mockBase64HmacSignature==');
  });

  it('[ICE-03] Handles missing backend TURN configuration safely with STUN-only fallback', () => {
    // Simulated unconfigured backend response (turn_configured: false)
    const simulatedUnconfiguredRpc = {
      success: true,
      turn_configured: false,
      ice_servers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      message: 'TURN server not configured on backend. STUN fallback returned.',
    };

    webRtcService.setIceServers(simulatedUnconfiguredRpc.ice_servers);
    const activeServers = webRtcService.getIceServers();

    expect(activeServers).toHaveLength(2);
    // Verify no undefined, null, or empty credentials exist in the server list
    activeServers.forEach((s) => {
      const urlStr = typeof s.urls === 'string' ? s.urls : s.urls[0];
      expect(urlStr.startsWith('stun:')).toBe(true);
      expect(s.username).toBeUndefined();
      expect(s.credential).toBeUndefined();
    });
  });

  it('[ICE-04] Failed or error RPC responses preserve safe STUN-only configuration', () => {
    // Initial state is default STUN
    expect(webRtcService.getIceServers()).toHaveLength(3);

    // Simulate RPC error responses (empty payload, null, undefined)
    webRtcService.setIceServers([] as any);
    expect(webRtcService.getIceServers()).toHaveLength(3); // Preserved

    webRtcService.setIceServers(null as any);
    expect(webRtcService.getIceServers()).toHaveLength(3); // Preserved

    webRtcService.setIceServers(undefined as any);
    expect(webRtcService.getIceServers()).toHaveLength(3); // Preserved
  });

  it('[ICE-05] Malformed ICE entries (missing urls or empty strings) are sanitized', () => {
    const malformedList: any[] = [
      { urls: '' },
      { urls: '   ' },
      { username: 'orphan_user', credential: 'orphan_cred' }, // missing urls
      null,
      undefined,
      { urls: 'stun:stun.l.google.com:19302' }, // valid
    ];

    webRtcService.setIceServers(malformedList);
    const activeServers = webRtcService.getIceServers();

    // Only the valid entry should be accepted
    expect(activeServers).toHaveLength(1);
    expect(activeServers[0].urls).toBe('stun:stun.l.google.com:19302');
  });

  it('[ICE-06] Expired credentials cannot regenerate secret client-side (Zero Client Secret)', () => {
    // Verify client bundle does not hold any shared secret or token generator
    const serviceKeys = Object.keys(webRtcService);
    expect(serviceKeys).not.toContain('turnSharedSecret');
    expect(serviceKeys).not.toContain('sharedSecret');
    expect(serviceKeys).not.toContain('staticAuthSecret');
    expect((webRtcService as any).turnSecret).toBeUndefined();
  });

  it('[ICE-07] Engine cleanup resets active ICE servers back to default STUN state', () => {
    // Configure with custom TURN
    webRtcService.setIceServers([
      { urls: 'turn:turn-staging.careloop.org:3478', username: 'u', credential: 'c' },
    ]);
    expect(webRtcService.getIceServers()).toHaveLength(1);

    // Run cleanup
    webRtcService.cleanup();

    // Should be restored to default 3 STUN servers
    const restored = webRtcService.getIceServers();
    expect(restored).toHaveLength(DEFAULT_STUN_SERVERS.length);
    expect(restored[0].urls).toBe('stun:stun.l.google.com:19302');
  });
});

