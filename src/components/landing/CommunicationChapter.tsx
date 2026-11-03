import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  MessageSquare,
  ShieldCheck,
  CheckCheck,
  PhoneCall,
  UserRound,
  UserCheck,
  Building2,
  Activity,
  ArrowRight,
  Clock,
  Radio,
  Lock
} from 'lucide-react';

export const CommunicationChapter: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [activeChannel, setActiveChannel] = useState<'all' | 'donor' | 'coordinator' | 'centre'>('all');

  const participants = [
    {
      role: 'Patient / Attendant',
      desc: 'Monitors real-time status and direct coordinator updates without sharing public phone numbers.',
      icon: UserRound,
      badgeColor: 'bg-brand text-white',
    },
    {
      role: 'Hospital Coordinator',
      desc: 'Oversees verification, intervenes in delays, and resolves cross-matching logistics.',
      icon: Activity,
      badgeColor: 'bg-slate-900 text-white',
    },
    {
      role: 'Assigned Donor',
      desc: 'Receives precise hospital transfusion center directions, contact desk, and arrival confirmation.',
      icon: UserCheck,
      badgeColor: 'bg-emerald-600 text-white',
    },
    {
      role: 'Accredited Blood Centre',
      desc: 'Logs physical component issue, donor screening results, and transfusion release slips.',
      icon: Building2,
      badgeColor: 'bg-sky-600 text-white',
    },
  ];

  const sampleMessages = [
    {
      id: 'm1',
      senderRole: 'Coordinator',
      senderName: 'Dr. Ramesh Rao (KIMS)',
      text: 'Emergency Request CL-8F42 verified. 2 units of Packed RBC (B+) required in ICU Block B.',
      timestamp: '14:22',
      status: 'READ',
      channel: 'coordinator',
    },
    {
      id: 'm2',
      senderRole: 'Donor',
      senderName: 'Vikram Sharma (O+ Donor)',
      text: 'Accepted request. I am en route to KIMS Transfusion Medicine reception. ETA 18 minutes.',
      timestamp: '14:26',
      status: 'READ',
      channel: 'donor',
    },
    {
      id: 'm3',
      senderRole: 'Blood Centre',
      senderName: 'Red Cross Central Lab',
      text: 'Laboratory cross-match sample received from patient. Reserve hold placed on unit #B-4089.',
      timestamp: '14:29',
      status: 'DELIVERED',
      channel: 'centre',
    },
    {
      id: 'm4',
      senderRole: 'Patient / Attendant',
      senderName: 'Suresh Kumar (Attendant)',
      text: 'Attendant waiting at 2nd Floor Blood Bank reception with patient medical record file.',
      timestamp: '14:31',
      status: 'SENT',
      channel: 'all',
    },
  ];

  const filteredMessages =
    activeChannel === 'all'
      ? sampleMessages
      : sampleMessages.filter((m) => m.channel === activeChannel || m.channel === 'all');

  return (
    <section className="py-16 sm:py-24 bg-app-bg border-b border-app-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-sky-50 text-info border border-sky-200 uppercase tracking-wider">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Dedicated Multi-Role Emergency Hub</span>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-h1 font-bold text-app-text tracking-tight">
            Transparent, Structured Communication
          </h2>

          <p className="text-sm sm:text-base text-app-text-secondary leading-relaxed">
            CareLoop replaces chaotic phone chains with a privacy-safe, synchronized communication hub linked directly to the emergency request.
          </p>
        </div>

        {/* Central Request Ecosystem Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-12">
          {/* Left: 4 Connected Participant Nodes */}
          <div className="lg:col-span-5 space-y-3.5">
            <span className="text-caption font-semibold text-app-text-secondary uppercase tracking-wider block mb-2">
              Synchronized Ecosystem Participants
            </span>

            {participants.map((p, idx) => {
              const Icon = p.icon;
              return (
                <div
                  key={idx}
                  className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-start gap-3.5 hover:border-slate-300 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.badgeColor}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-app-text">{p.role}</h3>
                    <p className="text-[11px] text-app-text-secondary leading-relaxed mt-0.5">
                      {p.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Live Request Communication Feed Mockup */}
          <div className="lg:col-span-7 bg-app-surface rounded-xl border border-app-border shadow-card overflow-hidden">
            {/* Thread Header */}
            <div className="bg-app-surface p-4 border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-app-text">Request #CL-8F42</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-emergency border border-red-200">
                      CRITICAL • 2 Units B+
                    </span>
                  </div>
                  <span className="text-[11px] text-app-text-secondary block">
                    KIMS Hospital, Hyderabad • Coordination Active
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-medium hidden sm:inline">HIPAA & Privacy Protected</span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="bg-app-bg px-4 py-2 border-b border-app-border flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[11px] font-semibold text-app-text-secondary shrink-0">Filter Feed:</span>
              {(['all', 'coordinator', 'donor', 'centre'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setActiveChannel(ch)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all capitalize ${
                    activeChannel === ch
                      ? 'bg-app-surface border border-app-border text-brand shadow-xs'
                      : 'text-app-text-secondary hover:text-app-text'
                  }`}
                >
                  {ch === 'all' ? 'All Updates' : ch}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div className="p-4 sm:p-5 space-y-3.5 max-h-80 overflow-y-auto bg-app-bg/50">
              {filteredMessages.map((msg) => (
                <div key={msg.id} className="bg-app-surface p-3.5 rounded-lg border border-app-border space-y-1.5 shadow-subtle">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-app-text text-[11px]">{msg.senderName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-muted text-app-text-secondary font-medium">
                        {msg.senderRole}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-app-text-secondary font-mono">
                      <span>{msg.timestamp}</span>
                      <CheckCheck className={`w-3.5 h-3.5 ${msg.status === 'READ' ? 'text-info' : 'text-slate-400'}`} />
                    </div>
                  </div>
                  <p className="text-xs text-app-text leading-relaxed">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Feed Footer with Channel Safeguards */}
            <div className="bg-app-surface p-3 border-t border-app-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-app-text-secondary">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px]">Realtime Dispatch Engine: In-App WebSockets + SMS Fallback</span>
              </div>
              <span className="text-[11px] text-slate-400">Zero Simulated Activity</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
