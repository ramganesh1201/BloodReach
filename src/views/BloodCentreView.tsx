import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { InventoryTable } from '../components/bloodcentre/InventoryTable';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Droplet,
  MapPin,
  Phone,
  AlertCircle,
  MessageSquare,
  ArrowRight,
  Send
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const BloodCentreView: React.FC = () => {
  const { bloodCentres, inventory, requests, updateInventory, verifyAndFulfillRequest } = useBloodStore();
  const navigate = useNavigate();
  const [selectedCentreId, setSelectedCentreId] = useState<string>(bloodCentres[0].id);

  const activeCentre = bloodCentres.find((c) => c.id === selectedCentreId) || bloodCentres[0];

  const pendingRequests = requests.filter(
    (r) =>
      r.status === 'AWAITING_CENTRE_VERIFICATION' ||
      r.status === 'RESPONDER_FOUND' ||
      r.status === 'DONOR_ASSIGNED'
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Header & Bank Selector */}
      <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info-light text-info flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-app-text">Blood Centre Operations</h1>
                <span className="text-[10px] font-bold bg-info text-white px-2 py-0.5 rounded-sm">
                  Licensed Facility
                </span>
              </div>
              <p className="text-xs text-app-text-secondary mt-0.5">
                Real-time stock management, freshness timestamps, and emergency unit clearance.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-app-muted/50 p-1.5 rounded-lg border border-app-border">
            <label className="text-xs font-bold text-app-text whitespace-nowrap pl-2">Active Facility:</label>
            <select
              value={selectedCentreId}
              onChange={(e) => setSelectedCentreId(e.target.value)}
              className="text-xs bg-app-surface border border-app-border rounded-md px-3 py-1.5 font-bold text-app-text focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {bloodCentres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => navigate('/communication')}
            className="bg-brand-light text-brand hover:bg-brand/20 border border-brand/30 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Coordinator Comms</span>
          </button>
        </div>
      </div>

      {/* Facility Details Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-success shrink-0" />
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">License ID</span>
            <span className="font-bold text-app-text">{activeCentre.licenseNumber || 'CL-BB-VERIFIED'}</span>
          </div>
        </div>

        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-app-text-secondary shrink-0" />
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">Facility Address</span>
            <span className="font-bold text-app-text truncate">{activeCentre.address}</span>
          </div>
        </div>

        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-2.5">
          <Phone className="w-4 h-4 text-app-text-secondary shrink-0" />
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">24/7 Desk Contact</span>
            <span className="font-bold text-app-text">{activeCentre.phone}</span>
          </div>
        </div>
      </div>

      {/* Inventory Table for Selected Bank */}
      <InventoryTable
        centre={activeCentre}
        inventory={inventory}
        onUpdateInventory={updateInventory}
      />

      {/* Pending Emergency Verifications Section */}
      <div className="bg-app-surface p-6 rounded-xl border border-app-border shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-app-border pb-3">
          <div className="flex items-center gap-2">
            <Droplet className="w-5 h-5 text-brand fill-current" />
            <h3 className="text-sm font-bold text-app-text">Incoming Hospital Emergency Clearances</h3>
          </div>
          <span className="text-xs text-app-text-secondary font-semibold bg-app-muted px-2.5 py-0.5 rounded-md border border-app-border">
            {pendingRequests.length} Pending Review
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-8 text-center text-xs text-app-text-secondary space-y-1 shadow-subtle bg-app-muted/30 rounded-lg">
            <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
            <p className="font-bold text-app-text">No emergency calls currently awaiting blood bank issue clearance.</p>
            <p>Incoming hospital requests requiring reserve issue or cross-match clearance will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-app-text bg-app-surface px-2 py-0.5 rounded border border-app-border">
                      {req.referenceCode}
                    </span>
                    <span className="font-bold text-brand text-sm">
                      {req.bloodGroup} {req.component}
                    </span>
                    <span className="bg-warning-light text-warning-dark font-bold px-2 py-0.5 rounded text-[10px] border border-warning-border">
                      {req.unitsCoordinated} / {req.unitsRequired} Coordinated
                    </span>
                  </div>
                  <p className="text-app-text-secondary mt-1">
                    Hospital: <strong className="text-app-text">{req.hospitalName}</strong> • Attendant: {req.contactName} ({req.contactPhone})
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate('/communication')}
                    className="border border-app-border bg-app-surface hover:bg-app-muted text-app-text font-semibold px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-info" />
                    <span>Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => verifyAndFulfillRequest(req.id, activeCentre.id, 1)}
                    className="bg-brand hover:bg-brand-dark text-white font-bold px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Issue (1 Unit)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
