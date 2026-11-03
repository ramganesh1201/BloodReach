import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Droplet, UserCheck, Building2, ArrowRight, ShieldCheck, PhoneCall, ExternalLink } from 'lucide-react';

interface ActionChapterProps {
  onRegisterDonor: () => void;
}

export const ActionChapter: React.FC<ActionChapterProps> = ({ onRegisterDonor }) => {
  const shouldReduceMotion = useReducedMotion();

  const entryPoints = [
    {
      role: 'Patient or Hospital Attendant',
      title: 'Need Urgent Blood?',
      description:
        'Submit a structured emergency request. Nearby compatible donors and certified blood banks will be notified immediately.',
      cta: 'Create Emergency Request',
      link: '/request',
      icon: Droplet,
      isPrimary: true,
      color: 'brand',
    },
    {
      role: 'Volunteer Blood Donor',
      title: 'Join the On-Call Donor Grid',
      description:
        'Register with your blood group and location. Receive alerts only when a verified emergency matching your exact compatibility occurs.',
      cta: 'Register as Volunteer Donor',
      action: onRegisterDonor,
      icon: UserCheck,
      isPrimary: false,
      color: 'success',
    },
    {
      role: 'Transfusion Facility / Blood Bank',
      title: 'Accredited Blood Centre',
      description:
        'Connect your facility’s licensed inventory to CareLoop to fulfill regional hospital orders and streamline donor dispatch.',
      cta: 'Access Blood Centre Operations',
      link: '/blood-centre',
      icon: Building2,
      isPrimary: false,
      color: 'info',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-app-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-brand-light text-brand border border-brand/20 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Structured Access for Every Participant</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            How would you like to enter CareLoop?
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            Choose your role to access your dedicated clinical console or start an emergency request.
          </p>
        </div>

        {/* 3 Entry Point Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {entryPoints.map((entry, idx) => {
            const Icon = entry.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : idx * 0.1 }}
                className={`bg-app-surface rounded-xl border p-6 sm:p-8 flex flex-col justify-between transition-all ${
                  entry.isPrimary
                    ? 'border-brand/40 shadow-elevated ring-1 ring-brand/10'
                    : 'border-app-border shadow-card hover:border-slate-300'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider">
                      {entry.role}
                    </span>
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        entry.color === 'brand'
                          ? 'bg-brand-light text-brand'
                          : entry.color === 'success'
                          ? 'bg-emerald-50 text-success'
                          : 'bg-sky-50 text-info'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-app-text">{entry.title}</h3>

                  <p className="text-xs text-app-text-secondary leading-relaxed">
                    {entry.description}
                  </p>
                </div>

                <div className="pt-6">
                  {entry.link ? (
                    <Link
                      to={entry.link}
                      className={`w-full py-3 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        entry.isPrimary
                          ? 'bg-brand hover:bg-brand-dark text-white shadow-xs'
                          : 'bg-app-surface border border-app-border text-app-text hover:bg-app-muted'
                      }`}
                    >
                      <span>{entry.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={entry.action}
                      className="w-full py-3 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all bg-app-surface border border-app-border text-app-text hover:bg-app-muted"
                    >
                      <span>{entry.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Emergency Ambulance Helpline Banner */}
        <div className="mt-14 max-w-4xl mx-auto bg-slate-900 text-white p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600/30 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <strong className="block text-sm font-bold text-white">
                National Ambulance Emergency Helpline: 108 / 112
              </strong>
              <p className="text-[11px] text-slate-400">
                In acute life-threatening emergencies, alert emergency dispatch services simultaneously.
              </p>
            </div>
          </div>

          <a
            href="tel:108"
            className="shrink-0 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5"
          >
            <span>Dial 108 Now</span>
          </a>
        </div>
      </div>
    </section>
  );
};
