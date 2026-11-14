import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Edit3,
  Save,
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  Phone,
} from 'lucide-react';

export type DonorTab =
  | 'overview'
  | 'matches'
  | 'notifications'
  | 'history'
  | 'communication'
  | 'availability'
  | 'profile';

const resolveTab = (tab: string | null): DonorTab => {
  if (!tab) return 'overview';
  if (tab === 'commitments') return 'history';
  const validTabs: DonorTab[] = [
    'overview',
    'matches',
    'notifications',
    'history',
    'communication',
    'availability',
    'profile',
  ];
  if (validTabs.includes(tab as DonorTab)) return tab as DonorTab;
  return 'overview';
};

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
    userDonorProfile,
    isRegisteredDonor,
    updateDonorContactInfo,
    requestClinicalCorrection,
  } = useBloodStore();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DonorTab>(() => resolveTab(searchParams.get('tab')));

  // Keep activeTab synchronized with searchParams
  useEffect(() => {
    const currentTabInUrl = searchParams.get('tab');
    const resolved = resolveTab(currentTabInUrl);
    if (resolved !== activeTab) {
      setActiveTab(resolved);
    }
  }, [searchParams]);

  const handleTabChange = (newTab: DonorTab) => {
    setActiveTab(newTab);
    setSearchParams({ tab: newTab }, { replace: true });
  };
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [selfDeferralDays, setSelfDeferralDays] = useState<number>(14);
  const [selfDeferralReason, setSelfDeferralReason] = useState<string>('Recent Dental / Travel');
  const [selfDeferralSuccess, setSelfDeferralSuccess] = useState<string | null>(null);

  // Active donor session - prioritize userDonorProfile if linked, then match by profileId or email
  const activeDonor =
    userDonorProfile ||
    donors.find(
      (d) =>
        (currentUser?.id && d.profileId === currentUser.id) ||
        (currentUser?.email && d.email === currentUser.email)
    ) || (demoExperience ? donors[0] : null);

  // Contact Info Editing State (Phase 3)
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactPhone, setContactPhone] = useState(activeDonor?.phone || '');
  const [contactCity, setContactCity] = useState(activeDonor?.city || '');
  const [contactDistrict, setContactDistrict] = useState(activeDonor?.district || '');
  const [contactStatus, setContactStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Clinical Correction Request State (Phase 3)
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionField, setCorrectionField] = useState('bloodGroup');
  const [correctionRequestedValue, setCorrectionRequestedValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionCertificateNotes, setCorrectionCertificateNotes] = useState('');
  const [correctionStatus, setCorrectionStatus] = useState<{ type: 'idle' | 'submitting' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Keep contact inputs synchronized if donor updates
  useEffect(() => {
    if (activeDonor) {
      setContactPhone(activeDonor.phone || '');
      setContactCity(activeDonor.city || '');
      setContactDistrict(activeDonor.district || '');
    }
  }, [activeDonor?.phone, activeDonor?.city, activeDonor?.district]);

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

  // Phase 3: Contact Info update handler
  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus({ type: 'saving' });

    const cleanPhone = contactPhone.trim();
    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 10) {
      setContactStatus({
        type: 'error',
        message: 'Please provide a valid phone number with at least 10 digits for emergency contact.',
      });
      return;
    }

    try {
      const res = await updateDonorContactInfo(activeDonor.id, {
        phone: cleanPhone,
        city: contactCity.trim(),
        district: contactDistrict.trim(),
      });

      if (res.success) {
        setContactStatus({
          type: 'success',
          message: 'Contact details successfully updated in clinical donor registry.',
        });
        setIsEditingContact(false);
      } else {
        setContactStatus({
          type: 'error',
          message: res.error || 'Failed to update contact details.',
        });
      }
    } catch (err: any) {
      setContactStatus({
        type: 'error',
        message: err?.message || 'Unexpected error updating contact details.',
      });
    }
  };

  // Phase 3: Clinical correction request handler
  const handleSubmitClinicalCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionRequestedValue.trim() || !correctionReason.trim()) {
      setCorrectionStatus({
        type: 'error',
        message: 'Please specify both the requested corrected value and the clinical justification.',
      });
      return;
    }

    setCorrectionStatus({ type: 'submitting' });
    try {
      const res = await requestClinicalCorrection(activeDonor.id, {
        field: correctionField,
        requestedValue: correctionRequestedValue.trim(),
        reason: correctionReason.trim(),
        certificateNotes: correctionCertificateNotes.trim() || undefined,
      });

      if (res.success) {
        setCorrectionStatus({
          type: 'success',
          message: res.message || 'Clinical correction request submitted for blood centre pathologist review.',
        });
        setTimeout(() => {
          setIsCorrectionModalOpen(false);
          setCorrectionStatus({ type: 'idle' });
          setCorrectionRequestedValue('');
          setCorrectionReason('');
          setCorrectionCertificateNotes('');
        }, 1800);
      } else {
        setCorrectionStatus({
          type: 'error',
          message: res.error || 'Failed to submit clinical correction request.',
        });
      }
    } catch (err: any) {
      setCorrectionStatus({
        type: 'error',
        message: err?.message || 'Unexpected error submitting correction request.',
      });
    }
  };

  // Clinical Eligibility evaluation
  const eligibility = evaluateDonorEligibility(activeDonor, 'Whole Blood');
  const isUndetermined = eligibility.reason === 'Unable to determine — blood centre assessment required';

  // Phase 4: Filter requests strictly matching this donor clinically and geographically
  const activeRequests = requests.filter((r) => {
    // 1. Exclude terminal states
    if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(r.status)) return false;

    // 2. Exclude requests created by the donor themselves
    if (currentUser?.id && r.createdBy === currentUser.id) return false;
    if (activeDonor?.profileId && r.createdBy === activeDonor.profileId) return false;

    // 3. Clinical compatibility (ABO / Rh / Component)
    const comp = isClinicallyCompatible(r.bloodGroup, activeDonor.bloodGroup, r.component);
    if (!comp.compatible) return false;

    // 4. Locality / Radius check (if city or district specified)
    if (r.city && activeDonor.city) {
      const cityMatch = r.city.trim().toLowerCase() === activeDonor.city.trim().toLowerCase();
      const districtMatch = r.district && activeDonor.district && r.district.trim().toLowerCase() === activeDonor.district.trim().toLowerCase();
      const distanceMatch =
        ((r as any).distanceKm !== undefined && (r as any).distanceKm <= 50) ||
        (activeDonor.approxDistanceKm !== undefined && activeDonor.approxDistanceKm <= 50);
      if (!cityMatch && !districtMatch && !distanceMatch) {
        return false;
      }
    }

    return true;
  });

  // Active commitments for this donor
  const myAssignments = donorAssignments.filter(
    (a) => a.donorId === activeDonor.id && a.status === 'ASSIGNED'
  );

  // Active conversations for this donor
  const myConversations = conversations.filter((c) => c.donorId === activeDonor.id);

  // Phase 4: Scoped and deduplicated notifications strictly for this donor
  const allNotifs = notificationService.getNotificationLogs();
  const myNotifications = allNotifs.filter((n) => {
    if (!n.userId) return true; // System broadcast
    return (
      n.userId === activeDonor.id ||
      n.userId === activeDonor.profileId ||
      (currentUser?.id && n.userId === currentUser.id) ||
      (n.metadata?.donor_id && n.metadata.donor_id === activeDonor.id) ||
      (n.metadata?.recipient_user_id && n.metadata.recipient_user_id === currentUser?.id)
    );
  });

  // Deduplicate notifications by stable key
  const seenNotifKeys = new Set<string>();
  const deduplicatedNotifications = myNotifications.filter((n) => {
    const key = n.id || `${n.requestId || 'gen'}-${n.channel}-${n.title}-${n.timestamp}`;
    if (seenNotifKeys.has(key)) return false;
    seenNotifKeys.add(key);
    return true;
  });

  const filteredNotifications =
    notificationFilter === 'UNREAD'
      ? deduplicatedNotifications.filter((n) => n.status !== 'ACKNOWLEDGED')
      : deduplicatedNotifications;

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

      {/* Mobile Donor Quick Card (Answering 6 Core Questions Immediately Without Stat Bloat) */}
      <div className="block sm:hidden bg-app-surface border border-app-border rounded-2xl p-4 shadow-subtle space-y-4">
        {/* 1. Am I registered? Status, Blood Group & Availability */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-brand text-white flex items-center justify-center font-black text-xl shadow-xs font-display shrink-0">
              {activeDonor.bloodGroup}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-app-text font-display truncate">
                  {activeDonor.fullName}
                </span>
                <span className="text-[9px] font-bold bg-success-light text-success border border-success-border px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 shrink-0">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Registered
                </span>
              </div>
              <p className="text-[11px] text-app-text-secondary truncate">
                {activeDonor.city || 'Emergency Dispatch'} • {livesImpacted} Lives Saved
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                activeDonor.isAvailable
                  ? 'bg-success-light text-success border-success-border'
                  : 'bg-warning-light text-warning-dark border-warning-border'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeDonor.isAvailable ? 'bg-success animate-pulse' : 'bg-warning-dark'}`} />
              {activeDonor.isAvailable ? 'Ready' : 'Paused'}
            </span>
          </div>
        </div>

        {/* 2. Am I currently available? Immediate Toggle */}
        <div className="pt-0.5">
          <AvailabilityToggle
            currentState={donorAvailabilityState}
            updatedAt={activeDonor.availabilityUpdatedAt}
            onSelectState={(state) => setDonorAvailabilityState(activeDonor.id, state)}
          />
        </div>

        {/* 3 & 4. Emergencies matching my blood & Action I can take right now */}
        {activeRequests.length > 0 ? (
          <div className="bg-brand/5 border border-brand/20 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-brand block truncate">
                  {activeRequests.length} Urgent {activeRequests.length === 1 ? 'Emergency' : 'Emergencies'} Near You
                </span>
                <span className="text-[10px] text-app-text-secondary truncate block">
                  Compatible with {activeDonor.bloodGroup} in your area
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange('matches')}
              className="px-3 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold shrink-0 transition-colors inline-flex items-center gap-1 shadow-xs"
            >
              <span>Respond</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="bg-success-light/40 border border-success-border rounded-xl p-3 flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-success block">On Standby • No Immediate Calls</span>
              <span className="text-[10px] text-app-text-secondary block">
                Instant alerts will be dispatched when blood is requested.
              </span>
            </div>
          </div>
        )}

        {/* 5 & 6. Where can I update my profile / see previous activity? */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-app-border">
          <button
            type="button"
            onClick={() => handleTabChange('profile')}
            className="py-2 px-2.5 rounded-lg bg-app-muted hover:bg-app-border text-app-text text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <User className="w-3.5 h-3.5 text-app-text-secondary shrink-0" />
            <span className="truncate">Edit Profile</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('history')}
            className="py-2 px-2.5 rounded-lg bg-app-muted hover:bg-app-border text-app-text text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Droplet className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="truncate">Donations ({activeDonor.totalDonations || 0})</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row (Desktop / Tablet only to prevent mobile bloat) */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto no-scrollbar scroll-smooth">
        {[
          { id: 'overview', label: 'Overview', icon: Heart },
          { id: 'matches', label: `Matching Requests (${activeRequests.length})`, icon: Bell },
          { id: 'notifications', label: `Notifications (${deduplicatedNotifications.length})`, icon: Activity },
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
              onClick={() => handleTabChange(t.id as DonorTab)}
              className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
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
          {/* Hero Profile Status Card (Desktop only since Mobile Quick Card covers identity) */}
          <div className="hidden sm:block bg-app-surface border border-app-border rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
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

          {/* Interval Status Banner (Mobile-specific concise view) */}
          <div className="block sm:hidden bg-app-surface border border-app-border rounded-xl p-3.5 shadow-subtle flex items-start gap-2.5 text-xs">
            <Award className="w-4 h-4 text-warning-dark shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-app-text block">
                {isUndetermined
                  ? 'Interval Assessment Required'
                  : eligibility.isEligible
                  ? 'Interval-Eligible for Transfusion'
                  : 'Donation Interval Active'}
              </span>
              <p className="text-[10px] text-app-text-secondary leading-relaxed mt-0.5">
                {isUndetermined
                  ? 'NBTC interval clearance and vitals will be checked on-site by blood centre staff.'
                  : eligibility.isEligible
                  ? 'Safe interval satisfied under NBTC guidelines. Vitals verified on-site.'
                  : eligibility.reason}
              </p>
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
                  onClick={() => handleTabChange('matches')}
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

      {/* TAB 7: CLINICAL PROFILE & SPECS (PHASE 3) */}
      {activeTab === 'profile' && (
        <div className="space-y-6 animate-fade-in text-xs">
          {/* Card 1: Contact Information (Editable with inline Edit/Save/Cancel) */}
          <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-app-border gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand" />
                  <h3 className="text-sm font-bold text-app-text font-display">
                    Contact & Geographical Information
                  </h3>
                </div>
                <p className="text-[11px] text-app-text-secondary mt-0.5">
                  Used exclusively by hospital coordinators for emergency dispatch routing.
                </p>
              </div>

              {!isEditingContact ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingContact(true);
                    setContactStatus({ type: 'idle' });
                  }}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-app-border bg-app-surface hover:bg-app-muted text-app-text font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5 text-brand" />
                  <span>Edit Contact Details</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingContact(false);
                      setContactPhone(activeDonor.phone || '');
                      setContactCity(activeDonor.city || '');
                      setContactDistrict(activeDonor.district || '');
                      setContactStatus({ type: 'idle' });
                    }}
                    disabled={contactStatus.type === 'saving'}
                    className="px-3 py-1.5 rounded-lg border border-app-border bg-app-muted text-app-text font-semibold text-xs flex items-center gap-1 hover:bg-app-muted/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveContactInfo}
                    disabled={contactStatus.type === 'saving'}
                    className="px-3.5 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    {contactStatus.type === 'saving' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{contactStatus.type === 'saving' ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              )}
            </div>

            {contactStatus.type === 'error' && (
              <div className="p-3 rounded-lg bg-red-50 text-emergency border border-red-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{contactStatus.message}</span>
              </div>
            )}

            {contactStatus.type === 'success' && (
              <div className="p-3 rounded-lg bg-success-light text-success border border-success-border text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{contactStatus.message}</span>
              </div>
            )}

            {isEditingContact ? (
              <form onSubmit={handleSaveContactInfo} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                    Contact Phone Number <span className="text-emergency">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    required
                    className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text font-mono text-xs focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                  <span className="text-[10px] text-app-text-secondary mt-1 block">Masked from recipients</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                    Primary City <span className="text-emergency">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactCity}
                    onChange={(e) => setContactCity(e.target.value)}
                    placeholder="e.g. Hyderabad"
                    required
                    className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text text-xs focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                    Administrative District
                  </label>
                  <input
                    type="text"
                    value={contactDistrict}
                    onChange={(e) => setContactDistrict(e.target.value)}
                    placeholder="e.g. Hyderabad District"
                    className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text text-xs focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-app-text-secondary">Emergency Phone</span>
                  <p className="text-sm font-bold text-app-text font-mono">{activeDonor.phone || 'Not recorded'}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-app-text-secondary">Primary City</span>
                  <p className="text-sm font-bold text-app-text">{activeDonor.city || 'Not recorded'}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-app-text-secondary">District</span>
                  <p className="text-sm font-bold text-app-text">{activeDonor.district || activeDonor.city || 'Not recorded'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Verified Clinical Specifications (LOCKED) */}
          <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-app-border gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success" />
                <div>
                  <h3 className="text-sm font-bold text-app-text font-display flex items-center gap-2">
                    <span>Locked Clinical Specifications</span>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Pathology-Locked
                    </span>
                  </h3>
                  <p className="text-[11px] text-app-text-secondary mt-0.5">
                    Critical clinical parameters are locked to prevent accidental or fraudulent mismatch.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCorrectionModalOpen(true);
                  setCorrectionStatus({ type: 'idle' });
                }}
                className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg border border-brand/40 bg-brand/5 hover:bg-brand/10 text-brand font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Request Clinical Correction</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1 relative">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary flex items-center justify-between">
                  <span>Blood Group</span>
                  <Lock className="w-3 h-3 text-app-text-secondary" />
                </span>
                <p className="text-2xl font-black text-brand font-display">{activeDonor.bloodGroup}</p>
                <span className="text-[10px] text-app-text-secondary block">ABO / Rh Confirmed</span>
              </div>

              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1 relative">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary flex items-center justify-between">
                  <span>Body Weight</span>
                  <Lock className="w-3 h-3 text-app-text-secondary" />
                </span>
                <p className="text-xl font-bold text-app-text font-mono">
                  {activeDonor.weightKg ? `${activeDonor.weightKg} kg` : '≥ 45 kg (Screened)'}
                </p>
                <span className="text-[10px] text-app-text-secondary block">Min NBTC requirement: 45 kg</span>
              </div>

              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1 relative">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary flex items-center justify-between">
                  <span>Biological Sex</span>
                  <Lock className="w-3 h-3 text-app-text-secondary" />
                </span>
                <p className="text-sm font-bold text-app-text">
                  {activeDonor.sex || activeDonor.gender || 'Assessment Required'}
                </p>
                <span className="text-[10px] text-app-text-secondary block">Governs 90d/120d safe interval</span>
              </div>

              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1 relative">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary flex items-center justify-between">
                  <span>Clinical Clearance</span>
                  <CheckCircle2 className="w-3 h-3 text-success" />
                </span>
                <p className="text-sm font-bold text-success">CLINICALLY_VERIFIED</p>
                <span className="text-[10px] text-app-text-secondary block">Donor Registry Active</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-info-light border border-info-border text-info text-[11px] flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-info" />
              <div>
                <strong className="block text-app-text font-bold">Healthcare Integrity Safeguard</strong>
                <p className="leading-relaxed text-app-text-secondary">
                  To protect recipient lives, medical specifications cannot be directly overwritten from the web browser. Submitting a correction request sends an audit notification to blood centre pathologists and administrative coordinators.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: System-Managed Eligibility & NBTC 2023 Guidelines */}
          <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-app-border">
              <Award className="w-4 h-4 text-warning-dark" />
              <div>
                <h3 className="text-sm font-bold text-app-text font-display">
                  System-Managed Clinical Eligibility (NBTC 2023 Standards)
                </h3>
                <p className="text-[11px] text-app-text-secondary mt-0.5">
                  Automated interval gating and mandatory hospital arrival protocols.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary">Interval Clearance</span>
                <p className={`text-base font-bold ${eligibility.isEligible ? 'text-success' : 'text-warning-dark'}`}>
                  {isUndetermined
                    ? 'Assessment Required'
                    : eligibility.isEligible
                    ? 'Interval Cleared'
                    : `${eligibility.daysRemaining || 0} Days Remaining`}
                </p>
                <p className="text-[10px] text-app-text-secondary">
                  {eligibility.reason || 'Calculated from last recorded donation'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary">Hemoglobin Requirement</span>
                <p className="text-base font-bold text-app-text font-mono">≥ 12.5 g/dL</p>
                <p className="text-[10px] text-app-text-secondary">
                  Mandatory rapid copper sulfate / photometric test on hospital arrival
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary">Vital Signs Gating</span>
                <p className="text-base font-bold text-app-text font-mono">BP & Pulse Verified</p>
                <p className="text-[10px] text-app-text-secondary">
                  Systolic 100–140 mmHg, diastolic 60–90 mmHg, pulse 60–100 bpm
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-app-border bg-app-muted/30 text-[11px] text-app-text-secondary space-y-1.5">
              <strong className="text-app-text block">National Blood Transfusion Council (NBTC) Minimum Intervals:</strong>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>• Whole Blood (Male): 90 days (max 4 times/yr)</div>
                <div>• Whole Blood (Female): 120 days (max 3 times/yr)</div>
                <div>• Single Donor Platelets (Apheresis): 14 days (max 24 times/yr)</div>
                <div>• Apheresis Plasma: 28 days</div>
              </div>
            </div>
          </div>

          {/* Card 4: Voluntary Donation Log */}
          <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold text-app-text font-display">
                  Voluntary Donation History & Clinical Log
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-brand bg-brand-light px-2.5 py-0.5 rounded-md border border-brand/20">
                {activeDonor.totalDonations || 0} Recorded Donation(s)
              </span>
            </div>

            <div className="p-4 rounded-xl bg-app-muted/30 border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-app-text block text-sm">
                  {activeDonor.lastDonatedComponent || 'Whole Blood'} Donation
                </span>
                <span className="text-[11px] text-app-text-secondary">
                  Recorded in CareLoop Clinical Transfusion Registry for biological interval compliance.
                </span>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[10px] uppercase font-bold text-app-text-secondary block">Last Donated Date</span>
                <span className="font-mono text-xs font-bold text-app-text bg-app-surface px-2.5 py-1 rounded border border-app-border inline-block mt-0.5">
                  {activeDonor.lastDonatedAt ? new Date(activeDonor.lastDonatedAt).toLocaleDateString() : 'Verified on file'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clinical Correction Modal Dialog */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-app-text font-display">
                    Request Clinical Data Correction
                  </h3>
                  <p className="text-[11px] text-app-text-secondary">
                    Changes require validation by an accredited blood centre.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="text-app-text-secondary hover:text-app-text p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {correctionStatus.type === 'error' && (
              <div className="p-3 rounded-lg bg-red-50 text-emergency border border-red-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{correctionStatus.message}</span>
              </div>
            )}

            {correctionStatus.type === 'success' && (
              <div className="p-3 rounded-lg bg-success-light text-success border border-success-border text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{correctionStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmitClinicalCorrection} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                  Field Requiring Correction <span className="text-emergency">*</span>
                </label>
                <select
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text font-semibold"
                >
                  <option value="bloodGroup">Blood Group (Currently: {activeDonor.bloodGroup})</option>
                  <option value="weightKg">Body Weight (Currently: {activeDonor.weightKg ? `${activeDonor.weightKg} kg` : 'Unspecified'})</option>
                  <option value="biologicalSex">Biological Sex (Male / Female)</option>
                  <option value="lastDonatedAt">Last Donation Date</option>
                  <option value="other">Other Clinical Parameter</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                  Requested Correct Value <span className="text-emergency">*</span>
                </label>
                <input
                  type="text"
                  value={correctionRequestedValue}
                  onChange={(e) => setCorrectionRequestedValue(e.target.value)}
                  placeholder="e.g. O+ or 65 kg"
                  required
                  className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                  Clinical Justification / Reason <span className="text-emergency">*</span>
                </label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Please state why this field needs correction (e.g., initial typing error, re-confirmed by blood bank lab report)."
                  required
                  className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text-secondary uppercase mb-1">
                  Lab / Blood Centre Certificate Reference (Optional)
                </label>
                <input
                  type="text"
                  value={correctionCertificateNotes}
                  onChange={(e) => setCorrectionCertificateNotes(e.target.value)}
                  placeholder="e.g. Red Cross Hyderabad Lab Report #RC-2026-991"
                  className="w-full p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  disabled={correctionStatus.type === 'submitting'}
                  className="px-4 py-2 rounded-lg border border-app-border bg-app-surface text-app-text font-semibold text-xs hover:bg-app-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionStatus.type === 'submitting'}
                  className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  {correctionStatus.type === 'submitting' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{correctionStatus.type === 'submitting' ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
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
