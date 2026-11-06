import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { KpiOverview } from '../components/coordinator/KpiOverview';
import { EmergencyMatrix } from '../components/coordinator/EmergencyMatrix';
import { EventTimeline } from '../components/emergency/EventTimeline';
import { findPotentialResponders } from '../services/matchingEngine';
import { EmergencyRequest } from '../types';
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  X,
  Phone,
  Building,
  UserCheck,
  Award,
  Layers,
  Sparkles,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CoordinatorView: React.FC = () => {
  const {
    requests,
    events,
    donors,
    escalateRequest,
    updateRequestStatus,
    verifyAndFulfillRequest,
    assignDonorToRequest,
    bloodCentres,
    currentUser
  } = useBloodStore();

  const navigate = useNavigate();
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(requests[0] || null);
  const [assignModalDonorId, setAssignModalDonorId] = useState<string | null>(null);
  const [assignUnits, setAssignUnits] = useState(1);
  const [assignFeedback, setAssignFeedback] = useState<string | null>(null);
  const [activeTabFilter, setActiveTabFilter] = useState<string>('ALL');

  const activeReq = selectedRequest
    ? requests.find((r) => r.id === selectedRequest.id) || selectedRequest
    : requests[0];

  const activeEvents = events.filter((e) => e.requestId === activeReq?.id);

  // Run component-aware clinical matching engine
  const matches = activeReq ? findPotentialResponders(activeReq, donors, 35) : [];

  const handleExecuteAssignment = async () => {
    if (activeReq && assignModalDonorId) {
      const res = await assignDonorToRequest(
        activeReq.id,
        assignModalDonorId,
        assignUnits,
        currentUser?.id || 'coord-1',
        'Assigned via Coordinator Control Room'
      );
      if (res.success) {
        setAssignFeedback(res.message);
        setTimeout(() => {
          setAssignModalDonorId(null);
          setAssignFeedback(null);
        }, 1200);
      } else {
        setAssignFeedback(res.message);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Donor Assignment Modal */}
      {assignModalDonorId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-app-surface rounded-xl p-6 max-w-md w-full shadow-elevated border border-app-border space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-success" />
                <h3 className="text-base font-bold text-app-text">Assign Registered Volunteer</h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalDonorId(null)}
                className="text-app-text-secondary hover:text-app-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {assignFeedback && (
              <div className="p-3 rounded-lg bg-success-light border border-success-border text-xs text-success font-semibold">
                {assignFeedback}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <p className="text-app-text-secondary leading-relaxed">
                Confirm formal assignment of this donor for request{' '}
                <strong className="text-app-text font-mono">{activeReq?.referenceCode}</strong>.
                This updates units coordinated, verifies safety caps, and dispatches hospital coordination details to the donor.
              </p>

              <div>
                <label className="text-app-text font-bold block mb-1">Units to Assign</label>
                <select
                  value={assignUnits}
                  onChange={(e) => setAssignUnits(Number(e.target.value))}
                  className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text font-bold"
                >
                  <option value={1}>1 Unit</option>
                  {activeReq && activeReq.unitsRequired - activeReq.unitsCoordinated >= 2 && (
                    <option value={2}>2 Units</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
              <button
                type="button"
                onClick={() => setAssignModalDonorId(null)}
                className="py-2 px-4 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAssignment}
                className="py-2 px-5 rounded-lg bg-brand hover:bg-brand-dark text-xs font-bold text-white shadow-xs transition-colors"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app-text tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand" />
            <span>Coordinator Control Room</span>
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Operational dashboard for managing emergencies, shortage mitigations, and atomic donor assignments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/communication')}
            className="bg-brand-light text-brand hover:bg-brand/20 border border-brand/30 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Communication Hub</span>
          </button>

          <span className="text-xs bg-app-text text-white font-mono px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span>DISPATCH ACTIVE</span>
          </span>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <KpiOverview requests={requests} />

      {/* Operational Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-2 text-xs font-bold overflow-x-auto">
        {[
          { key: 'ALL', label: 'All Requests' },
          { key: 'UNASSIGNED', label: 'Unassigned / Deficit' },
          { key: 'AWAITING_ASSIGNMENT', label: 'Awaiting Confirmation' },
          { key: 'ESCALATED', label: 'Escalated (L2+)' },
          { key: 'COMPLETED', label: 'Completed' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTabFilter(tab.key)}
            className={`py-1.5 px-3 rounded-md transition-all whitespace-nowrap ${
              activeTabFilter === tab.key
                ? 'bg-brand text-white shadow-xs'
                : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid: Matrix Table (2 cols) + Control Drawer (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Emergency Matrix Table (2 Columns) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-app-text">
              Emergency Coordination Matrix
            </h2>
            <span className="text-xs text-app-text-secondary">Click a record to inspect controls</span>
          </div>

          <EmergencyMatrix
            requests={requests}
            onSelectRequest={(req) => setSelectedRequest(req)}
            selectedRequestId={activeReq?.id}
            activeFilterTab={activeTabFilter}
          />
        </div>

        {/* Selected Request Detail Drawer (1 Column) */}
        {activeReq ? (
          <div className="bg-app-surface rounded-xl border border-app-border shadow-card p-5 space-y-5">
            <div className="flex items-start justify-between border-b border-app-border pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                  Active Control Console
                </span>
                <h3 className="text-xl font-bold font-mono text-app-text">
                  {activeReq.referenceCode}
                </h3>
              </div>
              <span className="text-xs font-bold bg-app-text text-white px-2.5 py-1 rounded-md">
                Level {activeReq.escalationLevel}
              </span>
            </div>

            {/* Quick Summary Grid */}
            <div className="bg-app-muted/40 p-3.5 rounded-lg text-xs space-y-2 border border-app-border">
              <div className="flex justify-between">
                <span className="text-app-text-secondary">Requirement:</span>
                <strong className="text-brand font-bold">
                  {activeReq.bloodGroup} {activeReq.component}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-app-text-secondary">Coordination:</span>
                <strong className="text-app-text">
                  {activeReq.unitsCoordinated} / {activeReq.unitsRequired} U Satisfied
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-app-text-secondary">Hospital:</span>
                <strong className="text-app-text truncate max-w-[150px]">
                  {activeReq.hospitalName}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-app-text-secondary">Attendant:</span>
                <span className="text-app-text">
                  {activeReq.contactName} ({activeReq.contactPhone})
                </span>
              </div>
            </div>

            {/* Escalation Control Buttons */}
            <div className="space-y-2 border-t border-app-border pt-3">
              <span className="text-xs font-bold text-app-text block">
                Coordinator Operational Actions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => escalateRequest(activeReq.id)}
                  disabled={activeReq.escalationLevel >= 4}
                  className="w-full py-2.5 px-3 rounded-lg bg-warning-dark hover:bg-warning text-white font-bold text-xs transition-colors disabled:opacity-50 shadow-xs"
                >
                  Expand Radius (+1)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    verifyAndFulfillRequest(
                      activeReq.id,
                      bloodCentres[0].id,
                      activeReq.unitsRequired - activeReq.unitsCoordinated
                    )
                  }
                  disabled={activeReq.unitsCoordinated >= activeReq.unitsRequired}
                  className="w-full py-2.5 px-3 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs transition-colors disabled:opacity-50 shadow-xs"
                >
                  Fulfill All
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('/communication')}
                className="w-full py-2 px-3 rounded-lg border border-app-border hover:bg-app-muted text-app-text font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-info" />
                <span>Open Direct Chat Thread</span>
              </button>
            </div>

            {/* Clinically Matched Candidates List */}
            <div className="space-y-2 border-t border-app-border pt-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-app-text">
                  Candidate Responders ({matches.length})
                </span>
                <span className="text-[10px] text-app-text-secondary font-semibold">Algorithmic Match</span>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {matches.length === 0 ? (
                  <div className="py-4 text-center text-app-text-secondary">No compatible donors in current radius.</div>
                ) : (
                  matches.map((m) => (
                    <div
                      key={m.donor.id}
                      className="p-3 rounded-lg bg-app-muted/40 border border-app-border text-xs space-y-1.5"
                    >
                      <div className="flex justify-between font-bold text-app-text">
                        <span>{m.donor.fullName} ({m.donor.bloodGroup})</span>
                        <span className="text-success font-mono">~{m.approxDistanceKm.toFixed(1)} km</span>
                      </div>
                      <p className="text-[11px] text-app-text-secondary">{m.matchReason}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-app-text-secondary">Score: {m.matchScore}/100</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignModalDonorId(m.donor.id);
                            setAssignUnits(1);
                          }}
                          disabled={activeReq.unitsCoordinated >= activeReq.unitsRequired}
                          className="bg-brand hover:bg-brand-dark text-white font-bold text-[11px] px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                        >
                          Assign Donor
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Audit Log Stream */}
            <div className="space-y-2 border-t border-app-border pt-3">
              <span className="text-xs font-bold text-app-text block">Audit Event Log</span>
              <div className="max-h-48 overflow-y-auto pr-1">
                <EventTimeline events={activeEvents} />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-app-surface rounded-xl border border-app-border p-8 text-center text-xs text-app-text-secondary">
            Select an emergency request from the matrix to inspect controls.
          </div>
        )}
      </div>
    </div>
  );
};
