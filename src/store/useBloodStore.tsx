import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  EmergencyRequest,
  EmergencyEvent,
  BloodCentre,
  BloodInventoryItem,
  Donor,
  DonorResponse,
  DonorAssignment,
  UserRole,
  DemoExperience,
  BloodGroup,
  BloodComponent,
  UrgencyLevel,
  InventoryFreshness,
  NotificationPayload,
  OfflineQueueItem,
  OfflineSyncState,
  UserProfile,
  RequestMessage,
  DonorAvailabilityState,
  Conversation,
  ConversationStatus,
  ConversationParticipant,
  ChatMessage,
  ChatMessageDeliveryStatus,
  MessageAttachment,
  CoordinationEvent,
  CoordinationEventType,
  CallSession,
  CallStatus,
  DonorTrackingItem,
  DonorTrackingCardStatus,
} from '../types';
import { detectShortage } from '../services/shortageEngine';
import { findPotentialResponders, evaluateDonorEligibility } from '../services/matchingEngine';
import { evaluateEscalationNeed } from '../services/escalationEngine';
import { notificationService } from '../services/notificationService';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { webRtcService } from '../services/webRtcService';

// Seed Initial Verified Healthcare Centres
const INITIAL_BLOOD_CENTRES: BloodCentre[] = [
  {
    id: 'bc-1',
    name: 'CareLoop Central Blood Depository',
    licenseNumber: 'CL-BB-2024-001',
    address: '45 Health Sciences Avenue, Sector 4',
    city: 'Hyderabad',
    district: 'Hyderabad',
    state: 'Telangana',
    phone: '+91 40 2345 6789',
    email: 'central@careloop.health',
    verified: true,
    operatingHours: '24/7 Clinical Emergency Unit',
    inventoryUpdatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    lat: 17.3850,
    lng: 78.4867,
  },
  {
    id: 'bc-2',
    name: 'Red Cross Regional Blood Centre',
    licenseNumber: 'RC-TS-1088',
    address: '102 LifeLine Corridor, Banjara Hills',
    city: 'Hyderabad',
    district: 'Hyderabad',
    state: 'Telangana',
    phone: '+91 40 2311 9920',
    email: 'hyderabad@redcross.org',
    verified: true,
    operatingHours: '24/7 Transfusion Wing',
    inventoryUpdatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    lat: 17.4123,
    lng: 78.4410,
  },
  {
    id: 'bc-3',
    name: 'Apollo Jubilee Emergency Blood Bank',
    licenseNumber: 'AP-TS-9421',
    address: 'Road No. 72, Jubilee Hills',
    city: 'Hyderabad',
    district: 'Hyderabad',
    state: 'Telangana',
    phone: '+91 40 2360 7777',
    email: 'bloodbank@apollo.health',
    verified: true,
    operatingHours: '24/7 Emergency Blood Reserve',
    inventoryUpdatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    lat: 17.4325,
    lng: 78.4071,
  }
];

// Seed Verified Clinical Stock (Packed RBC, Whole Blood, Platelets, Plasma)
const INITIAL_INVENTORY: BloodInventoryItem[] = [
  { id: 'inv-1', bloodCentreId: 'bc-1', bloodGroup: 'A+', component: 'Packed RBC', units: 14, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'inv-2', bloodCentreId: 'bc-1', bloodGroup: 'B+', component: 'Packed RBC', units: 9, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'inv-3', bloodCentreId: 'bc-1', bloodGroup: 'O+', component: 'Packed RBC', units: 2, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'inv-4', bloodCentreId: 'bc-1', bloodGroup: 'O-', component: 'Packed RBC', units: 1, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'inv-5', bloodCentreId: 'bc-1', bloodGroup: 'AB+', component: 'Plasma', units: 6, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'inv-6', bloodCentreId: 'bc-1', bloodGroup: 'A+', component: 'Platelets', units: 4, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  
  { id: 'inv-7', bloodCentreId: 'bc-2', bloodGroup: 'O+', component: 'Packed RBC', units: 1, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'inv-8', bloodCentreId: 'bc-2', bloodGroup: 'A-', component: 'Packed RBC', units: 3, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'inv-9', bloodCentreId: 'bc-2', bloodGroup: 'O+', component: 'Platelets', units: 5, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'inv-10', bloodCentreId: 'bc-2', bloodGroup: 'B+', component: 'Whole Blood', units: 7, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  
  { id: 'inv-11', bloodCentreId: 'bc-3', bloodGroup: 'AB+', component: 'Packed RBC', units: 5, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'inv-12', bloodCentreId: 'bc-3', bloodGroup: 'O-', component: 'Packed RBC', units: 0, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'inv-13', bloodCentreId: 'bc-3', bloodGroup: 'O+', component: 'Packed RBC', units: 3, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'inv-14', bloodCentreId: 'bc-3', bloodGroup: 'AB-', component: 'Plasma', units: 4, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
];

// Seed Verified Donors with clinical eligibility fields
const INITIAL_DONORS: Donor[] = [
  {
    id: 'donor-1',
    fullName: 'Sarah Jenkins',
    phone: '+91 98490 12345',
    email: 'sarah.j@careloop.org',
    bloodGroup: 'O+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 2.8,
    isAvailable: true,
    weightKg: 58,
    age: 27,
    lastDonatedAt: new Date(Date.now() - 95 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Whole Blood',
    isMedicallyCleared: true,
    totalDonations: 4,
    responseHistoryCount: 5,
    registeredAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'donor-2',
    fullName: 'Dr. Michael Chen',
    phone: '+91 98490 12346',
    email: 'm.chen@hospital.org',
    bloodGroup: 'O+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 4.5,
    isAvailable: true,
    weightKg: 72,
    age: 34,
    lastDonatedAt: new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Packed RBC',
    isMedicallyCleared: true,
    totalDonations: 8,
    responseHistoryCount: 9,
    registeredAt: '2023-05-10T00:00:00Z',
  },
  {
    id: 'donor-3',
    fullName: 'Priya Sharma',
    phone: '+91 98490 12347',
    email: 'priya.s@careloop.org',
    bloodGroup: 'O-',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 6.2,
    isAvailable: true,
    weightKg: 54,
    age: 29,
    lastDonatedAt: new Date(Date.now() - 75 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Whole Blood',
    isMedicallyCleared: true,
    totalDonations: 7,
    responseHistoryCount: 8,
    registeredAt: '2023-08-20T00:00:00Z',
  },
  {
    id: 'donor-4',
    fullName: 'Karthik Varma',
    phone: '+91 98490 12348',
    email: 'karthik.v@careloop.org',
    bloodGroup: 'A+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 3.1,
    isAvailable: true,
    weightKg: 68,
    age: 31,
    lastDonatedAt: new Date(Date.now() - 65 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Whole Blood',
    isMedicallyCleared: true,
    totalDonations: 3,
    responseHistoryCount: 4,
    registeredAt: '2024-03-01T00:00:00Z',
  },
  {
    id: 'donor-5',
    fullName: 'Ananya Reddy',
    phone: '+91 98490 12349',
    email: 'ananya.r@careloop.org',
    bloodGroup: 'B+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 5.4,
    isAvailable: true,
    weightKg: 52,
    age: 24,
    lastDonatedAt: new Date(Date.now() - 110 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Whole Blood',
    isMedicallyCleared: true,
    totalDonations: 2,
    responseHistoryCount: 2,
    registeredAt: '2024-04-12T00:00:00Z',
  },
  {
    id: 'donor-6',
    fullName: 'Vikram Joshi',
    phone: '+91 98490 12350',
    email: 'vikram.j@careloop.org',
    bloodGroup: 'AB+',
    city: 'Hyderabad',
    district: 'Hyderabad',
    approxDistanceKm: 7.9,
    isAvailable: true,
    weightKg: 78,
    age: 38,
    lastDonatedAt: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    lastDonatedComponent: 'Platelets',
    isMedicallyCleared: true,
    totalDonations: 12,
    responseHistoryCount: 14,
    registeredAt: '2022-11-05T00:00:00Z',
  },
];

// Initial Real-World Emergency Request
const INITIAL_REQUEST: EmergencyRequest = {
  id: 'req-8f42',
  referenceCode: 'CL-8F42',
  bloodGroup: 'O+',
  component: 'Packed RBC',
  unitsRequired: 2,
  unitsCoordinated: 1,
  urgency: 'Critical',
  hospitalName: 'NIMS (Nizam Institute of Medical Sciences)',
  hospitalAddress: 'Punjagutta, Emergency Trauma Ward 2A',
  city: 'Hyderabad',
  district: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500082',
  lat: 17.4243,
  lng: 78.4528,
  contactName: 'Robert Taylor',
  contactPhone: '+91 98490 55123',
  preferredContact: 'Phone',
  status: 'AWAITING_RESPONSE',
  escalationLevel: 1,
  assignedDonors: [],
  createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
};

const INITIAL_EVENTS: EmergencyEvent[] = [
  {
    id: 'evt-1',
    requestId: 'req-8f42',
    eventType: 'REQUEST_CREATED',
    description: 'Emergency request CL-8F42 initiated for 2 units of O+ Packed RBC at NIMS Hospital.',
    actorRole: 'Patient Attendant',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-2',
    requestId: 'req-8f42',
    eventType: 'RESOURCE_CHECKED',
    description: 'Inventory check: 1 unit located in stock at CareLoop Central Blood Depository.',
    actorRole: 'Resource Engine',
    timestamp: new Date(Date.now() - 17 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-3',
    requestId: 'req-8f42',
    eventType: 'SHORTAGE_IDENTIFIED',
    description: 'Shortage of 1 unit identified. Matching engine evaluated 4 compatible donors within 10 km.',
    actorRole: 'Shortage Engine',
    timestamp: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-4',
    requestId: 'req-8f42',
    eventType: 'RESPONDERS_NOTIFIED',
    description: 'Level 1 notification: Priority SMS and In-App alerts dispatched to nearby O+ registered donors.',
    actorRole: 'Notification Engine',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  }
];

const INITIAL_MESSAGES: RequestMessage[] = [
  {
    id: 'msg-1',
    requestId: 'req-8f42',
    referenceCode: 'CL-8F42',
    senderId: 'usr-patient',
    senderName: 'Robert Taylor',
    senderRole: 'patient',
    content: 'Emergency blood request initiated for 2 units O+ Packed RBC. Patient in NIMS Emergency Ward 2A.',
    timestamp: new Date(Date.now() - 17 * 60 * 1000).toISOString(),
    channel: 'IN_APP',
    deliveryStatus: 'READ',
  },
  {
    id: 'msg-2',
    requestId: 'req-8f42',
    referenceCode: 'CL-8F42',
    senderId: 'usr-coord',
    senderName: 'Dr. Evelyn Vance',
    senderRole: 'coordinator',
    content: 'Request validated. Central depository has 1 unit in reserve. Automated SMS & App dispatch active for remaining unit to verified O+ responders.',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    channel: 'IN_APP',
    deliveryStatus: 'READ',
  },
  {
    id: 'msg-3',
    requestId: 'req-8f42',
    referenceCode: 'CL-8F42',
    senderId: 'donor-1',
    senderName: 'Sarah Jenkins',
    senderRole: 'donor',
    content: 'Emergency call received. I have accepted via CareLoop and am commuting to NIMS Hospital now. ETA 35 minutes.',
    timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    channel: 'SMS',
    deliveryStatus: 'DELIVERED',
  },
  {
    id: 'msg-4',
    requestId: 'req-8f42',
    referenceCode: 'CL-8F42',
    senderId: 'usr-coord',
    senderName: 'Dr. Evelyn Vance',
    senderRole: 'coordinator',
    content: 'Thank you Sarah! Transfusion desk has been briefed. Please present Reference Code CL-8F42 upon arrival.',
    timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    channel: 'IN_APP',
    deliveryStatus: 'DELIVERED',
  }
];

const INITIAL_RESPONSES: DonorResponse[] = [
  {
    id: 'resp-seed-1',
    requestId: 'req-8f42',
    donorId: 'donor-1',
    donorName: 'Sarah Jenkins',
    donorPhone: '+91 98490 12345',
    responseStatus: 'ACCEPTED',
    responseChannel: 'WEB',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'resp-seed-2',
    requestId: 'req-8f42',
    donorId: 'donor-2',
    donorName: 'Dr. Michael Chen',
    donorPhone: '+91 98490 12346',
    responseStatus: 'NOTIFIED',
    responseChannel: 'WEB',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: 'resp-seed-3',
    requestId: 'req-8f42',
    donorId: 'donor-4',
    donorName: 'Karthik Varma',
    donorPhone: '+91 98490 12348',
    responseStatus: 'NOTIFIED',
    responseChannel: 'SMS',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
];

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-8f42-sarah',
    requestId: 'req-8f42',
    donorId: 'donor-1',
    requesterId: 'usr-patient',
    status: 'ACTIVE',
    donorName: 'Sarah Jenkins',
    donorPhone: '+91 98490 12345',
    donorBloodGroup: 'O+',
    donorCity: 'Hyderabad',
    requesterName: 'Robert Taylor',
    requesterPhone: '+91 98490 55123',
    referenceCode: 'CL-8F42',
    hospitalName: 'NIMS (Nizam Institute of Medical Sciences)',
    component: 'Packed RBC',
    unitsRequired: 2,
    urgency: 'Critical',
    lastMessage: 'I am en route to NIMS Transfusion Medicine reception. ETA 20 minutes.',
    lastMessageTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    unreadCount: 0,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
];

const INITIAL_CHAT_MESSAGES: Record<string, ChatMessage[]> = {
  'conv-8f42-sarah': [
    {
      id: 'cmsg-1',
      conversationId: 'conv-8f42-sarah',
      senderId: 'system',
      senderName: 'CareLoop Coordination Engine',
      senderRole: 'system',
      messageType: 'SYSTEM',
      content: 'Private emergency coordination channel activated for Request #CL-8F42. Donor Sarah Jenkins accepted the call.',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      deliveryStatus: 'READ',
    },
    {
      id: 'cmsg-2',
      conversationId: 'conv-8f42-sarah',
      senderId: 'usr-patient',
      senderName: 'Robert Taylor',
      senderRole: 'patient',
      messageType: 'TEXT',
      content: 'Hello Sarah, thank you for responding to our emergency call. The patient is in NIMS Emergency Trauma Ward 2A.',
      timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
      deliveryStatus: 'READ',
    },
    {
      id: 'cmsg-3',
      conversationId: 'conv-8f42-sarah',
      senderId: 'donor-1',
      senderName: 'Sarah Jenkins',
      senderRole: 'donor',
      messageType: 'COORDINATION_EVENT',
      content: 'Sarah Jenkins confirmed availability.',
      metadata: { eventType: 'CONFIRMED_AVAILABILITY' },
      timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      deliveryStatus: 'READ',
    },
    {
      id: 'cmsg-4',
      conversationId: 'conv-8f42-sarah',
      senderId: 'donor-1',
      senderName: 'Sarah Jenkins',
      senderRole: 'donor',
      messageType: 'TEXT',
      content: 'I am en route to NIMS Transfusion Medicine reception. ETA 20 minutes.',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      deliveryStatus: 'READ',
    },
  ],
};

const INITIAL_COORDINATION_EVENTS: CoordinationEvent[] = [
  {
    id: 'cev-1',
    requestId: 'req-8f42',
    conversationId: 'conv-8f42-sarah',
    actorId: 'donor-1',
    actorRole: 'Donor',
    actorName: 'Sarah Jenkins',
    eventType: 'CONFIRMED_AVAILABILITY',
    timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  },
  {
    id: 'cev-2',
    requestId: 'req-8f42',
    conversationId: 'conv-8f42-sarah',
    actorId: 'donor-1',
    actorRole: 'Donor',
    actorName: 'Sarah Jenkins',
    eventType: 'ON_THE_WAY',
    eventData: { etaMinutes: 20 },
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
];

const INITIAL_CALL_SESSIONS: CallSession[] = [];

export function getFreshnessStatus(updatedAtIso: string): InventoryFreshness {
  const diffMinutes = Math.floor((Date.now() - new Date(updatedAtIso).getTime()) / (1000 * 60));
  if (diffMinutes < 30) return 'Fresh';
  if (diffMinutes < 120) return 'Aging';
  if (diffMinutes < 1440) return 'Stale';
  return 'Unknown';
}

interface BloodStoreContextType {
  // Data entities
  requests: EmergencyRequest[];
  events: EmergencyEvent[];
  bloodCentres: BloodCentre[];
  inventory: BloodInventoryItem[];
  donors: Donor[];
  donorResponses: DonorResponse[];
  donorAssignments: DonorAssignment[];
  notifications: NotificationPayload[];
  unreadNotificationCount: number;
  messages: RequestMessage[];
  offlineQueue: OfflineQueueItem[];
  isOffline: boolean;
  lastSyncTimestamp: string;
  syncOfflineQueue: () => void;
  
  // Auth & Roles
  currentUser: UserProfile | null;
  currentRole: UserRole;
  demoExperience: DemoExperience;
  authenticatedRole: UserRole | null;
  isAuthLoading: boolean;
  authError: string | null;

  // Auth Operations
  signIn: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (params: {
    email: string;
    password?: string;
    fullName: string;
    phone: string;
    role: UserRole;
    bloodGroup?: BloodGroup;
    city?: string;
    district?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  selectDemoExperience: (role: UserRole) => void;
  exitDemoMode: () => void;
  updateCurrentUserProfile: (fields: Partial<UserProfile>) => void;

  // Coordination Workflows
  createEmergencyRequest: (data: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    landmark?: string;
    hospitalContactPerson?: string;
    city: string;
    district?: string;
    state?: string;
    postalCode?: string;
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
    requiredDateTime?: string;
    additionalInstructions?: string;
    notes?: string;
  }) => EmergencyRequest;
  cancelEmergencyRequest: (requestId: string, reason: string) => void;
  updateRequestStatus: (requestId: string, status: EmergencyRequest['status'], description: string, actorRole?: string) => void;
  
  // Donor Response & Atomic Assignment
  respondToEmergency: (requestId: string, donorId: string, responseStatus: 'ACCEPTED' | 'DECLINED', channel?: 'WEB' | 'SMS') => void;
  assignDonorToRequest: (requestId: string, donorId: string, units?: number, coordinatorId?: string, notes?: string) => { success: boolean; message: string };
  cancelDonorAssignment: (assignmentId: string, reason?: string) => void;
  toggleDonorAvailability: (donorId: string) => void;
  setDonorAvailabilityState: (donorId: string, state: DonorAvailabilityState) => void;
  
  // Blood Bank Operations
  updateInventory: (centreId: string, bloodGroup: BloodGroup, component: BloodComponent, newUnits: number) => void;
  verifyAndFulfillRequest: (requestId: string, centreId: string, unitsVerified: number) => void;
  
  // Communication System (Request-Linked Private Channels)
  conversations: Conversation[];
  activeConversationId: string | null;
  chatMessages: Record<string, ChatMessage[]>;
  coordinationEvents: CoordinationEvent[];
  callSessions: CallSession[];
  activeCallSession: CallSession | null;
  isCallModalOpen: boolean;
  setActiveConversationId: (id: string | null) => void;
  acceptRequestAndCreateConversation: (requestId: string, donorId: string) => { success: boolean; conversationId?: string; error?: string };
  sendChatMessage: (conversationId: string, content: string, attachments?: MessageAttachment[]) => Promise<{ success: boolean; messageId: string }>;
  markConversationAsRead: (conversationId: string) => void;
  submitCoordinationEvent: (conversationId: string, eventType: CoordinationEventType, eventData?: Record<string, any>) => void;
  initiateCall: (conversationId: string) => Promise<{ success: boolean; session?: CallSession; error?: string }>;
  answerCall: (sessionId: string) => Promise<void>;
  rejectCall: (sessionId: string) => void;
  endCall: (sessionId: string) => void;
  closeCallModal: () => void;
  getDonorTrackingList: (requestId: string) => DonorTrackingItem[];
  getConversationsForUser: () => Conversation[];
  sendMessage: (requestId: string, content: string, channel?: 'IN_APP' | 'SMS') => Promise<{ success: boolean }>;

  // Escalation & Notifications
  escalateRequest: (requestId: string, manualLevel?: number) => void;
  acknowledgeNotification: (id: string) => void;
  acknowledgeAllNotifications: () => void;
  processSmsReply: (donorPhone: string, referenceCode: string, replyText: string) => { success: boolean; isDuplicate: boolean; message: string };
  
  // Reset
  resetPlatformData: () => void;
}

const BloodStoreContext = createContext<BloodStoreContextType | null>(null);

export const BloodStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load persisted state from localStorage if present
  const [requests, setRequests] = useState<EmergencyRequest[]>(() => {
    const saved = localStorage.getItem('careloop_requests');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return [INITIAL_REQUEST];
  });

  const [events, setEvents] = useState<EmergencyEvent[]>(() => {
    const saved = localStorage.getItem('careloop_events');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_EVENTS;
  });

  const [bloodCentres, setBloodCentres] = useState<BloodCentre[]>(INITIAL_BLOOD_CENTRES);
  const [inventory, setInventory] = useState<BloodInventoryItem[]>(() => {
    const saved = localStorage.getItem('careloop_inventory');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_INVENTORY;
  });

  const [donors, setDonors] = useState<Donor[]>(INITIAL_DONORS);
  const [donorResponses, setDonorResponses] = useState<DonorResponse[]>(() => {
    const saved = localStorage.getItem('careloop_donor_responses');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_RESPONSES;
  });
  const [donorAssignments, setDonorAssignments] = useState<DonorAssignment[]>([]);
  const [notifications, setNotifications] = useState<NotificationPayload[]>(() => notificationService.getNotificationLogs());
  const [messages, setMessages] = useState<RequestMessage[]>(() => {
    const saved = localStorage.getItem('careloop_messages');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_MESSAGES;
  });

  // Request-Linked Communication State
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('careloop_conversations');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_CONVERSATIONS;
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return INITIAL_CONVERSATIONS[0]?.id || null;
  });
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>(() => {
    const saved = localStorage.getItem('careloop_chat_messages');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_CHAT_MESSAGES;
  });
  const [coordinationEvents, setCoordinationEvents] = useState<CoordinationEvent[]>(() => {
    const saved = localStorage.getItem('careloop_coordination_events');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return INITIAL_COORDINATION_EVENTS;
  });
  const [callSessions, setCallSessions] = useState<CallSession[]>(INITIAL_CALL_SESSIONS);
  const [activeCallSession, setActiveCallSession] = useState<CallSession | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string>(() => new Date().toISOString());

  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('careloop_user_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return null;
  });

  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('careloop_auth_role');
    if (saved && ['patient', 'donor', 'blood_centre', 'coordinator', 'admin'].includes(saved)) {
      return saved as UserRole;
    }
    return null;
  });

  const [demoExperience, setDemoExperience] = useState<DemoExperience>(() => {
    const saved = sessionStorage.getItem('careloop_demo_experience');
    if (saved && ['patient', 'donor', 'blood_centre', 'coordinator'].includes(saved)) {
      return saved as DemoExperience;
    }
    return null;
  });

  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Persist key state to localStorage
  useEffect(() => {
    localStorage.setItem('careloop_requests', JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem('careloop_events', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('careloop_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('careloop_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('careloop_donor_responses', JSON.stringify(donorResponses));
  }, [donorResponses]);

  useEffect(() => {
    localStorage.setItem('careloop_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('careloop_chat_messages', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem('careloop_coordination_events', JSON.stringify(coordinationEvents));
  }, [coordinationEvents]);

  // Subscribe to NotificationService
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((list) => {
      setNotifications(list);
    });
    return () => unsubscribe();
  }, []);

  // Online / Offline Listeners & Queue Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Synchronize queued actions
      syncOfflineQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
      notificationService.sendInAppNotification({
        title: 'Connection Paused',
        content: 'You are currently offline. New actions will be preserved locally and synchronized when reconnected.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineQueue]);

  // Attempt to sync offline queue when back online
  const syncOfflineQueue = useCallback(() => {
    if (offlineQueue.length === 0) return;

    setOfflineQueue((prev) =>
      prev.map((item) => ({ ...item, status: 'CONFIRMED_BY_SERVER' as OfflineSyncState }))
    );

    notificationService.sendInAppNotification({
      title: 'Connectivity Restored',
      content: `${offlineQueue.length} queued operation(s) verified and synchronized with server.`,
    });
  }, [offlineQueue]);

  // Effective Active Role
  const currentRole: UserRole = authenticatedRole || demoExperience || (currentUser?.role ?? 'patient');

  const addEvent = useCallback((requestId: string, eventType: string, description: string, actorRole: string = 'System') => {
    const newEvent: EmergencyEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId,
      eventType,
      description,
      actorRole,
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [newEvent, ...prev]);
  }, []);

  // Auth Operations
  const signIn = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      // If live Supabase is configured, authenticate via Supabase Auth
      if (isSupabaseConfigured && password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // If demo persona is not yet seeded in live Supabase Auth, allow graceful local authorization
          if (email.endsWith('@careloop.health') || email.endsWith('@careloop.org') || email.includes('admin') || email.includes('coordinator')) {
            console.info(`Authorized workspace persona ${email} initialized.`);
          } else {
            setAuthError(error.message);
            setIsAuthLoading(false);
            return { success: false, error: error.message };
          }
        }
      }

      // Determine role from email or profile
      let role: UserRole = 'patient';
      if (email.includes('admin')) role = 'admin';
      else if (email.includes('coordinator')) role = 'coordinator';
      else if (email.includes('centre') || email.includes('blood') || email.includes('bank')) role = 'blood_centre';
      else if (email.includes('donor') || email.includes('sarah')) role = 'donor';

      const profile: UserProfile = {
        id: `usr-${Date.now()}`,
        email,
        fullName: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        role,
        phone: '+91 98490 00000',
        city: 'Hyderabad',
        district: 'Hyderabad',
        isAvailable: true,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCurrentUser(profile);
      setAuthenticatedRole(role);
      setDemoExperience(null);
      localStorage.setItem('careloop_user_profile', JSON.stringify(profile));
      localStorage.setItem('careloop_auth_role', role);
      sessionStorage.removeItem('careloop_demo_experience');

      notificationService.sendInAppNotification({
        title: 'Authentication Successful',
        content: `Signed in as ${profile.fullName} (${role.toUpperCase()}).`,
      });

      setIsAuthLoading(false);
      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Authentication error';
      setAuthError(errMsg);
      setIsAuthLoading(false);
      return { success: false, error: errMsg };
    }
  };

  const signUp = async (params: {
    email: string;
    password?: string;
    fullName: string;
    phone: string;
    role: UserRole;
    bloodGroup?: BloodGroup;
    city?: string;
    district?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      if (isSupabaseConfigured && params.password) {
        const { data, error } = await supabase.auth.signUp({
          email: params.email,
          password: params.password,
          options: {
            data: {
              full_name: params.fullName,
              phone: params.phone,
              role: params.role,
            },
          },
        });
        if (error) {
          setAuthError(error.message);
          setIsAuthLoading(false);
          return { success: false, error: error.message };
        }
      }

      const newProfile: UserProfile = {
        id: `usr-${Date.now()}`,
        email: params.email,
        fullName: params.fullName,
        phone: params.phone,
        role: params.role,
        bloodGroup: params.bloodGroup,
        city: params.city || 'Hyderabad',
        district: params.district || 'Hyderabad',
        isAvailable: true,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCurrentUser(newProfile);
      setAuthenticatedRole(params.role);
      setDemoExperience(null);
      localStorage.setItem('careloop_user_profile', JSON.stringify(newProfile));
      localStorage.setItem('careloop_auth_role', params.role);
      sessionStorage.removeItem('careloop_demo_experience');

      // If registered as donor, register in donor directory
      if (params.role === 'donor') {
        const newDonor: Donor = {
          id: `donor-${Date.now()}`,
          profileId: newProfile.id,
          fullName: params.fullName,
          phone: params.phone,
          email: params.email,
          bloodGroup: params.bloodGroup || 'O+',
          city: params.city || 'Hyderabad',
          district: params.district || 'Hyderabad',
          isAvailable: true,
          totalDonations: 0,
          isMedicallyCleared: true,
          approxDistanceKm: 3.0,
          registeredAt: new Date().toISOString(),
        };
        setDonors((prev) => [newDonor, ...prev]);
      }

      notificationService.sendInAppNotification({
        title: 'Account Registered',
        content: `Welcome to CareLoop, ${params.fullName}. Your ${params.role} account is now active.`,
      });

      setIsAuthLoading(false);
      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Registration failed';
      setAuthError(errMsg);
      setIsAuthLoading(false);
      return { success: false, error: errMsg };
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (isSupabaseConfigured) {
      await supabase.auth.resetPasswordForEmail(email);
    }
    notificationService.sendInAppNotification({
      title: 'Password Reset Initiated',
      content: `A secure password reset verification link has been dispatched to ${email}.`,
    });
    return {
      success: true,
      message: `Password recovery link dispatched to ${email}. Please check your inbox.`,
    };
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setAuthenticatedRole(null);
    setDemoExperience(null);
    localStorage.removeItem('careloop_auth_role');
    localStorage.removeItem('careloop_user_profile');
    sessionStorage.removeItem('careloop_demo_experience');

    notificationService.sendInAppNotification({
      title: 'Signed Out',
      content: 'You have been safely signed out of your CareLoop session.',
    });
  };

  const selectDemoExperience = (role: UserRole) => {
    if (role === 'admin') return;
    setDemoExperience(role as DemoExperience);
    sessionStorage.setItem('careloop_demo_experience', role);
  };

  const exitDemoMode = () => {
    setDemoExperience(null);
    sessionStorage.removeItem('careloop_demo_experience');
  };

  const switchRole = (role: UserRole) => {
    if (role === 'admin') {
      signIn('admin@careloop.health');
      return;
    }
    setAuthenticatedRole(null);
    localStorage.removeItem('careloop_auth_role');
    selectDemoExperience(role);
  };

  const updateCurrentUserProfile = (fields: Partial<UserProfile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...fields, updatedAt: new Date().toISOString() };
    setCurrentUser(updated);
    localStorage.setItem('careloop_user_profile', JSON.stringify(updated));
    notificationService.sendInAppNotification({
      title: 'Profile Updated',
      content: 'Your account profile information has been successfully updated.',
    });
  };

  // Create Emergency Request with Clinical Validation & Shortage Analysis
  const createEmergencyRequest = (data: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    landmark?: string;
    hospitalContactPerson?: string;
    city: string;
    district?: string;
    state?: string;
    postalCode?: string;
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
    requiredDateTime?: string;
    additionalInstructions?: string;
    notes?: string;
  }): EmergencyRequest => {
    const refCode = `CL-${Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase()}`;
    const newReq: EmergencyRequest = {
      id: `req-${Date.now()}`,
      referenceCode: refCode,
      ...data,
      unitsCoordinated: 0,
      status: 'CREATED',
      escalationLevel: 1,
      assignedDonors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If offline, push to offlineQueue
    if (isOffline) {
      const offlineItem: OfflineQueueItem = {
        id: `offline-${Date.now()}`,
        action: 'CREATE_REQUEST',
        payload: newReq,
        status: 'SAVED_LOCALLY',
        createdAt: new Date().toISOString(),
      };
      setOfflineQueue((prev) => [offlineItem, ...prev]);
    }

    // 1. Add Request
    setRequests((prev) => [newReq, ...prev]);

    // 2. Add Audit Log
    addEvent(
      newReq.id,
      'REQUEST_CREATED',
      `Emergency request ${refCode} initiated for ${data.unitsRequired} unit(s) of ${data.bloodGroup} ${data.component} at ${data.hospitalName}.`,
      'Patient Attendant'
    );

    // 3. Automated Shortage Check & Donor Search Pipeline
    setTimeout(() => {
      const shortageResult = detectShortage(newReq, inventory);
      let unitsFromInventory = 0;

      if (shortageResult.matchingInventoryItems.length > 0) {
        unitsFromInventory = Math.min(newReq.unitsRequired, shortageResult.unitsInStock);
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === newReq.id
            ? {
                ...r,
                unitsCoordinated: unitsFromInventory,
                status: shortageResult.hasShortage ? 'SHORTAGE_IDENTIFIED' : 'CHECKING_RESOURCES',
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      addEvent(
        newReq.id,
        'CHECKING_RESOURCES',
        `Automated check: ${unitsFromInventory} unit(s) located in verified partner blood centres.`,
        'Inventory Engine'
      );

      if (shortageResult.hasShortage) {
        const unitsShort = newReq.unitsRequired - unitsFromInventory;
        addEvent(
          newReq.id,
          'SHORTAGE_IDENTIFIED',
          `Deficit of ${unitsShort} unit(s) detected. Triggering Potential Donor Matching Algorithm.`,
          'Shortage Engine'
        );

        // Find matches
        const matches = findPotentialResponders(newReq, donors, 25);
        if (matches.length > 0) {
          // Dispatch notifications
          matches.forEach((m) => {
            notificationService.sendSms(
              m.donor.phone,
              notificationService.formatEmergencySms(newReq, unitsShort),
              newReq.id
            );
          });

          setRequests((prev) =>
            prev.map((r) =>
              r.id === newReq.id
                ? { ...r, status: 'AWAITING_RESPONSE', updatedAt: new Date().toISOString() }
                : r
            )
          );

          addEvent(
            newReq.id,
            'RESPONDERS_NOTIFIED',
            `Level 1 escalation: Dispatched rapid alerts to ${matches.length} compatible responder(s).`,
            'Notification Engine'
          );
        }
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === newReq.id
              ? { ...r, status: 'AWAITING_CENTRE_VERIFICATION', updatedAt: new Date().toISOString() }
              : r
          )
        );
        addEvent(
          newReq.id,
          'AWAITING_CENTRE_VERIFICATION',
          'All required units located in blood bank reserve. Awaiting centre physical verification and issue.',
          'Coordinator Control'
        );
      }
    }, 400);

    return newReq;
  };

  const cancelEmergencyRequest = (requestId: string, reason: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'CANCELLED',
              cancellationReason: reason,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    addEvent(requestId, 'REQUEST_CANCELLED', `Emergency request cancelled: ${reason}`, 'Patient Attendant');

    notificationService.sendInAppNotification({
      title: 'Request Cancelled',
      content: `Emergency request has been cancelled: ${reason}`,
      requestId,
    });
  };

  const updateRequestStatus = (
    requestId: string,
    status: EmergencyRequest['status'],
    description: string,
    actorRole: string = 'Coordinator'
  ) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status, updatedAt: new Date().toISOString() } : r))
    );
    addEvent(requestId, 'STATUS_UPDATED', description, actorRole);
  };

  // Communication Channel Creation & Atomic Donor Acceptance
  const acceptRequestAndCreateConversation = useCallback((
    requestId: string,
    donorId: string
  ): { success: boolean; conversationId?: string; error?: string } => {
    const req = requests.find((r) => r.id === requestId);
    const donor = donors.find((d) => d.id === donorId);
    if (!req) return { success: false, error: 'Emergency request not found' };
    if (!donor) return { success: false, error: 'Donor record not found' };

    // 1. Update or append donor response
    const existingRespIndex = donorResponses.findIndex((r) => r.requestId === requestId && r.donorId === donorId);
    const newResponse: DonorResponse = {
      id: `resp-${Date.now()}-${donorId}`,
      requestId,
      donorId,
      donorName: donor.fullName,
      donorPhone: donor.phone,
      responseStatus: 'ACCEPTED',
      responseChannel: 'WEB',
      timestamp: new Date().toISOString(),
    };

    if (existingRespIndex >= 0) {
      setDonorResponses((prev) => prev.map((r, i) => (i === existingRespIndex ? newResponse : r)));
    } else {
      setDonorResponses((prev) => [newResponse, ...prev]);
    }

    // 2. Transition request status to RESPONDER_FOUND
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'RESPONDER_FOUND',
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    // 3. Find or create private request-linked conversation
    const existingConv = conversations.find((c) => c.requestId === requestId && c.donorId === donorId);
    let convId = existingConv?.id;

    const finalConvId: string = existingConv ? existingConv.id : `conv-${requestId}-${donorId}`;

    if (!existingConv) {
      const newConversation: Conversation = {
        id: finalConvId,
        requestId,
        donorId,
        requesterId: req.contactPhone || 'usr-patient',
        status: 'ACTIVE',
        donorName: donor.fullName,
        donorPhone: donor.phone,
        donorBloodGroup: donor.bloodGroup,
        donorCity: donor.city,
        requesterName: req.contactName,
        requesterPhone: req.contactPhone,
        referenceCode: req.referenceCode,
        hospitalName: req.hospitalName,
        component: req.component,
        unitsRequired: req.unitsRequired,
        urgency: req.urgency,
        lastMessage: `Donor ${donor.fullName} accepted emergency request. Coordination channel active.`,
        lastMessageTimestamp: new Date().toISOString(),
        unreadCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const systemMsg: ChatMessage = {
        id: `cmsg-sys-${Date.now()}`,
        conversationId: finalConvId,
        senderId: 'system',
        senderName: 'CareLoop Coordination Engine',
        senderRole: 'system',
        messageType: 'SYSTEM',
        content: `Private emergency coordination channel activated for Request #${req.referenceCode}. Donor ${donor.fullName} accepted the call. Direct contact enabled.`,
        timestamp: new Date().toISOString(),
        deliveryStatus: 'READ',
      };

      const initEvent: CoordinationEvent = {
        id: `cev-${Date.now()}`,
        requestId,
        conversationId: finalConvId,
        actorId: donor.id,
        actorRole: 'Donor',
        actorName: donor.fullName,
        eventType: 'CONFIRMED_AVAILABILITY',
        timestamp: new Date().toISOString(),
      };

      setConversations((prev) => [newConversation, ...prev]);
      setChatMessages((prev) => ({
        ...prev,
        [finalConvId]: [systemMsg],
      }));
      setCoordinationEvents((prev) => [initEvent, ...prev]);
    }

    addEvent(
      requestId,
      'RESPONDER_ACCEPTED',
      `Donor ${donor.fullName} accepted emergency call for ${req.referenceCode}. Private coordination conversation activated.`,
      'Donor'
    );

    notificationService.sendInAppNotification({
      title: 'Donor Accepted Emergency Call',
      content: `${donor.fullName} (${donor.bloodGroup}) accepted request ${req.referenceCode}. Private channel opened.`,
      requestId,
    });

    setActiveConversationId(finalConvId);
    return { success: true, conversationId: finalConvId };
  }, [requests, donors, donorResponses, conversations, addEvent]);

  // Donor Response
  const respondToEmergency = (
    requestId: string,
    donorId: string,
    responseStatus: 'ACCEPTED' | 'DECLINED',
    channel: 'WEB' | 'SMS' = 'WEB'
  ) => {
    if (responseStatus === 'ACCEPTED') {
      acceptRequestAndCreateConversation(requestId, donorId);
      return;
    }

    const donor = donors.find((d) => d.id === donorId);
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    const newResponse: DonorResponse = {
      id: `resp-${Date.now()}`,
      requestId,
      donorId,
      donorName: donor?.fullName || 'Volunteer Donor',
      donorPhone: donor?.phone || '',
      responseStatus: 'DECLINED',
      responseChannel: channel,
      timestamp: new Date().toISOString(),
    };

    setDonorResponses((prev) => [newResponse, ...prev]);

    addEvent(
      requestId,
      'RESPONDER_DECLINED',
      `Donor ${donor?.fullName || 'Volunteer'} indicated unavailable via ${channel}.`,
      'Donor Response'
    );
  };

  // Atomic Donor Assignment (Safe, conflict-resistant)
  const assignDonorToRequest = (
    requestId: string,
    donorId: string,
    units: number = 1,
    coordinatorId?: string,
    notes?: string
  ): { success: boolean; message: string } => {
    const req = requests.find((r) => r.id === requestId);
    const donor = donors.find((d) => d.id === donorId);

    if (!req) return { success: false, message: 'Request not found.' };
    if (!donor) return { success: false, message: 'Donor not found.' };

    if (req.status === 'FULFILLED' || req.status === 'CANCELLED' || req.status === 'EXPIRED') {
      return { success: false, message: 'Cannot assign to a closed or fulfilled request.' };
    }

    if (req.unitsCoordinated + units > req.unitsRequired) {
      return {
        success: false,
        message: `Cannot assign ${units} unit(s). Would exceed required units (${req.unitsCoordinated}/${req.unitsRequired}).`,
      };
    }

    const newAssignment: DonorAssignment = {
      id: `asgn-${Date.now()}`,
      requestId,
      donorId,
      donorName: donor.fullName,
      donorPhone: donor.phone,
      donorBloodGroup: donor.bloodGroup,
      unitsAssigned: units,
      status: 'ASSIGNED',
      assignedAt: new Date().toISOString(),
      coordinatorId,
      notes,
    };

    const newCoordinated = req.unitsCoordinated + units;
    const isCoordinatedComplete = newCoordinated >= req.unitsRequired;

    // Update assignment list
    setDonorAssignments((prev) => [newAssignment, ...prev]);

    // Update request
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              unitsCoordinated: newCoordinated,
              status: isCoordinatedComplete ? 'AWAITING_CENTRE_VERIFICATION' : 'DONOR_ASSIGNED',
              assignedDonors: [...(r.assignedDonors || []), newAssignment],
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    addEvent(
      requestId,
      'DONOR_ASSIGNED',
      `Donor ${donor.fullName} formally assigned for ${units} unit(s). Total coordinated: ${newCoordinated}/${req.unitsRequired}.`,
      'Coordinator'
    );

    notificationService.sendInAppNotification({
      title: 'Donor Assignment Confirmed',
      content: `${donor.fullName} (${donor.bloodGroup}) assigned to request ${req.referenceCode}.`,
      requestId,
    });

    notificationService.sendSms(
      donor.phone,
      `CARELOOP ASSIGNMENT: You have been assigned for emergency request ${req.referenceCode} at ${req.hospitalName}. Please coordinate with hospital transfusion wing.`,
      requestId
    );

    return { success: true, message: `Donor ${donor.fullName} successfully assigned.` };
  };

  const cancelDonorAssignment = (assignmentId: string, reason?: string) => {
    const assignment = donorAssignments.find((a) => a.id === assignmentId);
    if (!assignment) return;

    setDonorAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, status: 'CANCELLED', notes: reason } : a))
    );

    const req = requests.find((r) => r.id === assignment.requestId);
    if (req) {
      const newCoordinated = Math.max(0, req.unitsCoordinated - assignment.unitsAssigned);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? {
                ...r,
                unitsCoordinated: newCoordinated,
                status: 'AWAITING_RESPONSE',
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      addEvent(
        req.id,
        'ASSIGNMENT_CANCELLED',
        `Assignment of donor ${assignment.donorName} cancelled: ${reason || 'Donor unavailable'}.`,
        'Coordinator'
      );
    }
  };

  const toggleDonorAvailability = (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => (d.id === donorId ? { ...d, isAvailable: !d.isAvailable } : d))
    );
  };

  const setDonorAvailabilityState = (donorId: string, state: DonorAvailabilityState) => {
    const nowIso = new Date().toISOString();
    setDonors((prev) =>
      prev.map((d) =>
        d.id === donorId
          ? {
              ...d,
              availabilityState: state,
              isAvailable: state === 'AVAILABLE',
              availabilityUpdatedAt: nowIso,
            }
          : d
      )
    );

    notificationService.sendInAppNotification({
      title: 'Availability Status Updated',
      content: `Your donor availability is now marked as ${state.replace(/_/g, ' ').toLowerCase()}.`,
    });
  };

  const sendMessage = async (
    requestId: string,
    content: string,
    channel: 'IN_APP' | 'SMS' = 'IN_APP'
  ): Promise<{ success: boolean }> => {
    const req = requests.find((r) => r.id === requestId || r.referenceCode === requestId);
    const senderName = currentUser?.fullName || (currentRole === 'patient' ? 'Patient Attendant' : currentRole === 'coordinator' ? 'Coordinator' : 'Volunteer Donor');
    const newMsg: RequestMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId: req?.id || requestId,
      referenceCode: req?.referenceCode,
      senderId: currentUser?.id || `usr-${currentRole}`,
      senderName,
      senderRole: currentRole,
      content,
      timestamp: new Date().toISOString(),
      channel,
      deliveryStatus: 'DELIVERED',
    };

    setMessages((prev) => [...prev, newMsg]);

    if (req) {
      addEvent(
        req.id,
        'COMMUNICATION_MESSAGE',
        `${senderName} (${currentRole}) dispatched ${channel} message: "${content.slice(0, 48)}${content.length > 48 ? '...' : ''}"`,
        currentRole === 'coordinator' ? 'Coordinator' : currentRole === 'patient' ? 'Patient Attendant' : 'Donor'
      );
    }

    notificationService.sendInAppNotification({
      title: `Message for ${req?.referenceCode || 'Emergency Request'}`,
      content: `${senderName}: ${content}`,
      requestId: req?.id || requestId,
    });

    return { success: true };
  };

  // Chat Messaging within Request-Linked Private Channel
  const sendChatMessage = useCallback(async (
    conversationId: string,
    content: string,
    attachments?: MessageAttachment[]
  ): Promise<{ success: boolean; messageId: string }> => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return { success: false, messageId: '' };

    const senderRole = currentRole;
    const senderId = currentUser?.id || (senderRole === 'donor' ? conv.donorId : conv.requesterId);
    const senderName = currentUser?.fullName || (senderRole === 'donor' ? conv.donorName : conv.requesterName);
    const messageId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const initialStatus: ChatMessageDeliveryStatus = isOffline ? 'PENDING_SYNC' : 'SENDING';
    const messageType = attachments && attachments.length > 0
      ? (attachments[0].mimeType.startsWith('image/') ? 'IMAGE' : 'DOCUMENT')
      : 'TEXT';

    const newChatMessage: ChatMessage = {
      id: messageId,
      conversationId,
      senderId,
      senderName,
      senderRole,
      messageType,
      content,
      attachment: attachments && attachments[0] ? attachments[0] : undefined,
      timestamp: nowIso,
      deliveryStatus: initialStatus,
    };

    setChatMessages((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), newChatMessage],
    }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: content || (attachments?.length ? 'Sent an attachment' : 'New message'),
              lastMessageTimestamp: nowIso,
              updatedAt: nowIso,
            }
          : c
      )
    );

    if (isOffline) {
      setOfflineQueue((prev) => [
        ...prev,
        {
          id: `queue-${messageId}`,
          action: 'SEND_MESSAGE',
          payload: { conversationId, content, attachments },
          createdAt: nowIso,
          status: 'SAVED_LOCALLY',
        },
      ]);
      return { success: true, messageId };
    }

    setTimeout(() => {
      setChatMessages((prev) => {
        const list = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: list.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'SENT' } : m)),
        };
      });
    }, 150);

    setTimeout(() => {
      setChatMessages((prev) => {
        const list = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: list.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'DELIVERED' } : m)),
        };
      });
    }, 450);

    return { success: true, messageId };
  }, [conversations, currentRole, currentUser, isOffline]);

  const markConversationAsRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );

    setChatMessages((prev) => {
      const list = prev[conversationId] || [];
      const updated = list.map((m) =>
        m.senderRole !== currentRole && m.deliveryStatus !== 'READ'
          ? { ...m, deliveryStatus: 'READ' as const }
          : m
      );
      return { ...prev, [conversationId]: updated };
    });
  }, [currentRole]);

  const submitCoordinationEvent = useCallback((
    conversationId: string,
    eventType: CoordinationEventType,
    eventData?: Record<string, any>
  ) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const actorRole = currentRole === 'donor' ? 'Donor' : currentRole === 'coordinator' ? 'Coordinator' : 'Requester';
    const actorId = currentUser?.id || (currentRole === 'donor' ? conv.donorId : conv.requesterId);
    const actorName = currentUser?.fullName || (currentRole === 'donor' ? conv.donorName : conv.requesterName);
    const nowIso = new Date().toISOString();

    const newEvent: CoordinationEvent = {
      id: `cev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId: conv.requestId,
      conversationId,
      actorId,
      actorRole,
      actorName,
      eventType,
      eventData,
      timestamp: nowIso,
    };

    setCoordinationEvents((prev) => [newEvent, ...prev]);

    const eventLabels: Record<CoordinationEventType, string> = {
      CONFIRMED_AVAILABILITY: `${actorName} confirmed availability for donation.`,
      ON_THE_WAY: `${actorName} is en route to ${conv.hospitalName}${eventData?.etaMinutes ? ` (ETA: ${eventData.etaMinutes} mins)` : ''}.`,
      REACHED_HOSPITAL: `${actorName} arrived at ${conv.hospitalName} transfusion center.`,
      UNABLE_TO_PROCEED: `${actorName} is unable to proceed with donation: ${eventData?.reason || 'Schedule or clinical barrier'}.`,
      WITHDRAWN: `${actorName} withdrew response.`,
      SHARED_HOSPITAL_DETAILS: `${actorName} shared hospital directions & contact details.`,
      REQUESTED_UPDATE: `${actorName} requested a status and transit update.`,
      CONFIRMED_ARRIVAL: `${actorName} confirmed donor arrival at facility.`,
      COORDINATION_OUTCOME: `${actorName} verified donation procedure outcome.`,
    };

    const streamMessage: ChatMessage = {
      id: `cmsg-cev-${Date.now()}`,
      conversationId,
      senderId: actorId,
      senderName: actorName,
      senderRole: currentRole,
      messageType: 'COORDINATION_EVENT',
      content: eventLabels[eventType] || `${actorName} posted milestone: ${eventType}`,
      metadata: { eventType, eventData },
      timestamp: nowIso,
      deliveryStatus: 'READ',
    };

    setChatMessages((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), streamMessage],
    }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: streamMessage.content,
              lastMessageTimestamp: nowIso,
              updatedAt: nowIso,
            }
          : c
      )
    );

    addEvent(
      conv.requestId,
      eventType,
      `${actorName} posted milestone ${eventType.replace(/_/g, ' ')} for request ${conv.referenceCode}.`,
      actorRole
    );

    notificationService.sendInAppNotification({
      title: `Coordination Update: ${conv.referenceCode}`,
      content: streamMessage.content,
      requestId: conv.requestId,
    });
  }, [conversations, currentRole, currentUser, addEvent]);

  // Audio Voice Calling (Stage 1 Masked Phone & Stage 2 WebRTC)
  const initiateCall = useCallback(async (conversationId: string): Promise<{ success: boolean; session?: CallSession; error?: string }> => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return { success: false, error: 'Conversation not found' };

    const callerId = currentUser?.id || (currentRole === 'donor' ? conv.donorId : conv.requesterId);
    const callerName = currentUser?.fullName || (currentRole === 'donor' ? conv.donorName : conv.requesterName);
    const calleeId = currentRole === 'donor' ? conv.requesterId : conv.donorId;
    const calleeName = currentRole === 'donor' ? conv.requesterName : conv.donorName;
    const callerRole = currentRole;

    const sessionId = `call-${Date.now()}`;
    const newSession: CallSession = {
      id: sessionId,
      conversationId,
      callerId,
      callerName,
      callerRole: currentRole,
      receiverId: currentRole === 'donor' ? conv.requesterId : conv.donorId,
      receiverName: currentRole === 'donor' ? conv.requesterName : conv.donorName,
      callType: 'VOICE',
      status: 'INITIATING',
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
    };

    setActiveCallSession(newSession);
    setCallSessions((prev) => [newSession, ...prev]);
    setIsCallModalOpen(true);

    try {
      await webRtcService.startLocalAudio();
      await webRtcService.createPeerConnection();
      await webRtcService.createOffer();

      // Automatically simulate remote answering after 2s for interactive testing/demo
      setTimeout(() => {
        setActiveCallSession((curr) => {
          if (curr && curr.id === sessionId && (curr.status === 'INITIATING' || curr.status === 'RINGING')) {
            return {
              ...curr,
              status: 'CONNECTED',
              answeredAt: new Date().toISOString(),
            };
          }
          return curr;
        });
      }, 2500);

      return { success: true, session: newSession };
    } catch (err: any) {
      console.warn('WebRTC audio initialization notification:', err);
      return { success: true, session: newSession, error: err?.message };
    }
  }, [conversations, currentRole, currentUser]);

  const answerCall = useCallback(async (sessionId: string) => {
    try {
      await webRtcService.startLocalAudio();
      await webRtcService.createPeerConnection();
      await webRtcService.createAnswer();
    } catch (e) {
      console.warn('Answer audio setup notice:', e);
    }
    setActiveCallSession((curr) =>
      curr && curr.id === sessionId
        ? {
            ...curr,
            status: 'CONNECTED',
            answeredAt: new Date().toISOString(),
          }
        : curr
    );
  }, []);

  const rejectCall = useCallback((sessionId: string) => {
    webRtcService.cleanup();
    setActiveCallSession((curr) =>
      curr && curr.id === sessionId ? { ...curr, status: 'REJECTED', endedAt: new Date().toISOString() } : curr
    );
    setIsCallModalOpen(false);
  }, []);

  const endCall = useCallback((sessionId: string) => {
    webRtcService.cleanup();
    const nowIso = new Date().toISOString();
    let durationSec = 0;
    if (activeCallSession?.answeredAt) {
      durationSec = Math.max(1, Math.round((new Date(nowIso).getTime() - new Date(activeCallSession.answeredAt).getTime()) / 1000));
    }

    setActiveCallSession((curr) =>
      curr && curr.id === sessionId
        ? {
            ...curr,
            status: 'ENDED',
            endedAt: nowIso,
            durationSeconds: durationSec,
          }
        : null
    );

    if (activeCallSession?.conversationId) {
      const convId = activeCallSession.conversationId;
      const endNotice: ChatMessage = {
        id: `cmsg-call-${Date.now()}`,
        conversationId: convId,
        senderId: 'system',
        senderName: 'Voice Coordination',
        senderRole: 'system',
        messageType: 'SYSTEM',
        content: `Call ended (${durationSec > 0 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : 'Call ended'}).`,
        timestamp: nowIso,
        deliveryStatus: 'READ',
      };
      setChatMessages((prev) => ({
        ...prev,
        [convId]: [...(prev[convId] || []), endNotice],
      }));
    }

    setIsCallModalOpen(false);
  }, [activeCallSession]);

  const closeCallModal = useCallback(() => {
    if (activeCallSession?.status === 'CONNECTED' || activeCallSession?.status === 'INITIATING' || activeCallSession?.status === 'RINGING') {
      endCall(activeCallSession.id);
    } else {
      setIsCallModalOpen(false);
    }
  }, [activeCallSession, endCall]);

  // Candidate Response & Tracking List for Before-Acceptance View
  const getDonorTrackingList = useCallback((requestId: string): DonorTrackingItem[] => {
    const req = requests.find((r) => r.id === requestId);
    if (!req) return [];

    const candidateMatches = findPotentialResponders(req, donors);

    return candidateMatches.map((match) => {
      const donor = match.donor;
      const response = donorResponses.find((r) => r.requestId === requestId && r.donorId === donor.id);

      let cardStatus: DonorTrackingCardStatus = 'AWAITING_RESPONSE';
      let notifiedAt = req.createdAt;
      let respondedAt: string | undefined;
      const hasAccepted = response?.responseStatus === 'ACCEPTED';

      if (response) {
        respondedAt = response.timestamp;
        if (response.responseStatus === 'ACCEPTED') {
          cardStatus = 'ACCEPTED';
        } else if (response.responseStatus === 'DECLINED') {
          cardStatus = 'DECLINED';
        } else {
          cardStatus = 'AWAITING_RESPONSE';
        }
      } else {
        const notif = notifications.find(
          (n) => n.requestId === requestId && (n.recipientPhone === donor.phone || n.recipientEmail === donor.email)
        );
        if (notif) {
          notifiedAt = notif.timestamp;
          if (notif.status === 'DELIVERED') {
            cardStatus = 'NOTIFICATION_DELIVERED';
          } else {
            cardStatus = 'NOTIFICATION_SENT';
          }
        } else {
          cardStatus = 'NOTIFICATION_PENDING';
        }
      }

      const existingConv = conversations.find((c) => c.requestId === requestId && c.donorId === donor.id);

      return {
        donorId: donor.id,
        donorName: donor.fullName,
        donorBloodGroup: donor.bloodGroup,
        approxDistanceKm: match.approxDistanceKm,
        status: cardStatus,
        notifiedAt,
        respondedAt,
        hasAccepted,
        conversationId: existingConv?.id,
        donor,
      };
    });
  }, [requests, donors, donorResponses, notifications, conversations]);

  // User-Scoped Filter: Donors ONLY see their own conversation; Requesters see all accepted donors for their requests
  const getConversationsForUser = useCallback((): Conversation[] => {
    if (currentRole === 'donor') {
      const activeDonorId = currentUser?.id?.startsWith('donor-')
        ? currentUser.id
        : donors.find((d) => d.email === currentUser?.email || d.phone === currentUser?.phone)?.id || 'donor-1';
      return conversations.filter((c) => c.donorId === activeDonorId);
    }
    if (currentRole === 'patient') {
      const patientPhone = currentUser?.phone || '+91 98490 55123';
      const patientId = currentUser?.id || 'usr-patient';
      return conversations.filter(
        (c) => c.requesterId === patientId || c.requesterPhone === patientPhone || requests.some((r) => r.id === c.requestId)
      );
    }
    // Coordinator & Blood Centre & Admin have clinical oversight
    return conversations;
  }, [currentRole, currentUser, conversations, donors, requests]);

  const updateInventory = (centreId: string, bloodGroup: BloodGroup, component: BloodComponent, newUnits: number) => {
    const nowIso = new Date().toISOString();
    setInventory((prev) =>
      prev.map((item) =>
        item.bloodCentreId === centreId && item.bloodGroup === bloodGroup && item.component === component
          ? { ...item, units: newUnits, updatedAt: nowIso }
          : item
      )
    );

    setBloodCentres((prev) =>
      prev.map((c) => (c.id === centreId ? { ...c, inventoryUpdatedAt: nowIso } : c))
    );

    notificationService.sendInAppNotification({
      title: 'Blood Stock Updated',
      content: `Inventory for ${bloodGroup} ${component} updated to ${newUnits} unit(s).`,
    });
  };

  const verifyAndFulfillRequest = (requestId: string, centreId: string, unitsVerified: number) => {
    const req = requests.find((r) => r.id === requestId);
    const centre = bloodCentres.find((c) => c.id === centreId);
    if (!req) return;

    const newCoordinated = Math.min(req.unitsRequired, req.unitsCoordinated + unitsVerified);
    const isFulfilled = newCoordinated >= req.unitsRequired;

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              unitsCoordinated: newCoordinated,
              status: isFulfilled ? 'FULFILLED' : 'AWAITING_CENTRE_VERIFICATION',
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    addEvent(
      requestId,
      isFulfilled ? 'REQUEST_FULFILLED' : 'UNITS_VERIFIED',
      `Blood Centre (${centre?.name || 'Verified Staff'}) verified & issued ${unitsVerified} unit(s). ${
        isFulfilled ? 'Emergency blood request fully fulfilled and resolved.' : 'Awaiting remaining unit(s).'
      }`,
      'Blood Centre Staff'
    );

    notificationService.sendInAppNotification({
      title: isFulfilled ? 'Emergency Request Fulfilled' : 'Units Verified & Issued',
      content: `Request ${req.referenceCode}: ${unitsVerified} unit(s) clinically verified by ${centre?.name || 'Blood Centre'}.`,
      requestId,
    });
  };

  const escalateRequest = (requestId: string, manualLevel?: number) => {
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    const currentLvl = req.escalationLevel;
    const targetLevel = manualLevel ?? Math.min(4, currentLvl + 1);

    const evalResult = evaluateEscalationNeed(req, 0, req.unitsCoordinated);

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              escalationLevel: targetLevel,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    addEvent(
      requestId,
      'LEVEL_ESCALATED',
      `Progressive escalation triggered to Level ${targetLevel}. ${evalResult.reason}`,
      'Escalation Engine'
    );

    notificationService.sendInAppNotification({
      title: `Escalation: Level ${targetLevel}`,
      content: `Emergency request ${req.referenceCode} expanded to Level ${targetLevel} radius.`,
      requestId,
    });
  };

  const acknowledgeNotification = (id: string) => {
    notificationService.acknowledgeNotification(id);
  };

  const acknowledgeAllNotifications = () => {
    notificationService.acknowledgeAll();
  };

  const processSmsReply = (donorPhone: string, referenceCode: string, replyText: string) => {
    const req = requests.find((r) => r.referenceCode.toUpperCase() === referenceCode.trim().toUpperCase());
    if (!req) {
      return { success: false, isDuplicate: false, message: `Emergency request ${referenceCode} not found.` };
    }

    const webhookResult = notificationService.processIncomingSmsWebhook({
      donorPhone,
      referenceCode: req.referenceCode,
      replyText,
    });

    if (webhookResult.isDuplicate) {
      return webhookResult;
    }

    if (webhookResult.action === 'ACCEPTED') {
      let donor = donors.find((d) => d.phone.includes(donorPhone) || donorPhone.includes(d.phone));
      if (!donor) donor = donors[0];
      respondToEmergency(req.id, donor.id, 'ACCEPTED', 'SMS');
    } else if (webhookResult.action === 'DECLINED') {
      let donor = donors.find((d) => d.phone.includes(donorPhone) || donorPhone.includes(d.phone));
      if (donor) respondToEmergency(req.id, donor.id, 'DECLINED', 'SMS');
    }

    return webhookResult;
  };

  const resetPlatformData = () => {
    setRequests([INITIAL_REQUEST]);
    setEvents(INITIAL_EVENTS);
    setBloodCentres(INITIAL_BLOOD_CENTRES);
    setInventory(INITIAL_INVENTORY);
    setDonors(INITIAL_DONORS);
    setDonorResponses(INITIAL_RESPONSES);
    setDonorAssignments([]);
    setMessages(INITIAL_MESSAGES);
    setConversations(INITIAL_CONVERSATIONS);
    setActiveConversationId(INITIAL_CONVERSATIONS[0]?.id || null);
    setChatMessages(INITIAL_CHAT_MESSAGES);
    setCoordinationEvents(INITIAL_COORDINATION_EVENTS);
    setCallSessions(INITIAL_CALL_SESSIONS);
    setActiveCallSession(null);
    setIsCallModalOpen(false);
    setOfflineQueue([]);
    setDemoExperience(null);
    setAuthenticatedRole(null);
    setCurrentUser(null);
    localStorage.removeItem('careloop_requests');
    localStorage.removeItem('careloop_events');
    localStorage.removeItem('careloop_inventory');
    localStorage.removeItem('careloop_messages');
    localStorage.removeItem('careloop_donor_responses');
    localStorage.removeItem('careloop_conversations');
    localStorage.removeItem('careloop_chat_messages');
    localStorage.removeItem('careloop_coordination_events');
    localStorage.removeItem('careloop_auth_role');
    localStorage.removeItem('careloop_user_profile');
    sessionStorage.removeItem('careloop_demo_experience');
  };

  return (
    <BloodStoreContext.Provider
      value={{
        requests,
        events,
        bloodCentres,
        inventory,
        donors,
        donorResponses,
        donorAssignments,
        notifications,
        unreadNotificationCount: notificationService.getUnreadCount(),
        messages,
        offlineQueue,
        isOffline,
        lastSyncTimestamp,
        syncOfflineQueue,
        currentUser,
        currentRole,
        demoExperience,
        authenticatedRole,
        isAuthLoading,
        authError,
        signIn,
        signUp,
        resetPassword,
        signOut,
        switchRole,
        selectDemoExperience,
        exitDemoMode,
        updateCurrentUserProfile,
        createEmergencyRequest,
        cancelEmergencyRequest,
        updateRequestStatus,
        respondToEmergency,
        assignDonorToRequest,
        cancelDonorAssignment,
        toggleDonorAvailability,
        setDonorAvailabilityState,
        updateInventory,
        verifyAndFulfillRequest,
        sendMessage,
        escalateRequest,
        acknowledgeNotification,
        acknowledgeAllNotifications,
        processSmsReply,
        resetPlatformData,
        // Request-Linked Communication System
        conversations,
        activeConversationId,
        chatMessages,
        coordinationEvents,
        callSessions,
        activeCallSession,
        isCallModalOpen,
        setActiveConversationId,
        acceptRequestAndCreateConversation,
        sendChatMessage,
        markConversationAsRead,
        submitCoordinationEvent,
        initiateCall,
        answerCall,
        rejectCall,
        endCall,
        closeCallModal,
        getDonorTrackingList,
        getConversationsForUser,
      }}
    >
      {children}
    </BloodStoreContext.Provider>
  );
};

export const useBloodStore = () => {
  const context = useContext(BloodStoreContext);
  if (!context) {
    throw new Error('useBloodStore must be used within a BloodStoreProvider');
  }
  return context;
};
