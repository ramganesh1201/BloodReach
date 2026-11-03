import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  UserRound,
  Droplet,
  PlusCircle,
  Activity,
  ArrowRight,
  Clock,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Search
} from 'lucide-react';

export const PatientView: React.FC = () => {
  const { requests, demoExperience } = useBloodStore();
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Header & Primary Action Banner */}
      <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-700 text-white rounded-3xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
          <Droplet className="w-64 h-64 fill-current text-white" />
        </div>

        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold border border-white/20">
            <UserRound className="w-4 h-4 text-white" />
            <span>Patient / Attendant Workspace</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Emergency Blood Requirement Assistance
          </h1>

          <p className="text-sm sm:text-base text-red-100 leading-relaxed font-medium">
            Submit an urgent request to locate verified blood bank inventory and notify nearby registered donors immediately.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/request')}
              className="bg-white hover:bg-slate-100 text-red-700 font-extrabold text-sm py-3.5 px-6 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 group"
            >
              <PlusCircle className="w-5 h-5 text-red-600 group-hover:scale-110 transition-transform" />
              Request Emergency Blood
            </button>

            {requests.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/request/track/${requests[0].id}`)}
                className="bg-red-800/60 hover:bg-red-800 text-white border border-white/25 font-bold text-sm py-3.5 px-5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Activity className="w-4 h-4 text-red-200" />
                Track Active Request ({requests[0].referenceCode})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Demo Mode Banner Indicator */}
      {demoExperience === 'patient' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="font-bold bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] uppercase">DEMO MODE</span>
            <span>You are currently previewing the <strong>Patient / Attendant Workspace</strong>.</span>
          </div>
        </div>
      )}

      {/* Active Requests List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Your Active Requests</h2>
            <p className="text-xs text-slate-500">Real-time status of emergency blood requirements linked to your session.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/request')}
            className="text-xs font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1"
          >
            New Request <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
            <Droplet className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">No active emergency requests</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              If a patient needs urgent blood, submit a request now to initiate automated resource discovery.
            </p>
            <button
              type="button"
              onClick={() => navigate('/request')}
              className="mt-2 inline-flex items-center gap-2 bg-red-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors"
            >
              <PlusCircle className="w-4 h-4" /> Request Emergency Blood
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {req.referenceCode}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        req.urgency === 'Critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {req.urgency}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{req.hospitalName}</h3>
                  </div>

                  <StatusBadge status={req.status} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-semibold block">Blood Requirement</span>
                    <span className="font-extrabold text-red-600 text-sm">{req.bloodGroup}</span>
                    <span className="text-slate-600 block text-[11px]">{req.component}</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-semibold block">Fulfillment Progress</span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {req.unitsCoordinated} / {req.unitsRequired} Units
                    </span>
                    <span className="text-emerald-700 font-medium block text-[11px]">
                      {req.unitsCoordinated >= req.unitsRequired ? 'Fully Coordinated' : 'Searching Responders'}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{req.hospitalAddress}, {req.city}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Created {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-semibold text-slate-600">Contact: {req.contactName} ({req.contactPhone})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => navigate(`/request/track/${req.id}`)}
                    className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5" /> Track Request
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/request/confirm/${req.id}`)}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                  >
                    Summary
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Emergency Workflow Guide */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          How BloodReach Coordinates Emergency Blood
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl space-y-1.5 border border-slate-100">
            <span className="font-black text-red-600 font-mono text-sm block">1. Submit</span>
            <span className="font-bold text-slate-900 block">Emergency Request</span>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Provide hospital name, required units, and contact details.
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl space-y-1.5 border border-slate-100">
            <span className="font-black text-red-600 font-mono text-sm block">2. Discover</span>
            <span className="font-bold text-slate-900 block">Verified Inventory</span>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              System checks live verified blood bank stocks across the metro area.
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl space-y-1.5 border border-slate-100">
            <span className="font-black text-red-600 font-mono text-sm block">3. Match</span>
            <span className="font-bold text-slate-900 block">Volunteer Donors</span>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              If shortage exists, nearby compatible donors receive rapid SMS & web alerts.
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl space-y-1.5 border border-slate-100">
            <span className="font-black text-red-600 font-mono text-sm block">4. Resolve</span>
            <span className="font-bold text-slate-900 block">Hospital Verification</span>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Blood centre staff verify and issue units to resolve the emergency.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
