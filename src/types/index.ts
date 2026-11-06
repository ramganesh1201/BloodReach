export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type BloodComponent = 'Packed RBC' | 'Whole Blood' | 'Platelets' | 'Plasma';

export type UrgencyLevel = 'Today' | 'Urgent' | 'Critical';

export type EmergencyStatus = 
  | 'CREATED'
  | 'VERIFYING'
  | 'CHECKING_RESOURCES'
  | 'SHORTAGE_IDENTIFIED'
  | 'MATCHING_RESPONDERS'
  | 'AWAITING_RESPONSE'
  | 'RESPONDER_FOUND'
  | 'COORDINATION_IN_PROGRESS'
  | 'DONOR_ASSIGNED'
  | 'AWAITING_CENTRE_VERIFICATION'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'EXPIRED';

export type UserRole = 'patient' | 'donor' | 'blood_centre' | 'coordinator' | 'admin';

export type DemoExperience = 'patient' | 'donor' | 'blood_centre' | 'coordinator' | null;

export interface EmergencyRequest {
  id: string;
  referenceCode: string; // e.g. CL-8F42
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsCoordinated: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  landmark?: string;
  hospitalContactPerson?: string;
  city: string;
  district?: string;
  state?: string;
  postalCode?: string;
  facilityId?: string;
  locationSource?: string;
  locationVerificationStatus?: 'source_listed' | 'unverified' | 'pending' | 'verified';
  lat?: number;
  lng?: number;
  contactName: string;
  contactPhone: string;
  preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  requiredDateTime?: string;
  additionalInstructions?: string;
  status: EmergencyStatus;
  escalationLevel: number; // 1 to 4
  createdBy?: string;
  assignedDonors?: DonorAssignment[];
  notes?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyEvent {
  id: string;
  requestId: string;
  eventType: string;
  description: string;
  actorRole: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type InventoryFreshness = 'Fresh' | 'Aging' | 'Stale' | 'Unknown';

export interface BloodCentre {
  id: string;
  name: string;
  licenseNumber?: string;
  address: string;
  city: string;
  district?: string;
  state?: string;
  phone: string;
  email?: string;
  verified: boolean;
  inventoryUpdatedAt: string;
  operatingHours?: string;
  lat?: number;
  lng?: number;
}

export type InventoryStockStatus = 'AVAILABLE' | 'RESERVED' | 'UNAVAILABLE';

export interface BloodInventoryItem {
  id: string;
  bloodCentreId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  status?: InventoryStockStatus;
  updatedAt: string;
}

export type DonorAvailabilityState = 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'NOT_ACCEPTING';

export interface Donor {
  id: string;
  profileId?: string;
  fullName: string;
  phone: string;
  email?: string;
  bloodGroup: BloodGroup;
  city: string;
  district?: string;
  approxDistanceKm?: number;
  isAvailable: boolean;
  availabilityState?: DonorAvailabilityState;
  availabilityUpdatedAt?: string;
  lastDonatedAt?: string;
  lastDonatedComponent?: BloodComponent;
  isMedicallyCleared?: boolean;
  deferralUntil?: string;
  weightKg?: number;
  age?: number;
  totalDonations: number;
  responseHistoryCount?: number;
  registeredAt?: string;
}

export interface DonorResponse {
  id: string;
  requestId: string;
  donorId: string;
  donorName?: string;
  donorPhone?: string;
  responseStatus: 'NOTIFIED' | 'ACCEPTED' | 'DECLINED';
  responseChannel: 'WEB' | 'SMS';
  timestamp: string;
}

export interface DonorAssignment {
  id: string;
  requestId: string;
  donorId: string;
  donorName: string;
  donorPhone: string;
  donorBloodGroup: BloodGroup;
  unitsAssigned: number;
  status: 'ASSIGNED' | 'CONFIRMED' | 'DONATED' | 'CANCELLED';
  assignedAt: string;
  coordinatorId?: string;
  notes?: string;
}

export interface EscalationConfig {
  level: number;
  name: string;
  description: string;
  radiusKm: number;
  autoEscalateMinutes: number;
}

export type NotificationChannel = 'IN_APP' | 'SMS' | 'PUSH' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'QUEUED' | 'ATTEMPTED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';

export interface NotificationPayload {
  id: string;
  userId?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  channel: NotificationChannel;
  title?: string;
  content: string;
  status: NotificationStatus;
  timestamp: string;
  acknowledgedAt?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export type MessageDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface RequestMessage {
  id: string;
  requestId: string;
  referenceCode?: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole | 'system';
  recipientRole?: UserRole | 'all';
  content: string;
  timestamp: string;
  channel: 'IN_APP' | 'SMS';
  deliveryStatus: MessageDeliveryStatus;
}

// ============================================================================
// COMPLETE COMMUNICATION SYSTEM DATA MODELS
// ============================================================================

export type ConversationStatus = 'PENDING_ACCEPTANCE' | 'ACTIVE' | 'RESTRICTED' | 'CLOSED';

export interface Conversation {
  id: string;
  requestId: string;
  donorId: string;
  requesterId: string;
  status: ConversationStatus;
  donorName: string;
  donorPhone?: string;
  donorBloodGroup: BloodGroup;
  donorCity?: string;
  requesterName: string;
  requesterPhone?: string;
  referenceCode: string;
  hospitalName: string;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
  lastMessage?: string;
  lastMessageTimestamp?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closureReason?: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  participantRole: 'requester' | 'donor' | 'coordinator';
  isActive: boolean;
  joinedAt: string;
  lastReadAt: string;
}

export type ChatMessageDeliveryStatus = MessageDeliveryStatus | 'SENDING' | 'PENDING_SYNC' | 'FAILED';

export interface MessageAttachment {
  id: string;
  messageId?: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole | 'system';
  messageType: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'COORDINATION_EVENT' | 'SYSTEM';
  content: string;
  clientMessageId?: string;
  replyToMessageId?: string;
  timestamp: string;
  deliveryStatus: ChatMessageDeliveryStatus;
  attachment?: MessageAttachment;
  metadata?: Record<string, any>;
  isEdited?: boolean;
}

export type CoordinationEventType =
  | 'CONFIRMED_AVAILABILITY'
  | 'ON_THE_WAY'
  | 'REACHED_HOSPITAL'
  | 'UNABLE_TO_PROCEED'
  | 'WITHDRAWN'
  | 'SHARED_HOSPITAL_DETAILS'
  | 'REQUESTED_UPDATE'
  | 'CONFIRMED_ARRIVAL'
  | 'COORDINATION_OUTCOME';

export interface CoordinationEvent {
  id: string;
  requestId: string;
  conversationId?: string;
  actorId: string;
  actorRole: string;
  actorName?: string;
  eventType: CoordinationEventType;
  eventData?: Record<string, any>;
  timestamp: string;
}

export type CallStatus = 'INITIATING' | 'RINGING' | 'ACCEPTED' | 'CONNECTED' | 'ENDED' | 'REJECTED' | 'TIMEOUT' | 'FAILED';

export type CallConnectionState = 'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export interface CallSession {
  id: string;
  conversationId: string;
  requestId?: string;
  callerId: string;
  callerName: string;
  callerRole: UserRole;
  receiverId: string;
  receiverName: string;
  receiverRole?: UserRole;
  callType: 'VOICE' | 'DIALER_FALLBACK';
  status: CallStatus;
  startedAt: string;
  ringingAt?: string;
  acceptedAt?: string;
  answeredAt?: string;
  connectedAt?: string;
  endedAt?: string;
  durationSeconds: number;
  endReason?: string;
  metadata?: Record<string, any>;
}

export type CallEventType =
  | 'INITIATED'
  | 'RINGING'
  | 'ACCEPTED'
  | 'CONNECTED'
  | 'MUTED'
  | 'UNMUTED'
  | 'RECONNECTED'
  | 'ENDED'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'FAILED';

export interface CallEvent {
  id: string;
  callId: string;
  eventType: CallEventType;
  actorId?: string;
  eventData?: Record<string, any>;
  createdAt: string;
}

export type DonorTrackingCardStatus =
  | 'NOTIFICATION_PENDING'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_DELIVERED'
  | 'AWAITING_RESPONSE'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'NOTIFICATION_FAILED'
  | 'RESPONSE_EXPIRED';

export interface DonorTrackingItem {
  donorId: string;
  donorName: string;
  donorBloodGroup: BloodGroup;
  approxDistanceKm: number;
  status: DonorTrackingCardStatus;
  notifiedAt?: string;
  respondedAt?: string;
  hasAccepted: boolean;
  conversationId?: string;
  donor?: Donor;
}

export type OfflineSyncState = 
  | 'SAVED_LOCALLY'
  | 'WAITING_FOR_CONNECTION'
  | 'SUBMISSION_PENDING'
  | 'CONFIRMED_BY_SERVER'
  | 'FAILED';

export interface OfflineQueueItem {
  id: string;
  action: 'CREATE_REQUEST' | 'RESPOND_REQUEST' | 'UPDATE_INVENTORY' | 'ASSIGN_DONOR' | 'SEND_MESSAGE';
  payload: any;
  status: OfflineSyncState;
  createdAt: string;
  lastAttemptAt?: string;
  error?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  bloodGroup?: BloodGroup;
  city?: string;
  district?: string;
  isAvailable?: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}
