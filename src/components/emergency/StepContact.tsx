import React from 'react';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../../types';
import { Phone, User, ShieldCheck, CheckCircle2, MapPin } from 'lucide-react';

interface StepContactProps {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  city: string;
  contactName: string;
  contactPhone: string;
  preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  onChange: (fields: Partial<{
    contactName: string;
    contactPhone: string;
    preferredContact: 'Phone' | 'SMS' | 'WhatsApp';
  }>) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export const StepContact: React.FC<StepContactProps> = ({
  bloodGroup,
  component,
  unitsRequired,
  urgency,
  hospitalName,
  hospitalAddress,
  city,
  contactName,
  contactPhone,
  preferredContact,
  onChange,
  onSubmit,
  onBack,
}) => {
  const isValid = contactName.trim().length > 1 && contactPhone.trim().length > 6;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Step 3 — Contact & Review</h2>
        <p className="text-sm text-slate-600">Provide attendant contact details to coordinate response.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-semibold text-slate-800 mb-1">
            Attendant / Contact Name <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <input
              id="contact-name"
              type="text"
              value={contactName}
              onChange={(e) => onChange({ contactName: e.target.value })}
              placeholder="e.g. Robert Taylor"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
        </div>

        <div>
          <label htmlFor="contact-phone" className="block text-sm font-semibold text-slate-800 mb-1">
            Mobile Phone Number <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <input
              id="contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => onChange({ contactPhone: e.target.value })}
              placeholder="e.g. +1 (555) 012-3456"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Preferred Contact Method
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['Phone', 'SMS', 'WhatsApp'] as const).map((method) => {
            const selected = preferredContact === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => onChange({ preferredContact: method })}
                className={`py-2 px-3 rounded-lg text-sm font-medium border text-center transition-colors ${
                  selected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}
              >
                {method}
              </button>
            );
          })}
        </div>
      </div>

      {/* Review Summary Box */}
      <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Review Emergency Request
          </span>
          <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-bold uppercase">
            {urgency} Priority
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-slate-400 block">Blood Group</span>
            <span className="text-2xl font-black text-red-500">{bloodGroup}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Component</span>
            <span className="font-semibold">{component}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Units Required</span>
            <span className="font-semibold text-lg">{unitsRequired} unit(s)</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Hospital & Location</span>
            <span className="font-semibold truncate block">{hospitalName}</span>
            <span className="text-[11px] text-slate-400 truncate block">{hospitalAddress}, {city}</span>
          </div>
        </div>

        <div className="pt-2 text-xs text-slate-400 flex items-center gap-1.5 border-t border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Upon submission, resource discovery will check verified blood centres and notify matching responders.
          </span>
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!isValid}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg text-sm transition-colors shadow-md disabled:opacity-50 inline-flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          Create Emergency Request
        </button>
      </div>
    </div>
  );
};
