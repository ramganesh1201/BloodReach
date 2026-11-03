import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BloodGroup, BloodComponent } from '../../types';
import { getCompatibleDonorGroups, getComponentCompatibilityDescription } from '../../services/matchingEngine';
import {
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Scale,
  Calendar,
  Compass,
  Info
} from 'lucide-react';

export const MatchingChapter: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>('B+');
  const [selectedComponent, setSelectedComponent] = useState<BloodComponent>('Packed RBC');

  const bloodGroups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const components: BloodComponent[] = ['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'];

  const compatibleGroups = getCompatibleDonorGroups(selectedGroup, selectedComponent);
  const compatibilityDescription = getComponentCompatibilityDescription(selectedComponent);

  return (
    <section className="py-16 sm:py-24 bg-app-surface border-b border-app-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-emerald-50 text-success border border-emerald-200 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multi-Parameter Antigen & Logistics Engine</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            Intelligent Donor Matching
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            CareLoop never notifies donors at random. Our matching engine cross-references biological compatibility, geographic distance, availability status, and clinical deferral intervals before a single alert is sent.
          </p>
        </div>

        {/* 5 Clinical Parameters Showcase Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-12">
          <div className="bg-app-bg p-4 rounded-xl border border-app-border text-left space-y-1.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-brand flex items-center justify-center">
              <Heart className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-app-text">1. Antigen Profile</h3>
            <p className="text-[11px] text-app-text-secondary leading-tight">
              Reverse component rules: RBC vs. FFP compatibility logic.
            </p>
          </div>

          <div className="bg-app-bg p-4 rounded-xl border border-app-border text-left space-y-1.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-info flex items-center justify-center">
              <Compass className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-app-text">2. Proximity Radius</h3>
            <p className="text-[11px] text-app-text-secondary leading-tight">
              Precise road distance from hospital facility coordinates.
            </p>
          </div>

          <div className="bg-app-bg p-4 rounded-xl border border-app-border text-left space-y-1.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-success flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-app-text">3. Availability State</h3>
            <p className="text-[11px] text-app-text-secondary leading-tight">
              Only donors actively marked "Available" receive alert dispatches.
            </p>
          </div>

          <div className="bg-app-bg p-4 rounded-xl border border-app-border text-left space-y-1.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-warning flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-app-text">4. Clearance Window</h3>
            <p className="text-[11px] text-app-text-secondary leading-tight">
              Mandatory 90-day recovery window enforced between donations.
            </p>
          </div>

          <div className="bg-app-bg p-4 rounded-xl border border-app-border text-left space-y-1.5 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-app-text">5. Clinical Triage</h3>
            <p className="text-[11px] text-app-text-secondary leading-tight">
              Critical, Urgent, and Today emergency tiers prioritize search radius.
            </p>
          </div>
        </div>

        {/* Interactive Compatibility Engine Sandbox */}
        <div className="bg-app-bg rounded-xl border border-app-border p-6 sm:p-8 space-y-6 shadow-subtle">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-app-border pb-4">
            <div>
              <span className="text-caption font-semibold text-brand uppercase tracking-wider block">
                Interactive Biological Matrix
              </span>
              <h3 className="text-base sm:text-lg font-bold text-app-text">
                Explore Clinical Compatibility Logic
              </h3>
            </div>
            <span className="text-xs text-app-text-secondary bg-app-surface px-3 py-1 rounded-md border border-app-border font-mono">
              Live Clinical Engine Rules
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Controls: Select Component & Recipient Group */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-app-text-secondary mb-2">
                  Select Blood Component:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {components.map((comp) => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => setSelectedComponent(comp)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all ${
                        selectedComponent === comp
                          ? 'bg-app-surface border-brand text-brand shadow-xs'
                          : 'bg-app-surface/60 border-app-border text-app-text hover:bg-app-surface'
                      }`}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-text-secondary mb-2">
                  Select Patient Blood Group:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {bloodGroups.map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setSelectedGroup(bg)}
                      className={`py-2 text-center rounded-lg text-xs font-mono font-bold border transition-all ${
                        selectedGroup === bg
                          ? 'bg-brand text-white border-brand shadow-xs'
                          : 'bg-app-surface border-app-border text-app-text hover:border-slate-400'
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-app-surface p-3.5 rounded-lg border border-app-border text-xs text-app-text-secondary flex items-start gap-2">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">{compatibilityDescription}</p>
              </div>
            </div>

            {/* Right Output: Compatible Donor Antigen Groups */}
            <div className="lg:col-span-7 bg-app-surface p-6 rounded-xl border border-app-border space-y-4">
              <div className="flex items-center justify-between border-b border-app-border pb-3">
                <span className="text-xs font-semibold text-app-text-secondary">
                  Eligible Donor Groups for Patient: <strong className="text-brand font-mono text-sm">{selectedGroup} ({selectedComponent})</strong>
                </span>
                <span className="text-xs font-bold text-success font-mono">
                  {compatibleGroups.length} Compatible Profile(s)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {bloodGroups.map((bg) => {
                  const isCompatible = compatibleGroups.includes(bg);
                  return (
                    <div
                      key={bg}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isCompatible
                          ? 'bg-emerald-50/80 border-emerald-300 text-success'
                          : 'bg-app-muted/50 border-app-border text-slate-400 opacity-60'
                      }`}
                    >
                      <span className="text-base font-black font-mono block">{bg}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider block mt-0.5">
                        {isCompatible ? '✓ Compatible' : '✗ Incompatible'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-app-bg rounded-lg border border-app-border text-[11px] text-app-text-secondary flex items-center justify-between">
                <span>Universal Donor for {selectedComponent}:</span>
                <strong className="font-mono text-app-text">
                  {selectedComponent === 'Plasma' ? 'AB+ / AB- (Reverse Rules)' : 'O- (Packed RBC)'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Essential Medical Disclaimer Banner */}
        <div className="mt-8 bg-amber-50/60 p-4 rounded-xl border border-amber-200 flex items-start gap-3 text-xs text-amber-950">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Medical Safety & Clinical Governance Boundary</span>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              CareLoop’s algorithmic matching identifies prospective donor candidates based on declared profiles. An algorithm match is <strong>not</strong> a medically confirmed match. Physical donor screening, viral marker screening (HIV, Hepatitis B/C, Syphilis, Malaria), and laboratory cross-matching are conducted exclusively by licensed hospital transfusion medicine departments.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
