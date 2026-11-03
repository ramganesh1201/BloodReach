import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ShieldAlert,
  WifiOff,
  UserX,
  Compass,
  PhoneCall,
  CheckCircle2,
  RefreshCw,
  Lock,
  Layers,
  Activity
} from 'lucide-react';

export const ReliabilityChapter: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [activeScenario, setActiveScenario] = useState<number>(0);

  const scenarios = [
    {
      title: 'Donor Does Not Respond or Declines',
      icon: UserX,
      badge: 'Automated Tier 2 Expansion',
      problem: 'Volunteer donors may be in meetings, traveling, or unable to donate immediately.',
      solution:
        'If a notified donor declines or fails to respond within 12 minutes, the system automatically expands the radius by 5 km and notifies the next tier of verified donors without duplicate alerts.',
      stateFlow: ['Wave 1: 5km Radius (3 Donors)', '1 Declined / 2 Timeout', 'Auto Expand: 10km Radius (4 Donors)', 'Responder Secured'],
    },
    {
      title: 'Coordinator Human-in-the-Loop Escalation',
      icon: Activity,
      badge: 'Clinical Human Triage',
      problem: 'Rare blood phenotypes (e.g., AB-, O-) may face acute regional deficits.',
      solution:
        'When algorithm matching identifies zero nearby stock or active donors, the case immediately flags the regional coordinator control room for emergency inter-hospital transfer and blood bank reserves.',
      stateFlow: ['Automated Query (0 Local Units)', 'Coordinator Alert Paged', 'Direct Blood Bank Reserve Transfer', 'Units Dispatched via Ambulance'],
    },
    {
      title: 'Unreliable Hospital Network & Low Bandwidth',
      icon: WifiOff,
      badge: 'Offline Draft & Zero Data Loss',
      problem: 'Hospital basements and intensive care units frequently suffer cellular dead zones.',
      solution:
        'CareLoop preserves your request locally as a structured draft. The UI transparently states: "You are offline. Your request is saved as a draft." Upon signal restoration, actions sync cleanly without duplicate entries.',
      stateFlow: ['Basement Signal Lost', 'Saved to Local Encrypted Draft', 'Connectivity Restored', 'Verified Sync with Server'],
    },
    {
      title: 'Atomic Race-Condition Protection',
      icon: Lock,
      badge: 'Transactional Concurrency Lock',
      problem: 'Two responders accepting the same single unit requirement simultaneously.',
      solution:
        'All assignments execute via atomic database transactions (`assign_donor_atomic`). Once the exact required units are reached, subsequent responses are gracefully preserved as backup volunteers.',
      stateFlow: ['Unit Required: 1 Unit', 'Donor A & B Respond', 'Atomic Transaction Evaluated', 'Donor A Assigned • Donor B on Standby'],
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-app-surface border-b border-app-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-emerald-50 text-success border border-emerald-200 uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Fail-Safe System Architecture</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            Built for Real-World Hospital Conditions
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            Real emergencies don’t happen under ideal conditions. CareLoop is engineered with comprehensive fallback protocols, human coordinator intervention, and offline resilience.
          </p>
        </div>

        {/* 4 Interactive Reliability Scenarios */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Scenario Selector Pills (Left) */}
          <div className="lg:col-span-5 space-y-3">
            <span className="text-caption font-semibold text-app-text-secondary uppercase tracking-wider block mb-2">
              Select Fail-Safe Protocol:
            </span>

            {scenarios.map((s, idx) => {
              const Icon = s.icon;
              const isSelected = activeScenario === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveScenario(idx)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-app-surface border-brand shadow-card'
                      : 'bg-app-bg border-app-border hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold text-app-text-secondary uppercase tracking-wider block">
                        {s.badge}
                      </span>
                      <h3 className={`text-xs font-bold truncate ${isSelected ? 'text-brand' : 'text-app-text'}`}>
                        {s.title}
                      </h3>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scenario Details & Visual Flow (Right) */}
          <div className="lg:col-span-7">
            <motion.div
              key={activeScenario}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-app-bg rounded-xl border border-app-border p-6 sm:p-8 space-y-6 shadow-card"
            >
              {/* Header */}
              <div className="border-b border-app-border pb-4 space-y-1">
                <span className="text-caption font-mono font-bold text-brand uppercase tracking-wider">
                  {scenarios[activeScenario].badge}
                </span>
                <h3 className="text-lg font-bold text-app-text">
                  {scenarios[activeScenario].title}
                </h3>
              </div>

              {/* Problem vs Solution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-app-surface p-4 rounded-lg border border-app-border space-y-1.5">
                  <span className="font-semibold text-emergency flex items-center gap-1.5 text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5" /> Emergency Hazard
                  </span>
                  <p className="text-app-text-secondary leading-relaxed">
                    {scenarios[activeScenario].problem}
                  </p>
                </div>

                <div className="bg-app-surface p-4 rounded-lg border border-app-border space-y-1.5">
                  <span className="font-semibold text-success flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> CareLoop Safeguard
                  </span>
                  <p className="text-app-text-secondary leading-relaxed">
                    {scenarios[activeScenario].solution}
                  </p>
                </div>
              </div>

              {/* Sequential State Flow */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold text-app-text-secondary block">
                  Verifiable State Transition Sequence:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {scenarios[activeScenario].stateFlow.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="bg-app-surface p-2.5 rounded-md border border-app-border flex items-center gap-2 text-app-text"
                    >
                      <span className="w-5 h-5 rounded-full bg-brand-light text-brand text-[10px] font-bold flex items-center justify-center shrink-0">
                        {sIdx + 1}
                      </span>
                      <span className="text-[11px] font-medium leading-tight">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
