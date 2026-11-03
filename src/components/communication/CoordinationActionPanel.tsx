import React, { useState } from 'react';
import {
  CoordinationEventType,
  UserRole,
} from '../../types';
import {
  Car,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  HelpCircle,
  CheckSquare,
  Sparkles,
} from 'lucide-react';

interface CoordinationActionPanelProps {
  currentRole: UserRole;
  onSubmitMilestone: (eventType: CoordinationEventType, eventData?: Record<string, any>) => void;
  hospitalName: string;
}

export const CoordinationActionPanel: React.FC<CoordinationActionPanelProps> = ({
  currentRole,
  onSubmitMilestone,
  hospitalName,
}) => {
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedEta, setSelectedEta] = useState(30);
  const [cancelReason, setCancelReason] = useState('Traffic or transit delay');

  const isDonor = currentRole === 'donor';

  const handleEtaSubmit = () => {
    onSubmitMilestone('ON_THE_WAY', { etaMinutes: selectedEta });
    setShowEtaModal(false);
  };

  const handleCancelSubmit = () => {
    onSubmitMilestone('UNABLE_TO_PROCEED', { reason: cancelReason });
    setShowCancelModal(false);
  };

  return (
    <div className="border-b border-[#E6E9E7] bg-white px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#69716F] shrink-0">
          Coordination Actions:
        </span>

        <div className="flex items-center gap-2">
          {isDonor ? (
            <>
              <button
                type="button"
                onClick={() => onSubmitMilestone('CONFIRMED_AVAILABILITY')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm Availability
              </button>

              <button
                type="button"
                onClick={() => setShowEtaModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors whitespace-nowrap"
              >
                <Car className="w-3.5 h-3.5" />
                On The Way (ETA)
              </button>

              <button
                type="button"
                onClick={() => onSubmitMilestone('REACHED_HOSPITAL')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors whitespace-nowrap"
              >
                <Building className="w-3.5 h-3.5" />
                Reached Hospital
              </button>

              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors whitespace-nowrap"
              >
                <XCircle className="w-3.5 h-3.5 text-zinc-400" />
                Cannot Proceed
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSubmitMilestone('SHARED_HOSPITAL_DETAILS')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5" />
                Share Hospital Directions
              </button>

              <button
                type="button"
                onClick={() => onSubmitMilestone('REQUESTED_UPDATE')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" />
                Request ETA Update
              </button>

              <button
                type="button"
                onClick={() => onSubmitMilestone('CONFIRMED_ARRIVAL')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm Donor Arrival
              </button>

              <button
                type="button"
                onClick={() => onSubmitMilestone('COORDINATION_OUTCOME')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#B42332]/10 text-[#B42332] hover:bg-[#B42332]/20 border border-[#B42332]/20 transition-colors whitespace-nowrap"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Verify Outcome
              </button>
            </>
          )}
        </div>
      </div>

      {/* ETA Selection Modal */}
      {showEtaModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#E6E9E7] p-6 max-w-sm w-full shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#202322]">Select Estimated Arrival Time</h3>
              <p className="text-xs text-[#69716F]">
                Heading to {hospitalName}. When do you expect to arrive?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[15, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSelectedEta(mins)}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    selectedEta === mins
                      ? 'border-[#B42332] bg-[#B42332]/5 text-[#B42332]'
                      : 'border-[#E6E9E7] text-[#202322] hover:bg-[#F8F9F8]'
                  }`}
                >
                  {mins} Minutes
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEtaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#69716F] hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEtaSubmit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B42332] hover:bg-[#8F1928] text-white transition-colors"
              >
                Broadcast ETA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cannot Proceed Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#E6E9E7] p-6 max-w-sm w-full shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#202322]">Unable to Proceed</h3>
              <p className="text-xs text-[#69716F]">
                Please inform the requester so they can immediately notify alternate standby responders.
              </p>
            </div>

            <div className="space-y-2">
              {[
                'Traffic or transit roadblock',
                'Unforeseen clinical condition / medication taken',
                'Urgent family obligation',
                'Other personal emergency',
              ].map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                    cancelReason === reason ? 'border-[#B42332] bg-rose-50/50' : 'border-[#E6E9E7]'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={cancelReason === reason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="text-[#B42332]"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#69716F] hover:bg-zinc-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCancelSubmit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

