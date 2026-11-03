import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore, getFreshnessStatus } from '../store/useBloodStore';
import { UserRole } from '../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../config/navigation';
import { AuthModal } from '../components/common/AuthModal';
import {
  Droplet,
  UserRound,
  UserRoundCheck,
  Building2,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  Shield
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { bloodCentres, selectDemoExperience } = useBloodStore();
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleRoleSelect = (role: UserRole) => {
    if (role === 'admin') {
      setIsAuthModalOpen(true);
      return;
    }
    selectDemoExperience(role);
    const targetPath = DEFAULT_WORKSPACE_BY_ROLE[role] || '/';
    navigate(targetPath);
  };

  return (
    <div className="space-y-16 py-8">
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* 1. Hero Section */}
      <section className="relative max-w-4xl mx-auto text-center px-4 space-y-5">
        <div className="inline-flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3.5 py-1.5 rounded-full text-xs font-semibold">
          <Droplet className="w-4 h-4 fill-current text-red-600" />
          <span>Emergency Blood Coordination Network</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Blood<span className="text-red-600">Reach</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-medium">
          Connect emergency blood requests with blood centres, donors and coordinators through a single coordinated response system.
        </p>

        <p className="text-xs text-slate-500 max-w-xl mx-auto">
          One emergency request. One coordinated workflow. Multiple ways to participate.
        </p>
      </section>

      {/* 2. Primary Role Selection Section: "How will you use BloodReach?" */}
      <section className="max-w-5xl mx-auto px-4 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            How will you use BloodReach?
          </h2>
          <p className="text-xs text-slate-600">
            Select an experience to explore BloodReach's role-specific emergency workflows.
          </p>
        </div>

        {/* 4 Public Role Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Patient Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between hover:border-red-300 transition-colors space-y-4">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                <UserRound className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Patient / Attendant</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Request emergency blood coordination and track your request status in real time.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleRoleSelect('patient')}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              Continue as Patient <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Registered Donor Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between hover:border-red-300 transition-colors space-y-4">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                <UserRoundCheck className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Registered Donor</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Receive emergency alerts and respond when you may be able to help nearby patients.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleRoleSelect('donor')}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              Continue as Donor <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Blood Centre Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between hover:border-red-300 transition-colors space-y-4">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Blood Centre</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Manage blood resources, update inventory freshness, and verify emergency coordination.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleRoleSelect('blood_centre')}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              Continue as Blood Centre <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Coordinator Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between hover:border-red-300 transition-colors space-y-4">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Coordinator</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Monitor emergencies, responses, shortage detection, and escalation from one control room.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleRoleSelect('coordinator')}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              Open Control Room <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sign in prompt footer */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500 font-medium">
            Already have an authorized account?{' '}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="text-slate-900 hover:underline font-bold inline-flex items-center gap-1"
            >
              Sign in to Workspace <Shield className="w-3.5 h-3.5 text-red-600" />
            </button>
          </p>
        </div>
      </section>

      {/* 3. Verified Inventory Snapshot */}
      <section className="max-w-5xl mx-auto px-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Verified Blood Centre Inventory Snapshot</h3>
            <p className="text-xs text-slate-500">Live verified stock levels across partner blood banks in Metro City.</p>
          </div>
          <span className="text-[11px] bg-slate-100 text-slate-700 font-mono px-2.5 py-1 rounded-full border border-slate-200">
            Recorded Inventory Data
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {bloodCentres.map((centre) => {
            const freshness = getFreshnessStatus(centre.inventoryUpdatedAt);
            const diffMins = Math.floor((Date.now() - new Date(centre.inventoryUpdatedAt).getTime()) / (1000 * 60));

            return (
              <div key={centre.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-subtle space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{centre.name}</h4>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    freshness === 'Fresh' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {diffMins}m ago
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1 text-center text-xs">
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[10px] text-slate-500 block font-bold">O+</span>
                    <span className="font-extrabold text-slate-900">1 U</span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[10px] text-slate-500 block font-bold">A+</span>
                    <span className="font-extrabold text-slate-900">12 U</span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[10px] text-slate-500 block font-bold">B+</span>
                    <span className="font-extrabold text-slate-900">8 U</span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[10px] text-slate-500 block font-bold">O-</span>
                    <span className="font-extrabold text-red-600">0 U</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Medical Boundaries & Trust Notice */}
      <section className="max-w-4xl mx-auto px-4 bg-slate-100/80 p-5 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <h3 className="text-sm font-bold text-slate-900">Medical Boundary & Safety Principle</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          BloodReach coordinates emergency resource discovery and communications. Final donor eligibility and blood compatibility testing remain strictly with qualified blood-centre and medical staff.
        </p>
      </section>
    </div>
  );
};

