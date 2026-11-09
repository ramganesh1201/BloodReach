import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CommunicationView } from '../views/CommunicationView';
import { BeforeAcceptanceTracker } from '../components/communication/BeforeAcceptanceTracker';
import { ConversationSidebar } from '../components/communication/ConversationSidebar';
import { ContextPanel } from '../components/communication/ContextPanel';
import { Conversation, EmergencyRequest, DonorTrackingItem } from '../types';

// Configure React act environment for Happy-DOM
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock store state container
let mockStoreState: any = {};
vi.mock('../store/useBloodStore', () => ({
  useBloodStore: () => mockStoreState,
}));

describe('CareLoop — CommunicationView Runtime Safety & Regression Suite', { timeout: 15000 }, () => {
  const sampleRequest: EmergencyRequest = {
    id: 'req-test-1',
    referenceCode: 'CL-9A2F',
    bloodGroup: 'O+',
    component: 'Packed RBC',
    unitsRequired: 2,
    unitsCoordinated: 1,
    urgency: 'Critical',
    hospitalName: 'Apollo Jubilee Hills',
    hospitalAddress: 'Road No 72, Jubilee Hills',
    city: 'Hyderabad',
    district: 'Hyderabad',
    postalCode: '500033',
    contactName: 'Rajesh Sharma',
    contactPhone: '+91 98490 11223',
    preferredContact: 'Phone',
    status: 'AWAITING_RESPONSE',
    escalationLevel: 1,
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
  };

  const sampleConversation: Conversation = {
    id: 'conv-test-1',
    requestId: 'req-test-1',
    donorId: 'donor-test-1',
    requesterId: 'usr-patient-1',
    status: 'ACTIVE',
    donorName: 'Vikram Rao',
    donorPhone: '+91 98490 99887',
    donorBloodGroup: 'O+',
    donorCity: 'Hyderabad',
    requesterName: 'Rajesh Sharma',
    requesterPhone: '+91 98490 11223',
    referenceCode: 'CL-9A2F',
    hospitalName: 'Apollo Jubilee Hills',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Critical',
    lastMessage: 'I am on my way to the hospital.',
    lastMessageTimestamp: '2026-11-08T11:00:00Z',
    unreadCount: 0,
    createdAt: '2026-11-08T10:30:00Z',
    updatedAt: '2026-11-08T11:00:00Z',
  };

  const sampleTrackingItem: DonorTrackingItem = {
    donorId: 'donor-test-1',
    donorName: 'Vikram Rao',
    donorBloodGroup: 'O+',
    approxDistanceKm: 4.2,
    status: 'AWAITING_RESPONSE',
    hasAccepted: false,
    notifiedAt: '2026-11-08T10:05:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockStoreState = {
      requests: [],
      conversations: [],
      activeConversationId: null,
      setActiveConversationId: vi.fn(),
      chatMessages: {},
      sendChatMessage: vi.fn().mockResolvedValue({ success: true }),
      markConversationAsRead: vi.fn(),
      submitCoordinationEvent: vi.fn(),
      initiateCall: vi.fn().mockResolvedValue(undefined),
      getDonorTrackingList: vi.fn().mockReturnValue([]),
      getConversationsForUser: () => mockStoreState.conversations || [],
      acceptRequestAndCreateConversation: vi.fn().mockResolvedValue({ success: true, conversationId: 'conv-test-1' }),
      escalateRequest: vi.fn(),
      currentRole: 'patient',
      currentUser: { id: 'usr-patient-1', fullName: 'Rajesh Sharma', role: 'patient' },
      isOffline: false,
    };
  });

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
    document.body.removeChild(el);
    return html;
  };

  /* -------------------------------------------------------------------------- */
  /* Scenario 1: Conversation with valid emergency request                       */
  /* -------------------------------------------------------------------------- */
  it('1. Conversation with valid emergency request renders chat, reference code, and specs cleanly', async () => {
    mockStoreState.requests = [sampleRequest];
    mockStoreState.conversations = [sampleConversation];
    mockStoreState.activeConversationId = sampleConversation.id;
    mockStoreState.chatMessages = {
      [sampleConversation.id]: [
        {
          id: 'msg-1',
          conversationId: sampleConversation.id,
          senderId: 'donor-test-1',
          senderName: 'Vikram Rao',
          senderRole: 'donor',
          messageType: 'TEXT',
          content: 'I have arrived at the transfusion reception desk.',
          timestamp: '2026-11-08T11:05:00Z',
          deliveryStatus: 'DELIVERED',
        },
      ],
    };

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    // Verify critical elements are rendered
    expect(html).toContain('Emergency Communication Hub');
    expect(html).toContain('CL-9A2F');
    expect(html).toContain('Vikram Rao');
    expect(html).toContain('Apollo Jubilee Hills');
    expect(html).toContain('I have arrived at the transfusion reception desk.');
    expect(html).toContain('Voice Call');
    expect(html).toContain('WebRTC Ready');
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 2: Conversation with missing / null emergency request             */
  /* -------------------------------------------------------------------------- */
  it('2. Conversation with missing or null emergency request renders safely without crashing', async () => {
    // requests is empty or contains an unrelated request ID
    mockStoreState.requests = [];
    mockStoreState.conversations = [sampleConversation];
    mockStoreState.activeConversationId = sampleConversation.id;

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    // Must render conversation details safely without throwing TypeError: Cannot read properties of undefined (reading 'referenceCode')
    expect(html).toContain('Emergency Communication Hub');
    expect(html).toContain('CL-9A2F');
    expect(html).toContain('Vikram Rao');
    expect(html).toContain('Apollo Jubilee Hills');
  });

  it('2b. Conversation with missing optional referenceCode falls back gracefully', async () => {
    const convWithoutRefCode: Conversation = {
      ...sampleConversation,
      id: 'conv-orphan-1',
      referenceCode: '' as any,
      hospitalName: '',
      donorBloodGroup: '' as any,
    };
    mockStoreState.requests = [];
    mockStoreState.conversations = [convWithoutRefCode];
    mockStoreState.activeConversationId = convWithoutRefCode.id;

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    expect(html).toContain('Direct Coordination Channel');
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 3: Conversation while request data is loading or empty           */
  /* -------------------------------------------------------------------------- */
  it('3a. Patient with empty requests and zero conversations renders structured Empty State without crash', async () => {
    mockStoreState.requests = [];
    mockStoreState.conversations = [];
    mockStoreState.activeConversationId = null;
    mockStoreState.currentRole = 'patient';

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    // Verify structured empty state is shown instead of crashing BeforeAcceptanceTracker
    expect(html).toContain('No Active Emergency Requests');
    expect(html).toContain('Create Blood Request');
    expect(html).not.toContain('Cannot read properties of undefined');
  });

  it('3b. Donor with zero conversations renders structured Donor Empty State', async () => {
    mockStoreState.requests = [sampleRequest];
    mockStoreState.conversations = [];
    mockStoreState.activeConversationId = null;
    mockStoreState.currentRole = 'donor';

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    expect(html).toContain('No Active Coordination Channels');
    expect(html).toContain('Go to Donor Hub');
  });

  it('3c. While requests array is empty but active conversations exist, chat interface remains fully accessible', async () => {
    mockStoreState.requests = [];
    mockStoreState.conversations = [sampleConversation];
    mockStoreState.activeConversationId = sampleConversation.id;

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    expect(html).toContain('Live Chat');
    expect(html).toContain('Voice Call');
    expect(html).toContain('CL-9A2F');
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 4: Empty conversation list (Before-Acceptance State)              */
  /* -------------------------------------------------------------------------- */
  it('4a. Before donor acceptance, renders BeforeAcceptanceTracker with valid request and tracking items', async () => {
    mockStoreState.requests = [sampleRequest];
    mockStoreState.conversations = [];
    mockStoreState.activeConversationId = null;
    mockStoreState.currentRole = 'patient';
    mockStoreState.getDonorTrackingList = vi.fn().mockReturnValue([sampleTrackingItem]);

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <MemoryRouter>
          <CommunicationView />
        </MemoryRouter>
      );
    })()).resolves.not.toThrow();

    // Verify BeforeAcceptanceTracker displays request referenceCode and candidate cards
    expect(html).toContain('CL-9A2F');
    expect(html).toContain('Critical Priority');
    expect(html).toContain('Apollo Jubilee Hills');
    expect(html).toContain('Direct Communication Activates on Donor Acceptance');
    expect(html).toContain('Simulate Donor Acceptance');
  });

  it('4b. BeforeAcceptanceTracker handles null or undefined request defensively without throwing', async () => {
    let htmlNull = await renderComponent(
      <BeforeAcceptanceTracker request={null} trackingItems={[]} />
    );
    expect(htmlNull).toContain('Awaiting Emergency Request Context');

    let htmlUndefined = await renderComponent(
      <BeforeAcceptanceTracker request={undefined} trackingItems={[]} />
    );
    expect(htmlUndefined).toContain('Awaiting Emergency Request Context');
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 5: Switching between conversations                                */
  /* -------------------------------------------------------------------------- */
  it('5a. Switching activeConversationId updates conversation context safely', async () => {
    const secondConversation: Conversation = {
      ...sampleConversation,
      id: 'conv-test-2',
      donorId: 'donor-test-2',
      donorName: 'Ananya Sharma',
      donorBloodGroup: 'B+',
      referenceCode: 'CL-B8C1',
      hospitalName: 'NIMS Hyderabad',
      component: 'Platelets',
      unitsRequired: 4,
      urgency: 'Urgent',
      lastMessage: 'Verified platelet donation availability.',
    };

    mockStoreState.requests = [sampleRequest];
    mockStoreState.conversations = [sampleConversation, secondConversation];

    // Select conv-1
    mockStoreState.activeConversationId = sampleConversation.id;
    let html1 = await renderComponent(
      <MemoryRouter>
        <CommunicationView />
      </MemoryRouter>
    );
    expect(html1).toContain('CL-9A2F');
    expect(html1).toContain('Vikram Rao');

    // Switch to conv-2
    mockStoreState.activeConversationId = secondConversation.id;
    let html2 = await renderComponent(
      <MemoryRouter>
        <CommunicationView />
      </MemoryRouter>
    );
    expect(html2).toContain('CL-B8C1');
    expect(html2).toContain('Ananya Sharma');
    expect(html2).toContain('NIMS Hyderabad');
  });

  it('5b. ConversationSidebar handles searches and missing referenceCode without string crashes', async () => {
    const convWithNullRef: Conversation = {
      ...sampleConversation,
      id: 'conv-null-ref',
      referenceCode: undefined as any,
      donorName: 'Test Volunteer',
    };

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <ConversationSidebar
          conversations={[sampleConversation, convWithNullRef]}
          activeConversationId={convWithNullRef.id}
          onSelectConversation={vi.fn()}
          currentRole="patient"
        />
      );
    })()).resolves.not.toThrow();

    expect(html).toContain('Test Volunteer');
    expect(html).toContain('Direct Channel');
  });

  it('5c. ContextPanel renders safely with missing or partial conversation fields', async () => {
    const minimalConv: Conversation = {
      id: 'conv-min',
      requestId: 'req-min',
      donorId: 'donor-min',
      requesterId: 'usr-patient-1',
      status: 'ACTIVE',
      donorName: 'Dr. Ramesh',
      donorBloodGroup: 'AB+' as any,
      requesterName: 'Aditi Roy',
      referenceCode: undefined as any,
      hospitalName: '',
      component: 'Plasma',
      unitsRequired: 1,
      urgency: 'Today',
      unreadCount: 0,
      createdAt: '2026-11-08T10:00:00Z',
      updatedAt: '2026-11-08T10:00:00Z',
    };

    let html = '';
    await expect((async () => {
      html = await renderComponent(
        <ContextPanel
          conversation={minimalConv}
          currentRole="patient"
          onInitiateCall={vi.fn()}
        />
      );
    })()).resolves.not.toThrow();

    expect(html).toContain('Direct Coordination Channel');
    expect(html).toContain('Emergency Hospital');
    expect(html).toContain('AB+');
    expect(html).toContain('Plasma');
  });
});
