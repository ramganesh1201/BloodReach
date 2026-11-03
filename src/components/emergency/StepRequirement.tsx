import React from 'react';
import { BloodGroup, BloodComponent, UrgencyLevel } from '../../types';
import { Minus, Plus, AlertCircle } from 'lucide-react';

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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Step 1 — Requirement Details</h2>
        <p className="text-sm text-slate-600">Specify the required blood group, component type, and urgency.</p>
      </div>

      {/* Blood Group Selection */}
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Blood Group Required <span className="text-red-600">*</span>
        </label>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {BLOOD_GROUPS.map((group) => {
            const selected = bloodGroup === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => onChange({ bloodGroup: group })}
                className={`py-3 px-2 rounded-lg text-base font-bold text-center border transition-all ${
                  selected
                    ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-600 ring-offset-1'
                    : 'bg-white text-slate-800 border-slate-300 hover:border-red-300 hover:bg-red-50/50'
                }`}
              >
                {group}
              </button>
            );
          })}
        </div>
      </div>

      {/* Component Type */}
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Blood Component <span className="text-red-600">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COMPONENTS.map((comp) => {
            const selected = component === comp;
            return (
              <button
                key={comp}
                type="button"
                onClick={() => onChange({ component: comp })}
                className={`py-2.5 px-3 rounded-lg text-sm font-medium text-center border transition-colors ${
                  selected
                    ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}
              >
                {comp}
              </button>
            );
          })}
        </div>
      </div>

      {/* Units Required Stepper */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
        <div>
          <label className="block text-sm font-semibold text-slate-800">
            Units Required <span className="text-red-600">*</span>
          </label>
          <span className="text-xs text-slate-500">1 unit = approx. 350–450 ml</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange({ unitsRequired: Math.max(1, unitsRequired - 1) })}
            className="w-10 h-10 rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-100 disabled:opacity-50"
            disabled={unitsRequired <= 1}
            aria-label="Decrease units"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xl font-bold text-slate-900 w-8 text-center">{unitsRequired}</span>
          <button
            type="button"
            onClick={() => onChange({ unitsRequired: Math.min(10, unitsRequired + 1) })}
            className="w-10 h-10 rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-100 disabled:opacity-50"
            disabled={unitsRequired >= 10}
            aria-label="Increase units"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Urgency Selection */}
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Urgency Level <span className="text-red-600">*</span>
        </label>
        <div className="space-y-2">
          {URGENCIES.map(({ level, description }) => {
            const selected = urgency === level;
            return (
              <label
                key={level}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected
                    ? 'border-red-600 bg-red-50/60 ring-1 ring-red-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="urgency"
                  value={level}
                  checked={selected}
                  onChange={() => onChange({ urgency: level })}
                  className="mt-1 text-red-600 focus:ring-red-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{level}</span>
                    {level === 'Critical' && (
                      <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
                        High Priority
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="bg-red-600 text-white hover:bg-red-700 font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
        >
          Continue to Location →
        </button>
      </div>
    </div>
  );
};
