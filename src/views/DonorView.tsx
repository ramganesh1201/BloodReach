import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { AvailabilityToggle } from '../components/donor/AvailabilityToggle';
import { EmergencyCard } from '../components/donor/EmergencyCard';
import { KeypadSmsSimulator } from '../components/donor/KeypadSmsSimulator';
import { Users, Bell, Smartphone, ShieldCheck } from 'lucide-react';

export const DonorView: React.FC = () => {
  const { donors, requests, donorResponses, respondToEmergency, toggleDonorAvailability } = useBloodStore();
  const [showSmsSimulator, setShowSmsSimulator] = useState(false);

  const activeDonor = donors[0]; // Sarah Jenkins (O+)
  const activeRequests = requests.filter((r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Donor Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Good morning, {activeDonor.fullName}</h1>
            <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">
              Group {activeDonor.bloodGroup}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Registered Volunteer Donor • {activeDonor.city} • Total Donations: {activeDonor.totalDonations}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSmsSimulator(!showSmsSimulator)}
          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm shrink-0"
        >
          <Smartphone className="w-4 h-4 text-amber-400" />
          {showSmsSimulator ? 'Hide SMS Simulator' : 'Test Keypad SMS Simulator'}
        </button>
      </div>

      {/* Availability Toggle */}
      <AvailabilityToggle
        isAvailable={activeDonor.isAvailable}
        onToggle={() => toggleDonorAvailability(activeDonor.id)}
      />

      {/* SMS Simulator Drawer if toggled */}
      {showSmsSimulator && (
        <div className="pt-2">
          <KeypadSmsSimulator donorPhone={activeDonor.phone} referenceCode={requests[0]?.referenceCode || 'BR-8F42'} />
        </div>
      )}

      {/* Nearby Emergencies List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold text-slate-900">Nearby Emergency Requests</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {activeRequests.length} Active Emergency Call(s)
          </span>
        </div>

        {!activeDonor.isAvailable ? (
          <div className="bg-slate-100 p-6 rounded-xl text-center text-xs text-slate-600 space-y-2 border border-slate-200">
            <p className="font-semibold text-slate-800">You are currently set to Unavailable.</p>
            <p>Toggle availability back on above to view matching emergency calls in your vicinity.</p>
          </div>
        ) : activeRequests.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500 space-y-2">
            <p className="font-semibold text-slate-800">No active emergency calls in your immediate vicinity.</p>
            <p>Thank you for staying available! You will receive alerts when urgent blood is needed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeRequests.map((req) => {
              const prevResp = donorResponses.find((dr) => dr.requestId === req.id && dr.donorId === activeDonor.id);
              const hasResponded = prevResp?.responseStatus as 'ACCEPTED' | 'DECLINED' | undefined;

              return (
                <EmergencyCard
                  key={req.id}
                  request={req}
                  approxDistanceKm={activeDonor.approxDistanceKm}
                  hasResponded={hasResponded}
                  onRespond={(status) => respondToEmergency(req.id, activeDonor.id, status, 'WEB')}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Trust & Safety Banner */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-900 block font-bold mb-0.5">Donor Privacy Guarantee</strong>
          BloodReach does not expose your phone number or exact address to patient attendants. When you indicate you can help, coordination staff or blood centre clinicians manage next steps.
        </div>
      </div>
    </div>
  );
};
