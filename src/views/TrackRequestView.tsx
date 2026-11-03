import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { EventTimeline } from '../components/emergency/EventTimeline';
import { getEscalationConfig } from '../services/escalationEngine';
import { EmergencyStatus } from '../types';
import {
  Building,
  Phone,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Share2,
  Clock,
  UserCheck,
  CheckCircle2,
  MapPin,
  ArrowLeft,
  MessageSquare,
  ChevronRight,
  Radio,
  Users
} from 'lucide-react';

const LIFECYCLE_STEPS: { id: number; key: string; label: string; statusMatch: EmergencyStatus[] }[] = [
  { id: 1, key: 'submitted', label: 'Request Submitted', statusMatch: ['CREATED', 'VERIFYING', 'CHECKING_RESOURCES', 'SHORTAGE_IDENTIFIED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 2, key: 'validated', label: 'Request Validated', statusMatch: ['CHECKING_RESOURCES', 'SHORTAGE_IDENTIFIED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 3, key: 'searching', label: 'Searching Eligible Donors', statusMatch: ['SHORTAGE_IDENTIFIED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 4, key: 'notified', label: 'Donors Notified', statusMatch: ['MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 5, key: 'responses', label: 'Donor Responses Received', statusMatch: ['RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 6, key: 'accepted', label: 'Donor Accepted', statusMatch: ['RESPONDER_FOUND', 'COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 7, key: 'assigned', label: 'Donor Confirmed / Assigned', statusMatch: ['DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 8, key: 'contacted', label: 'Coordination Active', statusMatch: ['COORDINATION_IN_PROGRESS', 'DONOR_ASSIGNED', 'AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 9, key: 'clearance', label: 'Centre Verification', statusMatch: ['AWAITING_CENTRE_VERIFICATION', 'FULFILLED'] },
  { id: 10, key: 'fulfilled', label: 'Request Completed', statusMatch: ['FULFILLED'] },
];

export const TrackRequestView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { requests, events, escalateRequest, isOffline } = useBloodStore();

  const req = requests.find((r) => r.id === id || r.referenceCode.toUpperCase() === id?.toUpperCase()) || requests[0];
  const reqEvents = events.filter((e) => e.requestId === req?.id);

  if (!req) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-warning mx-auto" />
        <h2 className="text-xl font-bold text-app-text">Emergency Request Not Found</h2>
        <p className="text-xs text-app-text-secondary">The requested blood coordination code does not exist or has expired.</p>
        <Link to="/" className="inline-block bg-brand text-white font-bold text-xs px-5 py-2.5 rounded-lg">
          Return to CareLoop Home
        </Link>
      </div>
    );
  }

  const escalationInfo = getEscalationConfig(req.escalationLevel);
  const unitsShort = Math.max(0, req.unitsRequired - req.unitsCoordinated);
  const percentCoordinated = Math.min(100, Math.round((req.unitsCoordinated / req.unitsRequired) * 100));

  // Determine current lifecycle stage index (1 to 10)
  let activeStepNumber = 1;
  for (let i = LIFECYCLE_STEPS.length - 1; i >= 0; i--) {
    if (LIFECYCLE_STEPS[i].statusMatch.includes(req.status)) {
      activeStepNumber = LIFECYCLE_STEPS[i].id;
      break;
    }
  }

  const getStageExplanation = () => {
    switch (req.status) {
      case 'CREATED':
      case 'VERIFYING':
        return {
          explanation: 'Emergency request has been securely recorded and is undergoing automated clinical validation.',
          nextAction: 'Cross-referencing partner blood centre inventories for available units.',
        };
      case 'CHECKING_RESOURCES':
        return {
          explanation: 'Checking verified regional blood bank reserves to satisfy requirements from available inventory.',
          nextAction: 'Confirming unit compatibility and preparing reserve issue clearances.',
        };
      case 'SHORTAGE_IDENTIFIED':
        return {
          explanation: `Inventory deficit detected for ${unitsShort} unit(s). The matching engine is preparing multi-channel priority alerts.`,
          nextAction: `Dispatching SMS and in-app emergency calls to registered ${req.bloodGroup} donors within ${escalationInfo.radiusKm} km.`,
        };
      case 'AWAITING_RESPONSE':
      case 'MATCHING_RESPONDERS':
        return {
          explanation: `Priority alerts dispatched to compatible donors in your area. Awaiting response confirmations.`,
          nextAction: 'Active coordinator monitoring donor replies. Search radius escalates automatically if unanswered.',
        };
      case 'RESPONDER_FOUND':
        return {
          explanation: 'A volunteer donor has received the call and responded available. Assignment is awaiting clinical confirmation.',
          nextAction: 'Clinical coordinator is confirming the arrival window and assigning the donor.',
        };
      case 'DONOR_ASSIGNED':
      case 'COORDINATION_IN_PROGRESS':
        return {
          explanation: 'Donor assigned and arriving at hospital blood transfusion desk with reference authorization.',
          nextAction: 'Pathological cross-match compatibility test to be completed upon physical sample verification.',
        };
      case 'AWAITING_CENTRE_VERIFICATION':
        return {
          explanation: 'Required units located and confirmed. Awaiting physical clearance and issue from the hospital transfusion center.',
          nextAction: 'Attendant to present Reference Code to blood bank counter for unit handover.',
        };
      case 'FULFILLED':
        return {
          explanation: 'Emergency blood coordination successfully completed. Units clinically verified and issued for transfusion.',
          nextAction: 'Emergency request closed and recorded in permanent medical audit trail.',
        };
      case 'CANCELLED':
        return {
          explanation: `This emergency coordination request was formally cancelled: ${req.cancellationReason || 'Requirement resolved'}.`,
          nextAction: 'No further donor alerts active.',
        };
      default:
        return {
          explanation: 'Active coordination under way.',
          nextAction: 'Check communication hub for live updates.',
        };
    }
  };

  const stageData = getStageExplanation();

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      <Link
        to="/patient"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-app-text-secondary hover:text-app-text transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Patient Workspace</span>
      </Link>

      {/* Top Request Summary Card */}
      <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight font-mono">
                Emergency Call {req.referenceCode}
              </h1>
              <span className="text-xs font-bold bg-app-text text-white px-2.5 py-0.5 rounded-md">
                Level {req.escalationLevel} Radius ({escalationInfo.radiusKm} km)
              </span>
            </div>
            <p className="text-xs text-app-text-secondary mt-1">
              Initiated {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Attendant: {req.contactName} ({req.contactPhone})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={req.status} size="lg" />
            <button
              type="button"
              onClick={() => navigate('/communication')}
              className="bg-brand-light text-brand hover:bg-brand/20 border border-brand/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open Chat</span>
            </button>
          </div>
        </div>

        {/* 10-Step Lifecycle Visual Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-app-text">
              Coordination Stage {activeStepNumber} of 10: <span className="text-brand">{LIFECYCLE_STEPS[activeStepNumber - 1]?.label}</span>
            </span>
            <span className="text-app-text-secondary font-mono">{percentCoordinated}% Coordinated</span>
          </div>

          <div className="grid grid-cols-10 gap-1">
            {LIFECYCLE_STEPS.map((step) => {
              const isPast = step.id < activeStepNumber;
              const isCurrent = step.id === activeStepNumber;

              return (
                <div key={step.id} className="space-y-1">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isPast
                        ? 'bg-success'
                        : isCurrent
                        ? 'bg-brand'
                        : 'bg-app-muted'
                    }`}
                    title={`Stage ${step.id}: ${step.label}`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 Core Clinical Status Details */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-app-muted/40 p-4 rounded-xl border border-app-border text-xs">
          <div>
            <span className="text-app-text-secondary block text-[10px] font-bold uppercase tracking-wider">
              1. What is Needed
            </span>
            <strong className="text-brand font-bold text-sm block mt-0.5">
              {req.bloodGroup} {req.component}
            </strong>
            <span className="text-app-text-secondary truncate block mt-0.5 font-medium">
              {req.unitsRequired} Unit(s) • {req.hospitalName}
            </span>
          </div>

          <div>
            <span className="text-app-text-secondary block text-[10px] font-bold uppercase tracking-wider">
              2. What Has Been Found
            </span>
            <strong className="text-app-text font-bold text-sm block mt-0.5">
              {req.unitsCoordinated} of {req.unitsRequired} Unit(s)
            </strong>
            <span className="text-app-text-secondary truncate block mt-0.5 font-medium">
              {req.unitsCoordinated > 0 ? 'Verified In Reserve' : 'Searching Active Pool'}
            </span>
          </div>

          <div>
            <span className="text-app-text-secondary block text-[10px] font-bold uppercase tracking-wider">
              3. Current Stage
            </span>
            <strong className="text-app-text font-bold text-xs block mt-0.5">
              {LIFECYCLE_STEPS[activeStepNumber - 1]?.label}
            </strong>
            <span className="text-app-text-secondary truncate block mt-0.5 font-medium">
              Search Radius: {escalationInfo.radiusKm} km
            </span>
          </div>

          <div>
            <span className="text-app-text-secondary block text-[10px] font-bold uppercase tracking-wider">
              4. Next Action
            </span>
            <strong className="text-app-text font-bold text-xs block mt-0.5 truncate">
              {unitsShort > 0 ? 'Donor Response & Assignment' : 'Pathology Cross-Match'}
            </strong>
            <span className="text-app-text-secondary truncate block mt-0.5 font-medium">
              Transfusion unit clearance
            </span>
          </div>
        </div>

        {/* Stage Explanation & Next Steps Callout */}
        <div className="bg-app-surface border border-app-border p-4 rounded-xl space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-brand animate-pulse" />
            <h3 className="font-bold text-app-text">Current Operational Status:</h3>
          </div>
          <p className="text-app-text leading-relaxed">
            {stageData.explanation}
          </p>
          <div className="pt-2 border-t border-app-border flex items-center justify-between text-app-text-secondary">
            <span><strong>Next Expected Action:</strong> {stageData.nextAction}</span>
            <span className="font-mono text-[11px]">Updated {new Date(req.updatedAt).toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Shortage & Escalation Controls */}
        {unitsShort > 0 && req.status !== 'CANCELLED' && req.status !== 'FULFILLED' && (
          <div className="bg-warning-light border border-warning-border p-4 rounded-xl text-xs text-warning-dark flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-dark shrink-0" />
              <span>
                <strong>Shortage Status:</strong> {unitsShort} unit(s) still required. Automated alerts active across Level {req.escalationLevel} radius ({escalationInfo.radiusKm} km).
              </span>
            </div>

            {req.escalationLevel < 4 && (
              <button
                type="button"
                onClick={() => escalateRequest(req.id)}
                className="bg-warning-dark hover:bg-warning text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors shrink-0 shadow-xs"
              >
                Expand Search Radius (+1)
              </button>
            )}
          </div>
        )}

        {/* Assigned Donors Section: Confirmed by Backend */}
        {req.assignedDonors && req.assignedDonors.length > 0 ? (
          <div className="bg-success-light/40 border border-success-border p-4 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-success uppercase tracking-wider text-[10px] block">
              Clinically Assigned Donors ({req.assignedDonors.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {req.assignedDonors.map((asgn) => (
                <div key={asgn.id} className="bg-app-surface p-3 rounded-lg border border-success-border flex items-center justify-between shadow-xs">
                  <div>
                    <span className="font-bold text-app-text block">{asgn.donorName}</span>
                    <span className="text-[11px] text-app-text-secondary">Blood Group {asgn.donorBloodGroup} • Assigned {asgn.unitsAssigned} Unit(s)</span>
                  </div>
                  <span className="text-[10px] font-bold bg-success-light text-success px-2 py-0.5 rounded-full border border-success-border">
                    Confirmed
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-app-muted/30 border border-app-border rounded-lg text-xs text-app-text-secondary flex items-center justify-between">
            <span>No donor has been assigned yet. System is awaiting volunteer responses.</span>
            <span className="font-semibold text-brand">Searching Active Pool</span>
          </div>
        )}
      </div>

      {/* Main Grid: Immutable Event Timeline + Facility Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Audit Event Timeline (2 Columns) */}
        <div className="md:col-span-2 bg-app-surface p-6 rounded-xl border border-app-border shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="text-base font-bold text-app-text">Immutable Audit Event Timeline</h3>
            <span className="text-xs text-app-text-secondary font-mono">{reqEvents.length} Event(s) Recorded</span>
          </div>

          <EventTimeline events={reqEvents} />
        </div>

        {/* Side Panel: Facility Details & Governance (1 Column) */}
        <div className="space-y-4">
          {/* Hospital & Attendant Details */}
          <div className="bg-app-surface p-5 rounded-xl border border-app-border shadow-card space-y-3 text-xs">
            <h4 className="font-bold text-app-text-secondary uppercase tracking-wider text-[11px]">
              Care Facility & Attendant
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-app-text">
                <Building className="w-4 h-4 text-app-text-secondary shrink-0" />
                <span className="font-bold">{req.hospitalName}</span>
              </div>
              <p className="text-app-text-secondary pl-6 leading-relaxed">
                {req.hospitalAddress}, {req.city}
              </p>

              <div className="pt-2 border-t border-app-border flex items-center justify-between text-app-text">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-app-text-secondary shrink-0" />
                  <span>{req.contactName} ({req.contactPhone})</span>
                </div>
                <a
                  href={`tel:${req.contactPhone}`}
                  className="text-xs font-bold text-brand hover:underline"
                >
                  Call
                </a>
              </div>
            </div>
          </div>

          {/* Hospital Arrival Transfusion Desk Guidelines */}
          <div className="bg-app-surface p-5 rounded-xl border border-app-border shadow-card space-y-2 text-xs">
            <h4 className="font-bold text-app-text uppercase tracking-wider text-[11px]">
              Transfusion Desk Protocols
            </h4>
            <p className="text-[11px] text-app-text-secondary leading-relaxed">
              Upon arriving at the hospital transfusion unit, present Reference Code <strong className="text-app-text font-mono">{req.referenceCode}</strong>. Pathology cross-match test will confirm compatibility prior to unit issue.
            </p>
          </div>

          {/* Clinical Safety Disclaimer */}
          <div className="bg-app-text text-app-muted p-5 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-success-light font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Medical Safety Principle</span>
            </div>
            <p className="text-[11px] text-app-muted/80 leading-relaxed">
              CareLoop coordinates communication events and donor discovery. Medical cross-match compatibility testing and physical donor eligibility screening are strictly conducted by accredited hospital pathologists.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
