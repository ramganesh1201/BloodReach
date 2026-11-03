import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { EventTimeline } from '../components/emergency/EventTimeline';
import { getEscalationConfig } from '../services/escalationEngine';
import { Building, Phone, AlertTriangle, ShieldCheck, RefreshCw, Share2 } from 'lucide-react';

export const TrackRequestView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { requests, events, escalateRequest } = useBloodStore();

  const req = requests.find((r) => r.id === id || r.referenceCode.toUpperCase() === id?.toUpperCase()) || requests[0];
  const reqEvents = events.filter((e) => e.requestId === req.id);

  const escalationInfo = getEscalationConfig(req.escalationLevel);
  const unitsShort = Math.max(0, req.unitsRequired - req.unitsCoordinated);
  const percentCoordinated = Math.min(100, Math.round((req.unitsCoordinated / req.unitsRequired) * 100));

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Top Request Summary Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                Emergency {req.referenceCode}
              </h1>
              <span className="text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                Level {req.escalationLevel} Escalation
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Created {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Contact: {req.contactName} ({req.contactPhone})
            </p>
          </div>

          <div>
            <StatusBadge status={req.status} size="lg" />
          </div>
        </div>

        {/* 4 Core Answers: What is needed -> What has been found -> What is happening -> Next */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px] font-semibold uppercase">1. What is Needed</span>
            <strong className="text-red-600 font-extrabold text-sm block mt-0.5">
              {req.bloodGroup} {req.component} ({req.unitsRequired} U)
            </strong>
            <span className="text-slate-600 truncate block mt-0.5">{req.hospitalName}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px] font-semibold uppercase">2. What Has Been Found</span>
            <strong className="text-slate-900 font-extrabold text-sm block mt-0.5">
              {req.unitsCoordinated} of {req.unitsRequired} Unit(s)
            </strong>
            <span className="text-slate-600 truncate block mt-0.5">
              {req.unitsCoordinated > 0 ? 'Verified in Reserve' : 'Shortage Active'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px] font-semibold uppercase">3. What is Happening Now</span>
            <strong className="text-slate-900 font-bold text-xs block mt-0.5">
              {escalationInfo.name}
            </strong>
            <span className="text-slate-600 truncate block mt-0.5">Radius: {escalationInfo.radiusKm} km</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px] font-semibold uppercase">4. What Happens Next</span>
            <strong className="text-slate-900 font-bold text-xs block mt-0.5">
              {unitsShort > 0 ? 'Responder Confirmation' : 'Blood Bank Issue'}
            </strong>
            <span className="text-slate-600 truncate block mt-0.5">Clinical verification</span>
          </div>
        </div>

        {/* Coordinated Units Progress Bar */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between text-xs font-bold text-slate-800">
            <span>Progress: {req.unitsCoordinated} of {req.unitsRequired} Units Coordinated</span>
            <span>{percentCoordinated}% Complete</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-red-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${percentCoordinated}%` }}
            />
          </div>
        </div>

        {/* Shortage Detection Banner */}
        {unitsShort > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Shortage Detected:</strong> {unitsShort} unit(s) remaining. Potential responder alerts dispatches active across Level {req.escalationLevel} radius ({escalationInfo.radiusKm} km).
              </span>
            </div>

            {req.escalationLevel < 4 && (
              <button
                type="button"
                onClick={() => escalateRequest(req.id)}
                className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-3 py-1.5 rounded text-xs transition-colors shrink-0"
              >
                Escalate to Level {req.escalationLevel + 1}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Immutable Event Timeline + Context Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Audit Event Timeline (2 Columns) */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Immutable Audit Event Timeline</h3>
            <span className="text-xs text-slate-500 font-mono">{reqEvents.length} Event(s) Recorded</span>
          </div>

          <EventTimeline events={reqEvents} />
        </div>

        {/* Side Panel (1 Column) */}
        <div className="space-y-4">
          {/* Hospital & Contact Details */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-card space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-slate-500">
              Care Facility Details
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-800">
                <Building className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-semibold">{req.hospitalName}</span>
              </div>
              <p className="text-slate-600 pl-6">{req.hospitalAddress}</p>

              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-slate-800">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Contact: {req.contactName} ({req.contactPhone})</span>
              </div>
            </div>
          </div>

          {/* Safety Notice */}
          <div className="bg-slate-900 text-white p-5 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Medical Safety</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              BloodReach coordinates response events. Medical compatibility testing and physical donor eligibility screening are strictly conducted by authorized blood-centre clinicians.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
