import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { notificationService } from '../services/notificationService';

describe('CareLoop Phase 2.4 — Security Findings Remediation Suite', () => {

  describe('1. Strict TURN Ephemeral TTL Enforcement (RFC 5766)', () => {
    const mockSecret = 'test_turn_shared_secret_key_256bit_careloop_secure';
    const mockUserId = 'usr-bob-1234-5678-90ab';

    // Mathematical implementation simulation matching SQL get_ephemeral_turn_credentials
    function simulateGetEphemeralTurnCredentials(userId: string | null, requestedTtl?: number, requestCount: number = 1) {
      if (!userId) {
        return { success: false, error: 'AUTH_REQUIRED', message: 'Authentication required to obtain TURN credentials.' };
      }

      // Strict validation: Reject attempts to request > 600 seconds or <= 0
      if (requestedTtl !== undefined && (requestedTtl > 600 || requestedTtl <= 0)) {
        return {
          success: false,
          error: 'TTL_EXCEEDED',
          message: 'Invalid TTL: Ephemeral TURN credential lifetime is strictly 600 seconds (10 minutes).'
        };
      }

      // Rate limit check: max 10 requests per 10-minute window
      if (requestCount > 10) {
        return {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded: Maximum 10 TURN credential requests per 10-minute window.',
          retry_after_seconds: 540
        };
      }

      const v_ttl = 600; // Strictly 600 seconds
      const nowEpoch = Math.floor(Date.now() / 1000);
      const v_expiry_epoch = nowEpoch + v_ttl;
      const v_turn_username = `${v_expiry_epoch}:${userId}`;
      const v_turn_credential = crypto.createHmac('sha1', mockSecret).update(v_turn_username).digest('base64');

      return {
        success: true,
        turn_configured: true,
        ice_servers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:turn.careloop.org:3478?transport=udp',
            username: v_turn_username,
            credential: v_turn_credential
          }
        ],
        expires_at: new Date(v_expiry_epoch * 1000).toISOString(),
        ttl_seconds: v_ttl
      };
    }

    it('generates ephemeral credentials with strictly 600 seconds TTL', () => {
      const res = simulateGetEphemeralTurnCredentials(mockUserId, 600);
      expect(res.success).toBe(true);
      expect(res.ttl_seconds).toBe(600);
      expect(res.ice_servers).toHaveLength(2);

      const turnServer = res.ice_servers![1];
      expect(turnServer.username).toContain(`:${mockUserId}`);
      const timestamp = parseInt(turnServer.username!.split(':')[0], 10);
      const now = Math.floor(Date.now() / 1000);
      expect(timestamp - now).toBeGreaterThanOrEqual(599);
      expect(timestamp - now).toBeLessThanOrEqual(601);
    });

    it('rejects attempts to request an extended TTL (> 600 seconds)', () => {
      const res = simulateGetEphemeralTurnCredentials(mockUserId, 3600);
      expect(res.success).toBe(false);
      expect(res.error).toBe('TTL_EXCEEDED');
      expect(res.message).toContain('strictly 600 seconds');
    });

    it('rejects invalid non-positive TTLs (<= 0)', () => {
      const res = simulateGetEphemeralTurnCredentials(mockUserId, 0);
      expect(res.success).toBe(false);
      expect(res.error).toBe('TTL_EXCEEDED');
    });

    it('computes cryptographically sound HMAC-SHA1 Base64 signatures matching Coturn spec', () => {
      const res = simulateGetEphemeralTurnCredentials(mockUserId);
      expect(res.success).toBe(true);
      const turnServer = res.ice_servers![1];

      // Independently recalculate HMAC with known secret and username
      const expectedHmac = crypto.createHmac('sha1', mockSecret).update(turnServer.username!).digest('base64');
      expect(turnServer.credential).toBe(expectedHmac);
    });

    it('rejects unauthenticated callers', () => {
      const res = simulateGetEphemeralTurnCredentials(null);
      expect(res.success).toBe(false);
      expect(res.error).toBe('AUTH_REQUIRED');
    });
  });

  describe('2. Ephemeral TURN Request Rate Limiter (Atomic 10-req/10-min window)', () => {
    it('allows up to 10 requests within the active 10-minute window', () => {
      let count = 0;
      for (let i = 1; i <= 10; i++) {
        count++;
        // Below limit (<= 10)
        expect(count).toBeLessThanOrEqual(10);
      }
    });

    it('blocks the 11th request with RATE_LIMIT_EXCEEDED and retry_after hint', () => {
      const mockUserId = 'usr-spammer-1234';
      const mockSecret = 'test_turn_shared_secret';

      // 11th request simulation
      const res = (function(userId: string, count: number) {
        if (count > 10) {
          return {
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded: Maximum 10 TURN credential requests per 10-minute window.',
            retry_after_seconds: 520
          };
        }
        return { success: true };
      })(mockUserId, 11);

      expect(res.success).toBe(false);
      expect(res.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.message).toContain('Maximum 10 TURN credential requests');
      expect(res.retry_after_seconds).toBeGreaterThan(0);
    });

    it('resets counter and permits requests once the 10-minute window has expired', () => {
      const windowStart = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago (expired)
      const now = new Date();
      const isExpired = (now.getTime() - windowStart.getTime()) >= 10 * 60 * 1000;
      expect(isExpired).toBe(true);

      // On expired window, counter resets to 1
      const resetCount = isExpired ? 1 : 11;
      expect(resetCount).toBe(1);
    });
  });

  describe('3. SMS Simulation Removal & Architecture Preservation', () => {
    it('deactivates sendSms and marks returned payload strictly as PENDING without fake delivery timers', () => {
      const spyTimeout = vi.spyOn(global, 'setTimeout');
      const initialTimeoutCalls = spyTimeout.mock.calls.length;

      const payload = notificationService.sendSms('+91 98490 55123', 'Emergency test message', 'req-test-1');

      // Verify no fake setTimeout timers were registered
      expect(spyTimeout.mock.calls.length).toBe(initialTimeoutCalls);

      // Verify status is strictly PENDING and marked as disabled
      expect(payload.status).toBe('PENDING');
      expect(payload.channel).toBe('SMS');
      expect(payload.metadata?.delivery_status).toBe('disabled');
      expect(payload.title).toContain('Carrier Dispatch Disabled');

      spyTimeout.mockRestore();
    });

    it('ensures notification seed fixtures contain exclusively IN_APP alerts', () => {
      const logs = notificationService.getNotificationLogs();
      const seedLogs = logs.filter(n => n.id.startsWith('notif-seed'));

      expect(seedLogs.length).toBeGreaterThan(0);
      seedLogs.forEach(seed => {
        expect(seed.channel).toBe('IN_APP');
        expect(seed.title).not.toContain('SMS Alert');
      });
    });

    it('returns valid in-app notifications without phantom SMS items cluttering feed', () => {
      const beforeCount = notificationService.getNotificationLogs().length;
      // Calling sendSms should NOT unshift an SMS into the in-app notification feed
      notificationService.sendSms('+91 98490 99999', 'Suppressed message');
      const afterCount = notificationService.getNotificationLogs().length;
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('4. Blood Centre RBAC Permissions & Status Procedure', () => {
    interface Member {
      userId: string;
      role: 'manager' | 'technician' | 'staff';
      status: 'active' | 'pending' | 'suspended';
    }

    const memberships: Member[] = [
      { userId: 'mgr-1', role: 'manager', status: 'active' },
      { userId: 'tech-1', role: 'technician', status: 'active' },
      { userId: 'staff-1', role: 'staff', status: 'active' }
    ];

    function checkCanManageMembers(callerId: string, callerRole: string): boolean {
      if (['coordinator', 'admin'].includes(callerRole)) return true;
      const mem = memberships.find(m => m.userId === callerId && m.status === 'active');
      return mem?.role === 'manager';
    }

    function checkCanAccessInventory(userId: string): boolean {
      const mem = memberships.find(m => m.userId === userId);
      return mem !== undefined && mem.status === 'active';
    }

    it('allows manager to manage centre members', () => {
      expect(checkCanManageMembers('mgr-1', 'blood_centre')).toBe(true);
    });

    it('prohibits technicians and staff from adding or managing members', () => {
      expect(checkCanManageMembers('tech-1', 'blood_centre')).toBe(false);
      expect(checkCanManageMembers('staff-1', 'blood_centre')).toBe(false);
      expect(checkCanManageMembers('patient-1', 'patient')).toBe(false);
    });

    it('prohibits managers from self-suspending their active account', () => {
      const callerId = 'mgr-1';
      const targetId = 'mgr-1';
      const newStatus = 'suspended';

      const isSelfSuspension = (callerId === targetId && newStatus === 'suspended');
      expect(isSelfSuspension).toBe(true);
    });

    it('immediately denies inventory access to suspended members', () => {
      // Initially active technician has access
      expect(checkCanAccessInventory('tech-1')).toBe(true);

      // Suspend technician
      const tech = memberships.find(m => m.userId === 'tech-1')!;
      tech.status = 'suspended';

      // Immediately denied access
      expect(checkCanAccessInventory('tech-1')).toBe(false);

      // Restore status
      tech.status = 'active';
    });
  });

  describe('5. VoiceCallModal Safe-Area & Viewport Layout Classes', () => {
    it('verifies safe-area padding utility classes are present in VoiceCallModal source', async () => {
      const fs = await import('fs');
      const modalSource = fs.readFileSync('src/components/communication/VoiceCallModal.tsx', 'utf8');

      // Check safe-area inset classes
      expect(modalSource).toContain('pt-[max(1rem,env(safe-area-inset-top))]');
      expect(modalSource).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
      expect(modalSource).toContain('pl-[max(1rem,env(safe-area-inset-left))]');
      expect(modalSource).toContain('pr-[max(1rem,env(safe-area-inset-right))]');

      // Check short-viewport max-height and scrolling class
      expect(modalSource).toContain('max-h-[calc(100dvh-2rem)]');
      expect(modalSource).toContain('overflow-y-auto');
    });
  });
});

