import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, Variants } from 'framer-motion';
import { Droplet, ArrowRight, UserCheck, ShieldCheck, Activity, Building2, Clock, CheckCircle2, HeartHandshake } from 'lucide-react';

interface HeroChapterProps {
  onRegisterDonor: () => void;
  activeRequestsCount: number;
  availableUnitsCount: number;
  verifiedDonorsCount: number;
}

export const HeroChapter: React.FC<HeroChapterProps> = ({
  onRegisterDonor,
  activeRequestsCount,
  availableUnitsCount,
  verifiedDonorsCount,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Orchestrated motion variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const badgeVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4 },
    },
  };

  return (
    <section className="relative overflow-hidden pt-8 pb-16 sm:pt-14 sm:pb-24 border-b border-app-border bg-gradient-to-b from-app-bg to-white">
      {/* Subtle background ambient ring */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[400px] bg-brand/5 blur-3xl rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-4xl mx-auto space-y-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Eyebrow badge */}
          <motion.div variants={badgeVariants} className="inline-block">
            <div className="inline-flex items-center gap-2 bg-brand-light text-brand border border-brand/20 px-3.5 py-1.5 rounded-full text-caption font-semibold tracking-wide shadow-subtle">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
              <span>National Emergency Blood Coordination Platform</span>
            </div>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            variants={itemVariants}
            className="text-3xl sm:text-5xl lg:text-display font-extrabold text-app-text tracking-tight leading-[1.12]"
          >
            When minutes matter, <br className="hidden sm:inline" />
            <span className="text-brand">CareLoop coordinates care.</span>
          </motion.h1>

          {/* Supporting Text */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg text-app-text-secondary max-w-2xl mx-auto leading-relaxed font-normal"
          >
            CareLoop connects people who urgently need blood with compatible eligible donors, accredited blood banks, and hospital coordinators through an intelligent, transparent response pipeline.
          </motion.p>

          {/* Primary Action Buttons */}
          <motion.div
            variants={itemVariants}
            className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto"
          >
            <Link
              to="/request"
              className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white font-medium text-xs py-3.5 px-6 rounded-lg transition-colors shadow-subtle flex items-center justify-center gap-2 group"
            >
              <Droplet className="w-4 h-4 fill-current transition-transform group-hover:scale-110" />
              <span>Create Blood Request</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <button
              type="button"
              onClick={onRegisterDonor}
              className="w-full sm:w-auto bg-app-surface hover:bg-app-muted text-app-text border border-app-border font-medium text-xs py-3.5 px-6 rounded-lg transition-colors shadow-subtle flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-success" />
              <span>Register as Volunteer Donor</span>
            </button>
          </motion.div>

          {/* Clinical Authority Note */}
          <motion.div variants={itemVariants} className="pt-1 flex items-center justify-center gap-4 text-caption text-app-text-secondary">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-success" /> Verified Hospital Inventories
            </span>
            <span className="text-app-border">•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-info" /> Conflict-Safe Donor Assignment
            </span>
          </motion.div>
        </motion.div>

        {/* Hero Visual Composition: Realistic Clinical Environment with Live Telemetry Cards */}
        <motion.div
          className="mt-12 sm:mt-16 relative max-w-5xl mx-auto"
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Main Visual Frame */}
          <div className="relative rounded-xl overflow-hidden border border-app-border shadow-elevated bg-app-muted">
            <img
              src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1400&q=80"
              alt="Medical laboratory specialist inspecting cross-matched blood components in hospital transfusion facility"
              className="w-full h-64 sm:h-[420px] object-cover object-center filter saturate-[0.95]"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

            {/* Bottom Caption inside hero visual */}
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 text-white">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-brand text-white">
                  <Activity className="w-3 h-3" /> Live Dispatch Console
                </span>
                <p className="text-sm font-semibold tracking-tight text-white/95">
                  Statewide Transfusion Medicine & Donor Coordination Grid
                </p>
                <p className="text-xs text-white/75 max-w-lg">
                  Real-time status synchronization between authorized transfusion blood banks and registered on-call donors across Andhra Pradesh.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/15 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Grid Operational • 100% Data Integrity</span>
              </div>
            </div>
          </div>

          {/* Floating Telemetry Micro-Cards */}
          <motion.div
            className="hidden md:flex absolute -bottom-6 -left-4 bg-app-surface p-4 rounded-xl border border-app-border shadow-card items-center gap-3.5 z-20 max-w-xs"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-success flex items-center justify-center shrink-0 border border-emerald-100">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-app-text-secondary block">Verified Blood Centres</span>
              <strong className="text-app-text text-sm font-bold block">{availableUnitsCount} Units Monitored</strong>
              <span className="text-[10px] text-success font-medium">Real-time lab verified stock</span>
            </div>
          </motion.div>

          <motion.div
            className="hidden md:flex absolute -bottom-6 -right-4 bg-app-surface p-4 rounded-xl border border-app-border shadow-card items-center gap-3.5 z-20 max-w-xs"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="w-10 h-10 rounded-lg bg-red-50 text-brand flex items-center justify-center shrink-0 border border-red-100">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-app-text-secondary block">On-Call Responders</span>
              <strong className="text-app-text text-sm font-bold block">{verifiedDonorsCount} Registered Donors</strong>
              <span className="text-[10px] text-brand font-medium">Screened for clinical eligibility</span>
            </div>
          </motion.div>
        </motion.div>

        {/* 3 Metric Signals Banner */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <div className="bg-app-surface p-4 rounded-lg border border-app-border text-left space-y-1">
            <span className="text-caption text-app-text-secondary font-medium">Active Emergencies</span>
            <div className="text-xl font-bold text-app-text font-mono flex items-center justify-between">
              <span>{activeRequestsCount} In Progress</span>
              <Clock className="w-4 h-4 text-warning" />
            </div>
            <p className="text-[11px] text-app-text-secondary">Monitored 24/7 by regional coordinators</p>
          </div>

          <div className="bg-app-surface p-4 rounded-lg border border-app-border text-left space-y-1">
            <span className="text-caption text-app-text-secondary font-medium">Reverse Compatibility</span>
            <div className="text-xl font-bold text-app-text font-mono flex items-center justify-between">
              <span>RBC • FFP • Plt</span>
              <ShieldCheck className="w-4 h-4 text-success" />
            </div>
            <p className="text-[11px] text-app-text-secondary">Automated antigen compatibility verification</p>
          </div>

          <div className="bg-app-surface p-4 rounded-lg border border-app-border text-left space-y-1">
            <span className="text-caption text-app-text-secondary font-medium">Zero Duplicate Lock</span>
            <div className="text-xl font-bold text-app-text font-mono flex items-center justify-between">
              <span>Atomic Assign</span>
              <CheckCircle2 className="w-4 h-4 text-info" />
            </div>
            <p className="text-[11px] text-app-text-secondary">Prevents over-allocation and donor confusion</p>
          </div>
        </div>
      </div>
    </section>
  );
};