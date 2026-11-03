import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, MessageSquare, PhoneCall, Building2, ExternalLink, Activity } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 text-xs py-12 border-t border-slate-800 pb-24 md:pb-12" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand Info */}
          <div className="space-y-3.5 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-brand p-1.5 flex items-center justify-center transition-transform group-hover:scale-105">
                <img src="/logo.svg" alt="CareLoop logo" className="w-full h-full object-contain filter brightness-0 invert" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Care<span className="text-brand">Loop</span>
              </span>
            </Link>
            <p className="text-slate-400 leading-relaxed text-xs">
              Intelligent emergency blood donation coordination platform connecting patients, accredited blood centres, verified donors, and coordinators across Andhra Pradesh.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-medium pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>National Blood Coordination Network Active</span>
            </div>
          </div>

          {/* Quick Portals */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3.5">
              Platform Portals
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/request" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-brand font-bold">•</span> Submit Emergency Request
                </Link>
              </li>
              <li>
                <Link to="/patient" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Patient & Attendant Dashboard
                </Link>
              </li>
              <li>
                <Link to="/donor" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Volunteer Donor Registry
                </Link>
              </li>
              <li>
                <Link to="/blood-centre" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Blood Centre Operations
                </Link>
              </li>
              <li>
                <Link to="/coordinator" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Coordinator Operations Console
                </Link>
              </li>
              <li>
                <Link to="/communication" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Multi-Role Communication Hub
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-slate-600">•</span> Administrative Governance
                </Link>
              </li>
            </ul>
          </div>

          {/* Healthcare Safety Principles */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3.5">
              Clinical Governance
            </h4>
            <ul className="space-y-2 text-[11px] text-slate-400 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Component-specific compatibility (RBC vs. FFP reverse logic) validated prior to donor notification.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Atomic assignment controls prevent duplicate donor commitments or over-allocation.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Privacy-preserving communications: donor numbers are masked behind verified clinical channels.</span>
              </li>
            </ul>
          </div>

          {/* Medical Safety Notice */}
          <div className="space-y-2.5 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Medical Safety Boundary</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              CareLoop is an emergency coordination platform. Physical donor eligibility testing, viral marker screening, and cross-matching are conducted exclusively by licensed hospital transfusion medicine departments.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>National Ambulance Helpline:</span>
              <strong className="text-brand text-xs font-mono font-bold">108 / 112</strong>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-slate-500 gap-3 text-[11px]">
          <p>© {new Date().getFullYear()} CareLoop Health Systems. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>NABH & CDSCO Aligned Protocols</span>
            <span>•</span>
            <span>Zero Fabricated Inventory Guarantee</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
