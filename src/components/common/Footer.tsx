import React from 'react';
import { Link } from 'react-router-dom';
import { Droplet, ShieldCheck, Info, FileText } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 text-xs py-10 border-t border-slate-800 pb-20 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-red-600 flex items-center justify-center text-white">
                <Droplet className="w-4 h-4 fill-current" />
              </div>
              <span className="text-base font-bold text-white tracking-tight">
                Blood<span className="text-red-500">Reach</span>
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-xs">
              Emergency blood requirement coordination platform. Rapid resource discovery, shortage detection, and responder escalation.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3">
              Navigation
            </h4>
            <ul className="space-y-2">
              <li>
                <Link to="/request" className="hover:text-white transition-colors">
                  Create Emergency Request
                </Link>
              </li>
              <li>
                <Link to="/donor" className="hover:text-white transition-colors">
                  Volunteer Donor Portal
                </Link>
              </li>
              <li>
                <Link to="/blood-centre" className="hover:text-white transition-colors">
                  Blood Centre Dashboard
                </Link>
              </li>
              <li>
                <Link to="/coordinator" className="hover:text-white transition-colors">
                  Coordinator Control Room
                </Link>
              </li>
            </ul>
          </div>

          {/* Key Workflows */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3">
              Testing & Accessibility
            </h4>
            <ul className="space-y-2">
              <li>
                <Link to="/simulation" className="hover:text-white transition-colors flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Section 33 Interactive Workflow Simulation
                </Link>
              </li>
              <li>
                <span className="text-slate-500">Keypad Phone SMS Webhook API</span>
              </li>
              <li>
                <span className="text-slate-500">Offline PWA Shell</span>
              </li>
            </ul>
          </div>

          {/* Trust Statement & Disclaimer */}
          <div className="space-y-2 bg-slate-800/60 p-4 rounded-lg border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Medical Safety Notice</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              BloodReach coordinates emergency communication. It does not replace blood banks, hospitals, or medical screening. Final donor eligibility and transfusion compatibility are determined solely by qualified medical staff.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} BloodReach Emergency Network. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Calm & Fast Healthcare UX</span>
            <span>•</span>
            <span>Zero Fake Data</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
