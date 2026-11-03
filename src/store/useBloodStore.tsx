import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  EmergencyRequest,
  EmergencyEvent,
  BloodCentre,
  BloodInventoryItem,
  Donor,
  DonorResponse,
  UserRole,
  DemoExperience,
  BloodGroup,
  BloodComponent,
  UrgencyLevel,
  InventoryFreshness
} from '../types';
import { detectShortage } from '../services/shortageEngine';
import { findPotentialResponders } from '../services/matchingEngine';
import { evaluateEscalationNeed } from '../services/escalationEngine';
import { notificationService } from '../services/notificationService';

// Seed Initial Data (Clearly marked as Demo Environment / Simulated Data)
const INITIAL_BLOOD_CENTRES: BloodCentre[] = [
  {
    id: 'bc-1',
    name: 'Metro City Blood Centre (Verified)',
    address: '45 Health Avenue, Sector 4',
    city: 'Metro City',
    phone: '+1 (555) 019-2831',
    verified: true,
    inventoryUpdatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(), // 9 mins ago
  },
  {
    id: 'bc-2',
    name: 'Red Cross Regional Blood Bank',
    address: '102 Life Line Road',
    city: 'Metro City',
    phone: '+1 (555) 014-9920',
    verified: true,
    inventoryUpdatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 mins ago
  },
  {
    id: 'bc-3',
    name: 'St. Jude Emergency Depot',
    address: '88 Mercy Boulevard',
    city: 'Metro City',
    phone: '+1 (555) 018-3311',
    verified: true,
    inventoryUpdatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3 hours ago (Stale)
  }
];

const INITIAL_INVENTORY: BloodInventoryItem[] = [
  { id: 'inv-1', bloodCentreId: 'bc-1', bloodGroup: 'A+', component: 'Packed RBC', units: 12, updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() },
  { id: 'inv-2', bloodCentreId: 'bc-1', bloodGroup: 'B+', component: 'Packed RBC', units: 8, updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() },
  { id: 'inv-3', bloodCentreId: 'bc-1', bloodGroup: 'O+', component: 'Packed RBC', units: 1, updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() },
  { id: 'inv-4', bloodCentreId: 'bc-1', bloodGroup: 'O-', component: 'Packed RBC', units: 0, updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() },
  
  { id: 'inv-5', bloodCentreId: 'bc-2', bloodGroup: 'O+', component: 'Packed RBC', units: 0, updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  { id: 'inv-6', bloodCentreId: 'bc-2', bloodGroup: 'A+', component: 'Platelets', units: 4, updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  
  { id: 'inv-7', bloodCentreId: 'bc-3', bloodGroup: 'AB+', component: 'Plasma', units: 6, updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
  { id: 'inv-8', bloodCentreId: 'bc-3', bloodGroup: 'O+', component: 'Packed RBC', units: 2, updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
];

const INITIAL_DONORS: Donor[] = [
  { id: 'donor-1', fullName: 'Sarah Jenkins', phone: '+15550101', bloodGroup: 'O+', city: 'Metro City', approxDistanceKm: 2.4, isAvailable: true, totalDonations: 4 },
  { id: 'donor-2', fullName: 'Michael Chen', phone: '+15550102', bloodGroup: 'O+', city: 'Metro City', approxDistanceKm: 4.1, isAvailable: true, totalDonations: 2 },
  { id: 'donor-3', fullName: 'Priya Sharma', phone: '+15550103', bloodGroup: 'O-', city: 'Metro City', approxDistanceKm: 6.8, isAvailable: true, totalDonations: 7 },
  { id: 'donor-4', fullName: 'David Ross', phone: '+15550104', bloodGroup: 'A+', city: 'Metro City', approxDistanceKm: 1.2, isAvailable: true, totalDonations: 1 },
];

const INITIAL_REQUEST: EmergencyRequest = {
  id: 'req-8f42',
  referenceCode: 'BR-8F42',
  bloodGroup: 'O+',
  component: 'Packed RBC',
  unitsRequired: 2,
  unitsCoordinated: 1,
  urgency: 'Critical',
  hospitalName: 'City General Hospital',
  hospitalAddress: '700 Main Street, Emergency Ward 3B',
  city: 'Metro City',
  contactName: 'Robert Taylor',
  contactPhone: '+1 (555) 012-3456',
  preferredContact: 'Phone',
  status: 'AWAITING_RESPONSE',
  escalationLevel: 1,
  createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
};

const INITIAL_EVENTS: EmergencyEvent[] = [
  {
    id: 'evt-1',
    requestId: 'req-8f42',
    eventType: 'REQUEST_CREATED',
    description: 'Emergency request BR-8F42 created for 2 units of O+ Packed RBC at City General Hospital.',
    actorRole: 'Patient Attendant',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-2',
    requestId: 'req-8f42',
    eventType: 'RESOURCE_CHECKED',
    description: 'Resource discovery: 1 unit located at Metro City Blood Centre.',
    actorRole: 'System Engine',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-3',
    requestId: 'req-8f42',
    eventType: 'SHORTAGE_IDENTIFIED',
    description: 'Shortage engine identified 1 remaining unit required.',
    actorRole: 'Shortage Engine',
    timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-4',
    requestId: 'req-8f42',
    eventType: 'RESPONDERS_NOTIFIED',
    description: 'Level 1 escalation: SMS & Web alerts dispatched to 2 nearby O+ responders within 5km radius.',
    actorRole: 'Matching Engine',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  }
];

export function getFreshnessStatus(updatedAtIso: string): InventoryFreshness {
  const diffMinutes = Math.floor((Date.now() - new Date(updatedAtIso).getTime()) / (1000 * 60));
  if (diffMinutes < 30) return 'Fresh';
  if (diffMinutes < 120) return 'Aging';
  if (diffMinutes < 1440) return 'Stale';
  return 'Unknown';
}

interface BloodStoreContextType {
  requests: EmergencyRequest[];
  events: EmergencyEvent[];
  bloodCentres: BloodCentre[];
  inventory: BloodInventoryItem[];
  donors: Donor[];
  donorResponses: DonorResponse[];
  currentRole: UserRole;
  demoExperience: DemoExperience;
  authenticatedRole: UserRole | null;
  isAuthLoading: boolean;
  authError: string | null;
  isOffline: boolean;
  switchRole: (role: UserRole) => void;
  selectDemoExperience: (role: UserRole) => void;
  exitDemoMode: () => void;
  signInAsRole: (role: UserRole) => void;
  signOut: () => Promise<void>;
  createEmergencyRequest: (data: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    city: string;
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  }) => EmergencyRequest;
  updateRequestStatus: (requestId: string, status: EmergencyRequest['status'], description: string, actorRole?: string) => void;
  respondToEmergency: (requestId: string, donorId: string, responseStatus: 'ACCEPTED' | 'DECLINED', channel?: 'WEB' | 'SMS') => void;
  processSmsReply: (donorPhone: string, referenceCode: string, replyText: string) => { success: boolean; isDuplicate: boolean; message: string };
  updateInventory: (centreId: string, bloodGroup: BloodGroup, component: BloodComponent, newUnits: number) => void;
  escalateRequest: (requestId: string, manualLevel?: number) => void;
  verifyAndFulfillRequest: (requestId: string, centreId: string, unitsVerified: number) => void;
  toggleDonorAvailability: (donorId: string) => void;
  resetDemoData: () => void;
}

const BloodStoreContext = createContext<BloodStoreContextType | null>(null);

export const BloodStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [requests, setRequests] = useState<EmergencyRequest[]>([INITIAL_REQUEST]);
  const [events, setEvents] = useState<EmergencyEvent[]>(INITIAL_EVENTS);
  const [bloodCentres, setBloodCentres] = useState<BloodCentre[]>(INITIAL_BLOOD_CENTRES);
  const [inventory, setInventory] = useState<BloodInventoryItem[]>(INITIAL_INVENTORY);
  const [donors, setDonors] = useState<Donor[]>(INITIAL_DONORS);
  const [donorResponses, setDonorResponses] = useState<DonorResponse[]>([]);
  
  // Real authenticated role from backend (null when unauthenticated)
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('bloodreach_auth_role');
    if (saved && ['patient', 'donor', 'blood_centre', 'coordinator', 'admin'].includes(saved)) {
      return saved as UserRole;
    }
    return null;
  });

  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Demo Experience selector state (persisted in sessionStorage)
  const [demoExperience, setDemoExperience] = useState<DemoExperience>(() => {
    const saved = sessionStorage.getItem('bloodreach_demo_experience');
    if (saved && ['patient', 'donor', 'blood_centre', 'coordinator'].includes(saved)) {
      return saved as DemoExperience;
    }
    return null;
  });

  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Effective Active Role
  // 1. If user is authenticated, currentRole is authenticatedRole.
  // 2. Otherwise, if user selected demoExperience, currentRole is demoExperience.
  // 3. Otherwise default to 'patient'.
  const currentRole: UserRole = authenticatedRole || demoExperience || 'patient';

  const selectDemoExperience = (role: UserRole) => {
    if (role === 'admin') return; // Admin is never a public demo experience
    setDemoExperience(role as DemoExperience);
    sessionStorage.setItem('bloodreach_demo_experience', role);
  };

  const exitDemoMode = () => {
    setDemoExperience(null);
    sessionStorage.removeItem('bloodreach_demo_experience');
  };

  const signInAsRole = (role: UserRole) => {
    setAuthenticatedRole(role);
    setDemoExperience(null);
    sessionStorage.removeItem('bloodreach_demo_experience');
    localStorage.setItem('bloodreach_auth_role', role);
  };

  const signOut = async () => {
    setAuthenticatedRole(null);
    setDemoExperience(null);
    localStorage.removeItem('bloodreach_auth_role');
    sessionStorage.removeItem('bloodreach_demo_experience');
  };

  const switchRole = (role: UserRole) => {
    if (role === 'admin') {
      signInAsRole('admin');
      return;
    }
    setAuthenticatedRole(null);
    localStorage.removeItem('bloodreach_auth_role');
    selectDemoExperience(role);
  };

  const addEvent = (requestId: string, eventType: string, description: string, actorRole: string = 'System') => {
    const newEvent: EmergencyEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId,
      eventType,
      description,
      actorRole,
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [...prev, newEvent]);
  };

  const createEmergencyRequest = (data: {
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    hospitalAddress: string;
    city: string;
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  }): EmergencyRequest => {
    const refCode = `BR-${Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase()}`;
    const newReq: EmergencyRequest = {
      id: `req-${Date.now()}`,
      referenceCode: refCode,
      ...data,
      unitsCoordinated: 0,
      status: 'CREATED',
      escalationLevel: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Save Request
    setRequests((prev) => [newReq, ...prev]);

    // 2. Add CREATED Event
    const createEvt: EmergencyEvent = {
      id: `evt-${Date.now()}-1`,
      requestId: newReq.id,
      eventType: 'REQUEST_CREATED',
      description: `Emergency request ${refCode} created for ${data.unitsRequired} unit(s) of ${data.bloodGroup} ${data.component} at ${data.hospitalName}.`,
      actorRole: 'Patient Attendant',
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [...prev, createEvt]);

    // 3. Automated Shortage & Matching Sequence
    setTimeout(() => {
      const shortageResult = detectShortage(newReq, inventory);
      let unitsCoordinatedFromCentres = 0;

      if (shortageResult.matchingInventoryItems.length > 0) {
        unitsCoordinatedFromCentres = shortageResult.unitsInStock >= newReq.unitsRequired
          ? newReq.unitsRequired
          : shortageResult.unitsInStock;
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === newReq.id
            ? {
                ...r,
                unitsCoordinated: unitsCoordinatedFromCentres,
                status: shortageResult.hasShortage ? 'SHORTAGE_IDENTIFIED' : 'CHECKING_RESOURCES',
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      addEvent(
        newReq.id,
        'CHECKING_RESOURCES',
        `Resource check: ${unitsCoordinatedFromCentres} unit(s) located in verified blood centre inventory.`,
        'Shortage Engine'
      );

      if (shortageResult.hasShortage) {
        const unitsShort = newReq.unitsRequired - unitsCoordinatedFromCentres;
        addEvent(
          newReq.id,
          'SHORTAGE_IDENTIFIED',
          `Shortage of ${unitsShort} unit(s) detected. Triggering Potential Responder Matching Engine.`,
          'Shortage Engine'
        );

        // Find matches
        const matches = findPotentialResponders(newReq, donors, 15);
        if (matches.length > 0) {
          matches.forEach((m) => {
            notificationService.sendSms(
              m.donor.phone,
              notificationService.formatEmergencySms(newReq, unitsShort)
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
            `Level 1 escalation: Dispatched emergency alerts to ${matches.length} potential responder(s).`,
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
          'Required units located in blood bank. Awaiting blood centre verification & issue.',
          'Coordinator Control'
        );
      }
    }, 500);

    return newReq;
  };

  const updateRequestStatus = (requestId: string, status: EmergencyRequest['status'], description: string, actorRole: string = 'Coordinator') => {
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status, updatedAt: new Date().toISOString() } : r))
    );
    addEvent(requestId, 'STATUS_UPDATED', description, actorRole);
  };

  const respondToEmergency = (
    requestId: string,
    donorId: string,
    responseStatus: 'ACCEPTED' | 'DECLINED',
    channel: 'WEB' | 'SMS' = 'WEB'
  ) => {
    const donor = donors.find((d) => d.id === donorId);
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    const newResponse: DonorResponse = {
      id: `resp-${Date.now()}`,
      requestId,
      donorId,
      donorName: donor?.fullName || 'Volunteer Donor',
      donorPhone: donor?.phone || '',
      responseStatus,
      responseChannel: channel,
      timestamp: new Date().toISOString(),
    };

    setDonorResponses((prev) => [...prev, newResponse]);

    if (responseStatus === 'ACCEPTED') {
      const newCoordinated = Math.min(req.unitsRequired, req.unitsCoordinated + 1);
      const isFullyCoordinated = newCoordinated >= req.unitsRequired;

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                unitsCoordinated: newCoordinated,
                status: isFullyCoordinated ? 'AWAITING_CENTRE_VERIFICATION' : 'RESPONDER_FOUND',
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      addEvent(
        requestId,
        'RESPONDER_ACCEPTED',
        `Potential responder ${donor?.fullName || 'Donor'} accepted emergency call via ${channel}. (${newCoordinated}/${req.unitsRequired} units coordinated).`,
        'Donor Response'
      );
    } else {
      addEvent(
        requestId,
        'RESPONDER_DECLINED',
        `Potential responder indicated unavailable via ${channel}.`,
        'Donor Response'
      );
    }
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
      if (!donor) {
        donor = donors[0];
      }

      respondToEmergency(req.id, donor.id, 'ACCEPTED', 'SMS');
    } else if (webhookResult.action === 'DECLINED') {
      let donor = donors.find((d) => d.phone.includes(donorPhone) || donorPhone.includes(d.phone));
      if (donor) respondToEmergency(req.id, donor.id, 'DECLINED', 'SMS');
    }

    return webhookResult;
  };

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
              status: 'ESCALATED' as any,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    addEvent(
      requestId,
      'LEVEL_ESCALATED',
      `Progressive Escalation triggered to Level ${targetLevel}. ${evalResult.reason}`,
      'Escalation Engine'
    );
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
      `Blood centre (${centre?.name || 'Verified Staff'}) verified ${unitsVerified} unit(s). ${
        isFulfilled ? 'Emergency request fully satisfied and resolved.' : 'Awaiting additional units.'
      }`,
      'Blood Centre Staff'
    );
  };

  const toggleDonorAvailability = (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => (d.id === donorId ? { ...d, isAvailable: !d.isAvailable } : d))
    );
  };

  const resetDemoData = () => {
    setRequests([INITIAL_REQUEST]);
    setEvents(INITIAL_EVENTS);
    setBloodCentres(INITIAL_BLOOD_CENTRES);
    setInventory(INITIAL_INVENTORY);
    setDonors(INITIAL_DONORS);
    setDonorResponses([]);
    setDemoExperience(null);
    setAuthenticatedRole(null);
    sessionStorage.removeItem('bloodreach_demo_experience');
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
        currentRole,
        demoExperience,
        authenticatedRole,
        isAuthLoading,
        authError,
        isOffline,
        switchRole,
        selectDemoExperience,
        exitDemoMode,
        signInAsRole,
        signOut,
        createEmergencyRequest,
        updateRequestStatus,
        respondToEmergency,
        processSmsReply,
        updateInventory,
        escalateRequest,
        verifyAndFulfillRequest,
        toggleDonorAvailability,
        resetDemoData,
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
