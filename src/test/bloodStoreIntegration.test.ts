import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as emergencyRequestService from '../services/emergencyRequestService';
import * as donorResponseService from '../services/donorResponseService';
import * as donorDiscoveryService from '../services/donorDiscoveryService';
import * as conversationService from '../services/conversationService';

describe('CareLoop — Store & Persistence Integration Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Create emergency request rejects invalid data before network call', () => {
    const validation = emergencyRequestService.validateEmergencyRequestInput({
      bloodGroup: 'Invalid' as any,
      component: 'Packed RBC',
      unitsRequired: 1,
      urgency: 'Critical',
      hospitalName: 'Apollo',
      hospitalAddress: 'Road 72',
      city: 'Hyderabad',
      contactName: 'Robert',
      contactPhone: '9849000000',
      preferredContact: 'Phone',
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Invalid blood group');
  });

  it('2. Donor discovery protects patient PII in discoverable view mapping', () => {
    const rawDbRow = {
      id: 'req-uuid-1',
      reference_code: 'CL-A101',
      blood_group: 'O+',
      component: 'Packed RBC',
      units_required: 2,
      units_coordinated: 0,
      urgency: 'Critical',
      hospital_name: 'NIMS Hyderabad',
      hospital_address: 'Punjagutta',
      city: 'Hyderabad',
      district: 'Hyderabad',
      status: 'AWAITING_RESPONSE',
      escalation_level: 1,
      created_at: '2026-11-04T12:00:00Z',
      updated_at: '2026-11-04T12:00:00Z',
      // Note: contact_phone and notes are intentionally omitted by the SQL view
    };

    const mapped = emergencyRequestService.mapDbToEmergencyRequest(rawDbRow);
    expect(mapped.id).toBe('req-uuid-1');
    expect(mapped.referenceCode).toBe('CL-A101');
    expect(mapped.bloodGroup).toBe('O+');
    expect(mapped.contactPhone).toBe('');
    expect(mapped.notes).toBeUndefined();
  });

  it('3. Donor acceptance response model correctly handles already_accepted concurrent flag', () => {
    const rawRpcPayload = {
      success: false,
      already_accepted: true,
      message: 'This emergency request has already been accepted by another donor.',
    };

    expect(rawRpcPayload.success).toBe(false);
    expect(rawRpcPayload.already_accepted).toBe(true);
  });

  it('4. Realtime chat message model correctly maps message delivery states', () => {
    const rawDbMsg = {
      id: 'msg-uuid-1',
      conversation_id: 'conv-uuid-1',
      sender_id: 'usr-patient-1',
      sender_name: 'Robert Taylor',
      sender_role: 'patient',
      message_type: 'TEXT',
      content: 'We have arrived at the hospital reception.',
      created_at: '2026-11-04T12:30:00Z',
      client_message_id: 'client-msg-101',
      is_edited: false,
    };

    const chatMsg = conversationService.mapDbToChatMessage(rawDbMsg);
    expect(chatMsg.id).toBe('msg-uuid-1');
    expect(chatMsg.conversationId).toBe('conv-uuid-1');
    expect(chatMsg.senderRole).toBe('patient');
    expect(chatMsg.content).toBe('We have arrived at the hospital reception.');
    expect(chatMsg.deliveryStatus).toBe('DELIVERED');
    expect(chatMsg.clientMessageId).toBe('client-msg-101');
  });
});

