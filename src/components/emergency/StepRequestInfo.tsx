import React from 'react';
import { Phone, User, Calendar, Clock, FileText, ArrowRight, ArrowLeft } from 'lucide-react';

interface StepRequestInfoProps {
  requiredDateTime?: string;
  additionalInstructions?: string;
  contactName: string;
  contactPhone: string;
  preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  onChange: (fields: Partial<{
    requiredDateTime: string;
    additionalInstructions: string;
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StepRequestInfo: React.FC<StepRequestInfoProps> = ({
  requiredDateTime = '',
  additionalInstructions = '',
  contactName,
  contactPhone,
  preferredContact,
  onChange,
  onNext,
  onBack,
}) => {
  const isValid = contactName.trim().length > 1 && contactPhone.trim().length > 7;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand-light px-2 py-0.5 rounded-sm">
            Step 3 of 4
          </span>
          <span className="text-xs text-app-text-secondary">Timing & Attendant Contact</span>
        </div>
        <h2 className="text-xl font-bold text-app-text">Request & Contact Information</h2>
        <p className="text-xs text-app-text-secondary mt-0.5">
          Provide required timing, additional clinical instructions, and attendant contact channels.
        </p>
      </div>

      {/* Attendant Name & Phone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="contact-name" className="block text-xs font-bold text-app-text">
            Attendant / Contact Person <span className="text-emergency">*</span>
          </label>
          <div className="relative">
            <input
              id="contact-name"
              type="text"
              value={contactName}
              onChange={(e) => onChange({ contactName: e.target.value })}
              placeholder="e.g. Robert Taylor"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-app-border text-app-text text-xs focus:border-brand focus:ring-1 focus:ring-brand bg-app-surface"
              required
            />
            <User className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
          </div>
          <span className="text-[10px] text-app-text-secondary">Person present with patient at the hospital</span>
        </div>

        <div className="space-y-1">
          <label htmlFor="contact-phone" className="block text-xs font-bold text-app-text">
            Attendant Mobile Number <span className="text-emergency">*</span>
          </label>
          <div className="relative">
            <input
              id="contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => onChange({ contactPhone: e.target.value })}
              placeholder="e.g. +91 98490 55123"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-app-border text-app-text text-xs focus:border-brand focus:ring-1 focus:ring-brand bg-app-surface font-mono"
              required
            />
            <Phone className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
          </div>
          <span className="text-[10px] text-app-text-secondary">Will receive verification SMS and donor updates</span>
        </div>
      </div>

      {/* Required Date & Time */}
      <div className="space-y-1">
        <label htmlFor="required-time" className="block text-xs font-bold text-app-text">
          Required By Date & Time <span className="text-[11px] font-normal text-app-text-secondary">(Optional)</span>
        </label>
        <div className="relative">
          <input
            id="required-time"
            type="datetime-local"
            value={requiredDateTime}
            onChange={(e) => onChange({ requiredDateTime: e.target.value })}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-app-border text-app-text text-xs focus:border-brand focus:ring-1 focus:ring-brand bg-app-surface"
          />
          <Calendar className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
        </div>
        <span className="text-[10px] text-app-text-secondary">Leave blank if immediate transfusion required</span>
      </div>

      {/* Preferred Contact Method */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-app-text">
          Preferred Contact Channel <span className="text-emergency">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['Phone', 'SMS', 'WhatsApp'] as const).map((method) => {
            const selected = preferredContact === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => onChange({ preferredContact: method })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-colors ${
                  selected
                    ? 'bg-app-text text-white border-app-text shadow-xs'
                    : 'bg-app-surface text-app-text border-app-border hover:border-app-border hover:bg-app-muted'
                }`}
              >
                {method}
              </button>
            );
          })}
        </div>
      </div>

      {/* Additional Instructions */}
      <div className="space-y-1">
        <label htmlFor="instructions" className="block text-xs font-bold text-app-text">
          Additional Hospital Instructions / Patient Ward <span className="text-[11px] font-normal text-app-text-secondary">(Optional)</span>
        </label>
        <div className="relative">
          <textarea
            id="instructions"
            value={additionalInstructions}
            onChange={(e) => onChange({ additionalInstructions: e.target.value })}
            rows={2}
            placeholder="e.g. ICU Bed 4B, 3rd Floor Trauma Wing. Patient undergoing emergency arterial surgery."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-app-border text-app-text text-xs focus:border-brand focus:ring-1 focus:ring-brand bg-app-surface"
          />
          <FileText className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onBack}
          className="py-2 px-4 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Location</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold text-xs py-2.5 px-5 rounded-lg transition-colors shadow-xs flex items-center gap-2"
        >
          <span>Review Request Details</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

