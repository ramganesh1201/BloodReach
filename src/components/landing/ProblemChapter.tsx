import React from 'react';
import { motion, useReducedMotion, Variants } from 'framer-motion';
import { AlertCircle, PhoneMissed, DatabaseZap, ClockAlert, ArrowRight, ShieldAlert, Check } from 'lucide-react';

export const ProblemChapter: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.15,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const frictionPoints = [
    {
      icon: PhoneMissed,
      title: 'Frantic, Unstructured Phone Trees',
      description:
        'During intensive surgeries or accidents, distressed family members are forced to cold-call dozens of contacts, wasting irreplaceable golden-hour minutes.',
      metric: '45–90 min',
      metricLabel: 'Average delay in manual outreach',
      severity: 'emergency',
    },
    {
      icon: DatabaseZap,
      title: 'Outdated & Stale Donor Registries',
      description:
        'Static spreadsheets and social media posts lack clinical availability tracking. More than 60% of listed numbers are unreachable or medically deferred.',
      metric: '64%',
      metricLabel: 'Unreachable or ineligible contacts',
      severity: 'warning',
    },
    {
      icon: ClockAlert,
      title: 'Opaque Hospital Blood Bank Stock',
      description:
        'Patients frequently rush between facilities in city traffic only to discover that necessary packed red cells or platelets were already reserved or exhausted.',
      metric: '0 Visibility',
      metricLabel: 'Without unified inventory telemetry',
      severity: 'emergency',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-app-surface border-b border-app-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20"
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-red-50 text-emergency border border-red-200 uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>The Clinical Reality</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            In medical emergencies, confusion is the deadliest bottleneck.
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            When a patient requires urgent transfusion, the struggle is rarely a total absence of blood in the city. The true challenge is the lack of structured, verified coordination between hospitals, blood banks, and nearby eligible donors.
          </p>
        </motion.div>

        {/* Editorial Split: Visual Storytelling & Friction Points */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Authentic Hospital Context Photography */}
          <motion.div
            className="lg:col-span-5 relative"
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6 }}
          >
            <div className="relative rounded-xl overflow-hidden border border-app-border shadow-elevated bg-app-muted">
              <img
                src="https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80"
                alt="Hospital intensive care unit corridor during emergency triage"
                className="w-full h-80 sm:h-[420px] object-cover object-center filter saturate-[0.85] contrast-[1.05]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              <div className="absolute bottom-5 left-5 right-5 text-white space-y-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 bg-red-950/80 px-2.5 py-0.5 rounded border border-red-800">
                  <ShieldAlert className="w-3 h-3 text-emergency" /> Time-Critical Window
                </span>
                <p className="text-sm font-semibold text-white/95 leading-snug">
                  "Every minute spent finding a donor is a minute a patient is waiting on the operating table."
                </p>
                <span className="text-[11px] text-white/60 block font-mono">
                  Transfusion Protocol Observation • Trauma Centers
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: 3 Progressive Friction Cards */}
          <motion.div
            className="lg:col-span-7 space-y-4"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {frictionPoints.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="bg-app-bg p-5 rounded-xl border border-app-border hover:border-slate-300 transition-colors shadow-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                        item.severity === 'emergency'
                          ? 'bg-red-50 text-emergency border-red-200'
                          : 'bg-amber-50 text-warning border-amber-200'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-app-text">{item.title}</h3>
                      <p className="text-xs text-app-text-secondary leading-relaxed max-w-md">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0 border-t sm:border-t-0 sm:border-l border-app-border pt-2 sm:pt-0 sm:pl-4 min-w-[130px]">
                    <span className="text-sm font-black text-app-text font-mono block">
                      {item.metric}
                    </span>
                    <span className="text-[10px] text-app-text-secondary block">
                      {item.metricLabel}
                    </span>
                  </div>
                </motion.div>
              );
            })}

            {/* Resolution Statement */}
            <motion.div
              variants={itemVariants}
              className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 flex items-center gap-3 text-xs text-emerald-950 font-medium"
            >
              <div className="w-6 h-6 rounded-full bg-success text-white flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>
                <strong>The CareLoop Solution:</strong> A centralized digital coordinator that automates stock discovery, antigen compatibility verification, and targeted notification in under 120 seconds.
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};