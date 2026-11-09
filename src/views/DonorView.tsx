import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { AvailabilityToggle } from '../components/donor/AvailabilityToggle';
import { EmergencyCard } from '../components/donor/EmergencyCard';
import { DonorOnboardingModal } from '../components/donor/DonorOnboardingModal';
import {
  evaluateDonorEligibility,
  isClinicallyCompatible,
  DONATION_INTERVAL_DAYS,
  NBTC_2023_INTERVALS,
} from '../services/matchingEngine';
import { notificationService } from '../services/notificationService';
import { smsNotificationService } from '../services/smsNotificationService';
import { DonorAvailabilityState, BloodGroup, BloodComponent } from '../types';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import {
  Bell,
  ShieldCheck,
  ShieldAlert,
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
  Sliders,
  User,
  MapPin,
  PhoneCall,
  Check,
  XCircle,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';

export type DonorTab =
  | 'overview'
  | 'matches'
  | 'notifications'
  | 'history'
  | 'communication'
  | 'availability'
  | 'profile';

export const DonorView: React.FC = () => {
  const {
    donors,
    requests,
    donorResponses,
    donorAssignments,
    conversations,
    respondToEmergency,
    setDonorAvailabilityState,
    currentUser,
    demoExperience,
    isOffline,
  } = useBloodStore();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DonorTab>('overview');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [selfDeferralDays, setSelfDeferralDays] = useState<number>(14);
  const [selfDeferralReason, setSelfDeferralReason] = useState<string>('Recent Dental / Travel');
  const [selfDeferralSuccess, setSelfDeferralSuccess] = useState<string | null>(null);

  // Active donor session - resolve strictly to authenticated user's linked donor record
  const activeDonor =
    donors.find(
      (d) =>
        (currentUser?.id && d.profileId === currentUser.id) ||
        (currentUser?.email && d.email === currentUser.email)
    ) || (demoExperience ? donors[0] : null);

  // Unlinked or unonboarded user view
  if (!activeDonor) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6 animate-fade-in">
        <WorkspaceHeader
          breadcrumbs={[
            { label: 'CareLoop', href: '/' },
            { label: 'Donor Workspace' },
          ]}
          roleBadge={{
            label: 'Volunteer Donor Portal',
            variant: 'brand',
            icon: Heart,
          }}
          title="Volunteer Donor Workspace"
          description="Clinical donor verification and emergency blood coordination hub."
        />

        <div className="bg-app-surface border border-app-border rounded-2xl p-8 sm:p-12 text-center space-y-6 shadow-subtle">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mx-auto border border-brand/20">
            <UserCheck className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-bold text-app-text font-display">
              No Donor Profile Linked Yet
            </h2>
            <p className="text-xs sm:text-sm text-app-text-secondary leading-relaxed">
              Your account ({currentUser?.email || 'Logged In'}) is not yet registered as a volunteer blood donor in the CareLoop clinical registry, or your registration is awaiting verification.
            </p>
          </div>

          <div className="bg-app-muted/50 p-4 rounded-xl border border-app-border max-w-lg mx-auto text-left text-xs space-y-2">
            <div className="flex items-center gap-2 text-app-text font-medium">
              <ShieldAlert className="w-4 h-4 text-brand shrink-0" />
              <span>Clinical Registry Requirements (NBTC 2023)</span>
            </div>
            <p className="text-app-text-secondary text-[11px] leading-relaxed">
              To respond to emergency blood alerts, volunteer donors must submit clinical onboarding details including age (18–65), minimum body weight (≥45 kg), biological sex for interval validation (90 days male / 120 days female), and recent donation history.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsOnboardingModalOpen(true)}
              className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 px-6 rounded-lg text-xs sm:text-sm transition-colors shadow-sm inline-flex items-center justify-center gap-2"
            >
              <Heart className="w-4 h-4" />
              <span>Complete Donor Onboarding</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/patient')}
              className="w-full sm:w-auto bg-app-surface hover:bg-app-muted border border-app-border text-app-text font-medium py-2.5 px-5 rounded-lg text-xs sm:text-sm transition-colors"
            >
              <span>Go to Patient Workspace</span>
            </button>
          </div>
        </div>

        <DonorOnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() => setIsOnboardingModalOpen(false)}
        />
      </div>
    );
  }

  const handleRespond = async (requestId: string, status: 'ACCEPTED' | 'DECLINED') => {
    setRespondingId(requestId);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });

    try {
      const res = await respondToEmergency(requestId, activeDonor.id, status, 'WEB');
      // Synchronize in-app response with any matching SMS tokens
      smsNotificationService.syncInAppActionToTokens(requestId, activeDonor.id, status);

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

  // Handle Self Deferral
  const handleApplySelfDeferral = () => {
    const untilDate = new Date(Date.now() + selfDeferralDays * 24 * 3600 * 1000).toLocaleDateString();
    setDonorAvailabilityState(activeDonor.id, 'TEMPORARILY_UNAVAILABLE');
    setSelfDeferralSuccess(`Self-deferral active for ${selfDeferralDays} days until ${untilDate} (${selfDeferralReason}).`);
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

  // Active conversations for this donor
  const myConversations = conversations.filter((c) => c.donorId === activeDonor.id);

  // Notifications for this donor
  const allNotifs = notificationService.getNotificationLogs();
  const myNotifications = allNotifs.filter(
    (n) => !n.userId || n.userId === activeDonor.id || n.userId === activeDonor.profileId
  );
  const filteredNotifications =
    notificationFilter === 'UNREAD'
      ? myNotifications.filter((n) => n.status !== 'ACKNOWLEDGED')
      : myNotifications;

  const donorAvailabilityState: DonorAvailabilityState =
    activeDonor.availabilityState || (activeDonor.isAvailable ? 'AVAILABLE' : 'TEMPORARILY_UNAVAILABLE');

  const livesImpacted = (activeDonor.totalDonations || 1) * 3;

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Workspace Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Donor Workspace' },
        ]}
        roleBadge={{
          label: 'Volunteer Donor Portal',
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

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Compatible Emergencies"
          value={activeRequests.length}
          subtext={`In your radius for ${activeDonor.bloodGroup}`}
          icon={Bell}
          variant={activeRequests.length > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Total Voluntary Donations"
          value={activeDonor.totalDonations || 0}
          subtext="Verified clinical records"
          icon={Droplet}
          variant="success"
        />
        <StatCard
          label="Estimated Lives Impacted"
          value={livesImpacted}
          subtext="3 lives saved per unit"
          icon={Heart}
          variant="brand"
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
              ? 'NBTC whole blood sex check'
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

      {/* 7 Dedicated Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: Heart },
          { id: 'matches', label: `Matching Requests (${activeRequests.length})`, icon: Bell },
          { id: 'notifications', label: `Notifications (${myNotifications.length})`, icon: Activity },
          { id: 'history', label: 'My Donations', icon: Droplet },
          { id: 'communication', label: `Communication (${myConversations.length})`, icon: MessageSquare },
          { id: 'availability', label: 'Availability & Intervals', icon: Sliders },
          { id: 'profile', label: 'Clinical Profile', icon: User },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as DonorTab)}
              className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'bg-brand text-white shadow-xs font-bold'
                  : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Hero Profile Status Card */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-brand text-white flex items-center justify-center font-black text-2xl shadow-subtle font-display shrink-0">
                  {activeDonor.bloodGroup}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-app-text font-display">
                      {activeDonor.fullName}
                    </h2>
                    <span className="text-[10px] font-bold bg-success-light text-success border border-success-border px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified Donor
                    </span>
                  </div>
                  <p className="text-xs text-app-text-secondary">
                    Registered in {activeDonor.city} • Standby Emergency Response Network
                  </p>
                </div>
              </div>

              {/* 3-State Availability Toggle */}
              <div className="pt-2 md:pt-0">
                <AvailabilityToggle
                  currentState={donorAvailabilityState}
                  updatedAt={activeDonor.availabilityUpdatedAt}
                  onSelectState={(state) => setDonorAvailabilityState(activeDonor.id, state)}
                />
              </div>
            </div>

            {/* Interval Status Banner */}
            <div className="bg-app-muted/50 p-4 rounded-xl border border-app-border flex items-start gap-3 text-xs">
              <Award className="w-4 h-4 text-warning-dark shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-app-text block">
                  {isUndetermined
                    ? 'Interval Assessment Required'
                    : eligibility.isEligible
                    ? 'Interval-Eligible for Volunteer Transfusion'
                    : 'Donation Interval Active'}
                </span>
                <p className="text-[11px] text-app-text-secondary leading-relaxed mt-0.5">
                  {isUndetermined
                    ? 'NBTC 2023 guidelines require 90 days for male donors and 120 days for female donors for whole blood. Biological sex is unrecorded in this profile; final donation interval clearance, hemoglobin screening (≥12.5 g/dL), and physical vitals must be assessed on-site by blood centre pathologists.'
                    : eligibility.isEligible
                    ? 'Interval satisfied under NBTC guidelines. Final medical clearance, hemoglobin screening (≥12.5 g/dL), and cross-matching are determined on-site by accredited hospital pathologists.'
                    : eligibility.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Urgent Needs Near You Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Urgent Needs Matching Your Profile ({activeRequests.length})
              </h3>
              {activeRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('matches')}
                  className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1"
                >
                  <span>View All Matches</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeRequests.length === 0 ? (
              <EmptyState
                icon={Heart}
                variant="success"
                title="No Active Emergency Calls in Your Vicinity"
                description="Thank you for standing by. There are currently no urgent transfusions matching your blood group in your area. You will receive an instant alert as soon as a hospital initiates an emergency dispatch."
              />
            ) : (
              <div className="space-y-3">
                {activeRequests.slice(0, 3).map((req) => (
                  <EmergencyCard
                    key={req.id}
                    request={req}
                    approxDistanceKm={activeDonor.approxDistanceKm}
                    isLoading={respondingId === req.id}
                    errorMessage={cardErrors[req.id]}
                    onRespond={(status) => handleRespond(req.id, status)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MATCHING REQUESTS */}
      {activeTab === 'matches' && (
        <div className="space-y-4 animate-fade-in">
          {!activeDonor.isAvailable ? (
            <EmptyState
              icon={AlertCircle}
              variant="warning"
              title="Availability Status Currently Paused"
              description="Your profile is set to unavailable or paused. Toggle your availability to 'Available' in the overview tab when you are ready to receive and respond to urgent hospital calls."
            />
          ) : activeRequests.length === 0 ? (
            <EmptyState
              icon={Heart}
              variant="success"
              title="No Matching Requests Active"
              description="There are currently no open emergency requests matching your blood group."
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

      {/* TAB 3: NOTIFICATIONS CENTRE */}
      {activeTab === 'notifications' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Emergency Notifications & Multi-channel Alerts
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Real-time in-app alerts and carrier delivery confirmations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotificationFilter('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                  notificationFilter === 'ALL'
                    ? 'bg-brand text-white'
                    : 'bg-app-muted text-app-text-secondary'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setNotificationFilter('UNREAD')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                  notificationFilter === 'UNREAD'
                    ? 'bg-brand text-white'
                    : 'bg-app-muted text-app-text-secondary'
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-app-text-secondary">
              No notifications to display.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 hover:bg-app-muted/40 transition-colors flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold bg-brand-light text-brand px-2 py-0.5 rounded">
                        {n.channel}
                      </span>
                      <strong className="text-app-text">{n.title}</strong>
                    </div>
                    <p className="text-app-text-secondary text-[11px] leading-relaxed">{n.content}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-app-muted border border-app-border shrink-0">
                    {n.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MY DONATIONS & DIGITAL CERTIFICATE */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-fade-in">
          {/* Digital Donor Recognition Card */}
          <div className="bg-gradient-to-r from-brand to-brand-dark text-white rounded-2xl p-6 sm:p-8 shadow-subtle relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span className="text-xs uppercase font-extrabold tracking-wider opacity-90">
                  CareLoop Clinical Blood Network
                </span>
              </div>
              <span className="font-mono text-xs opacity-75">ID: {activeDonor.id}</span>
            </div>

            <div className="relative z-10 space-y-1">
              <h2 className="text-2xl font-black font-display tracking-tight">
                {activeDonor.fullName}
              </h2>
              <p className="text-xs opacity-85">
                Certified Volunteer Blood Donor • Blood Group <strong className="text-white text-base">{activeDonor.bloodGroup}</strong>
              </p>
            </div>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs relative z-10">
              <span>Total Recorded Donations: <strong>{activeDonor.totalDonations || 0}</strong></span>
              <span>Lives Touched: <strong>{livesImpacted}</strong></span>
            </div>
          </div>

          {/* Past Records */}
          <div className="bg-app-surface p-6 rounded-2xl border border-app-border shadow-subtle space-y-4 text-xs">
            <h3 className="font-bold text-app-text text-sm font-display">
              Voluntary Donation Log
            </h3>
            <div className="p-4 rounded-xl bg-app-muted/30 border border-app-border flex items-center justify-between">
              <div>
                <span className="font-bold text-app-text block">
                  {activeDonor.lastDonatedComponent || 'Whole Blood'} Donation
                </span>
                <span className="text-[11px] text-app-text-secondary">
                  Logged for clinical interval evaluation under NBTC 2023 guidelines.
                </span>
              </div>
              <span className="font-mono text-xs text-app-text font-bold bg-app-surface px-2.5 py-1 rounded border border-app-border">
                {activeDonor.lastDonatedAt ? new Date(activeDonor.lastDonatedAt).toLocaleDateString() : 'Verified'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVE COMMUNICATION */}
      {activeTab === 'communication' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Private Patient–Donor Communication Channels
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Encrypted coordination chat and WebRTC audio call history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/communication')}
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors inline-flex items-center gap-1 shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Launch Full Chat</span>
            </button>
          </div>

          {myConversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-app-text-secondary">
              No private conversations yet. Accepting an emergency alert establishes an encrypted channel with the patient and coordinator.
            </div>
          ) : (
            <div className="space-y-3">
              {myConversations.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl border border-app-border bg-app-muted/20 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] font-bold bg-app-muted px-2 py-0.5 rounded border border-app-border">
                      {c.id}
                    </span>
                    <p className="font-bold text-app-text">Emergency Coordination Channel</p>
                    <p className="text-[11px] text-app-text-secondary">Status: {c.status}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/communication')}
                    className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: AVAILABILITY & INTERVAL TRACKING */}
      {activeTab === 'availability' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-6 animate-fade-in text-xs">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-sm font-bold text-app-text font-display">
              Availability & Deferral Management
            </h3>
            <p className="text-[11px] text-app-text-secondary mt-0.5">
              Temporarily pause alerts during travel or medical procedures.
            </p>
          </div>

          {selfDeferralSuccess && (
            <div className="p-3.5 rounded-xl bg-success-light border border-success-border text-success flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{selfDeferralSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelfDeferralSuccess(null)}
                className="font-bold text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Self Deferral Control */}
          <div className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-3">
            <span className="font-bold text-app-text block">Self-Report Temporary Deferral</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-app-text-secondary mb-1">Deferral Duration</label>
                <select
                  value={selfDeferralDays}
                  onChange={(e) => setSelfDeferralDays(parseInt(e.target.value) || 14)}
                  className="w-full p-2 rounded-lg border border-app-border bg-app-surface text-app-text font-semibold"
                >
                  <option value={7}>7 Days (Minor Cold / Fatigue)</option>
                  <option value={14}>14 Days (Dental Procedure / Travel)</option>
                  <option value={30}>30 Days (Medication / Piercing)</option>
                  <option value={90}>90 Days (Recent Tattoo / Surgery)</option>
                </select>
              </div>

              <div>
                <label className="block text-app-text-secondary mb-1">Reason for Records</label>
                <input
                  type="text"
                  value={selfDeferralReason}
                  onChange={(e) => setSelfDeferralReason(e.target.value)}
                  className="w-full p-2 rounded-lg border border-app-border bg-app-surface text-app-text"
                />
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleApplySelfDeferral}
                className="px-4 py-2 rounded-xl bg-warning-dark text-white font-bold hover:bg-warning-dark/90 transition-colors shadow-xs"
              >
                Activate Temporary Deferral
              </button>
            </div>
          </div>

          {/* Clinical Interval Timeline */}
          <div className="p-4 rounded-xl border border-app-border bg-app-muted/20 space-y-2">
            <strong className="text-app-text block">NBTC 2023 Biological Interval Rules:</strong>
            <ul className="list-disc pl-5 space-y-1 text-app-text-secondary text-[11px]">
              <li>Whole Blood (Male): 90 days between donations</li>
              <li>Whole Blood (Female): 120 days between donations</li>
              <li>Packed RBC (Apheresis): 112 days (16 weeks)</li>
              <li>Platelets (Apheresis): 14 days (every 2 weeks)</li>
              <li>Plasma (Apheresis): 28 days (every 4 weeks)</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 7: CLINICAL PROFILE & SPECS */}
      {activeTab === 'profile' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-5 animate-fade-in text-xs">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-sm font-bold text-app-text font-display">
              Clinical Donor Specifications
            </h3>
            <p className="text-[11px] text-app-text-secondary mt-0.5">
              Verified clinical metrics and contact parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary">Blood Group</span>
              <p className="text-xl font-black text-brand font-display">{activeDonor.bloodGroup}</p>
            </div>

            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary">Body Weight</span>
              <p className="text-xl font-bold text-app-text font-mono">
                {activeDonor.weightKg ? `${activeDonor.weightKg} kg` : '≥45 kg (Verified)'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary">Primary City</span>
              <p className="text-sm font-bold text-app-text">{activeDonor.city}</p>
            </div>

            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary">On-Site Hemoglobin Protocol</span>
              <p className="text-sm font-semibold text-success">Screened ≥ 12.5 g/dL upon hospital arrival</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-info-light border border-info-border text-info text-[11px] flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Healthcare Data Integrity:</strong> To modify your verified blood group or clinical medical records, a certificate from an accredited blood centre pathologist is required.
            </span>
          </div>
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

      <DonorOnboardingModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
};
