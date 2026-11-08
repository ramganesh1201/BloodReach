import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import {
  UserRound,
  Droplet,
  PlusCircle,
  Activity,
  ArrowRight,
  Clock,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  History,
  MessageSquare,
  Users,
  HeartHandshake,
  Building2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const PatientView: React.FC = () => {
  const { requests, cancelEmergencyRequest, currentUser, isOffline } = useBloodStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Requirement satisfied elsewhere');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const activeRequests = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  );
  const historyRequests = requests.filter(
    (r) => r.status === 'FULFILLED' || r.status === 'CANCELLED' || r.status === 'EXPIRED'
  );

  const displayedRequests = activeTab === 'active' ? activeRequests : historyRequests;

  const totalUnitsRequired = activeRequests.reduce((sum, r) => sum + r.unitsRequired, 0);
  const totalUnitsCoordinated = activeRequests.reduce((sum, r) => sum + r.unitsCoordinated, 0);
  const fulfilledCount = historyRequests.filter((r) => r.status === 'FULFILLED').length;

  const handleOpenCancelModal = (requestId: string) => {
    setCancelModalId(requestId);
    setCancelError(null);
    setCancelReason('Requirement satisfied elsewhere');
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalId || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await cancelEmergencyRequest(cancelModalId, cancelReason);
      if (res.success) {
        setCancelModalId(null);
      } else {
        setCancelError(res.error || 'Failed to cancel emergency request. Please try again or notify your coordinator.');
      }
    } catch (err: any) {
      setCancelError(err?.message || 'An unexpected error occurred while processing cancellation.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Cancellation Confirmation Dialog */}
      {cancelModalId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-app-surface rounded-xl p-6 max-w-md w-full shadow-elevated border border-app-border space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning-light text-warning-dark border border-warning-border flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="cancel-dialog-title" className="text-base font-bold text-app-text font-display">
                  Cancel Emergency Request
                </h3>
                <p className="text-xs text-app-text-secondary leading-relaxed">
                  Are you sure you want to stop active donor dispatch for this emergency?
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="cancel-reason-select" className="text-xs font-semibold text-app-text block">
                Reason for Cancellation
              </label>
              <select
                id="cancel-reason-select"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full text-xs p-2.5 border border-app-border rounded-lg bg-app-surface text-app-text font-medium focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="Requirement satisfied elsewhere">Requirement satisfied at hospital reserve</option>
                <option value="Alternative donor arranged directly">Alternative donor arranged directly</option>
                <option value="Patient condition stabilized">Patient condition stabilized / Procedure postponed</option>
                <option value="Entered incorrect details">Entered incorrect details (will re-submit)</option>
              </select>
            </div>

            {cancelError && (
              <div className="p-3 rounded-lg bg-emergency-light border border-emergency-border text-xs text-emergency font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-app-border">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => {
                  setCancelModalId(null);
                  setCancelError(null);
                }}
                className="py-2 px-3.5 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keep Active
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="py-2 px-4 rounded-lg bg-emergency hover:bg-emergency-hover text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Cancellation...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Healthcare Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Patient Workspace' },
        ]}
        roleBadge={{
          label: 'Patient & Attendant',
          variant: 'brand',
          icon: UserRound,
        }}
        title="Emergency Blood Request Hub"
        description={`Welcome back${currentUser?.fullName ? `, ${currentUser.fullName}` : ''}. Initiate urgent blood calls, monitor real-time depository matching, and coordinate with verified volunteer donors.`}
        statusBadge={{
          label: isOffline ? 'Offline Mode Active' : 'Dispatch Network Live',
          live: !isOffline,
        }}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/request')}
              className="bg-brand hover:bg-brand-hover text-white font-semibold text-xs sm:text-sm py-2 px-4 rounded-lg transition-colors shadow-sm flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Create Blood Request</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/communication')}
              className="bg-app-surface hover:bg-app-muted text-app-text font-semibold text-xs sm:text-sm py-2 px-3.5 rounded-lg transition-colors border border-app-border flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-info shrink-0" />
              <span>Messages & Calls</span>
            </button>
          </>
        }
      />

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Emergencies"
          value={activeRequests.length}
          subtext={activeRequests.length > 0 ? 'Under active dispatch' : 'No active alerts'}
          icon={Activity}
          variant={activeRequests.length > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Units In Coordination"
          value={`${totalUnitsCoordinated} / ${totalUnitsRequired || 0} U`}
          subtext={totalUnitsRequired > 0 ? `${Math.round((totalUnitsCoordinated / totalUnitsRequired) * 100)}% total allocation` : 'None required'}
          icon={Droplet}
          variant={totalUnitsCoordinated > 0 ? 'brand' : 'neutral'}
        />
        <StatCard
          label="Successfully Fulfilled"
          value={fulfilledCount}
          subtext="Completed transfusions"
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Coordination Network"
          value="24/7 Live"
          subtext="Hospital & donor pipeline"
          icon={HeartHandshake}
          variant="info"
        />
      </div>

      {/* Tabs & View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-3">
        <div className="flex items-center gap-1.5 bg-app-muted p-1 rounded-lg text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`py-1.5 px-3.5 rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'active'
                ? 'bg-app-surface text-app-text shadow-xs font-bold'
                : 'text-app-text-secondary hover:text-app-text font-medium'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-brand" />
            <span>Active Requests ({activeRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1.5 px-3.5 rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-app-surface text-app-text shadow-xs font-bold'
                : 'text-app-text-secondary hover:text-app-text font-medium'
            }`}
          >
            <History className="w-3.5 h-3.5 text-app-text-secondary" />
            <span>Resolution History ({historyRequests.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/request')}
          className="text-xs font-semibold text-brand hover:text-brand-hover inline-flex items-center gap-1 self-end sm:self-auto"
        >
          <span>Initiate New Request</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content Area */}
      {displayedRequests.length === 0 ? (
        <EmptyState
          icon={activeTab === 'active' ? Droplet : History}
          title={activeTab === 'active' ? 'No Active Emergency Requests' : 'No Past Requests Recorded'}
          description={
            activeTab === 'active'
              ? 'If a patient under your care urgently requires blood or components, initiate an emergency request to activate our automated depository and donor dispatch system.'
              : 'Completed, fulfilled, and cancelled emergency records will appear here for clinical audit.'
          }
          action={
            activeTab === 'active'
              ? {
                  label: 'Create Blood Request',
                  onClick: () => navigate('/request'),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {displayedRequests.map((req) => {
            const percentComplete = Math.min(
              100,
              Math.round((req.unitsCoordinated / (req.unitsRequired || 1)) * 100)
            );

            return (
              <div
                key={req.id}
                className="bg-app-surface border border-app-border rounded-xl p-5 shadow-subtle hover:border-app-border-strong hover:shadow-card transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-4">
                  {/* Card Header: Code, Urgency & Status */}
                  <div className="flex items-start justify-between gap-3 border-b border-app-border/80 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-app-text bg-app-muted px-2 py-0.5 rounded border border-app-border">
                          {req.referenceCode}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            req.urgency === 'Critical'
                              ? 'bg-emergency-light text-emergency border border-emergency-border'
                              : 'bg-warning-light text-warning-dark border border-warning-border'
                          }`}
                        >
                          {req.urgency} Urgency
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-app-text flex items-center gap-1.5 pt-1">
                        <Building2 className="w-3.5 h-3.5 text-app-text-secondary shrink-0" />
                        <span>{req.hospitalName}</span>
                      </h3>
                    </div>

                    <StatusBadge status={req.status} size="sm" />
                  </div>

                  {/* Requirements & Progress Blocks */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-app-muted/50 p-3 rounded-lg border border-app-border">
                      <span className="text-[10px] text-app-text-secondary font-semibold uppercase tracking-wider block">
                        Blood Component
                      </span>
                      <span className="font-extrabold text-brand text-lg block leading-tight font-display">
                        {req.bloodGroup}
                      </span>
                      <span className="text-app-text-secondary block text-xs font-medium mt-0.5">
                        {req.component}
                      </span>
                    </div>

                    <div className="bg-app-muted/50 p-3 rounded-lg border border-app-border">
                      <span className="text-[10px] text-app-text-secondary font-semibold uppercase tracking-wider block">
                        Coordinated Units
                      </span>
                      <span className="font-extrabold text-app-text text-lg block leading-tight font-display">
                        {req.unitsCoordinated} / {req.unitsRequired} U
                      </span>
                      <span className="text-success font-semibold block text-xs mt-0.5">
                        {percentComplete}% Satisfied
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-app-muted rounded-full h-2 overflow-hidden border border-app-border/40">
                      <div
                        className="bg-brand h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentComplete}%` }}
                      />
                    </div>
                  </div>

                  {/* Hospital Location & Attendant Info */}
                  <div className="space-y-1.5 text-xs text-app-text-secondary">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-app-text-secondary/70 mt-0.5" />
                      <span className="leading-snug">
                        {req.hospitalAddress}, {req.city}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 shrink-0 text-app-text-secondary/70" />
                      <span>
                        Attendant: <strong className="text-app-text font-medium">{req.contactName}</strong> ({req.contactPhone})
                      </span>
                    </div>
                  </div>

                  {/* Assigned Donors Info if present */}
                  {req.assignedDonors && req.assignedDonors.length > 0 && (
                    <div className="p-3 bg-success-light/40 border border-success-border rounded-lg text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 text-success font-bold text-xs">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Assigned Volunteer Donor</span>
                      </div>
                      <div className="text-app-text text-xs space-y-0.5">
                        <p className="font-medium">
                          {req.assignedDonors[0].donorName} (Blood Group <strong>{req.assignedDonors[0].donorBloodGroup}</strong>)
                        </p>
                        <p className="text-app-text-secondary text-[11px]">
                          Allocated: {req.assignedDonors[0].unitsAssigned} unit(s) • Status: Confirmed
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-app-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/request/track/${req.id}`)}
                      className="bg-brand hover:bg-brand-hover text-white font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Track Lifecycle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/communication')}
                      className="border border-app-border hover:bg-app-muted text-app-text font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-info" />
                      <span>Messages</span>
                    </button>
                  </div>

                  {req.status !== 'FULFILLED' && req.status !== 'CANCELLED' && req.status !== 'EXPIRED' && (
                    <button
                      type="button"
                      onClick={() => handleOpenCancelModal(req.id)}
                      className="text-xs text-app-text-secondary hover:text-emergency font-medium px-2 py-1 transition-colors"
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
