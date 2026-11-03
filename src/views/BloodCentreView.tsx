import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { InventoryTable } from '../components/bloodcentre/InventoryTable';
import { Building2, ShieldCheck, CheckCircle2, Clock, Droplet } from 'lucide-react';

export const BloodCentreView: React.FC = () => {
  const { bloodCentres, inventory, requests, updateInventory, verifyAndFulfillRequest } = useBloodStore();
  const [selectedCentreId, setSelectedCentreId] = useState<string>(bloodCentres[0].id);

  const activeCentre = bloodCentres.find((c) => c.id === selectedCentreId) || bloodCentres[0];

  const pendingRequests = requests.filter(
    (r) => r.status === 'AWAITING_CENTRE_VERIFICATION' || r.status === 'RESPONDER_FOUND'
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Header & Bank Selector */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Blood Centre Operations</h1>
            <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
              Verified Partner
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Real-time blood stock management, inventory timestamps, and emergency unit verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Select Bank:</label>
          <select
            value={selectedCentreId}
            onChange={(e) => setSelectedCentreId(e.target.value)}
            className="text-xs bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
          >
            {bloodCentres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inventory Table for Selected Bank */}
      <InventoryTable
        centre={activeCentre}
        inventory={inventory}
        onUpdateInventory={updateInventory}
      />

      {/* Pending Emergency Verifications Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Droplet className="w-5 h-5 text-red-600 fill-current" />
            <h3 className="text-base font-bold text-slate-900">Emergency Unit Verifications & Issue</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {pendingRequests.length} Emergency(s) Pending Clinical Verification
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No emergency requests currently awaiting blood centre verification.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{req.referenceCode}</span>
                    <span className="font-extrabold text-red-600">{req.bloodGroup} {req.component}</span>
                    <span className="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded text-[10px]">
                      {req.unitsCoordinated} / {req.unitsRequired} Coordinated
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Hospital: <strong>{req.hospitalName}</strong> • Attendant: {req.contactName} ({req.contactPhone})
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => verifyAndFulfillRequest(req.id, activeCentre.id, 1)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Verify & Confirm Issue (1 Unit)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
