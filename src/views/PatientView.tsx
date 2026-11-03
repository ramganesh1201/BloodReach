import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  UserRound,
  Droplet,
  PlusCircle,
  Activity,
  ArrowRight,
  Clock,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  MessageSquare,
  Users
} from 'lucide-react';

export const PatientView: React.FC = () => {
  const { requests, cancelEmergencyRequest, currentUser, isOffline } = useBloodStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Requirement satisfied elsewhere');

  const activeRequests = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  );
  const historyRequests = requests.filter(
    (r) => r.status === 'FULFILLED' || r.status === 'CANCELLED' || r.status === 'EXPIRED'
  );

  const displayedRequests = activeTab === 'active' ? activeRequests : historyRequests;

  const handleConfirmCancel = () => {
    if (cancelModalId) {
      cancelEmergencyRequest(cancelModalId, cancelReason);
      setCancelModalId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-8 animate-fade-in">
      {/* Cancellation Confirmation Dialog */}
      {cancelModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-app-surface rounded-xl p-6 max-w-md w-full shadow-elevated border border-app-border space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-warning-light text-warning flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-app-text">Cancel Emergency Request</h3>
                <p className="text-xs text-app-text-secondary">Are you sure you want to stop active donor coordination?</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-app-text block">Reason for Cancellation</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full text-xs p-2.5 border border-app-border rounded-lg bg-app-surface text-app-text font-medium"
              >
                <option value="Requirement satisfied elsewhere">Requirement satisfied at hospital reserve</option>
                <option value="Alternative donor arranged directly">Alternative donor arranged directly</option>
                <option value="Patient condition stabilized">Patient condition stabilized / Procedure postponed</option>
                <option value="Entered incorrect details">Entered incorrect details (will re-submit)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
              <button
                type="button"
                onClick={() => setCancelModalId(null)}
                className="py-2 px-4 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted transition-colors"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="py-2 px-4 rounded-lg bg-emergency hover:bg-emergency-dark text-xs font-bold text-white shadow-xs transition-colors"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero / Welcome Section */}
      <div className="bg-app-surface border border-app-border rounded-xl p-6 sm:p-8 shadow-card relative overflow-hidden">
        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-brand-light text-brand px-3 py-1 rounded-sm text-xs font-semibold border border-brand/20">
            <UserRound className="w-3.5 h-3.5" />
            <span>Patient & Attendant Coordination Hub</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-app-text leading-tight">
            Emergency Blood Request Coordination
          </h1>

          <p className="text-xs sm:text-sm text-app-text-secondary leading-relaxed">
            Welcome, {currentUser?.fullName || 'Attendant'}. Submit emergency blood requests directly to certified hospital depositories and nearby volunteer donors through our automated dispatch pipeline.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/request')}
              className="bg-brand hover:bg-brand-dark text-white font-bold text-xs sm:text-sm py-2.5 px-5 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Blood Request</span>
            </button>

            {activeRequests.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/request/track/${activeRequests[0].id}`)}
                className="bg-app-muted hover:bg-app-border text-app-text font-semibold text-xs sm:text-sm py-2.5 px-5 rounded-lg transition-colors flex items-center justify-center gap-2 border border-app-border"
              >
                <Activity className="w-4 h-4 text-brand" />
                <span>Track Active Call ({activeRequests[0].referenceCode})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/communication')}
              className="bg-app-surface hover:bg-app-muted text-app-text font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 border border-app-border"
            >
              <MessageSquare className="w-4 h-4 text-info" />
              <span>Communication Hub</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="flex items-center justify-between border-b border-app-border pb-3">
        <div className="flex items-center gap-2 bg-app-muted p-1 rounded-lg text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`py-1.5 px-4 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-app-surface text-app-text shadow-xs'
                : 'text-app-text-secondary hover:text-app-text'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-brand" />
            <span>Active Requests ({activeRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1.5 px-4 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-app-surface text-app-text shadow-xs'
                : 'text-app-text-secondary hover:text-app-text'
            }`}
          >
            <History className="w-3.5 h-3.5 text-app-text-secondary" />
            <span>Resolved History ({historyRequests.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/request')}
          className="text-xs font-bold text-brand hover:text-brand-dark inline-flex items-center gap-1"
        >
          <span>New Request</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Request Cards Grid */}
      {displayedRequests.length === 0 ? (
        <div className="bg-app-surface border border-app-border rounded-xl p-12 text-center space-y-3 shadow-subtle">
          <Droplet className="w-10 h-10 text-app-border mx-auto" />
          <h3 className="text-base font-bold text-app-text">
            {activeTab === 'active' ? 'No Active Emergency Requests' : 'No Past Requests Recorded'}
          </h3>
          <p className="text-xs text-app-text-secondary max-w-md mx-auto">
            {activeTab === 'active'
              ? 'If a patient in your care urgently requires blood or components, initiate an emergency request to activate coordination.'
              : 'Completed, fulfilled, and cancelled emergency records will appear here.'}
          </p>
          {activeTab === 'active' && (
            <button
              type="button"
              onClick={() => navigate('/request')}
              className="mt-2 inline-flex items-center gap-2 bg-brand text-white font-bold text-xs px-5 py-2.5 rounded-lg hover:bg-brand-dark transition-colors shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Blood Request</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {displayedRequests.map((req) => {
            const percentComplete = Math.min(100, Math.round((req.unitsCoordinated / req.unitsRequired) * 100));

            return (
              <div
                key={req.id}
                className="bg-app-surface border border-app-border rounded-xl p-5 shadow-card space-y-4 hover:border-brand/30 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-app-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-app-text bg-app-muted px-2 py-0.5 rounded border border-app-border">
                          {req.referenceCode}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          req.urgency === 'Critical'
                            ? 'bg-emergency-light text-emergency font-black'
                            : 'bg-warning-light text-warning-dark'
                        }`}>
                          {req.urgency}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-app-text mt-1.5">{req.hospitalName}</h3>
                    </div>

                    <StatusBadge status={req.status} size="sm" />
                  </div>

                  {/* Requirements & Progress Blocks */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-app-muted/50 p-2.5 rounded-lg border border-app-border">
                      <span className="text-[10px] text-app-text-secondary font-semibold block">Blood Component</span>
                      <span className="font-bold text-brand text-base">{req.bloodGroup}</span>
                      <span className="text-app-text-secondary block text-[11px] font-medium">{req.component}</span>
                    </div>

                    <div className="bg-app-muted/50 p-2.5 rounded-lg border border-app-border">
                      <span className="text-[10px] text-app-text-secondary font-semibold block">Coordinated Units</span>
                      <span className="font-bold text-app-text text-base">
                        {req.unitsCoordinated} / {req.unitsRequired} U
                      </span>
                      <span className="text-success font-semibold block text-[11px]">
                        {percentComplete}% Satisfied
                      </span>
                    </div>
                  </div>

                  {/* Coordinated Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-app-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-brand h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentComplete}%` }}
                      />
                    </div>
                  </div>

                  {/* Hospital Location & Attendant Info */}
                  <div className="space-y-1 text-xs text-app-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{req.hospitalAddress}, {req.city}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 shrink-0" />
                      <span>Attendant: {req.contactName} ({req.contactPhone})</span>
                    </div>
                  </div>

                  {/* Assigned Donors Info if present */}
                  {req.assignedDonors && req.assignedDonors.length > 0 && (
                    <div className="p-2.5 bg-success-light/50 border border-success-border rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-success font-bold text-[11px]">
                        <Users className="w-3.5 h-3.5" />
                        <span>Assigned Volunteer Donor:</span>
                      </div>
                      <p className="text-app-text font-medium text-[11px]">
                        {req.assignedDonors[0].donorName} (Group {req.assignedDonors[0].donorBloodGroup}) • Assigned {req.assignedDonors[0].unitsAssigned} unit(s)
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-app-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/request/track/${req.id}`)}
                      className="bg-brand hover:bg-brand-dark text-white font-bold text-xs py-2 px-3.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Track Lifecycle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/communication')}
                      className="border border-app-border hover:bg-app-muted text-app-text font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-info" />
                      <span>Messages</span>
                    </button>
                  </div>

                  {req.status !== 'FULFILLED' && req.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => setCancelModalId(req.id)}
                      className="text-xs text-app-text-secondary hover:text-emergency font-semibold px-2 py-1 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
