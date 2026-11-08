import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { AvailabilityToggle } from '../components/donor/AvailabilityToggle';
import { EmergencyCard } from '../components/donor/EmergencyCard';
import { evaluateDonorEligibility, isClinicallyCompatible, DONATION_INTERVAL_DAYS } from '../services/matchingEngine';
import { DonorAvailabilityState } from '../types';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import {
  Bell,
  ShieldCheck,
  Heart,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Activity,
  Award,
  MessageSquare,
  Droplet,
  UserCheck,
} from 'lucide-react';

export const DonorView: React.FC = () => {
  const {
    donors,
    requests,
    donorResponses,
    donorAssignments,
    respondToEmergency,
    setDonorAvailabilityState,
    currentUser,
    isOffline,
  } = useBloodStore();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'alerts' | 'commitments' | 'history'>('alerts');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Active donor session
  const activeDonor = donors.find((d) => d.email === currentUser?.email) || donors[0] || {
    id: currentUser?.id || 'demo-donor',
    fullName: currentUser?.fullName || 'Volunteer Donor',
    email: currentUser?.email || 'donor@example.com',
    phone: currentUser?.phone || '+91 98765 43210',
    bloodGroup: 'O+',
    city: 'Chennai',
    approxDistanceKm: 2.5,
    isAvailable: true,
    totalDonations: 0,
    lastDonatedAt: undefined,
  };

  const handleRespond = async (requestId: string, status: 'ACCEPTED' | 'DECLINED') => {
    setRespondingId(requestId);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });

    try {
      const res = await respondToEmergency(requestId, activeDonor.id, status, 'WEB');
      if (status === 'ACCEPTED') {
        if (res.success) {
          navigate('/communication');
        } else {
          setCardErrors((prev) => ({
            ...prev,
            [requestId]: res.error || 'Failed to accept emergency request.',
          }));
        }
      }
    } catch (err: any) {
      setCardErrors((prev) => ({
        ...prev,
        [requestId]: err?.message || 'Error responding to emergency request.',
      }));
    } finally {
      setRespondingId(null);
    }
  };

  // Clinical Eligibility evaluation
  const eligibility = evaluateDonorEligibility(activeDonor, 'Whole Blood');
  const isUndetermined = eligibility.reason === 'Unable to determine — blood centre assessment required';

  // Filter requests matching this donor clinically
  const activeRequests = requests.filter((r) => {
    if (r.status === 'FULFILLED' || r.status === 'CANCELLED' || r.status === 'EXPIRED') return false;
    const comp = isClinicallyCompatible(r.bloodGroup, activeDonor.bloodGroup, r.component);
    return comp.compatible;
  });

  // Active commitments for this donor
  const myAssignments = donorAssignments.filter(
    (a) => a.donorId === activeDonor.id && a.status === 'ASSIGNED'
  );

  const donorAvailabilityState: DonorAvailabilityState =
    activeDonor.availabilityState || (activeDonor.isAvailable ? 'AVAILABLE' : 'TEMPORARILY_UNAVAILABLE');

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Unified Healthcare Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Donor Workspace' },
        ]}
        roleBadge={{
          label: 'Volunteer Donor',
          variant: 'brand',
          icon: Heart,
        }}
        title="Volunteer Donor Emergency Hub"
        description="Review clinically compatible emergency requests in your area, manage your live dispatch readiness, and view confirmed hospital commitments."
        statusBadge={{
          label: activeDonor.isAvailable ? 'Ready for Dispatch' : 'Dispatch Paused',
          live: activeDonor.isAvailable && !isOffline,
        }}
        actions={
          <button
            type="button"
            onClick={() => navigate('/communication')}
            className="bg-app-surface hover:bg-app-muted text-app-text font-semibold text-xs sm:text-sm py-2 px-3.5 rounded-lg transition-colors border border-app-border flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-info shrink-0" />
            <span>Messages & Dispatch Chat</span>
          </button>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Compatible Emergencies"
          value={activeRequests.length}
          subtext={`In your radius for ${activeDonor.bloodGroup}`}
          icon={Bell}
          variant={activeRequests.length > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Confirmed Commitments"
          value={myAssignments.length}
          subtext="Active hospital allocations"
          icon={Activity}
          variant={myAssignments.length > 0 ? 'brand' : 'neutral'}
        />
        <StatCard
          label="Total Voluntary Donations"
          value={activeDonor.totalDonations || 0}
          subtext={activeDonor.lastDonatedAt ? `Last: ${new Date(activeDonor.lastDonatedAt).toLocaleDateString()}` : 'First-time responder'}
          icon={Droplet}
          variant="success"
        />
        <StatCard
          label="Interval Eligibility"
          value={
            isUndetermined
              ? 'Assessment Required'
              : eligibility.isEligible
              ? 'Interval-Eligible'
              : 'Interval Deferred'
          }
          subtext={
            isUndetermined
              ? 'Unable to determine — blood centre assessment required'
              : eligibility.isEligible
              ? 'NBTC safe interval satisfied'
              : eligibility.daysRemaining
              ? `${eligibility.daysRemaining} days remaining`
              : 'Interval pending'
          }
          icon={Award}
          variant={isUndetermined ? 'warning' : eligibility.isEligible ? 'success' : 'warning'}
        />
      </div>

      {/* Donor Clinical Profile & Eligibility Banner */}
      <div className="bg-app-surface border border-app-border rounded-xl p-5 sm:p-6 shadow-subtle space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand text-white flex items-center justify-center font-extrabold text-2xl shadow-xs font-display shrink-0">
              {activeDonor.bloodGroup}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-app-text font-display">
                  {activeDonor.fullName}
                </h2>
                <span className="text-[10px] font-bold bg-success-light text-success border border-success-border px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Verified Donor
                </span>
              </div>
              <p className="text-xs text-app-text-secondary">
                Registered in {activeDonor.city} • Safe Contact Relay Enabled
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-app-muted/60 p-3.5 rounded-lg border border-app-border text-xs max-w-md">
            <Award className="w-4 h-4 text-warning shrink-0" />
            <div>
              <span className="font-semibold text-app-text block">
                {isUndetermined
                  ? 'Unable to determine — blood centre assessment required'
                  : eligibility.isEligible
                  ? 'Interval-Eligible for Volunteer Dispatch'
                  : 'Donation Interval Active'}
              </span>
              <span className="text-[11px] text-app-text-secondary leading-normal block">
                {isUndetermined
                  ? 'NBTC 2023 guidelines require 90 days for male donors and 120 days for female donors for whole blood. Biological sex is unrecorded in this profile; final donation interval clearance, hemoglobin screening (≥12.5 g/dL), and physical vitals must be assessed on-site by blood centre pathologists.'
                  : eligibility.isEligible
                  ? 'Interval satisfied under NBTC guidelines. Final medical clearance, hemoglobin screening (≥12.5 g/dL), and cross-matching are determined on-site by accredited hospital pathologists.'
                  : eligibility.reason}
              </span>
            </div>
          </div>
        </div>

        {/* 3-State Availability Control */}
        <div className="pt-2">
          <AvailabilityToggle
            currentState={donorAvailabilityState}
            updatedAt={activeDonor.availabilityUpdatedAt}
            onSelectState={(state) => setDonorAvailabilityState(activeDonor.id, state)}
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-3">
        <div className="flex items-center gap-1.5 bg-app-muted p-1 rounded-lg text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`py-1.5 px-3.5 rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'alerts'
                ? 'bg-app-surface text-app-text shadow-xs font-bold'
                : 'text-app-text-secondary hover:text-app-text font-medium'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-brand" />
            <span>Emergency Alerts ({activeRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('commitments')}
            className={`py-1.5 px-3.5 rounded-md transition-all flex items-center gap-2 ${
              activeTab === 'commitments'
                ? 'bg-app-surface text-app-text shadow-xs font-bold'
                : 'text-app-text-secondary hover:text-app-text font-medium'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-success" />
            <span>Active Commitments ({myAssignments.length})</span>
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
            <Calendar className="w-3.5 h-3.5 text-app-text-secondary" />
            <span>Donation Records</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/communication')}
          className="text-xs font-semibold text-brand hover:text-brand-hover inline-flex items-center gap-1 self-end sm:self-auto"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Open Coordination Chat</span>
        </button>
      </div>

      {/* Tab 1: Nearby Matching Emergency Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {!activeDonor.isAvailable ? (
            <EmptyState
              icon={AlertCircle}
              variant="warning"
              title="Availability Status Currently Paused"
              description="Your profile is set to unavailable or paused. Toggle your availability to 'Available' above when you are ready to receive and respond to urgent hospital calls."
            />
          ) : activeRequests.length === 0 ? (
            <EmptyState
              icon={Heart}
              variant="success"
              title="No Active Emergency Calls in Your Vicinity"
              description="Thank you for standing by. There are currently no urgent transfusions matching your blood group in your area. You will receive an alert as soon as a hospital initiates an emergency dispatch."
            />
          ) : (
            <div className="space-y-4">
              {activeRequests.map((req) => {
                const prevResp = donorResponses.find(
                  (dr) => dr.requestId === req.id && dr.donorId === activeDonor.id
                );
                const hasResponded = prevResp?.responseStatus as 'ACCEPTED' | 'DECLINED' | undefined;
                const isAssigned = myAssignments.some((a) => a.requestId === req.id);

                return (
                  <EmergencyCard
                    key={req.id}
                    request={req}
                    approxDistanceKm={activeDonor.approxDistanceKm}
                    hasResponded={hasResponded}
                    isAssigned={isAssigned}
                    isLoading={respondingId === req.id}
                    errorMessage={cardErrors[req.id]}
                    onRespond={(status) => handleRespond(req.id, status)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Active Commitments / Assigned Donorships */}
      {activeTab === 'commitments' && (
        <div className="space-y-4">
          {myAssignments.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No Active Formal Coordinator Assignments"
              description="When a clinical coordinator assigns you to an accepted emergency request, hospital reporting instructions, appointment reference codes, and facility navigation details will appear here."
            />
          ) : (
            <div className="space-y-4">
              {myAssignments.map((asgn) => {
                const req = requests.find((r) => r.id === asgn.requestId);
                return (
                  <div
                    key={asgn.id}
                    className="bg-app-surface p-5 sm:p-6 rounded-xl border border-success-border shadow-subtle space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-app-border pb-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-success bg-success-light px-2.5 py-0.5 rounded-sm uppercase tracking-wider border border-success-border inline-block">
                          Confirmed by Clinical Coordinator
                        </span>
                        <h3 className="text-base font-bold text-app-text font-display">
                          {req?.hospitalName || 'Emergency Hospital Facility'}
                        </h3>
                        <p className="text-xs text-app-text-secondary">
                          {req?.hospitalAddress}, {req?.city}
                        </p>
                      </div>

                      <div className="sm:text-right">
                        <span className="font-mono text-xs font-bold bg-app-muted px-2.5 py-1 rounded-md border border-app-border inline-block">
                          {req?.referenceCode}
                        </span>
                        <span className="text-[10px] text-app-text-secondary block mt-1">
                          Quote upon arrival at blood bank
                        </span>
                      </div>
                    </div>

                    <div className="bg-app-muted/50 p-4 rounded-lg text-xs space-y-1.5 border border-app-border">
                      <strong className="block text-app-text font-bold">
                        Hospital Transfusion Center Arrival Guidelines:
                      </strong>
                      <p className="text-app-text-secondary leading-relaxed text-[11px]">
                        Please report directly to the Hospital Transfusion Center (Blood Bank Wing). Quote reference{' '}
                        <strong className="text-app-text">{req?.referenceCode}</strong>. Carry a valid government photo ID. A complimentary health check and hemoglobin screen will be performed on-site prior to donation.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-app-text-secondary font-medium">Assigned Requirement:</span>
                        <strong className="text-brand font-bold">{asgn.unitsAssigned} Unit(s)</strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate('/communication')}
                        className="text-xs font-semibold text-brand hover:text-brand-hover inline-flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Message Coordinator & Attendant</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Past Donation History */}
      {activeTab === 'history' && (
        <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-subtle space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="font-bold text-app-text text-sm font-display">Voluntary Donation Record</h3>
              <p className="text-app-text-secondary text-[11px]">Recorded voluntary donations and interval tracking</p>
            </div>
            <span className="text-app-text-secondary font-mono bg-app-muted px-2 py-0.5 rounded border border-app-border">
              {activeDonor.totalDonations || 0} Recorded
            </span>
          </div>

          {!activeDonor.lastDonatedAt && (!activeDonor.totalDonations || activeDonor.totalDonations === 0) ? (
            <EmptyState
              icon={Droplet}
              title="No Prior Donations Recorded"
              description="Your voluntary donation records will appear here after a hospital blood centre confirms completion of your donation."
            />
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-app-muted/40 border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-app-text block">
                    {activeDonor.lastDonatedComponent || 'Whole Blood'} Donation
                  </span>
                  <span className="text-[11px] text-app-text-secondary">
                    {isUndetermined
                      ? 'Logged for donor interval tracking (NBTC whole blood deferral assessment required at blood centre)'
                      : `Logged for donor interval tracking (NBTC ${activeDonor.gender || activeDonor.sex || 'clinical'} deferral window)`}
                  </span>
                </div>
                <span className="text-xs font-mono text-app-text-secondary bg-app-surface px-2.5 py-1 rounded border border-app-border self-start sm:self-auto">
                  {activeDonor.lastDonatedAt ? new Date(activeDonor.lastDonatedAt).toLocaleDateString() : 'Recorded in profile'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Strict Donor Privacy Guarantee Banner */}
      <div className="bg-app-surface p-4 sm:p-5 rounded-xl border border-app-border text-xs text-app-text-secondary flex items-start gap-3 shadow-subtle">
        <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong className="text-app-text block font-bold">Strict Donor Privacy Guarantee</strong>
          <p className="leading-relaxed">
            CareLoop coordinates emergency responses while keeping your personal telephone number and address strictly masked. Only verified hospital coordinators facilitate verified donor introductions.
          </p>
        </div>
      </div>
    </div>
  );
};
