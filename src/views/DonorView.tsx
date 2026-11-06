import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { AvailabilityToggle } from '../components/donor/AvailabilityToggle';
import { EmergencyCard } from '../components/donor/EmergencyCard';
import { evaluateDonorEligibility, isClinicallyCompatible } from '../services/matchingEngine';
import { DonorAvailabilityState } from '../types';
import {
  Users,
  Bell,
  ShieldCheck,
  Heart,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Activity,
  Award,
  MessageSquare,
  ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DonorView: React.FC = () => {
  const {
    donors,
    requests,
    donorResponses,
    donorAssignments,
    respondToEmergency,
    setDonorAvailabilityState,
    currentUser
  } = useBloodStore();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'alerts' | 'commitments' | 'history'>('alerts');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Active donor session
  const activeDonor = donors.find((d) => d.email === currentUser?.email) || donors[0];

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

  // Filter requests matching this donor clinically
  const activeRequests = requests.filter((r) => {
    if (r.status === 'FULFILLED' || r.status === 'CANCELLED' || r.status === 'EXPIRED') return false;
    const comp = isClinicallyCompatible(r.bloodGroup, activeDonor.bloodGroup, r.component);
    return comp.compatible;
  });

  // Active commitments for this donor
  const myAssignments = donorAssignments.filter((a) => a.donorId === activeDonor.id && a.status === 'ASSIGNED');

  const donorAvailabilityState: DonorAvailabilityState =
    activeDonor.availabilityState || (activeDonor.isAvailable ? 'AVAILABLE' : 'TEMPORARILY_UNAVAILABLE');

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Donor Profile Header Card */}
      <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
            {activeDonor.bloodGroup}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-app-text">
                {activeDonor.fullName}
              </h1>
              <span className="text-[10px] font-bold bg-success-light text-success border border-success-border px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Verified Donor
              </span>
            </div>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Volunteer Responder • {activeDonor.city} • Registered Contact: {activeDonor.phone}
            </p>
          </div>
        </div>

        {/* Quick Stats Pill */}
        <div className="flex items-center gap-2 bg-app-muted/50 p-2 rounded-lg border border-app-border self-start md:self-auto text-xs">
          <div className="px-3 py-1 text-center">
            <span className="text-[10px] uppercase font-bold text-app-text-secondary block">Total Donations</span>
            <span className="text-base font-bold text-app-text">{activeDonor.totalDonations}</span>
          </div>
          <div className="w-px h-7 bg-app-border" />
          <div className="px-3 py-1 text-center">
            <span className="text-[10px] uppercase font-bold text-app-text-secondary block">Response Rate</span>
            <span className="text-base font-bold text-success">100%</span>
          </div>
        </div>
      </div>

      {/* Clinical Eligibility Banner */}
      <div className="bg-app-surface p-5 rounded-xl border border-app-border shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-warning" />
            <span className="text-xs font-bold uppercase tracking-wider text-app-text">
              Clinical Transfusion Eligibility Check
            </span>
          </div>
          <p className="text-xs text-app-text-secondary">
            {eligibility.isEligible ? (
              <span className="text-success font-semibold">
                You are currently medically eligible for Whole Blood & Component Donation.
              </span>
            ) : (
              <span className="text-warning-dark font-semibold">{eligibility.reason}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-app-text-secondary font-mono">
            Last Donated: {activeDonor.lastDonatedAt ? new Date(activeDonor.lastDonatedAt).toLocaleDateString() : 'First time donor'}
          </span>
        </div>
      </div>

      {/* 3-State Availability Control */}
      <AvailabilityToggle
        currentState={donorAvailabilityState}
        updatedAt={activeDonor.availabilityUpdatedAt}
        onSelectState={(state) => setDonorAvailabilityState(activeDonor.id, state)}
      />

      {/* Navigation Tabs for Donor Hub */}
      <div className="flex items-center justify-between border-b border-app-border pb-2 text-xs font-bold">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`py-2 px-4 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'alerts'
                ? 'bg-brand-light text-brand font-bold shadow-xs'
                : 'text-app-text-secondary hover:text-app-text'
              }`}
          >
            <Bell className="w-3.5 h-3.5 text-brand" />
            <span>Emergency Alerts ({activeRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('commitments')}
            className={`py-2 px-4 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'commitments'
                ? 'bg-brand-light text-brand font-bold shadow-xs'
                : 'text-app-text-secondary hover:text-app-text'
              }`}
          >
            <Activity className="w-3.5 h-3.5 text-success" />
            <span>Active Commitments ({myAssignments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2 px-4 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'history'
                ? 'bg-brand-light text-brand font-bold shadow-xs'
                : 'text-app-text-secondary hover:text-app-text'
              }`}
          >
            <Calendar className="w-3.5 h-3.5 text-app-text-secondary" />
            <span>Donation History</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/communication')}
          className="text-xs text-brand hover:text-brand-dark font-semibold inline-flex items-center gap-1"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Messages</span>
        </button>
      </div>

      {/* Tab 1: Nearby Matching Emergency Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-app-text flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand" />
              <span>Matching Emergency Calls in Your Vicinity</span>
            </h2>
            <span className="text-xs text-app-text-secondary font-medium">
              Filtered for {activeDonor.bloodGroup} clinical compatibility
            </span>
          </div>

          {!activeDonor.isAvailable ? (
            <div className="bg-app-muted/50 p-8 rounded-xl text-center text-xs text-app-text-secondary space-y-2 border border-app-border">
              <AlertCircle className="w-8 h-8 text-app-border mx-auto" />
              <p className="font-bold text-app-text text-sm">Your availability status is currently set to paused.</p>
              <p>Turn on availability above when you are ready to receive and respond to emergency blood calls.</p>
            </div>
          ) : activeRequests.length === 0 ? (
            <div className="bg-app-surface p-12 rounded-xl border border-app-border text-center text-xs text-app-text-secondary space-y-2 shadow-subtle">
              <Heart className="w-10 h-10 text-success mx-auto" />
              <p className="font-bold text-app-text text-sm">No active emergency calls matching your profile right now.</p>
              <p>Thank you for staying on standby! You will receive an immediate in-app emergency alert when an urgent call arises in your radius.</p>
            </div>
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
          <h2 className="text-sm font-bold text-app-text">Your Confirmed Coordination Commitments</h2>
          {myAssignments.length === 0 ? (
            <div className="bg-app-surface p-12 rounded-xl border border-app-border text-center text-xs text-app-text-secondary space-y-2 shadow-subtle">
              <CheckCircle2 className="w-10 h-10 text-app-border mx-auto" />
              <p className="font-bold text-app-text text-sm">No active confirmed coordinator assignments.</p>
              <p>When an emergency coordinator formally assigns you to a verified request, hospital arrival guidelines and reference codes will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAssignments.map((asgn) => {
                const req = requests.find((r) => r.id === asgn.requestId);
                return (
                  <div
                    key={asgn.id}
                    className="bg-app-surface p-5 rounded-xl border border-success-border shadow-card space-y-3"
                  >
                    <div className="flex items-start justify-between border-b border-app-border pb-3">
                      <div>
                        <span className="text-[10px] font-bold text-success bg-success-light px-2 py-0.5 rounded-sm uppercase tracking-wider border border-success-border">
                          CONFIRMED BY CLINICAL COORDINATOR
                        </span>
                        <h3 className="text-base font-bold text-app-text mt-1.5">
                          {req?.hospitalName || 'Emergency Hospital'}
                        </h3>
                        <p className="text-xs text-app-text-secondary">{req?.hospitalAddress}, {req?.city}</p>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-xs font-bold bg-app-muted px-2 py-1 rounded-md border border-app-border">
                          {req?.referenceCode}
                        </span>
                        <span className="text-[10px] text-app-text-secondary block mt-1">Quote upon arrival</span>
                      </div>
                    </div>

                    <div className="bg-app-muted/50 p-3 rounded-lg text-xs space-y-1 border border-app-border">
                      <strong className="block text-app-text">Hospital Transfusion Center Instructions:</strong>
                      <p className="text-app-text-secondary leading-relaxed text-[11px]">
                        Please report to the Hospital Transfusion Center (Blood Bank Wing). Quote reference <strong>{req?.referenceCode}</strong>. Carry a valid government photo ID. A complimentary health check and hemoglobin screen will be performed on-site.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-app-text-secondary">Assigned for:</span>
                        <strong className="text-brand">{asgn.unitsAssigned} Unit(s)</strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate('/communication')}
                        className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1"
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
        <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-card space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="font-bold text-app-text text-sm">Verified Voluntary Donation History</h3>
            <span className="text-app-text-secondary font-mono">{activeDonor.totalDonations} Record(s)</span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-app-muted/40 border border-app-border flex items-center justify-between">
              <div>
                <span className="font-bold text-app-text block">CareLoop Central Depository</span>
                <span className="text-[11px] text-app-text-secondary">Whole Blood Donation • 1 Unit (350 ml)</span>
                <span className="text-[10px] text-app-text-secondary block mt-0.5">Certificate Ref: CL-CERT-2024-8841</span>
              </div>
              <span className="text-[11px] font-mono text-app-text-secondary">
                {activeDonor.lastDonatedAt ? new Date(activeDonor.lastDonatedAt).toLocaleDateString() : 'Past donation'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Strict Donor Privacy Guarantee */}
      <div className="bg-app-surface p-4 rounded-xl border border-app-border text-xs text-app-text-secondary flex items-start gap-3 shadow-subtle">
        <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <div>
          <strong className="text-app-text block font-bold mb-0.5">Strict Donor Privacy Guarantee</strong>
          CareLoop coordinates rapid emergency response while keeping your personal telephone number and residential address confidential. Only verified clinical coordinators facilitate donor introductions.
        </div>
      </div>
    </div>
  );
};
