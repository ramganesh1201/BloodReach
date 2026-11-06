import React, { useState } from 'react';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../../types';
import {
  Droplet,
  Building2,
  MapPin,
  User,
  Phone,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Send,
  Edit2,
  ShieldCheck
} from 'lucide-react';

interface StepReviewProps {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  city: string;
  district?: string;
  landmark?: string;
  hospitalContactPerson?: string;
  contactName: string;
  contactPhone: string;
  preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  requiredDateTime?: string;
  additionalInstructions?: string;
  onEditStep: (step: 1 | 2 | 3) => void;
  onSubmit: () => void | Promise<void>;
  onBack: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export const StepReview: React.FC<StepReviewProps> = ({
  bloodGroup,
  component,
  unitsRequired,
  urgency,
  hospitalName,
  hospitalAddress,
  city,
  district,
  landmark,
  hospitalContactPerson,
  contactName,
  contactPhone,
  preferredContact,
  requiredDateTime,
  additionalInstructions,
  onEditStep,
  onSubmit,
  onBack,
  isSubmitting: externalIsSubmitting,
  submitError,
}) => {
  const [confirmedTruthful, setConfirmedTruthful] = useState(false);
  const [localIsSubmitting, setLocalIsSubmitting] = useState(false);

  const isSubmitting = externalIsSubmitting !== undefined ? externalIsSubmitting : localIsSubmitting;

  const handleConfirmSubmit = async () => {
    if (!confirmedTruthful || isSubmitting) return;
    setLocalIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setLocalIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand-light px-2 py-0.5 rounded-sm">
            Step 4 of 4
          </span>
          <span className="text-xs text-app-text-secondary">Final Verification & Review</span>
        </div>
        <h2 className="text-xl font-bold text-app-text">Review Emergency Blood Request</h2>
        <p className="text-xs text-app-text-secondary mt-0.5">
          Carefully review all information before initiating automated clinical depository checks and volunteer matching.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="space-y-3">
        {/* Step 1 Summary */}
        <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
              1. Blood Requirement
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-brand">{bloodGroup}</span>
              <span className="text-xs font-semibold text-app-text">{component}</span>
              <span className="text-xs text-app-text-secondary">•</span>
              <span className="text-xs font-bold text-app-text">{unitsRequired} Unit(s)</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                urgency === 'Critical' ? 'bg-emergency-light text-emergency' : 'bg-warning-light text-warning-dark'
              }`}>
                {urgency}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onEditStep(1)}
            className="text-xs text-brand hover:text-brand-dark font-semibold inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        </div>

        {/* Step 2 Summary */}
        <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
              2. Hospital & Care Facility
            </span>
            <h4 className="text-xs font-bold text-app-text">{hospitalName}</h4>
            <p className="text-[11px] text-app-text-secondary leading-relaxed">
              {hospitalAddress}, {city} {district ? `(${district} Dist.)` : ''}
              {landmark ? ` • Landmark: ${landmark}` : ''}
            </p>
            {hospitalContactPerson && (
              <p className="text-[11px] text-app-text-secondary">
                Hospital Contact Person: <strong>{hospitalContactPerson}</strong>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onEditStep(2)}
            className="text-xs text-brand hover:text-brand-dark font-semibold inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        </div>

        {/* Step 3 Summary */}
        <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
              3. Request Timing & Attendant Contact
            </span>
            <div className="text-xs text-app-text space-y-0.5">
              <p>Attendant: <strong>{contactName}</strong> ({contactPhone})</p>
              <p className="text-[11px] text-app-text-secondary">
                Preferred Channel: <strong>{preferredContact}</strong>
                {requiredDateTime ? ` • Required by: ${new Date(requiredDateTime).toLocaleString()}` : ' • Urgency: Immediate dispatch'}
              </p>
              {additionalInstructions && (
                <p className="text-[11px] text-app-text-secondary italic">
                  Notes: "{additionalInstructions}"
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onEditStep(3)}
            className="text-xs text-brand hover:text-brand-dark font-semibold inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Medical Safety & Attendant Verification Declaration */}
      <div className="bg-app-muted/50 p-4 rounded-xl border border-app-border space-y-3 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <p className="text-[11px] text-app-text-secondary leading-relaxed">
            Submitting this request triggers automated stock cross-referencing across certified blood banks and alerts nearby verified donors. Pathological cross-matching will be completed by hospital staff.
          </p>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-emergency p-3.5 rounded-lg text-xs flex items-start gap-2.5 animate-shake">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-emergency" />
            <div className="space-y-0.5">
              <strong className="block font-bold">Failed to Dispatch Emergency Request</strong>
              <p className="text-[11px] leading-relaxed text-red-800">{submitError}</p>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2.5 pt-2 border-t border-app-border cursor-pointer">
          <input
            type="checkbox"
            checked={confirmedTruthful}
            onChange={(e) => setConfirmedTruthful(e.target.checked)}
            className="mt-0.5 text-brand focus:ring-brand rounded-sm"
          />
          <span className="text-xs font-semibold text-app-text select-none">
            I confirm that this emergency blood requirement is genuine and authorized by the attending medical practitioner at the specified hospital.
          </span>
        </label>
      </div>

      {/* Submission Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onBack}
          className="py-2 px-4 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Contact</span>
        </button>

        <button
          type="button"
          onClick={handleConfirmSubmit}
          disabled={!confirmedTruthful || isSubmitting}
          className="bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold text-xs py-2.5 px-6 rounded-lg transition-colors shadow-xs flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSubmitting ? 'Dispatching Emergency Call...' : 'Confirm & Dispatch Emergency Request'}</span>
        </button>
      </div>
    </div>
  );
};

