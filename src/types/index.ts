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
  | 'AWAITING_CENTRE_VERIFICATION'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'EXPIRED';

export type UserRole = 'patient' | 'donor' | 'blood_centre' | 'coordinator' | 'admin';

export type DemoExperience = 'patient' | 'donor' | 'blood_centre' | 'coordinator' | null;

export interface EmergencyRequest {
  id: string;
  referenceCode: string; // e.g. BR-8F42
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsCoordinated: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
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
  status: EmergencyStatus;
  escalationLevel: number; // 1 to 4
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
  address: string;
  city: string;
  phone: string;
  verified: boolean;
  inventoryUpdatedAt: string;
  lat?: number;
  lng?: number;
}

export interface BloodInventoryItem {
  id: string;
  bloodCentreId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  updatedAt: string;
}

export interface Donor {
  id: string;
  fullName: string;
  phone: string;
  bloodGroup: BloodGroup;
  city: string;
  approxDistanceKm?: number;
  isAvailable: boolean;
  lastDonatedAt?: string;
  totalDonations: number;
  responseHistoryCount?: number;
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

export interface EscalationConfig {
  level: number;
  name: string;
  description: string;
  radiusKm: number;
  autoEscalateMinutes: number;
}

export interface NotificationPayload {
  id: string;
  recipientPhone: string;
  channel: 'WEB' | 'SMS';
  content: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  timestamp: string;
}
