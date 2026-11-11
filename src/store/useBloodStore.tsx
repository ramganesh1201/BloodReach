import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  CallConnectionState,
  CallEvent,
  CallEventType,
  DonorTrackingItem,
  DonorTrackingCardStatus,
} from '../types';
import { detectShortage } from '../services/shortageEngine';
import { findPotentialResponders, evaluateDonorEligibility } from '../services/matchingEngine';
import { evaluateEscalationNeed } from '../services/escalationEngine';
import { notificationService } from '../services/notificationService';
import { fcmService } from '../services/fcmService';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { webRtcService } from '../services/webRtcService';
import { callSignalingService } from '../services/callSignalingService';
import { ringtoneService } from '../services/ringtoneService';
import * as emergencyRequestService from '../services/emergencyRequestService';
import * as donorDiscoveryService from '../services/donorDiscoveryService';
import * as donorResponseService from '../services/donorResponseService';
import * as conversationService from '../services/conversationService';
import * as inventoryService from '../services/inventoryService';
import * as donorAssignmentService from '../services/donorAssignmentService';

// Seed Initial Verified Healthcare Centres
const INITIAL_BLOOD_CENTRES: BloodCentre[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
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
    id: 'a0000000-0000-0000-0000-000000000002',
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
    id: 'a0000000-0000-0000-0000-000000000003',
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
  { id: 'b0000000-0000-0000-0000-000000000001', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'A+', component: 'Packed RBC', units: 14, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000002', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'B+', component: 'Packed RBC', units: 9, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000003', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'O+', component: 'Packed RBC', units: 2, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000004', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'O-', component: 'Packed RBC', units: 1, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000005', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'AB+', component: 'Plasma', units: 6, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000006', bloodCentreId: 'a0000000-0000-0000-0000-000000000001', bloodGroup: 'A+', component: 'Platelets', units: 4, updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
  
  { id: 'b0000000-0000-0000-0000-000000000007', bloodCentreId: 'a0000000-0000-0000-0000-000000000002', bloodGroup: 'O+', component: 'Packed RBC', units: 1, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000008', bloodCentreId: 'a0000000-0000-0000-0000-000000000002', bloodGroup: 'A-', component: 'Packed RBC', units: 3, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000009', bloodCentreId: 'a0000000-0000-0000-0000-000000000002', bloodGroup: 'O+', component: 'Platelets', units: 5, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000010', bloodCentreId: 'a0000000-0000-0000-0000-000000000002', bloodGroup: 'B+', component: 'Whole Blood', units: 7, updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
  
  { id: 'b0000000-0000-0000-0000-000000000011', bloodCentreId: 'a0000000-0000-0000-0000-000000000003', bloodGroup: 'AB+', component: 'Packed RBC', units: 5, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000012', bloodCentreId: 'a0000000-0000-0000-0000-000000000003', bloodGroup: 'O-', component: 'Packed RBC', units: 0, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000013', bloodCentreId: 'a0000000-0000-0000-0000-000000000003', bloodGroup: 'O+', component: 'Packed RBC', units: 3, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
  { id: 'b0000000-0000-0000-0000-000000000014', bloodCentreId: 'a0000000-0000-0000-0000-000000000003', bloodGroup: 'AB-', component: 'Plasma', units: 4, updatedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() },
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
    description: 'Level 1 notification: Priority In-App alerts dispatched to nearby O+ registered donors.',
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
    content: 'Request validated. Central depository has 1 unit in reserve. Real-time In-App dispatch active for remaining unit to verified O+ responders.',
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
  syncOfflineQueue: () => Promise<void>;
  
  // Backend & Persistence Mode
  dataSource: 'database' | 'demo';
  backendError: string | null;
  refreshRequests: () => Promise<void>;
  refreshConversations: () => Promise<void>;

  // Auth & Roles
  currentUser: UserProfile | null;
  currentRole: UserRole;
  demoExperience: DemoExperience;
  authenticatedRole: UserRole | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;

  // Auth Operations
  signIn: (email: string, password?: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  signUp: (params: {
    email: string;
    password?: string;
    fullName: string;
    phone: string;
    role?: UserRole;
    bloodGroup?: BloodGroup;
    city?: string;
    district?: string;
  }) => Promise<{ success: boolean; error?: string; role?: UserRole; needsEmailConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;
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
  }) => Promise<{ success: boolean; data?: EmergencyRequest; error?: string }>;
  cancelEmergencyRequest: (requestId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  updateRequestStatus: (requestId: string, status: EmergencyRequest['status'], description: string, actorRole?: string) => void;
  
  // Donor Response & Atomic Assignment
  respondToEmergency: (requestId: string, donorId: string, responseStatus: 'ACCEPTED' | 'DECLINED', channel?: 'WEB' | 'SMS') => Promise<{ success: boolean; conversationId?: string; error?: string }>;
  assignDonorToRequest: (requestId: string, donorId: string, units?: number, coordinatorId?: string, notes?: string) => Promise<{ success: boolean; message: string }>;
  cancelDonorAssignment: (assignmentId: string, reason?: string) => Promise<void>;
  toggleDonorAvailability: (donorId: string) => void;
  setDonorAvailabilityState: (donorId: string, state: DonorAvailabilityState) => void;
  onboardAsDonor: (input: donorResponseService.DonorOnboardingInput) => Promise<{ success: boolean; data?: Donor; error?: string }>;
  
  // Blood Bank Operations
  updateInventory: (centreId: string, bloodGroup: BloodGroup, component: BloodComponent, newUnits: number) => Promise<void>;
  verifyAndFulfillRequest: (requestId: string, centreId: string, unitsVerified: number) => Promise<void>;
  
  // Communication System (Request-Linked Private Channels)
  conversations: Conversation[];
  activeConversationId: string | null;
  chatMessages: Record<string, ChatMessage[]>;
  coordinationEvents: CoordinationEvent[];
  callSessions: CallSession[];
  activeCallSession: CallSession | null;
  isCallModalOpen: boolean;
  setActiveConversationId: (id: string | null) => void;
  acceptRequestAndCreateConversation: (requestId: string, donorId: string) => Promise<{ success: boolean; conversationId?: string; error?: string }>;
  sendChatMessage: (conversationId: string, content: string, attachments?: MessageAttachment[]) => Promise<{ success: boolean; messageId: string }>;
  markConversationAsRead: (conversationId: string) => void;
  submitCoordinationEvent: (conversationId: string, eventType: CoordinationEventType, eventData?: Record<string, any>) => void;
  initiateCall: (conversationId: string) => Promise<{ success: boolean; session?: CallSession; error?: string }>;
  answerCall: (sessionId: string) => Promise<void>;
  rejectCall: (sessionId: string, reason?: string) => void;
  cancelCall: (sessionId: string, reason?: string) => void;
  endCall: (sessionId: string, reason?: string) => void;
  closeCallModal: () => void;
  audioLevel: number;
  callConnectionState: 'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
  isMicrophoneMuted: boolean;
  toggleMicrophoneMute: () => boolean;
  callError: string | null;
  setAudioOutputSink: (sinkId: string) => Promise<boolean>;
  incomingCallSession: CallSession | null;
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
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [callConnectionState, setCallConnectionState] = useState<'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed'>('new');
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [incomingCallSession, setIncomingCallSession] = useState<CallSession | null>(null);
  const callRingingTimeoutRef = useRef<any>(null);
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
  const [backendError, setBackendError] = useState<string | null>(null);

  // Persistence / Mode indicator: explicit demo preview vs live database
  const dataSource: 'database' | 'demo' = demoExperience ? 'demo' : 'database';
  const isAuthenticated = Boolean(authenticatedRole && currentUser);

  // Authoritative Session & Profile Verification via Supabase Auth
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        setIsAuthLoading(false);
        return;
      }
      setIsAuthLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('[CareLoop Auth] Session retrieval error:', sessionError.message);
          if (isMounted) {
            setCurrentUser(null);
            setAuthenticatedRole(null);
            localStorage.removeItem('careloop_auth_role');
            localStorage.removeItem('careloop_user_profile');
          }
          return;
        }

        if (session?.user && isMounted) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileRow && isMounted) {
            const verifiedRole = profileRow.role as UserRole;
            const verifiedProfile: UserProfile = {
              id: profileRow.id,
              email: profileRow.email || session.user.email || '',
              fullName: profileRow.full_name || 'CareLoop User',
              role: verifiedRole,
              phone: profileRow.phone || '',
              bloodGroup: profileRow.blood_group,
              city: profileRow.city || 'Hyderabad',
              district: profileRow.district,
              isAvailable: profileRow.is_available ?? true,
              status: profileRow.status || 'ACTIVE',
              createdAt: profileRow.created_at,
              updatedAt: profileRow.updated_at,
            };

            setCurrentUser(verifiedProfile);
            setAuthenticatedRole(verifiedRole);
            setDemoExperience(null);
            localStorage.setItem('careloop_user_profile', JSON.stringify(verifiedProfile));
            localStorage.setItem('careloop_auth_role', verifiedRole);
            sessionStorage.removeItem('careloop_demo_experience');
            notificationService.initUserSession(session.user.id);
          } else if (isMounted) {
            // User in auth.users but no profile row found
            setCurrentUser(null);
            setAuthenticatedRole(null);
            localStorage.removeItem('careloop_auth_role');
            localStorage.removeItem('careloop_user_profile');
          }
        } else if (isMounted) {
          // No active Supabase session -> clean up unauthenticated state
          setCurrentUser(null);
          setAuthenticatedRole(null);
          localStorage.removeItem('careloop_auth_role');
          localStorage.removeItem('careloop_user_profile');
        }
      } catch (err: any) {
        console.warn('[CareLoop Auth] Session check caught error:', err?.message);
        if (isMounted) {
          setCurrentUser(null);
          setAuthenticatedRole(null);
          localStorage.removeItem('careloop_auth_role');
          localStorage.removeItem('careloop_user_profile');
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileRow && isMounted) {
            const verifiedRole = profileRow.role as UserRole;
            const verifiedProfile: UserProfile = {
              id: profileRow.id,
              email: profileRow.email || session.user.email || '',
              fullName: profileRow.full_name || 'CareLoop User',
              role: verifiedRole,
              phone: profileRow.phone || '',
              bloodGroup: profileRow.blood_group,
              city: profileRow.city || 'Hyderabad',
              district: profileRow.district,
              isAvailable: profileRow.is_available ?? true,
              status: profileRow.status || 'ACTIVE',
              createdAt: profileRow.created_at,
              updatedAt: profileRow.updated_at,
            };

            setCurrentUser(verifiedProfile);
            setAuthenticatedRole(verifiedRole);
            setDemoExperience(null);
            localStorage.setItem('careloop_user_profile', JSON.stringify(verifiedProfile));
            localStorage.setItem('careloop_auth_role', verifiedRole);
            sessionStorage.removeItem('careloop_demo_experience');
            notificationService.initUserSession(session.user.id);
          }
        } catch (err) {
          console.warn('[CareLoop Auth] Profile sync error:', err);
        }
      } else if (event === 'SIGNED_OUT' || !session) {
        if (isMounted) {
          setCurrentUser(null);
          setAuthenticatedRole(null);
          localStorage.removeItem('careloop_auth_role');
          localStorage.removeItem('careloop_user_profile');
          sessionStorage.removeItem('careloop_demo_experience');
          notificationService.cleanup();
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Effective Active Role
  const currentRole: UserRole = authenticatedRole || demoExperience || (currentUser?.role ?? 'patient');

  // Real Database Synchronization
  const refreshRequests = useCallback(async () => {
    if (dataSource !== 'database' || !isSupabaseConfigured) return;
    try {
      if (currentUser?.id) {
        if (currentRole === 'donor') {
          const res = await donorDiscoveryService.getDiscoverableRequests({
            bloodGroup: currentUser.bloodGroup,
            city: currentUser.city,
          });
          if (res.error) {
            setBackendError(res.error);
          } else if (res.data) {
            setRequests((prev) => {
              const ids = new Set(res.data!.map((m) => m.id));
              const retained = prev.filter((p) => !ids.has(p.id));
              return [...res.data!, ...retained];
            });
          }
        } else if (['coordinator', 'admin', 'blood_centre'].includes(currentRole)) {
          const res = await emergencyRequestService.getAllEmergencyRequests();
          if (res.error) {
            setBackendError(res.error);
          } else if (res.data) {
            setRequests(res.data);
          }
        } else {
          const res = await emergencyRequestService.getMyEmergencyRequests(currentUser.id);
          if (res.error) {
            setBackendError(res.error);
          } else if (res.data) {
            setRequests(res.data);
          }
        }
      }
    } catch (err: any) {
      setBackendError(err?.message || 'Failed to refresh requests');
    }
  }, [dataSource, currentUser, currentRole]);

  const refreshConversations = useCallback(async () => {
    if (dataSource !== 'database' || !isSupabaseConfigured || !currentUser?.id) return;
    try {
      const res = await conversationService.getConversationsForUser(currentUser.id);
      if (res.error) {
        setBackendError(res.error);
      } else if (res.data) {
        setConversations(res.data);
      }
    } catch (err: any) {
      setBackendError(err?.message || 'Failed to refresh conversations');
    }
  }, [dataSource, currentUser]);

  const refreshInventory = useCallback(async () => {
    if (dataSource !== 'database' || !isSupabaseConfigured) return;
    try {
      const [centresRes, invRes] = await Promise.all([
        inventoryService.fetchBloodCentres(),
        inventoryService.fetchInventory(),
      ]);

      if (centresRes.data && centresRes.data.length > 0) {
        setBloodCentres(centresRes.data);
      }
      if (invRes.data && invRes.data.length > 0) {
        setInventory(invRes.data);
      }
    } catch (err: any) {
      console.warn('[CareLoop Store] Failed to refresh inventory from DB:', err?.message);
    }
  }, [dataSource]);

  useEffect(() => {
    if (currentUser?.id && dataSource === 'database') {
      refreshRequests();
      refreshConversations();
      refreshInventory();
    }
  }, [currentUser?.id, dataSource, refreshRequests, refreshConversations, refreshInventory]);

  // Realtime Inventory Synchronization
  useEffect(() => {
    if (dataSource !== 'database' || !isSupabaseConfigured) return;
    const unsubscribe = inventoryService.subscribeToInventory((updatedItem) => {
      setInventory((prev) => {
        const index = prev.findIndex(
          (i) =>
            i.bloodCentreId === updatedItem.bloodCentreId &&
            i.bloodGroup === updatedItem.bloodGroup &&
            i.component === updatedItem.component
        );
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedItem;
          return next;
        }
        return [...prev, updatedItem];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [dataSource]);

  // Realtime Chat Message Synchronization for Active Conversation
  useEffect(() => {
    if (!activeConversationId || dataSource !== 'database' || !isSupabaseConfigured) return;

    let isMounted = true;
    conversationService.getConversationMessages(activeConversationId).then((res) => {
      if (isMounted && res.success && res.data && res.data.length > 0) {
        setChatMessages((prev) => ({
          ...prev,
          [activeConversationId]: res.data!,
        }));
      }
    });

    const unsubscribe = conversationService.subscribeToMessages(activeConversationId, (incomingMsg) => {
      if (!isMounted) return;
      setChatMessages((prev) => {
        const existing = prev[activeConversationId] || [];
        if (
          existing.some(
            (m) =>
              m.id === incomingMsg.id ||
              (incomingMsg.clientMessageId && m.clientMessageId === incomingMsg.clientMessageId)
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          [activeConversationId]: [...existing, incomingMsg],
        };
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeConversationId, dataSource]);

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

  // Cross-Device & Cross-Tab Secure Incoming Call Subscription
  useEffect(() => {
    const myId = currentUser?.id || (currentRole === 'donor' ? 'donor-1' : 'usr-patient');
    if (!myId) return;

    const unsubscribe = callSignalingService.subscribeToUserIncomingCalls(
      myId,
      (session: CallSession) => {
        // Disregard our own outgoing calls
        if (session.callerId === myId) return;

        // Discard stale calls older than 45 seconds
        if (session.startedAt) {
          const elapsed = Date.now() - new Date(session.startedAt).getTime();
          if (elapsed > 45000) {
            console.warn('[Call] Discarding stale incoming call:', session.id);
            return;
          }
        }

        // If currently in an active or accepted call, ignore or return busy
        if (activeCallSession && ['ACCEPTED', 'CONNECTED'].includes(activeCallSession.status)) {
          console.warn('[Call] Received incoming call while already in call. Busy.');
          return;
        }

        console.info('[Call] Remote incoming emergency voice call received:', session);
        setIncomingCallSession(session);
        ringtoneService.startIncomingRingtone();
      },
      (callId: string, status: string, reason?: string) => {
        // Remote caller cancelled before answer or call timed out
        setIncomingCallSession((curr) => {
          if (curr && curr.id === callId) {
            ringtoneService.stop();
            return null;
          }
          return curr;
        });

        // Remote peer ended active call
        setActiveCallSession((curr) => {
          if (curr && curr.id === callId) {
            ringtoneService.playCallEndTone();
            webRtcService.cleanup();
            callSignalingService.leaveCallChannel(callId);
            return {
              ...curr,
              status: status as CallStatus,
              endedAt: new Date().toISOString(),
              endReason: reason,
            };
          }
          return curr;
        });
      }
    );

    return () => {
      unsubscribe();
      ringtoneService.stop();
      if (callRingingTimeoutRef.current) {
        clearTimeout(callRingingTimeoutRef.current);
      }
    };
  }, [currentUser, currentRole, activeCallSession]);

  // Cleanup active calls when closing window or navigating away
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeCallSession && ['RINGING', 'ACCEPTED', 'CONNECTED'].includes(activeCallSession.status)) {
        callSignalingService.sendEnded(activeCallSession.id, 'Participant closed browser tab');
        callSignalingService.leaveCallChannel(activeCallSession.id);
        webRtcService.cleanup();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeCallSession]);

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
  const syncOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;

    const pendingItems = offlineQueue.filter(
      (item) => item.status === 'SAVED_LOCALLY' || item.status === 'WAITING_FOR_CONNECTION' || item.status === 'FAILED'
    );
    if (pendingItems.length === 0) return;

    let syncedCount = 0;
    const updatedQueue = [...offlineQueue];

    for (const item of pendingItems) {
      try {
        if (item.action === 'CREATE_REQUEST') {
          if (isSupabaseConfigured) {
            const res = await emergencyRequestService.createEmergencyRequest(item.payload, currentUser?.id);
            const idx = updatedQueue.findIndex((q) => q.id === item.id);
            if (res.success && res.data) {
              setRequests((prev) =>
                prev.map((r) => (r.id === item.payload.id ? res.data! : r))
              );
              syncedCount++;
              if (idx !== -1) {
                updatedQueue[idx] = { ...updatedQueue[idx], status: 'CONFIRMED_BY_SERVER', lastAttemptAt: new Date().toISOString() };
              }
            } else {
              if (idx !== -1) {
                updatedQueue[idx] = { ...updatedQueue[idx], status: 'FAILED', error: res.error, lastAttemptAt: new Date().toISOString() };
              }
            }
          } else {
            syncedCount++;
            const idx = updatedQueue.findIndex((q) => q.id === item.id);
            if (idx !== -1) {
              updatedQueue[idx] = { ...updatedQueue[idx], status: 'CONFIRMED_BY_SERVER', lastAttemptAt: new Date().toISOString() };
            }
          }
        } else if (item.action === 'SEND_MESSAGE') {
          if (isSupabaseConfigured) {
            const p = item.payload;
            const res = await conversationService.sendChatMessage(
              p.conversationId,
              p.senderId || currentUser?.id || '',
              p.senderName || currentUser?.fullName || '',
              p.senderRole || currentRole,
              p.content,
              p.clientMessageId || item.id
            );
            const idx = updatedQueue.findIndex((q) => q.id === item.id);
            if (res.success) {
              syncedCount++;
              if (idx !== -1) {
                updatedQueue[idx] = { ...updatedQueue[idx], status: 'CONFIRMED_BY_SERVER', lastAttemptAt: new Date().toISOString() };
              }
            } else {
              if (idx !== -1) {
                updatedQueue[idx] = { ...updatedQueue[idx], status: 'FAILED', error: res.error, lastAttemptAt: new Date().toISOString() };
              }
            }
          } else {
            syncedCount++;
            const idx = updatedQueue.findIndex((q) => q.id === item.id);
            if (idx !== -1) {
              updatedQueue[idx] = { ...updatedQueue[idx], status: 'CONFIRMED_BY_SERVER', lastAttemptAt: new Date().toISOString() };
            }
          }
        }
      } catch (err: any) {
        const idx = updatedQueue.findIndex((q) => q.id === item.id);
        if (idx !== -1) {
          updatedQueue[idx] = { ...updatedQueue[idx], status: 'FAILED', error: err?.message, lastAttemptAt: new Date().toISOString() };
        }
      }
    }

    setOfflineQueue(updatedQueue);

    if (syncedCount > 0) {
      notificationService.sendInAppNotification({
        title: 'Connectivity Restored',
        content: `${syncedCount} queued operation(s) synchronized with server.`,
      });
    }
  }, [offlineQueue, isSupabaseConfigured, currentUser, currentRole]);

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
  const signIn = async (
    email: string,
    password?: string
  ): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    setIsAuthLoading(true);
    setAuthError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setIsAuthLoading(false);
      return { success: false, error: 'Email address is required.' };
    }
    if (!password) {
      setIsAuthLoading(false);
      return { success: false, error: 'Password is required.' };
    }

    try {
      if (!isSupabaseConfigured) {
        const fallbackRole: UserRole = 'patient';
        const profile: UserProfile = {
          id: `usr-${Date.now()}`,
          email: cleanEmail,
          fullName: cleanEmail.split('@')[0],
          role: fallbackRole,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentUser(profile);
        setAuthenticatedRole(fallbackRole);
        setIsAuthLoading(false);
        return { success: true, role: fallbackRole };
      }

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authErr) {
        let msg = authErr.message;
        if (msg.includes('Invalid login credentials')) {
          msg = 'Invalid email or password. Please verify your credentials.';
        } else if (msg.includes('Email not confirmed')) {
          msg = 'Please verify your email address before signing in.';
        }
        setAuthError(msg);
        setIsAuthLoading(false);
        return { success: false, error: msg };
      }

      if (!authData.user) {
        setIsAuthLoading(false);
        return { success: false, error: 'Authentication failed. No user record returned.' };
      }

      // Fetch the user's actual profile from Supabase profiles table
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      const resolvedRole: UserRole = (profileRow?.role as UserRole) || 'patient';
      const fullName = profileRow?.full_name || cleanEmail.split('@')[0];

      const verifiedProfile: UserProfile = {
        id: authData.user.id,
        email: cleanEmail,
        fullName,
        role: resolvedRole,
        phone: profileRow?.phone || '',
        bloodGroup: profileRow?.blood_group,
        city: profileRow?.city || 'Hyderabad',
        district: profileRow?.district,
        isAvailable: profileRow?.is_available ?? true,
        status: (profileRow?.status as any) || 'ACTIVE',
        createdAt: profileRow?.created_at || new Date().toISOString(),
        updatedAt: profileRow?.updated_at || new Date().toISOString(),
      };

      setCurrentUser(verifiedProfile);
      setAuthenticatedRole(resolvedRole);
      setDemoExperience(null);
      localStorage.setItem('careloop_user_profile', JSON.stringify(verifiedProfile));
      localStorage.setItem('careloop_auth_role', resolvedRole);
      sessionStorage.removeItem('careloop_demo_experience');
      notificationService.initUserSession(authData.user.id);

      notificationService.sendInAppNotification({
        title: 'Authentication Successful',
        content: `Signed in as ${verifiedProfile.fullName} (${resolvedRole.toUpperCase()}).`,
      });

      setIsAuthLoading(false);
      return { success: true, role: resolvedRole };
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
    role?: UserRole;
    bloodGroup?: BloodGroup;
    city?: string;
    district?: string;
  }): Promise<{ success: boolean; error?: string; role?: UserRole; needsEmailConfirmation?: boolean }> => {
    setIsAuthLoading(true);
    setAuthError(null);

    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.fullName.trim();
    const cleanPhone = params.phone.trim();

    if (!cleanEmail || !cleanName || !cleanPhone || !params.password) {
      setIsAuthLoading(false);
      return { success: false, error: 'All mandatory profile fields and password are required.' };
    }

    if (params.password.length < 6) {
      setIsAuthLoading(false);
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    try {
      if (!isSupabaseConfigured) {
        const fallbackRole: UserRole = 'patient';
        const newProfile: UserProfile = {
          id: `usr-${Date.now()}`,
          email: cleanEmail,
          fullName: cleanName,
          phone: cleanPhone,
          role: fallbackRole,
          city: params.city || 'Hyderabad',
          district: params.district || 'Hyderabad',
          isAvailable: true,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCurrentUser(newProfile);
        setAuthenticatedRole(fallbackRole);
        setIsAuthLoading(false);
        return { success: true, role: fallbackRole };
      }

      // Public registrations strictly receive the 'patient' role through the trusted handle_new_user trigger
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: params.password,
        options: {
          data: {
            full_name: cleanName,
            phone: cleanPhone,
          },
        },
      });

      if (authErr) {
        let msg = authErr.message;
        if (msg.includes('User already registered')) {
          msg = 'An account with this email address already exists. Please sign in instead.';
        }
        setAuthError(msg);
        setIsAuthLoading(false);
        return { success: false, error: msg };
      }

      const sessionUser = authData.session?.user || authData.user;
      const needsEmailConfirmation = !authData.session && Boolean(authData.user && !authData.user.confirmed_at);

      if (sessionUser && !needsEmailConfirmation) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .maybeSingle();

        const role: UserRole = (profileRow?.role as UserRole) || 'patient';
        const newProfile: UserProfile = {
          id: sessionUser.id,
          email: cleanEmail,
          fullName: cleanName,
          phone: cleanPhone,
          role,
          city: params.city || 'Hyderabad',
          district: params.district || 'Hyderabad',
          isAvailable: true,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setCurrentUser(newProfile);
        setAuthenticatedRole(role);
        setDemoExperience(null);
        localStorage.setItem('careloop_user_profile', JSON.stringify(newProfile));
        localStorage.setItem('careloop_auth_role', role);
        sessionStorage.removeItem('careloop_demo_experience');
        notificationService.initUserSession(sessionUser.id);
      }

      notificationService.sendInAppNotification({
        title: 'Account Registered',
        content: `Welcome to CareLoop, ${cleanName}. Your account has been registered.`,
      });

      setIsAuthLoading(false);
      return { success: true, role: 'patient', needsEmailConfirmation };
    } catch (err: any) {
      const errMsg = err?.message || 'Registration failed';
      setAuthError(errMsg);
      setIsAuthLoading(false);
      return { success: false, error: errMsg };
    }
  };

  const resetPassword = async (
    email: string
  ): Promise<{ success: boolean; message: string; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return {
        success: false,
        message: 'Please provide a valid email address.',
        error: 'Email address is required.',
      };
    }

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) {
          return { success: false, message: error.message, error: error.message };
        }
      }

      notificationService.sendInAppNotification({
        title: 'Password Reset Dispatched',
        content: `Instructions to reset your password have been sent to ${cleanEmail}.`,
      });

      return {
        success: true,
        message: `Password recovery link dispatched to ${cleanEmail}. Please check your inbox.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to dispatch reset email.',
        error: err?.message,
      };
    }
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
  const createEmergencyRequest = async (data: {
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
  }): Promise<{ success: boolean; data?: EmergencyRequest; error?: string }> => {
    // If offline, queue locally
    if (isOffline) {
      const refCode = emergencyRequestService.generateReferenceCode();
      const offlineReq: EmergencyRequest = {
        id: `offline-req-${Date.now()}`,
        referenceCode: refCode,
        ...data,
        unitsCoordinated: 0,
        status: 'CREATED',
        escalationLevel: 1,
        assignedDonors: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const offlineItem: OfflineQueueItem = {
        id: `offline-${Date.now()}`,
        action: 'CREATE_REQUEST',
        payload: offlineReq,
        status: 'SAVED_LOCALLY',
        createdAt: new Date().toISOString(),
      };
      setOfflineQueue((prev) => [offlineItem, ...prev]);
      setRequests((prev) => [offlineReq, ...prev]);
      return { success: true, data: offlineReq };
    }

    if (dataSource === 'demo') {
      const refCode = emergencyRequestService.generateReferenceCode();
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

      setRequests((prev) => [newReq, ...prev]);
      addEvent(
        newReq.id,
        'REQUEST_CREATED',
        `Emergency request ${refCode} initiated for ${data.unitsRequired} unit(s) of ${data.bloodGroup} ${data.component} at ${data.hospitalName}.`,
        'Patient Attendant'
      );

      // Automated Shortage Check & Donor Search Pipeline for Demo
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

      return { success: true, data: newReq };
    }

    // Database Mode: Execute actual insertion into Supabase
    setBackendError(null);
    const result = await emergencyRequestService.createEmergencyRequest(data, currentUser?.id);
    if (!result.success || !result.data) {
      const errorMsg = result.error || 'Failed to persist emergency request to database.';
      setBackendError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const created = result.data;
    setRequests((prev) => [created, ...prev]);
    addEvent(
      created.id,
      'REQUEST_CREATED',
      `Emergency request ${created.referenceCode} created and stored in clinical registry.`,
      'Patient Attendant'
    );

    // Non-blocking Web Push notification trigger to clinically matched donors
    try {
      const candidateMatches = findPotentialResponders(created, donors);
      const matchedUserIds = candidateMatches
        .map((m) => m.donor.profileId || m.donor.id)
        .filter((id): id is string => Boolean(id));

      if (matchedUserIds.length > 0) {
        fcmService.dispatchPushToMatchedDonors({
          requestId: created.id,
          referenceCode: created.referenceCode,
          bloodGroup: created.bloodGroup,
          component: created.component,
          hospitalName: created.hospitalName,
          city: created.city,
          recipientUserIds: matchedUserIds,
        }).catch(() => {});
      }
    } catch {
      // Non-blocking: push alert failure never prevents request creation or local store update
    }

    return { success: true, data: created };
  };

  const cancelEmergencyRequest = async (requestId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
    if (dataSource === 'database' && isSupabaseConfigured) {
      setBackendError(null);
      const res = await emergencyRequestService.cancelEmergencyRequest(requestId, reason);
      if (!res.success) {
        setBackendError(res.error || 'Failed to cancel request in database.');
        return { success: false, error: res.error };
      }
    }

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

    return { success: true };
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
  const acceptRequestAndCreateConversation = useCallback(async (
    requestId: string,
    donorId: string
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> => {
    if (dataSource === 'database' && isSupabaseConfigured) {
      setBackendError(null);
      const rpcRes = await donorResponseService.acceptRequestAndCreateConversation(requestId, donorId);
      if (!rpcRes.success) {
        setBackendError(rpcRes.error || 'Failed to accept emergency request.');
        return {
          success: false,
          error: rpcRes.error || 'Failed to accept emergency request.',
        };
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: 'RESPONDER_FOUND', updatedAt: new Date().toISOString() }
            : r
        )
      );

      if (rpcRes.conversationId) {
        setActiveConversationId(rpcRes.conversationId);
        await refreshConversations();
      }

      return {
        success: true,
        conversationId: rpcRes.conversationId,
      };
    }

    // Demo Mode execution
    const req = requests.find((r) => r.id === requestId);
    const donor = donors.find((d) => d.id === donorId);
    if (!req) return { success: false, error: 'Emergency request not found' };
    if (!donor) return { success: false, error: 'Donor record not found' };

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

    const existingConv = conversations.find((c) => c.requestId === requestId && c.donorId === donorId);
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
  }, [dataSource, requests, donors, donorResponses, conversations, addEvent, refreshConversations]);

  // Donor Response
  const respondToEmergency = async (
    requestId: string,
    donorId: string,
    responseStatus: 'ACCEPTED' | 'DECLINED',
    channel: 'WEB' | 'SMS' = 'WEB'
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> => {
    if (responseStatus === 'ACCEPTED') {
      return await acceptRequestAndCreateConversation(requestId, donorId);
    }

    if (dataSource === 'database' && isSupabaseConfigured) {
      setBackendError(null);
      const decRes = await donorResponseService.declineRequest(requestId, donorId);
      if (!decRes.success) {
        setBackendError(decRes.error || 'Failed to record decline');
        return { success: false, error: decRes.error };
      }
    }

    const donor = donors.find((d) => d.id === donorId);
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

    return { success: true };
  };

  // Atomic Donor Assignment (Safe, conflict-resistant & DB-backed)
  const assignDonorToRequest = async (
    requestId: string,
    donorId: string,
    units: number = 1,
    coordinatorId?: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> => {
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

    let assignmentId = `asgn-${Date.now()}`;
    // Database atomic procedure when Supabase is configured and authenticated as coordinator/admin
    if (isSupabaseConfigured && currentUser && ['coordinator', 'admin'].includes(currentRole)) {
      const dbRes = await donorAssignmentService.assignDonorAtomic({
        requestId,
        donorId,
        units,
        coordinatorId: currentUser.id,
      });

      if (!dbRes.success) {
        return { success: false, message: dbRes.error || 'Assignment rejected by database.' };
      }
      if (dbRes.assignmentId) {
        assignmentId = dbRes.assignmentId;
      }
    }

    const newAssignment: DonorAssignment = {
      id: assignmentId,
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
    setDonorAssignments((prev) => [newAssignment, ...prev.filter((a) => !(a.requestId === requestId && a.donorId === donorId))]);

    // Update request
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              unitsCoordinated: newCoordinated,
              status: isCoordinatedComplete ? 'AWAITING_CENTRE_VERIFICATION' : 'DONOR_ASSIGNED',
              assignedDonors: [...(r.assignedDonors || []).filter((a) => a.donorId !== donorId), newAssignment],
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
      idempotencyKey: `asgn-confirmed:${requestId}:${donorId}`,
    });

    notificationService.sendSms(
      donor.phone,
      `CARELOOP ASSIGNMENT: You have been assigned for emergency request ${req.referenceCode} at ${req.hospitalName}. Please coordinate with hospital transfusion wing.`,
      requestId
    );

    return { success: true, message: `Donor ${donor.fullName} successfully assigned.` };
  };

  const cancelDonorAssignment = async (assignmentId: string, reason?: string) => {
    const assignment = donorAssignments.find((a) => a.id === assignmentId);
    if (!assignment) return;

    if (isSupabaseConfigured && !assignmentId.startsWith('asgn-')) {
      await donorAssignmentService.cancelAssignmentAtomic({
        assignmentId,
        reason: reason || 'Cancelled by coordinator',
      });
    }

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
                status: newCoordinated === 0 ? 'AWAITING_RESPONSE' : 'DONOR_ASSIGNED',
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

  const onboardAsDonor = async (
    input: donorResponseService.DonorOnboardingInput
  ): Promise<{ success: boolean; data?: Donor; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'User must be authenticated to submit donor registration.' };
    }

    if (dataSource === 'database' && isSupabaseConfigured) {
      setBackendError(null);
      const res = await donorResponseService.submitDonorOnboarding(input, currentUser.id);
      if (!res.success) {
        setBackendError(res.error || 'Failed to submit donor onboarding.');
        return { success: false, error: res.error };
      }
      if (res.data) {
        setDonors((prev) => [res.data!, ...prev.filter((d) => d.profileId !== currentUser.id)]);
      }
    } else {
      const newDonor: Donor = {
        id: `donor-${Date.now()}`,
        profileId: currentUser.id,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || currentUser.email,
        bloodGroup: input.bloodGroup,
        gender: input.gender,
        sex: input.gender,
        city: input.city,
        district: input.district,
        isAvailable: input.isAvailable,
        lastDonatedAt: input.lastDonatedAt,
        lastDonatedComponent: input.donationType,
        isMedicallyCleared: false,
        weightKg: input.weightKg,
        age: input.age,
        totalDonations: input.donationHistory,
        registeredAt: new Date().toISOString(),
      };
      setDonors((prev) => [newDonor, ...prev.filter((d) => d.profileId !== currentUser.id)]);
    }

    // Recipient-specific notification for the applicant
    notificationService.sendInAppNotification({
      userId: currentUser.id,
      title: 'Donor Application Submitted',
      content: `Your volunteer donor registration (${input.bloodGroup}) has been recorded and submitted for clinical verification.`,
    });

    // Administrative alert for coordinators/admins
    notificationService.sendInAppNotification({
      title: 'New Donor Registration',
      content: `Volunteer donor application received from ${input.fullName} (${input.bloodGroup}, ${input.city}). Ready for verification and role activation.`,
      metadata: { role: 'coordinator' },
    });

    return { success: true };
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

    if (dataSource === 'database' && isSupabaseConfigured) {
      try {
        const dbRes = await conversationService.sendChatMessage(
          conversationId,
          senderId,
          senderName,
          senderRole,
          content,
          messageId
        );
        if (dbRes.success) {
          setChatMessages((prev) => {
            const list = prev[conversationId] || [];
            return {
              ...prev,
              [conversationId]: list.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'DELIVERED' } : m)),
            };
          });
        } else {
          setChatMessages((prev) => {
            const list = prev[conversationId] || [];
            return {
              ...prev,
              [conversationId]: list.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'FAILED' } : m)),
            };
          });
        }
      } catch (err) {
        setChatMessages((prev) => {
          const list = prev[conversationId] || [];
          return {
            ...prev,
            [conversationId]: list.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'FAILED' } : m)),
          };
        });
      }
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
  }, [conversations, currentRole, currentUser, isOffline, dataSource]);

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

  // Helper to clear ringing timeout
  const clearCallTimeout = useCallback(() => {
    if (callRingingTimeoutRef.current) {
      clearTimeout(callRingingTimeoutRef.current);
      callRingingTimeoutRef.current = null;
    }
  }, []);

  // Safe Supabase RPC Invoker
  const invokeRpcSafe = useCallback(async (fnName: string, params: Record<string, any>) => {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.rpc(fnName, params);
    } catch (err) {
      console.warn(`[Supabase RPC] ${fnName} error:`, err);
    }
  }, []);

  // Audio Voice Calling (Stage 1 Masked Phone & Stage 2 Genuine WebRTC + Realtime Signaling)
  const initiateCall = useCallback(async (conversationId: string): Promise<{ success: boolean; session?: CallSession; error?: string }> => {
    setCallError(null);
    clearCallTimeout();

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return { success: false, error: 'Conversation channel not found.' };

    const callerId = currentUser?.id || (currentRole === 'donor' ? conv.donorId : conv.requesterId);
    const callerName = currentUser?.fullName || (currentRole === 'donor' ? conv.donorName : conv.requesterName);
    const receiverId = currentRole === 'donor' ? conv.requesterId : conv.donorId;
    const receiverName = currentRole === 'donor' ? conv.requesterName : conv.donorName;
    const callerRole = currentRole;

    if (activeCallSession && ['RINGING', 'ACCEPTED', 'CONNECTED'].includes(activeCallSession.status)) {
      setCallError('A call is already active or in progress.');
      return { success: false, error: 'A call is already active or in progress.' };
    }

    let sessionId = `call-${Date.now()}`;
    let configuredIceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (isSupabaseConfigured && currentUser) {
      try {
        const { data, error } = await supabase.rpc('initiate_call', {
          p_conversation_id: conversationId,
          p_call_type: 'VOICE',
        });
        if (error) {
          console.warn('[Call] RPC initiate_call notice:', error);
        } else if (data && data.success) {
          sessionId = data.call_id;
          if (data.ice_servers) {
            configuredIceServers = data.ice_servers;
          }
        } else if (data && !data.success) {
          setCallError(data.message || 'Call authorization failed.');
          return { success: false, error: data.message };
        }
      } catch (e: any) {
        console.warn('[Call] Exception invoking initiate_call RPC:', e);
      }
    }

    webRtcService.setIceServers(configuredIceServers);

    // 1. Capture microphone on explicit user action
    const audioRes = await webRtcService.acquireLocalAudio();
    if (!audioRes.success) {
      const errMsg = audioRes.error || 'Microphone access denied. Please allow microphone access in browser settings.';
      setCallError(errMsg);
      setIsCallModalOpen(true);
      return { success: false, error: errMsg };
    }

    const newSession: CallSession = {
      id: sessionId,
      conversationId,
      requestId: conv.requestId,
      callerId,
      callerName,
      callerRole: currentRole,
      receiverId,
      receiverName,
      receiverRole: currentRole === 'donor' ? 'patient' : 'donor',
      callType: 'VOICE',
      status: 'RINGING',
      startedAt: new Date().toISOString(),
      ringingAt: new Date().toISOString(),
      durationSeconds: 0,
    };

    setActiveCallSession(newSession);
    setCallSessions((prev) => [newSession, ...prev.filter((s) => s.id !== sessionId)]);
    setIsCallModalOpen(true);
    setCallConnectionState('connecting');

    // 2. Start audible ringback tone
    ringtoneService.startOutgoingRingback();

    // 3. Join signaling channel with receiver-ready handshake
    callSignalingService.joinCallChannel(sessionId, {
      onReceiverReady: async ({ calleeId }) => {
        console.info('[Signaling Caller] Receiver is ready in channel. Generating and dispatching SDP offer for:', calleeId);
        const offer = await webRtcService.createOffer();
        if (offer) {
          await callSignalingService.sendOffer(sessionId, offer, callerId);
        }
      },
      onAnswer: async ({ sdp }) => {
        console.info('[Signaling Caller] Received remote SDP answer');
        ringtoneService.stop();
        clearCallTimeout();
        await webRtcService.setRemoteDescription(sdp);
      },
      onIceCandidate: async ({ candidate }) => {
        await webRtcService.addIceCandidate(candidate);
      },
      onRejected: ({ reason }) => {
        ringtoneService.playCallEndTone();
        clearCallTimeout();
        setActiveCallSession((curr) =>
          curr && curr.id === sessionId
            ? { ...curr, status: 'REJECTED', endedAt: new Date().toISOString(), endReason: reason }
            : curr
        );
        setCallConnectionState('closed');
        webRtcService.cleanup();
      },
      onCancelled: ({ reason }) => {
        ringtoneService.playCallEndTone();
        clearCallTimeout();
        setActiveCallSession((curr) =>
          curr && curr.id === sessionId
            ? { ...curr, status: 'ENDED', endedAt: new Date().toISOString(), endReason: reason }
            : curr
        );
        setCallConnectionState('closed');
        webRtcService.cleanup();
      },
      onEnded: ({ reason, durationSeconds }) => {
        ringtoneService.playCallEndTone();
        clearCallTimeout();
        setActiveCallSession((curr) =>
          curr && curr.id === sessionId
            ? { ...curr, status: 'ENDED', endedAt: new Date().toISOString(), durationSeconds: durationSeconds || 0, endReason: reason }
            : curr
        );
        setCallConnectionState('closed');
        webRtcService.cleanup();
      },
    });

    // 4. Initialize peer connection
    webRtcService.initPeerConnection({
      onIceCandidate: (candidate) => {
        callSignalingService.sendIceCandidate(sessionId, candidate, callerId);
      },
      onConnectionStateChange: (state) => {
        console.info(`[Call Caller] WebRTC connection state: ${state}`);
        const mappedState: CallConnectionState = state === 'disconnected' ? 'reconnecting' : state;
        setCallConnectionState(mappedState);
        if (state === 'connected') {
          ringtoneService.stop();
          clearCallTimeout();
          const nowIso = new Date().toISOString();
          setActiveCallSession((curr) =>
            curr && curr.id === sessionId
              ? { ...curr, status: 'CONNECTED', connectedAt: curr.connectedAt || nowIso }
              : curr
          );
          invokeRpcSafe('record_call_connected', { p_call_id: sessionId });
        } else if (state === 'failed') {
          setCallError('WebRTC peer connection failed. Network or firewall restriction encountered.');
        }
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
    });

    // 5. Broadcast incoming call alert to receiver across network & local tabs
    await callSignalingService.sendIncomingCallAlert(receiverId, newSession);

    // 6. Auto-expire if no answer after 35 seconds
    callRingingTimeoutRef.current = setTimeout(() => {
      setActiveCallSession((curr) => {
        if (curr && curr.id === sessionId && (curr.status === 'INITIATING' || curr.status === 'RINGING')) {
          ringtoneService.playCallEndTone();
          webRtcService.cleanup();
          callSignalingService.sendCancelled(sessionId, 'Call timeout / No answer');
          callSignalingService.leaveCallChannel(sessionId);
          invokeRpcSafe('expire_call', { p_call_id: sessionId });
          return {
            ...curr,
            status: 'TIMEOUT',
            endedAt: new Date().toISOString(),
            endReason: 'Call timeout (no answer after 35s)',
          };
        }
        return curr;
      });
    }, 35000);

    return { success: true, session: newSession };
  }, [conversations, currentRole, currentUser, activeCallSession, clearCallTimeout, invokeRpcSafe]);

  const answerCall = useCallback(async (sessionId: string) => {
    ringtoneService.stop();
    clearCallTimeout();
    setIncomingCallSession(null);

    const targetSession = incomingCallSession?.id === sessionId ? incomingCallSession : activeCallSession;
    if (!targetSession) return;

    // 1. Capture microphone on explicit user answer
    const audioRes = await webRtcService.acquireLocalAudio();
    if (!audioRes.success) {
      setCallError(audioRes.error || 'Microphone access denied. Cannot answer voice call.');
      setIsCallModalOpen(true);
      return;
    }

    const calleeId = currentUser?.id || (currentRole === 'donor' ? targetSession.receiverId : targetSession.callerId);

    // Initial answered state: ACCEPTED and connecting (NOT CONNECTED until WebRTC establishes)
    const answeredSession: CallSession = {
      ...targetSession,
      status: 'ACCEPTED',
      answeredAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
    };

    setActiveCallSession(answeredSession);
    setIsCallModalOpen(true);
    setCallConnectionState('connecting');

    // 2. Obtain ICE servers from backend accept_call RPC
    let configuredIceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.rpc('accept_call', { p_call_id: sessionId });
        if (data && data.ice_servers) {
          configuredIceServers = data.ice_servers;
        }
      } catch (e) {
        console.warn('[Call] Exception invoking accept_call RPC:', e);
      }
    }

    webRtcService.setIceServers(configuredIceServers);

    // 3. Initialize peer connection
    webRtcService.initPeerConnection({
      onIceCandidate: (candidate) => {
        callSignalingService.sendIceCandidate(sessionId, candidate, calleeId);
      },
      onConnectionStateChange: (state) => {
        console.info(`[Call Callee] WebRTC connection state: ${state}`);
        const mappedState: CallConnectionState = state === 'disconnected' ? 'reconnecting' : state;
        setCallConnectionState(mappedState);
        if (state === 'connected') {
          const nowIso = new Date().toISOString();
          setActiveCallSession((curr) =>
            curr && curr.id === sessionId
              ? { ...curr, status: 'CONNECTED', connectedAt: curr.connectedAt || nowIso }
              : curr
          );
          invokeRpcSafe('record_call_connected', { p_call_id: sessionId });
        } else if (state === 'failed') {
          setCallError('WebRTC peer connection failed. Network or firewall restriction encountered.');
        }
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
    });

    // 4. Join signaling channel
    callSignalingService.joinCallChannel(sessionId, {
      onOffer: async ({ sdp }) => {
        console.info('[Signaling Callee] Received remote SDP offer. Applying remote description...');
        const applied = await webRtcService.setRemoteDescription(sdp);
        if (applied) {
          const answer = await webRtcService.createAnswer();
          if (answer) {
            console.info('[Signaling Callee] Created SDP answer. Sending to caller...');
            await callSignalingService.sendAnswer(sessionId, answer, calleeId);
          }
        }
      },
      onIceCandidate: async ({ candidate }) => {
        await webRtcService.addIceCandidate(candidate);
      },
      onEnded: ({ reason, durationSeconds }) => {
        ringtoneService.playCallEndTone();
        setActiveCallSession((curr) =>
          curr && curr.id === sessionId
            ? { ...curr, status: 'ENDED', endedAt: new Date().toISOString(), durationSeconds: durationSeconds || 0, endReason: reason }
            : curr
        );
        setCallConnectionState('closed');
        webRtcService.cleanup();
      },
      onCancelled: ({ reason }) => {
        ringtoneService.playCallEndTone();
        setActiveCallSession((curr) =>
          curr && curr.id === sessionId
            ? { ...curr, status: 'ENDED', endedAt: new Date().toISOString(), endReason: reason }
            : curr
        );
        setCallConnectionState('closed');
        webRtcService.cleanup();
      },
    });

    // 5. Send receiver-ready handshake so caller generates and sends the SDP offer
    await callSignalingService.sendReceiverReady(sessionId, calleeId);
  }, [incomingCallSession, activeCallSession, currentRole, currentUser, clearCallTimeout, invokeRpcSafe]);

  const rejectCall = useCallback((sessionId: string, reason: string = 'Declined by recipient') => {
    ringtoneService.stop();
    clearCallTimeout();
    setIncomingCallSession(null);

    callSignalingService.sendRejected(sessionId, reason);
    callSignalingService.leaveCallChannel(sessionId);
    webRtcService.cleanup();

    invokeRpcSafe('reject_call', { p_call_id: sessionId, p_reason: reason });

    setActiveCallSession((curr) =>
      curr && curr.id === sessionId ? { ...curr, status: 'REJECTED', endedAt: new Date().toISOString(), endReason: reason } : curr
    );
    setIsCallModalOpen(false);
  }, [clearCallTimeout, invokeRpcSafe]);

  const cancelCall = useCallback((sessionId: string, reason: string = 'Cancelled by caller') => {
    ringtoneService.stop();
    clearCallTimeout();

    callSignalingService.sendCancelled(sessionId, reason);
    callSignalingService.leaveCallChannel(sessionId);
    webRtcService.cleanup();

    invokeRpcSafe('cancel_call', { p_call_id: sessionId, p_reason: reason });

    setActiveCallSession((curr) =>
      curr && curr.id === sessionId ? { ...curr, status: 'ENDED', endedAt: new Date().toISOString(), endReason: reason } : curr
    );
    setIsCallModalOpen(false);
  }, [clearCallTimeout, invokeRpcSafe]);

  const endCall = useCallback((sessionId: string, reason: string = 'Completed normally') => {
    ringtoneService.playCallEndTone();
    clearCallTimeout();

    const nowIso = new Date().toISOString();
    let durationSec = 0;
    if (activeCallSession?.connectedAt) {
      durationSec = Math.max(1, Math.round((new Date(nowIso).getTime() - new Date(activeCallSession.connectedAt).getTime()) / 1000));
    }

    callSignalingService.sendEnded(sessionId, reason, durationSec);
    callSignalingService.leaveCallChannel(sessionId);
    webRtcService.cleanup();

    invokeRpcSafe('end_call', { p_call_id: sessionId, p_reason: reason });

    setActiveCallSession((curr) =>
      curr && curr.id === sessionId
        ? {
            ...curr,
            status: 'ENDED',
            endedAt: nowIso,
            durationSeconds: durationSec,
            endReason: reason,
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
        content: `Voice call completed (${durationSec > 0 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : 'Missed / No connection'}).`,
        timestamp: nowIso,
        deliveryStatus: 'READ',
      };
      setChatMessages((prev) => ({
        ...prev,
        [convId]: [...(prev[convId] || []), endNotice],
      }));
    }

    setIsCallModalOpen(false);
  }, [activeCallSession, clearCallTimeout, invokeRpcSafe]);

  const closeCallModal = useCallback(() => {
    if (activeCallSession?.status === 'CONNECTED' || activeCallSession?.status === 'RINGING' || activeCallSession?.status === 'INITIATING') {
      endCall(activeCallSession.id, 'User closed modal');
    } else {
      setIsCallModalOpen(false);
    }
  }, [activeCallSession, endCall]);

  const toggleMicrophoneMute = useCallback((): boolean => {
    const muted = webRtcService.toggleMute();
    setIsMicrophoneMuted(muted);
    return muted;
  }, []);

  const setAudioOutputSink = useCallback(async (sinkId: string): Promise<boolean> => {
    return webRtcService.setAudioOutputDevice(sinkId);
  }, []);

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

  const updateInventory = async (
    centreId: string,
    bloodGroup: BloodGroup,
    component: BloodComponent,
    newUnits: number
  ) => {
    const nowIso = new Date().toISOString();
    const prevItem = inventory.find(
      (item) => item.bloodCentreId === centreId && item.bloodGroup === bloodGroup && item.component === component
    );
    const previousUnits = prevItem ? prevItem.units : 0;

    // Optimistic local state update
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

    // Real Supabase persistence
    if (isSupabaseConfigured && currentUser && ['coordinator', 'blood_centre', 'admin'].includes(currentRole)) {
      const res = await inventoryService.setInventoryAtomic({
        centreId,
        bloodGroup,
        component,
        newUnits,
        reason: 'Updated via Blood Centre Management Console',
      });

      if (!res.success) {
        console.error('[Store] Failed to update inventory in DB:', res.error);
        setBackendError(res.error || 'Failed to persist inventory change to database.');

        // Rollback state on database RPC rejection
        setInventory((prev) =>
          prev.map((item) =>
            item.bloodCentreId === centreId && item.bloodGroup === bloodGroup && item.component === component
              ? { ...item, units: previousUnits, updatedAt: prevItem?.updatedAt || nowIso }
              : item
          )
        );

        notificationService.sendInAppNotification({
          title: 'Stock Update Failed',
          content: `Database update failed: ${res.error || 'Could not persist unit change'}. Reverted to ${previousUnits} U.`,
          idempotencyKey: `inv-fail:${centreId}:${bloodGroup}:${component}:${Date.now()}`,
        });
        return;
      }

      notificationService.sendInAppNotification({
        title: 'Blood Stock Persisted',
        content: `Inventory for ${bloodGroup} ${component} confirmed at ${newUnits} unit(s) in database.`,
        idempotencyKey: `inv-update:${centreId}:${bloodGroup}:${component}:${newUnits}`,
      });
    } else {
      // Local evaluation or offline mode: honest uncommitted notification
      notificationService.sendInAppNotification({
        title: 'Local Inventory Adjusted',
        content: `Local reserve for ${bloodGroup} ${component} set to ${newUnits} unit(s) (Uncommitted/Local Preview).`,
        idempotencyKey: `inv-local:${centreId}:${bloodGroup}:${component}:${newUnits}`,
      });
    }
  };

  const verifyAndFulfillRequest = async (requestId: string, centreId: string, unitsVerified: number) => {
    const req = requests.find((r) => r.id === requestId);
    const centre = bloodCentres.find((c) => c.id === centreId);
    if (!req) return;

    const newCoordinated = Math.min(req.unitsRequired, req.unitsCoordinated + unitsVerified);
    const isFulfilled = newCoordinated >= req.unitsRequired;

    // Deduct verified stock atomically from blood centre inventory if configured
    if (isSupabaseConfigured && currentUser && ['coordinator', 'blood_centre', 'admin'].includes(currentRole)) {
      await inventoryService.adjustInventoryAtomic({
        centreId,
        bloodGroup: req.bloodGroup,
        component: req.component,
        deltaUnits: -unitsVerified,
        reason: `Clinical issue for emergency request ${req.referenceCode}`,
      });
    }

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
      idempotencyKey: `verify-fulfill:${requestId}:${unitsVerified}:${isFulfilled}`,
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
        // Backend & Persistence Mode
        dataSource,
        backendError,
        refreshRequests,
        refreshConversations,
        currentUser,
        currentRole,
        demoExperience,
        authenticatedRole,
        isAuthenticated,
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
        onboardAsDonor,
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
        cancelCall,
        endCall,
        closeCallModal,
        audioLevel,
        callConnectionState,
        isMicrophoneMuted,
        toggleMicrophoneMute,
        callError,
        setAudioOutputSink,
        incomingCallSession,
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
