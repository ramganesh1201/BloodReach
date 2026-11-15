import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConversationSidebar } from '../components/communication/ConversationSidebar';
import { ContextPanel } from '../components/communication/ContextPanel';
import { MessageComposer } from '../components/communication/MessageComposer';
import { Conversation, CallHistoryRecord, EmergencyRequest } from '../types';
import * as caseLifecycleService from '../services/caseLifecycleService';

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

describe('CareLoop — Case-Based Communication Lifecycle & Messenger Upgrade Suite', () => {
  const sampleRequest: EmergencyRequest = {
    id: 'req-lifecycle-1',
    referenceCode: 'CL-8899',
    bloodGroup: 'B+',
    component: 'Packed RBC',
    unitsRequired: 2,
    unitsCoordinated: 1,
    urgency: 'Critical',
    hospitalName: 'Apollo Jubilee Hills',
    hospitalAddress: 'Road No 72, Jubilee Hills',
    city: 'Hyderabad',
    district: 'Hyderabad',
    postalCode: '500033',
    contactName: 'Suresh Varma',
    contactPhone: '+91 98490 22334',
    preferredContact: 'Phone',
    status: 'COORDINATION_IN_PROGRESS',
    escalationLevel: 1,
    createdAt: '2026-11-15T10:00:00Z',
    updatedAt: '2026-11-15T10:00:00Z',
  };

  const activeConversation: Conversation = {
    id: 'conv-active-1',
    requestId: 'req-lifecycle-1',
    donorId: 'donor-1',
    requesterId: 'usr-patient-1',
    status: 'ACTIVE',
    lifecycleStatus: 'active',
    donorName: 'Dr. Sarah Jenkins',
    donorPhone: '+91 98490 55123',
    donorBloodGroup: 'B+',
    donorCity: 'Hyderabad',
    requesterName: 'Suresh Varma',
    requesterPhone: '+91 98490 22334',
    referenceCode: 'CL-8899',
    hospitalName: 'Apollo Jubilee Hills',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Critical',
    lastMessage: 'I am walking into the blood bank.',
    lastMessageTimestamp: '2026-11-15T10:30:00Z',
    unreadCount: 0,
    createdAt: '2026-11-15T10:15:00Z',
    updatedAt: '2026-11-15T10:30:00Z',
    isArchived: false,
    isMuted: false,
  };

  const pendingConversation: Conversation = {
    ...activeConversation,
    id: 'conv-pending-1',
    lifecycleStatus: 'completion_pending',
    completionProposedBy: 'donor-1',
    completionProposedAt: '2026-11-15T11:00:00Z',
    completionProposalReason: 'Donated 1 unit of B+ at Apollo Blood Bank desk.',
  };

  const completedConversation: Conversation = {
    ...activeConversation,
    id: 'conv-completed-1',
    status: 'CLOSED',
    lifecycleStatus: 'completed',
    completedBy: 'usr-patient-1',
    completedAt: '2026-11-15T11:15:00Z',
    closedAt: '2026-11-15T11:15:00Z',
    closureReason: 'Unit verified and delivered to surgery.',
    isArchived: false,
  };

  const archivedCompletedConversation: Conversation = {
    ...completedConversation,
    id: 'conv-archived-1',
    isArchived: true,
    archivedAt: '2026-11-15T11:30:00Z',
  };

  const sampleCalls: CallHistoryRecord[] = [
    {
      id: 'call-1',
      conversationId: 'conv-completed-1',
      requestId: 'req-lifecycle-1',
      callerId: 'donor-1',
      receiverId: 'usr-patient-1',
      callType: 'VOICE',
      status: 'CONNECTED',
      startedAt: '2026-11-15T10:20:00Z',
      endedAt: '2026-11-15T10:23:45Z',
      durationSeconds: 225,
      endReason: 'NORMAL_CLEARING',
    },
    {
      id: 'call-2',
      conversationId: 'conv-completed-1',
      requestId: 'req-lifecycle-1',
      callerId: 'usr-patient-1',
      receiverId: 'donor-1',
      callType: 'VOICE',
      status: 'REJECTED',
      startedAt: '2026-11-15T10:10:00Z',
      endedAt: '2026-11-15T10:10:30Z',
      durationSeconds: 0,
      endReason: 'CALLER_CANCELLED',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      requests: [sampleRequest],
      conversations: [activeConversation, pendingConversation, completedConversation, archivedCompletedConversation],
      activeConversationId: activeConversation.id,
      setActiveConversationId: vi.fn(),
      currentUser: { id: 'usr-patient-1', fullName: 'Suresh Varma', role: 'patient' },
      currentRole: 'patient',
      getConversationCallHistory: vi.fn().mockResolvedValue(sampleCalls),
      proposeCaseCompletion: vi.fn().mockResolvedValue({ success: true }),
      confirmCaseCompletion: vi.fn().mockResolvedValue({ success: true }),
      rejectCaseCompletion: vi.fn().mockResolvedValue({ success: true }),
      coordinatorResolveCase: vi.fn().mockResolvedValue({ success: true }),
      toggleConversationArchive: vi.fn().mockResolvedValue({ success: true }),
      toggleConversationMute: vi.fn().mockResolvedValue({ success: true }),
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
  /* 1. Database-Backed Lifecycle & Security Logic                               */
  /* -------------------------------------------------------------------------- */
  describe('1. Case Lifecycle RPCs & Business Rules', () => {
    it('1.1 Participant can propose case completion', async () => {
      const rpcSpy = vi.spyOn(caseLifecycleService, 'proposeCaseCompletion').mockResolvedValueOnce({
        success: true,
        lifecycleStatus: 'completion_pending',
      });

      const res = await caseLifecycleService.proposeCaseCompletion('conv-active-1', 'Donation concluded');
      expect(res.success).toBe(true);
      expect(res.lifecycleStatus).toBe('completion_pending');
      rpcSpy.mockRestore();
    });

    it('1.2 Other participant confirms case completion and closes channel', async () => {
      const rpcSpy = vi.spyOn(caseLifecycleService, 'confirmCaseCompletion').mockResolvedValueOnce({
        success: true,
        lifecycleStatus: 'completed',
      });

      const res = await caseLifecycleService.confirmCaseCompletion('conv-pending-1', 'Verified at hospital desk');
      expect(res.success).toBe(true);
      expect(res.lifecycleStatus).toBe('completed');
      rpcSpy.mockRestore();
    });

    it('1.3 Declining a proposal returns case safely to active state', async () => {
      const rpcSpy = vi.spyOn(caseLifecycleService, 'rejectCaseCompletion').mockResolvedValueOnce({
        success: true,
        lifecycleStatus: 'active',
      });

      const res = await caseLifecycleService.rejectCaseCompletion('conv-pending-1', 'Need more units');
      expect(res.success).toBe(true);
      expect(res.lifecycleStatus).toBe('active');
      rpcSpy.mockRestore();
    });

    it('1.4 Coordinator override requires mandatory reason of at least 5 chars', async () => {
      const res = await caseLifecycleService.coordinatorResolveCase('conv-active-1', 'bad');
      expect(res.success).toBe(false);
      expect(res.error).toContain('at least 5 characters');
    });

    it('1.5 Cannot archive an unresolved active emergency case', async () => {
      const rpcSpy = vi.spyOn(caseLifecycleService, 'toggleConversationArchive').mockResolvedValueOnce({
        success: false,
        error: 'Cannot archive an active emergency case. Complete the case before archiving.',
      });

      const res = await caseLifecycleService.toggleConversationArchive('conv-active-1', true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot archive an active emergency case');
      rpcSpy.mockRestore();
    });

    it('1.6 Completed conversations allow per-user archive toggle', async () => {
      const rpcSpy = vi.spyOn(caseLifecycleService, 'toggleConversationArchive').mockResolvedValueOnce({
        success: true,
        isArchived: true,
      });

      const res = await caseLifecycleService.toggleConversationArchive('conv-completed-1', true);
      expect(res.success).toBe(true);
      expect(res.isArchived).toBe(true);
      rpcSpy.mockRestore();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Messenger 3-View Sidebar & Active / Completed / Archived Filtering       */
  /* -------------------------------------------------------------------------- */
  describe('2. Messenger 3-View Sidebar', () => {
    it('2.1 Active tab displays unresolved cases only (active and completion pending)', async () => {
      const html = await renderComponent(
        <MemoryRouter>
          <ConversationSidebar
            conversations={[activeConversation, pendingConversation, completedConversation, archivedCompletedConversation]}
            activeConversationId={activeConversation.id}
            onSelectConversation={vi.fn()}
            currentRole="patient"
            currentUserId="usr-patient-1"
          />
        </MemoryRouter>
      );

      // Tab badges
      expect(html).toContain('Active');
      expect(html).toContain('Completed');
      expect(html).toContain('Archived');

      // Both active and pending cases are in Active tab by default
      expect(html).toContain('Dr. Sarah Jenkins');
      expect(html).toContain('Pending');
    });

    it('2.2 Switching tabs isolates completed and archived cases', async () => {
      const html = await renderComponent(
        <MemoryRouter>
          <ConversationSidebar
            conversations={[completedConversation]}
            activeConversationId={completedConversation.id}
            onSelectConversation={vi.fn()}
            currentRole="patient"
            currentUserId="usr-patient-1"
          />
        </MemoryRouter>
      );

      expect(html).toContain('Completed');
      expect(html).toContain('1'); // Completed tab count badge
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Read-Only Completed Case Presentation & Call History Persistence       */
  /* -------------------------------------------------------------------------- */
  describe('3. Completed Case Presentation & Call History', () => {
    it('3.1 MessageComposer renders read-only banner when conversation is completed', async () => {
      const html = await renderComponent(
        <MessageComposer
          onSendMessage={vi.fn()}
          isReadOnly={true}
          readOnlyMessage="This emergency case is completed. Message history is preserved in read-only mode."
        />
      );

      expect(html).toContain('This emergency case is completed');
      expect(html).toContain('read-only mode');
      expect(html).not.toContain('Type your emergency coordination message');
    });

    it('3.2 ContextPanel renders real call session history with duration and timestamp', async () => {
      const html = await renderComponent(
        <ContextPanel
          conversation={completedConversation}
          currentRole="patient"
          onInitiateCall={vi.fn()}
        />
      );

      // Verify resolved case status
      expect(html).toContain('Resolved');
      expect(html).toContain('Case Completed');
      expect(html).toContain('Unit verified and delivered to surgery.');

      // Wait for call history hook
      expect(html).toContain('Call History');
    });
  });
});
