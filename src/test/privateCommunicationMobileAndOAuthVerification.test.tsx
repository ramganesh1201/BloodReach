import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CommunicationView } from '../views/CommunicationView';
import { Footer } from '../components/common/Footer';
import { MobileNav } from '../components/common/MobileNav';
import { Conversation, UserProfile, UserRole } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockStoreState: any = {};
vi.mock('../store/useBloodStore', () => ({
  useBloodStore: () => mockStoreState,
}));

describe('CareLoop — Private Communication, Mobile Experience & OAuth Verification Suite', () => {
  const convPatientA: Conversation = {
    id: 'conv-patient-a-uuid',
    requestId: 'req-alpha-1',
    donorId: 'donor-1-uuid',
    requesterId: 'patient-a-uuid',
    status: 'ACTIVE',
    donorName: 'Rahul Verma',
    donorBloodGroup: 'O+',
    requesterName: 'Patient Alpha',
    referenceCode: 'CL-A101',
    hospitalName: 'Apollo Jubilee Hills',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Critical',
    unreadCount: 0,
    createdAt: '2026-11-16T10:00:00Z',
    updatedAt: '2026-11-16T10:05:00Z',
  };

  const convPatientB: Conversation = {
    id: 'conv-patient-b-uuid',
    requestId: 'req-beta-2',
    donorId: 'donor-2-uuid',
    requesterId: 'patient-b-uuid',
    status: 'ACTIVE',
    donorName: 'Dr. Sunita Rao',
    donorBloodGroup: 'B-',
    requesterName: 'Patient Beta',
    referenceCode: 'CL-B202',
    hospitalName: 'NIMS Hyderabad',
    component: 'Whole Blood',
    unitsRequired: 1,
    urgency: 'Urgent',
    unreadCount: 0,
    createdAt: '2026-11-16T11:00:00Z',
    updatedAt: '2026-11-16T11:05:00Z',
  };

  const renderComponent = async (node: React.ReactElement): Promise<string> => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(node);
    });
    const html = el.innerHTML;
    await act(async () => {
      root.unmount();
    });
    el.remove();
    return html;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      requests: [],
      conversations: [convPatientA, convPatientB],
      activeConversationId: convPatientA.id,
      setActiveConversationId: vi.fn(),
      chatMessages: {
        [convPatientA.id]: [
          {
            id: 'msg-a-1',
            conversationId: convPatientA.id,
            senderId: 'donor-1-uuid',
            senderName: 'Rahul Verma',
            senderRole: 'donor',
            messageType: 'TEXT',
            content: 'I have arrived at the Apollo transfusion desk.',
            timestamp: '2026-11-16T10:05:00Z',
            deliveryStatus: 'DELIVERED',
          },
        ],
        [convPatientB.id]: [
          {
            id: 'msg-b-1',
            conversationId: convPatientB.id,
            senderId: 'donor-2-uuid',
            senderName: 'Dr. Sunita Rao',
            senderRole: 'donor',
            messageType: 'TEXT',
            content: 'Matching unit prepared at NIMS.',
            timestamp: '2026-11-16T11:05:00Z',
            deliveryStatus: 'DELIVERED',
          },
        ],
      },
      sendChatMessage: vi.fn().mockResolvedValue({ success: true }),
      markConversationAsRead: vi.fn(),
      submitCoordinationEvent: vi.fn(),
      initiateCall: vi.fn().mockResolvedValue(undefined),
      getDonorTrackingList: vi.fn().mockReturnValue([]),
      getConversationsForUser: () => {
        // Enforce strict user isolation logic as implemented in the store
        const { currentRole, currentUser } = mockStoreState;
        if (!currentUser) return [];
        if (currentRole === 'patient') {
          return mockStoreState.conversations.filter(
            (c: Conversation) => c.requesterId === currentUser.id
          );
        }
        if (currentRole === 'donor') {
          return mockStoreState.conversations.filter(
            (c: Conversation) => c.donorId === currentUser.id
          );
        }
        if (currentRole === 'coordinator') {
          return mockStoreState.conversations.filter(
            (c: Conversation) => c.requesterId === currentUser.id || c.donorId === currentUser.id
          );
        }
        return [];
      },
      currentRole: 'patient',
      currentUser: { id: 'patient-a-uuid', fullName: 'Patient Alpha', role: 'patient' },
      isOffline: false,
    };
  });

  /* -------------------------------------------------------------------------- */
  /* 1. PARTICIPANT PRIVACY & CONVERSATION ISOLATION                             */
  /* -------------------------------------------------------------------------- */
  it('1.1 Patient A sees ONLY Patient A conversations and NEVER Patient B conversation', async () => {
    mockStoreState.currentRole = 'patient';
    mockStoreState.currentUser = { id: 'patient-a-uuid', fullName: 'Patient Alpha', role: 'patient' };
    mockStoreState.activeConversationId = convPatientA.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${convPatientA.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    // Patient A sees their assigned donor Rahul Verma and request reference code
    expect(html).toContain('Rahul Verma');
    expect(html).toContain('CL-A101');
    expect(html).toContain('I have arrived at the Apollo transfusion desk.');

    // Strict privacy boundary: Patient A must NOT see Patient B's details or messages
    expect(html).not.toContain('Dr. Sunita Rao');
    expect(html).not.toContain('CL-B202');
    expect(html).not.toContain('Matching unit prepared at NIMS.');
  });

  it('1.2 Patient B sees ONLY Patient B conversations and NEVER Patient A conversation', async () => {
    mockStoreState.currentRole = 'patient';
    mockStoreState.currentUser = { id: 'patient-b-uuid', fullName: 'Patient Beta', role: 'patient' };
    mockStoreState.activeConversationId = convPatientB.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${convPatientB.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    // Patient B sees Dr. Sunita Rao
    expect(html).toContain('Dr. Sunita Rao');
    expect(html).toContain('CL-B202');
    expect(html).toContain('Matching unit prepared at NIMS.');

    // Strict privacy boundary: Patient B must NOT see Patient A's details or messages
    expect(html).not.toContain('Rahul Verma');
    expect(html).not.toContain('CL-A101');
    expect(html).not.toContain('I have arrived at the Apollo transfusion desk.');
  });

  it('1.3 Unassigned coordinator sees ZERO conversations and a clean clinical empty state', async () => {
    mockStoreState.currentRole = 'coordinator';
    mockStoreState.currentUser = { id: 'coord-unassigned-uuid', fullName: 'Clinical Coordinator', role: 'coordinator' };
    mockStoreState.activeConversationId = null;

    const html = await renderComponent(
      <MemoryRouter initialEntries={['/communication']}>
        <CommunicationView />
      </MemoryRouter>
    );

    // Zero cross-account conversation leak
    expect(html).not.toContain('Rahul Verma');
    expect(html).not.toContain('Dr. Sunita Rao');
    expect(html).toContain('No Active Communications');
    expect(html).toContain('Coordinator Dashboard');
  });

  it('1.4 Unauthenticated visitor sees ZERO conversations', async () => {
    mockStoreState.currentUser = null;
    mockStoreState.currentRole = 'patient';
    mockStoreState.activeConversationId = null;

    const html = await renderComponent(
      <MemoryRouter initialEntries={['/communication']}>
        <CommunicationView />
      </MemoryRouter>
    );

    expect(html).not.toContain('Rahul Verma');
    expect(html).not.toContain('Dr. Sunita Rao');
    expect(html).toContain('No Active Emergency Requests');
  });

  /* -------------------------------------------------------------------------- */
  /* 2. STATIC FOOTER SUPPRESSION ON AUTHENTICATED WORKSPACES                   */
  /* -------------------------------------------------------------------------- */
  it('2.1 Footer is suppressed on all authenticated workspace routes', async () => {
    const authRoutes = [
      '/patient',
      '/donor',
      '/admin',
      '/coordinator',
      '/blood-centre',
      '/hospital',
      '/communication',
    ];

    for (const route of authRoutes) {
      const html = await renderComponent(
        <MemoryRouter initialEntries={[route]}>
          <Footer />
        </MemoryRouter>
      );
      expect(html).toBe('');
    }
  });

  it('2.2 Footer renders normally on public landing page', async () => {
    mockStoreState.currentUser = null;
    const html = await renderComponent(
      <MemoryRouter initialEntries={['/']}>
        <Footer />
      </MemoryRouter>
    );
    expect(html).toContain('CareLoop');
    expect(html).toContain('National Blood Coordination Network Active');
  });

  /* -------------------------------------------------------------------------- */
  /* 3. MOBILE NAVIGATION SUPPRESSION IN ACTIVE CHAT VIEW                       */
  /* -------------------------------------------------------------------------- */
  it('3.1 MobileNav is suppressed when inside an active mobile 1-on-1 chat', async () => {
    const html = await renderComponent(
      <MemoryRouter initialEntries={['/communication?conversationId=conv-patient-a-uuid']}>
        <MobileNav />
      </MemoryRouter>
    );
    // When chatting, bottom navigation is hidden so message composer and keyboard take full viewport
    expect(html).toBe('');
  });

  it('3.2 MobileNav renders normally on non-chat views for patient navigation', async () => {
    mockStoreState.authenticatedRole = 'patient';
    const html = await renderComponent(
      <MemoryRouter initialEntries={['/patient']}>
        <MobileNav />
      </MemoryRouter>
    );
    expect(html).toContain('Requests');
  });

  /* -------------------------------------------------------------------------- */
  /* 4. CHAT COMPOSER & ACTIONS                                                 */
  /* -------------------------------------------------------------------------- */
  it('4.1 Chat composer contains accessible send button and keyboard instruction', async () => {
    mockStoreState.currentRole = 'patient';
    mockStoreState.currentUser = { id: 'patient-a-uuid', fullName: 'Patient Alpha', role: 'patient' };
    mockStoreState.activeConversationId = convPatientA.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${convPatientA.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    expect(html).toContain('Enter to send, Shift+Enter for newline');
    expect(html).toContain('Voice Call');
    expect(html).toContain('WebRTC Ready');
  });
});
