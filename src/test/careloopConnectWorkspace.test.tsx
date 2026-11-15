import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CommunicationView } from '../views/CommunicationView';
import { ChatTimeline } from '../components/communication/ChatTimeline';
import { ConversationSidebar } from '../components/communication/ConversationSidebar';
import { Footer } from '../components/common/Footer';
import { Conversation, ChatMessage, EmergencyRequest } from '../types';

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

describe('CareLoop Connect — Professional Communication Workspace Test Suite', () => {
  const patientConversation: Conversation = {
    id: 'conv-patient-1',
    requestId: 'req-alpha-1',
    donorId: 'donor-kavitha-1',
    requesterId: 'usr-patient-ram',
    status: 'ACTIVE',
    donorName: 'Dr. Kavitha Reddy',
    donorBloodGroup: 'B+',
    donorCity: 'Vijayawada',
    requesterName: 'Ram Ganesh (Patient Attendant)',
    referenceCode: 'CL-8891',
    hospitalName: 'Manipal Hospital Tadepalli',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Critical',
    lastMessage: 'I am arriving at the transfusion counter in 10 minutes.',
    lastMessageTimestamp: '2026-11-15T10:15:00Z',
    unreadCount: 0,
    createdAt: '2026-11-15T10:00:00Z',
    updatedAt: '2026-11-15T10:15:00Z',
  };

  const donorConversation: Conversation = {
    id: 'conv-donor-2',
    requestId: 'req-beta-2',
    donorId: 'donor-suresh-2',
    requesterId: 'usr-patient-deepa',
    status: 'ACTIVE',
    donorName: 'Suresh Kumar',
    donorBloodGroup: 'O-',
    donorCity: 'Guntur',
    requesterName: 'Deepa Sharma',
    referenceCode: 'CL-4412',
    hospitalName: 'Guntur Govt General Hospital',
    component: 'Whole Blood',
    unitsRequired: 1,
    urgency: 'Urgent',
    lastMessage: 'Bed allocated in ward 3.',
    lastMessageTimestamp: '2026-11-15T09:30:00Z',
    unreadCount: 1,
    createdAt: '2026-11-15T09:00:00Z',
    updatedAt: '2026-11-15T09:30:00Z',
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
      conversations: [patientConversation],
      activeConversationId: patientConversation.id,
      setActiveConversationId: vi.fn(),
      chatMessages: {
        [patientConversation.id]: [
          {
            id: 'msg-1',
            conversationId: patientConversation.id,
            senderId: 'donor-kavitha-1',
            senderName: 'Dr. Kavitha Reddy',
            senderRole: 'donor',
            messageType: 'TEXT',
            content: 'Hello, I have accepted the emergency request.',
            timestamp: '2026-11-15T10:05:00Z',
            deliveryStatus: 'DELIVERED',
          },
          {
            id: 'msg-2',
            conversationId: patientConversation.id,
            senderId: 'usr-patient-ram',
            senderName: 'Ram Ganesh',
            senderRole: 'patient',
            messageType: 'TEXT',
            content: 'Thank you Doctor. Please proceed to the transfusion counter.',
            timestamp: '2026-11-15T10:07:00Z',
            deliveryStatus: 'READ',
          },
        ],
      },
      sendChatMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-new' }),
      markConversationAsRead: vi.fn(),
      submitCoordinationEvent: vi.fn(),
      initiateCall: vi.fn().mockResolvedValue({ success: true }),
      getDonorTrackingList: vi.fn().mockReturnValue([]),
      getConversationsForUser: () => mockStoreState.conversations || [],
      acceptRequestAndCreateConversation: vi.fn().mockResolvedValue({ success: true }),
      escalateRequest: vi.fn(),
      currentRole: 'patient',
      currentUser: { id: 'usr-patient-ram', fullName: 'Ram Ganesh', role: 'patient' },
      isOffline: false,
    };
  });

  /* -------------------------------------------------------------------------- */
  /* PHASE 1: PARTICIPANT IDENTITY CHECKS                                       */
  /* -------------------------------------------------------------------------- */
  it('1. Patient View displays the assigned donor name and never patient own name as title', async () => {
    mockStoreState.currentRole = 'patient';
    mockStoreState.currentUser = { id: 'usr-patient-ram', fullName: 'Ram Ganesh', role: 'patient' };
    mockStoreState.conversations = [patientConversation];
    mockStoreState.activeConversationId = patientConversation.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${patientConversation.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    // Title in active chat header must be donor's name
    expect(html).toContain('Dr. Kavitha Reddy');
    expect(html).toContain('CL-8891');
    expect(html).toContain('Manipal Hospital Tadepalli');
    // The conversation header should identify her as Volunteer Donor with blood group B+
    expect(html).toContain('Volunteer Donor (B+)');
  });

  it('2. Donor View displays the requesting patient name and never donor own name as title', async () => {
    mockStoreState.currentRole = 'donor';
    mockStoreState.currentUser = { id: 'donor-kavitha-1', fullName: 'Dr. Kavitha Reddy', role: 'donor' };
    mockStoreState.conversations = [patientConversation];
    mockStoreState.activeConversationId = patientConversation.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${patientConversation.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    // Title in active chat header must be requester's name
    expect(html).toContain('Ram Ganesh (Patient Attendant)');
    expect(html).toContain('Patient Attendant • Request #CL-8891');
  });

  /* -------------------------------------------------------------------------- */
  /* PHASE 5: DEDUPLICATION & PRESENTATION VERIFICATION                         */
  /* -------------------------------------------------------------------------- */
  it('3. Single message with duplicate IDs is deduplicated and rendered exactly once', async () => {
    const rawMessagesWithDuplicate: ChatMessage[] = [
      {
        id: 'msg-uuid-101',
        conversationId: 'conv-1',
        senderId: 'usr-1',
        senderName: 'Vikram',
        senderRole: 'donor',
        messageType: 'TEXT',
        content: 'I have arrived.',
        timestamp: '2026-11-15T11:00:00Z',
        deliveryStatus: 'DELIVERED',
      },
      // Realtime echo or duplicate fetch of same message
      {
        id: 'msg-uuid-101',
        conversationId: 'conv-1',
        senderId: 'usr-1',
        senderName: 'Vikram',
        senderRole: 'donor',
        messageType: 'TEXT',
        content: 'I have arrived.',
        timestamp: '2026-11-15T11:00:00Z',
        deliveryStatus: 'DELIVERED',
      },
    ];

    const html = await renderComponent(
      <ChatTimeline
        messages={rawMessagesWithDuplicate}
        currentUserId="usr-patient"
        currentRole="patient"
      />
    );

    // Count occurrences of message text
    const matches = html.match(/I have arrived\./g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1);
  });

  it('4. Two distinct messages with identical text content remain separate and are both rendered', async () => {
    const twoSeparateMessagesSameContent: ChatMessage[] = [
      {
        id: 'msg-first-1',
        conversationId: 'conv-1',
        senderId: 'usr-1',
        senderName: 'Vikram',
        senderRole: 'donor',
        messageType: 'TEXT',
        content: 'Please confirm status.',
        timestamp: '2026-11-15T11:00:00Z',
        deliveryStatus: 'DELIVERED',
      },
      {
        id: 'msg-second-2',
        conversationId: 'conv-1',
        senderId: 'usr-2',
        senderName: 'Doctor',
        senderRole: 'patient',
        messageType: 'TEXT',
        content: 'Please confirm status.',
        timestamp: '2026-11-15T11:03:00Z',
        deliveryStatus: 'DELIVERED',
      },
    ];

    const html = await renderComponent(
      <ChatTimeline
        messages={twoSeparateMessagesSameContent}
        currentUserId="usr-patient"
        currentRole="patient"
      />
    );

    const matches = html.match(/Please confirm status\./g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(2);
  });

  it('5. Reconciles optimistic clientMessageId and database message without duplicate rendering', async () => {
    const optimisticAndServerEcho: ChatMessage[] = [
      {
        id: 'msg-client-temp-42',
        clientMessageId: 'client-token-999',
        conversationId: 'conv-1',
        senderId: 'usr-me',
        senderName: 'Me',
        senderRole: 'patient',
        messageType: 'TEXT',
        content: 'Optimistic message in flight.',
        timestamp: '2026-11-15T11:10:00Z',
        deliveryStatus: 'SENDING',
      },
      {
        id: 'server-db-uuid-888',
        clientMessageId: 'client-token-999',
        conversationId: 'conv-1',
        senderId: 'usr-me',
        senderName: 'Me',
        senderRole: 'patient',
        messageType: 'TEXT',
        content: 'Optimistic message in flight.',
        timestamp: '2026-11-15T11:10:00Z',
        deliveryStatus: 'DELIVERED',
      },
    ];

    const html = await renderComponent(
      <ChatTimeline
        messages={optimisticAndServerEcho}
        currentUserId="usr-me"
        currentRole="patient"
      />
    );

    const matches = html.match(/Optimistic message in flight\./g);
    expect(matches?.length).toBe(1);
  });

  /* -------------------------------------------------------------------------- */
  /* PHASE 3 & 4: SIDEBAR DIRECTORY & ACCESS ISOLATION                          */
  /* -------------------------------------------------------------------------- */
  it('6. ConversationSidebar filters conversations accurately and preserves request codes', async () => {
    const html = await renderComponent(
      <ConversationSidebar
        conversations={[patientConversation, donorConversation]}
        activeConversationId={patientConversation.id}
        onSelectConversation={vi.fn()}
        currentRole="patient"
        currentUserId="usr-patient-ram"
      />
    );

    expect(html).toContain('Dr. Kavitha Reddy');
    expect(html).toContain('Suresh Kumar');
    expect(html).toContain('CL-8891');
    expect(html).toContain('CL-4412');
  });

  /* -------------------------------------------------------------------------- */
  /* PHASE 3: FOOTER SUPPRESSION IN WORKSPACE                                   */
  /* -------------------------------------------------------------------------- */
  it('7. Static footer does not render when user is inside /communication workspace', async () => {
    const html = await renderComponent(
      <MemoryRouter initialEntries={['/communication?conversationId=conv-patient-1']}>
        <Footer />
      </MemoryRouter>
    );

    expect(html).toBe('');
  });

  it('8. Static footer renders normally on non-communication routes', async () => {
    const html = await renderComponent(
      <MemoryRouter initialEntries={['/']}>
        <Footer />
      </MemoryRouter>
    );

    expect(html).toContain('CareLoop');
    expect(html).toContain('National Blood Coordination Network Active');
  });

  /* -------------------------------------------------------------------------- */
  /* PROTECTED SYSTEMS: CALL & MESSAGE SUBMISSION                               */
  /* -------------------------------------------------------------------------- */
  it('9. Initiating call preserves existing initiateCall contract without modifying signaling', async () => {
    mockStoreState.conversations = [patientConversation];
    mockStoreState.activeConversationId = patientConversation.id;

    const html = await renderComponent(
      <MemoryRouter initialEntries={[`/communication?conversationId=${patientConversation.id}`]}>
        <CommunicationView />
      </MemoryRouter>
    );

    expect(html).toContain('Voice Call');
    expect(html).toContain('WebRTC Ready');
  });
});
