import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../components/common/Header';
import { StatCard } from '../components/common/StatCard';
import { ChatTimeline } from '../components/communication/ChatTimeline';
import { MobileNav } from '../components/common/MobileNav';
import fs from 'fs';
import path from 'path';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mockStoreState: any = {};
vi.mock('../store/useBloodStore', () => ({
  useBloodStore: () => mockStoreState,
}));

const renderComponent = async (node: React.ReactElement): Promise<{ html: string; container: HTMLDivElement }> => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(node);
  });
  const html = el.innerHTML;
  return { html, container: el };
};

describe('CARELOOP — Final Native-App Visual Polish & Safe Codebase Cleanup Verification', () => {
  beforeEach(() => {
    mockStoreState = {
      authenticatedRole: 'patient',
      demoExperience: null,
      currentUser: { id: 'usr-patient-1', fullName: 'Ananya Sharma', role: 'patient' },
      isRegisteredDonor: false,
      notifications: [],
      isOffline: false,
      userDonorProfile: null,
    };
  });

  describe('1. Debug / Technical Banners Discipline', () => {
    it('does not render "VERIFIED SESSION" or "PostgreSQL Mode" in standard production view', async () => {
      const { html } = await renderComponent(
        <MemoryRouter initialEntries={['/patient']}>
          <Header />
        </MemoryRouter>
      );

      expect(html.includes('VERIFIED SESSION')).toBe(false);
      expect(html.includes('PostgreSQL Mode')).toBe(false);
    });

    it('renders profile menu trigger with minimum 44px accessible touch target', async () => {
      const { container } = await renderComponent(
        <MemoryRouter initialEntries={['/patient']}>
          <Header />
        </MemoryRouter>
      );

      const profileBtn = container.querySelector('button[aria-label="User profile and account settings"]');
      expect(profileBtn).not.toBeNull();
      expect(profileBtn?.className).toContain('min-h-[44px]');
      expect(profileBtn?.className).toContain('min-w-[44px]');
    });
  });

  describe('2. Design System & Typography Discipline', () => {
    it('StatCard value applies tabular-nums for aligned numeric metrics', async () => {
      const { container } = await renderComponent(
        <StatCard label="Active Donors" value={142} subtext="Ready for emergency dispatch" />
      );

      const valueEl = container.querySelector('.tabular-nums');
      expect(valueEl).not.toBeNull();
      expect(valueEl?.textContent).toBe('142');
    });

    it('ChatTimeline applies tabular-nums and font-mono to message timestamps', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'usr-1',
          senderName: 'Dr. Sarah',
          senderRole: 'patient' as const,
          content: 'Transfusion unit ready.',
          timestamp: new Date().toISOString(),
          messageType: 'TEXT' as const,
          deliveryStatus: 'SENT' as const,
        },
      ];

      const { container } = await renderComponent(
        <ChatTimeline messages={mockMessages} currentRole="donor" />
      );

      const timestampSpan = container.querySelector('span.tabular-nums.font-mono');
      expect(timestampSpan).not.toBeNull();
    });
  });

  describe('3. Native Mobile Layout & Bottom Navigation Safeguards', () => {
    it('MobileNav hides during active 1-on-1 chat to prevent composer overlap', async () => {
      const { container } = await renderComponent(
        <MemoryRouter initialEntries={['/communication?conversationId=conv-test-123']}>
          <MobileNav />
        </MemoryRouter>
      );

      expect(container.querySelector('nav')).toBeNull();
    });

    it('MobileNav renders on standard workspace routes with safe area padding', async () => {
      const { container } = await renderComponent(
        <MemoryRouter initialEntries={['/patient']}>
          <MobileNav />
        </MemoryRouter>
      );

      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.className).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]');
    });
  });

  describe('4. Safe Codebase Cleanup Audit', () => {
    it('verifies that stale .bak component and service files have been safely eliminated from src/', () => {
      const srcDir = path.resolve(__dirname, '..');
      const files = fs.readdirSync(srcDir, { recursive: true }) as string[];

      const staleBakFiles = files.filter(
        (f) =>
          typeof f === 'string' &&
          (f.endsWith('.bak_phase3_0') ||
            f.endsWith('.bak_phase2_4') ||
            f.endsWith('.bak_phase2_3') ||
            f.endsWith('.bak_phase2_2'))
      );

      // Verify that component, service, view, and store stale backups are eliminated
      const staleComponentBaks = staleBakFiles.filter(
        (f) =>
          f.includes('components') ||
          f.includes('services') ||
          f.includes('views') ||
          f.includes('store') ||
          f.includes('App.tsx')
      );

      expect(staleComponentBaks).toHaveLength(0);
    });
  });
});
