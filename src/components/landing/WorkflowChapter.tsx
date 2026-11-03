import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Search,
  BellRing,
  HeartHandshake,
  UserCheck,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

interface WorkflowStep {
  number: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  actor: 'Patient / Attendant' | 'Automated Engine' | 'Registered Donor' | 'Hospital Coordinator';
  icon: any;
  statusBadge: string;
}

export const WorkflowChapter: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  const steps: WorkflowStep[] = [
    {
      number: '01',
      title: 'Create Blood Request',
      shortDesc: 'Enter blood component, units, hospital, and urgency level.',
      fullDesc:
        'The patient or attendant submits a structured emergency request. Location, hospital contact person, and component specifications (Packed RBC, Whole Blood, Platelets, Plasma) are locked.',
      actor: 'Patient / Attendant',
      icon: FileText,
      statusBadge: 'CREATED',
    },
    {
      number: '02',
      title: 'Find Compatible Eligible Donors',
      shortDesc: 'Automated reverse-compatibility and proximity calculation.',
      fullDesc:
        'The matching engine queries registered donors within geographical radius. Biological rules (e.g., O- for RBC vs. AB for Plasma) and 90-day donation clearance intervals are verified instantly.',
      actor: 'Automated Engine',
      icon: Search,
      statusBadge: 'MATCHING_RESPONDERS',
    },
    {
      number: '03',
      title: 'Notify Relevant Donors',
      shortDesc: 'Targeted alerts dispatched directly to on-call donors.',
      fullDesc:
        'Only screened, available donors matching the exact criteria receive high-priority notifications via in-app push and SMS fallback with hospital coordinates.',
      actor: 'Automated Engine',
      icon: BellRing,
      statusBadge: 'AWAITING_RESPONSE',
    },
    {
      number: '04',
      title: 'Receive Donor Responses',
      shortDesc: 'Donors accept or decline with transparent status feedback.',
      fullDesc:
        'Available donors review the request and accept. Accepting updates their response status to "Accepted" without premature assignment, preventing duplicate donor allocation.',
      actor: 'Registered Donor',
      icon: HeartHandshake,
      statusBadge: 'RESPONDER_FOUND',
    },
    {
      number: '05',
      title: 'Confirm Donor Assignment',
      shortDesc: 'Coordinator locks assignment atomically with zero race conditions.',
      fullDesc:
        'The regional coordinator reviews the responding donors and confirms assignment through a concurrency-safe atomic procedure, locking the required units and dispatching transit instructions.',
      actor: 'Hospital Coordinator',
      icon: UserCheck,
      statusBadge: 'DONOR_ASSIGNED',
    },
    {
      number: '06',
      title: 'Coordinate Communication',
      shortDesc: 'Masked, dedicated channel between attendant, coordinator & donor.',
      fullDesc:
        'Authorized parties connect in the Request Communication Hub. Transit status, arrival ETA, and transfusion desk location are shared with complete privacy and zero spam.',
      actor: 'Patient / Attendant',
      icon: MessageSquare,
      statusBadge: 'COORDINATION_IN_PROGRESS',
    },
    {
      number: '07',
      title: 'Track Request to Completion',
      shortDesc: 'Transfusion desk verification and medical record closure.',
      fullDesc:
        'Upon physical arrival at the hospital transfusion medicine unit, cross-matching is verified, the unit is issued, and the coordination cycle closes with a verifiable audit record.',
      actor: 'Hospital Coordinator',
      icon: CheckCircle2,
      statusBadge: 'FULFILLED',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-app-bg border-b border-app-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-brand-light text-brand border border-brand/20 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>End-to-End Coordination Lifecycle</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            How CareLoop Works
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            From the initial hospital request to final transfusion desk verification, every step is structured, transparent, and protected against coordination failure.
          </p>
        </div>

        {/* Desktop / Tablet: Stepper Grid with Interactive Detail Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 7-Step Sequential Stepper List */}
          <div className="lg:col-span-6 space-y-3 relative">
            {/* Continuous vertical connecting line */}
            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-app-border -z-0 hidden sm:block" />

            {steps.map((step, idx) => {
              const isActive = activeStepIndex === idx;
              const Icon = step.icon;

              return (
                <motion.div
                  key={step.number}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${
                    isActive
                      ? 'bg-app-surface border-brand shadow-card'
                      : 'bg-app-surface/60 border-app-border hover:bg-app-surface hover:border-slate-300'
                  }`}
                  whileHover={{ x: shouldReduceMotion ? 0 : 4 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="flex items-center gap-4">
                    {/* Step Number Circle */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 transition-colors z-10 ${
                        isActive
                          ? 'bg-brand text-white shadow-xs'
                          : 'bg-app-muted text-app-text-secondary border border-app-border'
                      }`}
                    >
                      {step.number}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-xs font-bold truncate ${isActive ? 'text-brand' : 'text-app-text'}`}>
                          {step.title}
                        </h3>
                        <span className="text-[10px] text-app-text-secondary uppercase tracking-wider font-semibold">
                          {step.actor}
                        </span>
                      </div>
                      <p className="text-[11px] text-app-text-secondary line-clamp-1 mt-0.5">
                        {step.shortDesc}
                      </p>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-brand translate-x-0.5' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Interactive Step Inspector Panel (Right Column) */}
          <div className="lg:col-span-6 sticky top-24">
            <motion.div
              key={activeStepIndex}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-app-surface rounded-xl border border-app-border p-6 sm:p-8 shadow-card space-y-6"
            >
              {/* Step Header */}
              <div className="flex items-center justify-between border-b border-app-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-light text-brand flex items-center justify-center font-bold text-lg font-mono border border-brand/20">
                    {steps[activeStepIndex].number}
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider block">
                      Phase {activeStepIndex + 1} of 7
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-app-text">
                      {steps[activeStepIndex].title}
                    </h3>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-app-muted text-app-text border border-app-border">
                  {steps[activeStepIndex].statusBadge}
                </span>
              </div>

              {/* Step Description */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-app-text-secondary block">
                  Clinical & Operational Protocol
                </span>
                <p className="text-xs sm:text-sm text-app-text leading-relaxed bg-app-bg p-4 rounded-lg border border-app-border">
                  {steps[activeStepIndex].fullDesc}
                </p>
              </div>

              {/* Responsible Participant */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-app-border">
                <span className="text-app-text-secondary font-medium">Primary Actor:</span>
                <strong className="text-brand font-semibold">
                  {steps[activeStepIndex].actor}
                </strong>
              </div>

              {/* Interactive Navigation inside Inspector */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className="text-xs font-semibold text-app-text-secondary hover:text-app-text disabled:opacity-30 transition-colors"
                >
                  ← Previous Step
                </button>

                <div className="flex gap-1.5">
                  {steps.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveStepIndex(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        activeStepIndex === i ? 'bg-brand w-5' : 'bg-app-border hover:bg-slate-400'
                      }`}
                      aria-label={`Jump to step ${i + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  disabled={activeStepIndex === steps.length - 1}
                  onClick={() => setActiveStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                  className="text-xs font-semibold text-brand hover:text-brand-dark disabled:opacity-30 transition-colors flex items-center gap-1"
                >
                  Next Step →
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
