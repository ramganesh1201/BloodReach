import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { KpiOverview } from '../components/coordinator/KpiOverview';
import { EmergencyMatrix } from '../components/coordinator/EmergencyMatrix';
import { EventTimeline } from '../components/emergency/EventTimeline';
import { findPotentialResponders } from '../services/matchingEngine';
import { EmergencyRequest } from '../types';
import { Activity, AlertTriangle, ShieldCheck, CheckCircle2, ChevronRight, X, Phone, Building, Send } from 'lucide-react';

export const CoordinatorView: React.FC = () => {
  const { requests, events, donors, escalateRequest, updateRequestStatus, verifyAndFulfillRequest, bloodCentres } = useBloodStore();
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(requests[0] || null);

  const activeReq = selectedRequest ? requests.find((r) => r.id === selectedRequest.id) || selectedRequest : requests[0];
  const activeEvents = events.filter((e) => e.requestId === activeReq?.id);

  // Run matching engine for selected request
  const matches = activeReq ? findPotentialResponders(activeReq, donors, 25) : [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-red-600" />
            Coordinator Control Room
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Operational command center for tracking active blood emergencies, shortages, and response escalations.
          </p>
        </div>

        <span className="text-xs bg-slate-900 text-white font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          SYSTEM OPERATIONAL
        </span>
      </div>

      {/* KPI Stats Overview */}
      <KpiOverview requests={requests} />

      {/* Main Grid: Matrix Table (2 cols) + Control Drawer (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Emergency Matrix Table (2 Columns) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Active Emergency Matrix</h2>
            <span className="text-xs text-slate-500 font-medium">Click row to open detailed control drawer</span>
          </div>

          <EmergencyMatrix
            requests={requests}
            onSelectRequest={(req) => setSelectedRequest(req)}
            selectedRequestId={activeReq?.id}
          />
        </div>

        {/* Selected Request Detail Drawer (1 Column) */}
        {activeReq ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Control Panel</span>
                <h3 className="text-lg font-black font-mono text-slate-900">{activeReq.referenceCode}</h3>
              </div>
              <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                Level {activeReq.escalationLevel}
              </span>
            </div>

            {/* Quick Summary */}
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Needed:</span>
                <strong className="text-red-600 font-bold">{activeReq.bloodGroup} {activeReq.component}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Units Coordinated:</span>
                <strong className="text-slate-900">{activeReq.unitsCoordinated} / {activeReq.unitsRequired} U</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hospital:</span>
                <strong className="text-slate-900 truncate max-w-[140px]">{activeReq.hospitalName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Attendant:</span>
                <span className="text-slate-800">{activeReq.contactName} ({activeReq.contactPhone})</span>
              </div>
            </div>

            {/* Escalation Control */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-800 block">Progressive Escalation Override</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => escalateRequest(activeReq.id)}
                  disabled={activeReq.escalationLevel >= 4}
                  className="w-full py-2 px-3 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors disabled:opacity-50"
                >
                  Escalate Level +1
                </button>
                <button
                  type="button"
                  onClick={() => verifyAndFulfillRequest(activeReq.id, bloodCentres[0].id, activeReq.unitsRequired - activeReq.unitsCoordinated)}
                  disabled={activeReq.unitsCoordinated >= activeReq.unitsRequired}
                  className="w-full py-2 px-3 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors disabled:opacity-50"
                >
                  Confirm Issue All
                </button>
              </div>
            </div>

            {/* Potential Responders Candidate Match List */}
            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Potential Responder Candidates ({matches.length})</span>
                <span className="text-[10px] text-slate-400">Match Algorithm</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {matches.map((m) => (
                  <div key={m.donor.id} className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{m.donor.fullName} ({m.donor.bloodGroup})</span>
                      <span className="text-emerald-700">~{m.approxDistanceKm.toFixed(1)} km</span>
                    </div>
                    <p className="text-[11px] text-slate-600">{m.matchReason}</p>
                    <p className="text-[10px] text-slate-400 italic">{m.disclaimer}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Log Stream */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-800 block">Live Event Timeline</span>
              <div className="max-h-48 overflow-y-auto pr-1">
                <EventTimeline events={activeEvents} />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            Select an emergency request from the matrix to view operational details.
          </div>
        )}
      </div>
    </div>
  );
};
