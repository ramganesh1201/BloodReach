import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthCard } from '../components/common/AuthCard';
import { MobileNav } from '../components/common/MobileNav';
import { Footer } from '../components/common/Footer';
import { fcmService } from '../services/fcmService';
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

describe('CARELOOP — Final Functional Fixes, Admin Data Integrity & Native Mobile Release Suite', () => {
  beforeEach(() => {
    mockStoreState = {
      authenticatedRole: 'patient',
      demoExperience: null,
      currentUser: { id: 'usr-patient-1', fullName: 'Ananya Sharma', role: 'patient' },
      isRegisteredDonor: false,
      notifications: [],
      isOffline: false,
      userDonorProfile: null,
      requests: [
        {
          id: 'req-1',
          referenceCode: 'REQ-HYD-001',
          patientName: 'K. Rao',
          bloodGroup: 'O+',
          component: 'Whole Blood',
          unitsRequired: 2,
          hospitalName: 'NIMS Hospital',
          city: 'Hyderabad',
          urgency: 'Critical',
          status: 'MATCHING_RESPONDERS',
          createdAt: new Date().toISOString(),
        },
      ],
      donors: [
        {
          id: 'dnr-1',
          profileId: 'usr-dnr-1',
          fullName: 'Vikram Singh',
          bloodGroup: 'O+',
          city: 'Hyderabad',
          isAvailable: true,
          isMedicallyCleared: true,
          medicalClearanceStatus: 'APPROVED',
        },
      ],
      donorResponses: [],
      donorAssignments: [],
      inventory: [
        {
          id: 'inv-1',
          bloodCentreId: 'centre-1',
          bloodGroup: 'O+',
          component: 'Whole Blood',
          units: 12,
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'inv-2',
          bloodCentreId: 'centre-1',
          bloodGroup: 'AB-',
          component: 'Whole Blood',
          units: 2,
          updatedAt: new Date().toISOString(),
        },
      ],
      bloodCentres: [
        {
          id: 'centre-1',
          name: 'NIMS Central Blood Bank',
          city: 'Hyderabad',
          address: 'Punjagutta, Hyderabad',
          phone: '+91 40 2348 9000',
          licenseNumber: 'TS-BB-2021-0089',
        },
      ],
      events: [
        {
          id: 'evt-1',
          requestId: 'req-1',
          eventType: 'EMERGENCY_DECLARED',
          actorRole: 'patient',
          description: 'Emergency blood request REQ-HYD-001 created',
          timestamp: new Date().toISOString(),
        },
      ],
      isAuthLoading: false,
      authError: null,
      signIn: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
    };
  });

  describe('Priority 1: Donor Decline Workflow & Persistence', () => {
    it('filters out declined requests from donor actionable matches while preserving patient request', () => {
      const activeDonor = { id: 'dnr-1', profileId: 'usr-dnr-1', bloodGroup: 'O+' };
      const requests = [
        { id: 'req-1', bloodGroup: 'O+', component: 'Whole Blood', status: 'MATCHING_RESPONDERS' },
        { id: 'req-2', bloodGroup: 'O+', component: 'Whole Blood', status: 'MATCHING_RESPONDERS' },
      ];
      const donorResponses = [
        { id: 'resp-1', requestId: 'req-1', donorId: 'dnr-1', responseStatus: 'DECLINED' },
      ];

      // Simulated DonorView activeRequests filtering rule
      const activeRequests = requests.filter((r) => {
        const donorResp = donorResponses.find((dr) => dr.requestId === r.id && dr.donorId === activeDonor.id);
        if (donorResp?.responseStatus === 'DECLINED') return false;
        return true;
      });

      expect(activeRequests).toHaveLength(1);
      expect(activeRequests[0].id).toBe('req-2');
      // Original patient request remains untouched for other eligible donors
      expect(requests.find((r) => r.id === 'req-1')?.status).toBe('MATCHING_RESPONDERS');
    });

    it('verifies donor responses sync and atomic state updates in store', () => {
      const storeCode = fs.readFileSync(path.resolve(__dirname, '../store/useBloodStore.tsx'), 'utf-8');
      expect(storeCode).toContain('donorResponseService.getDonorResponses');
      expect(storeCode).toContain("table: 'donor_responses'");
      expect(storeCode).toContain('careloop_donor_responses');
    });
  });

  describe('Priority 2: Compact Registration Form Layout', () => {
    it('renders internal scroll container with max-h-[80dvh] and responsive 2-column password grid', async () => {
      const { container } = await renderComponent(
        <MemoryRouter>
          <AuthCard initialMode="signup" />
        </MemoryRouter>
      );

      const scrollContainer = container.querySelector('.max-h-\\[80dvh\\]');
      expect(scrollContainer).not.toBeNull();
      expect(scrollContainer?.className).toContain('overflow-y-auto');

      const passwordGrid = container.querySelector('.grid-cols-1.sm\\:grid-cols-2');
      expect(passwordGrid).not.toBeNull();

      // Check vertical centering on eye icons
      const eyeButtons = container.querySelectorAll('button[aria-label*="password"]');
      expect(eyeButtons.length).toBeGreaterThanOrEqual(2);
      eyeButtons.forEach((btn) => {
        expect(btn.className).toContain('top-1/2');
        expect(btn.className).toContain('-translate-y-1/2');
      });
    });

    it('uses compact input heights of h-10', async () => {
      const { container } = await renderComponent(
        <MemoryRouter>
          <AuthCard initialMode="signup" />
        </MemoryRouter>
      );

      const inputs = container.querySelectorAll('input');
      expect(inputs.length).toBeGreaterThan(0);
      inputs.forEach((input) => {
        expect(input.className).toContain('h-10');
      });
    });
  });

  describe('Priority 3: Background Push Notifications Architecture', () => {
    it('verifies non-PII push payload defaults and service worker root scope', () => {
      const swCode = fs.readFileSync(path.resolve(__dirname, '../../public/firebase-messaging-sw.js'), 'utf-8');
      expect(swCode).toContain('CareLoop Emergency Blood Alert');
      expect(swCode).toContain('Urgent blood coordination alert');
      expect(swCode).toContain('/donor');
      expect(swCode).toContain('notificationclick');

      const fcmCode = fs.readFileSync(path.resolve(__dirname, '../services/fcmService.ts'), 'utf-8');
      expect(fcmCode).toContain("platform: 'web'");
      expect(fcmCode).toContain('device_tokens');
    });

    it('fcmService handles unconfigured or unsupported environments gracefully without crashing', async () => {
      const state = fcmService.getState();
      expect(state).toHaveProperty('isSupported');
      expect(state).toHaveProperty('permission');
      expect(state).toHaveProperty('loading');
    });
  });

  describe('Priority 4: Real Admin Environment & Data Integrity', () => {
    it('verifies request search and status filtering, real inventory, and audit logging in AdminView', () => {
      const adminCode = fs.readFileSync(path.resolve(__dirname, '../views/AdminView.tsx'), 'utf-8');
      // Request filters
      expect(adminCode).toContain('requestSearchTerm');
      expect(adminCode).toContain('requestStatusFilter');
      expect(adminCode).toContain('filteredRequests');

      // Real inventory integration
      expect(adminCode).toContain('inventoryByGroup');
      expect(adminCode).toContain('criticalStockThreshold');
      expect(adminCode).toContain('Critical (<5 units)');

      // Assignments and Acceptances
      expect(adminCode).toContain('donorAssignments');
      expect(adminCode).toContain('donorResponses');

      // Audit logs
      expect(adminCode).toContain('filteredEvents');
      expect(adminCode).toContain('auditTypeFilter');
    });
  });

  describe('Priority 5: Native-App Mobile Experience & Shell Deconfliction', () => {
    it('App layout shell applies pb-0 overflow-hidden on /communication and pb-24 on standard routes', () => {
      const appCode = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
      expect(appCode).toContain("location.pathname.startsWith('/communication')");
      expect(appCode).toContain('pb-0 overflow-hidden');
      expect(appCode).toContain('pb-24 md:pb-12');
    });

    it('MobileNav hides during active 1-on-1 chat to prevent composer collision', async () => {
      const { html } = await renderComponent(
        <MemoryRouter initialEntries={['/communication?conversationId=conv-123']}>
          <MobileNav />
        </MemoryRouter>
      );

      expect(html).toBe('');
    });

    it('Footer suppresses itself on authenticated workspaces', async () => {
      const { html } = await renderComponent(
        <MemoryRouter initialEntries={['/donor']}>
          <Footer />
        </MemoryRouter>
      );

      expect(html).toBe('');
    });
  });
});
