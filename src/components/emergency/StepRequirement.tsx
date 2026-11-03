import React from 'react';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../../types';
import { Minus, Plus, AlertCircle, ArrowRight } from 'lucide-react';

interface StepRequirementProps {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  urgency: UrgencyLevel;
  onChange: (fields: Partial<{
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: UrgencyLevel;
  }>) => void;
  onNext: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS: BloodComponent[] = ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'];
const URGENCIES: { level: UrgencyLevel; description: string }[] = [
  { level: 'Today', description: 'Needed within 24 hours for scheduled procedure' },
  { level: 'Urgent', description: 'Needed within 4–6 hours for surgery/treatment' },
  { level: 'Critical', description: 'Immediate emergency requirement (< 2 hours)' },
];

export const StepRequirement: React.FC<StepRequirementProps> = ({
  bloodGroup,
  component,
  unitsRequired,
  urgency,
  onChange,
  onNext,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand-light px-2 py-0.5 rounded-sm">
            Step 1 of 4
          </span>
          <span className="text-xs text-app-text-secondary">Mandatory Clinical Details</span>
        </div>
        <h2 className="text-xl font-bold text-app-text">Blood Requirement Details</h2>
        <p className="text-xs text-app-text-secondary mt-0.5">
          Specify the requested blood group, blood component type, required units, and urgency level.
        </p>
      </div>

      {/* Blood Group Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-app-text">
            Blood Group Required <span className="text-emergency">*</span>
          </label>
          <span className="text-[11px] text-app-text-secondary">Compatible donors matched automatically</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
          {BLOOD_GROUPS.map((group) => {
            const selected = bloodGroup === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => onChange({ bloodGroup: group })}
                className={`py-2.5 px-2 rounded-lg text-sm font-bold text-center border transition-all ${
                  selected
                    ? 'bg-brand text-white border-brand shadow-xs ring-2 ring-brand/30'
                    : 'bg-app-surface text-app-text border-app-border hover:border-brand/40 hover:bg-brand-light/30'
                }`}
              >
                {group}
              </button>
            );
          })}
        </div>
      </div>

      {/* Component Type */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-app-text">
            Blood Component <span className="text-emergency">*</span>
          </label>
          <span className="text-[11px] text-app-text-secondary">Verified against pathology inventory</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COMPONENTS.map((comp) => {
            const selected = component === comp;
            return (
              <button
                key={comp}
                type="button"
                onClick={() => onChange({ component: comp })}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold text-center border transition-colors ${
                  selected
                    ? 'bg-app-text text-white border-app-text font-bold shadow-xs'
                    : 'bg-app-surface text-app-text border-app-border hover:border-app-border hover:bg-app-muted'
                }`}
              >
                {comp}
              </button>
            );
          })}
        </div>
      </div>

      {/* Units Required Stepper */}
      <div className="bg-app-muted/50 p-4 rounded-xl border border-app-border flex items-center justify-between">
        <div>
          <label className="block text-xs font-bold text-app-text">
            Required Units (350–450 ml per unit) <span className="text-emergency">*</span>
          </label>
          <span className="text-[11px] text-app-text-secondary">Standard transfusion order unit</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange({ unitsRequired: Math.max(1, unitsRequired - 1) })}
            disabled={unitsRequired <= 1}
            className="w-8 h-8 rounded-lg bg-app-surface border border-app-border flex items-center justify-center text-app-text hover:bg-app-muted disabled:opacity-40 transition-colors shadow-xs"
            aria-label="Decrease units"
          >
            <Minus className="w-4 h-4" />
          </button>

          <span className="font-mono text-lg font-bold text-app-text w-8 text-center" aria-live="polite">
            {unitsRequired}
          </span>

          <button
            type="button"
            onClick={() => onChange({ unitsRequired: Math.min(10, unitsRequired + 1) })}
            disabled={unitsRequired >= 10}
            className="w-8 h-8 rounded-lg bg-app-surface border border-app-border flex items-center justify-center text-app-text hover:bg-app-muted disabled:opacity-40 transition-colors shadow-xs"
            aria-label="Increase units"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Urgency Level */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-app-text">
          Clinical Urgency Level <span className="text-emergency">*</span>
        </label>
        <div className="space-y-2">
          {URGENCIES.map(({ level, description }) => {
            const selected = urgency === level;
            return (
              <label
                key={level}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selected
                    ? level === 'Critical'
                      ? 'border-emergency bg-emergency-light/60 ring-1 ring-emergency'
                      : 'border-brand bg-brand-light/60 ring-1 ring-brand'
                    : 'border-app-border hover:bg-app-muted/50 bg-app-surface'
                }`}
              >
                <input
                  type="radio"
                  name="urgency"
                  checked={selected}
                  onChange={() => onChange({ urgency: level })}
                  className="mt-0.5 text-brand focus:ring-brand"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${
                      level === 'Critical' ? 'text-emergency' : level === 'Urgent' ? 'text-warning-dark' : 'text-app-text'
                    }`}>
                      {level}
                    </span>
                    {level === 'Critical' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emergency-light text-emergency px-1.5 py-0.2 rounded-sm border border-emergency-border">
                        Immediate Alert
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-app-text-secondary mt-0.5">{description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Next Step Action */}
      <div className="flex justify-end pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onNext}
          className="bg-brand hover:bg-brand-dark text-white font-bold text-xs py-2.5 px-5 rounded-lg transition-colors shadow-xs flex items-center gap-2"
        >
          <span>Continue to Hospital Location</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
