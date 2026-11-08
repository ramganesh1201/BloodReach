import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore, getFreshnessStatus } from '../store/useBloodStore';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { InventoryTable } from '../components/bloodcentre/InventoryTable';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Droplet,
  MapPin,
  Phone,
  AlertTriangle,
  MessageSquare,
  Package,
} from 'lucide-react';

export const BloodCentreView: React.FC = () => {
  const {
    bloodCentres,
    inventory,
    requests,
    updateInventory,
    verifyAndFulfillRequest,
    isOffline,
  } = useBloodStore();
  const navigate = useNavigate();
  const [selectedCentreId, setSelectedCentreId] = useState<string>(
    bloodCentres[0]?.id || ''
  );

  const activeCentre =
    bloodCentres.find((c) => c.id === selectedCentreId) || bloodCentres[0] || {
      id: 'default-bc',
      name: 'CareLoop Central Blood Bank',
      address: 'Medical Enclave, Central District',
      city: 'Chennai',
      phone: '+91 44 2836 1000',
      licenseNumber: 'TN-BB-2024-9912',
      inventoryUpdatedAt: new Date().toISOString(),
      verified: true,
    };

  const centreItems = inventory.filter((item) => item.bloodCentreId === activeCentre.id);
  const totalUnits = centreItems.reduce((acc, curr) => acc + curr.units, 0);
  const criticalShortages = centreItems.filter((item) => item.units <= 1).length;
  const freshness = getFreshnessStatus(activeCentre.inventoryUpdatedAt);

  const pendingRequests = requests.filter(
    (r) =>
      r.status === 'AWAITING_CENTRE_VERIFICATION' ||
      r.status === 'RESPONDER_FOUND' ||
      r.status === 'DONOR_ASSIGNED'
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Unified Healthcare Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Blood Centre Console' },
        ]}
        roleBadge={{
          label: 'Licensed Depository',
          variant: 'info',
          icon: Building2,
        }}
        title="Blood Centre Inventory & Clearance"
        description="Monitor cold-chain unit balances in real-time, maintain verified freshness timestamps, and issue emergency clearances directly to hospitals."
        statusBadge={{
          label: isOffline ? 'Offline Cache Active' : 'Depository Network Online',
          live: !isOffline,
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-app-muted/70 px-3 py-1.5 rounded-lg border border-app-border text-xs">
              <label htmlFor="facility-selector" className="font-semibold text-app-text-secondary whitespace-nowrap">
                Facility:
              </label>
              <select
                id="facility-selector"
                value={selectedCentreId}
                onChange={(e) => setSelectedCentreId(e.target.value)}
                className="bg-app-surface border border-app-border rounded-md px-2.5 py-1 font-bold text-app-text text-xs focus:outline-none focus:ring-1 focus:ring-brand"
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
              className="bg-app-surface hover:bg-app-muted text-app-text font-semibold text-xs sm:text-sm py-2 px-3.5 rounded-lg transition-colors border border-app-border flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-info shrink-0" />
              <span>Coordinator Comms</span>
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Units In Reserve"
          value={`${totalUnits} U`}
          subtext={`Across ${centreItems.length} blood types & components`}
          icon={Package}
          variant="brand"
        />
        <StatCard
          label="Critical Low Stock"
          value={criticalShortages}
          subtext={criticalShortages > 0 ? 'Categories with ≤ 1 unit' : 'Safe reserve buffer'}
          icon={AlertTriangle}
          variant={criticalShortages > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Emergency Clearances Pending"
          value={pendingRequests.length}
          subtext={pendingRequests.length > 0 ? 'Awaiting depository sign-off' : 'All clear'}
          icon={Droplet}
          variant={pendingRequests.length > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Inventory Freshness"
          value={freshness === 'Fresh' ? 'Verified' : freshness}
          subtext={`Facility: ${activeCentre.licenseNumber || 'Certified'}`}
          icon={ShieldCheck}
          variant={freshness === 'Fresh' ? 'success' : freshness === 'Aging' ? 'warning' : 'emergency'}
        />
      </div>

      {/* Facility Credentials Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success-light text-success border border-success-border shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">
              Accredited License
            </span>
            <span className="font-bold text-app-text">{activeCentre.licenseNumber || 'CL-BB-VERIFIED'}</span>
          </div>
        </div>

        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-3">
          <div className="p-2 rounded-lg bg-info-light text-info border border-info-border shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">
              Depository Location
            </span>
            <span className="font-bold text-app-text truncate">{activeCentre.address}</span>
          </div>
        </div>

        <div className="bg-app-surface p-3.5 rounded-xl border border-app-border shadow-subtle flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-light text-brand border border-brand/20 shrink-0">
            <Phone className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="text-app-text-secondary text-[10px] block font-bold uppercase tracking-wider">
              24/7 Desk Contact
            </span>
            <span className="font-bold text-app-text">{activeCentre.phone}</span>
          </div>
        </div>
      </div>

      {/* Inventory Table for Selected Facility */}
      <InventoryTable
        centre={activeCentre}
        inventory={inventory}
        onUpdateInventory={updateInventory}
        isLiveSync={isSupabaseConfigured && !isOffline}
      />

      {/* Incoming Hospital Emergency Clearances Section */}
      <div className="bg-app-surface p-5 sm:p-6 rounded-xl border border-app-border shadow-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app-border pb-3">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-brand fill-current" />
            <h3 className="text-sm font-bold text-app-text font-display">
              Hospital Emergency Clearance Queue
            </h3>
          </div>
          <span className="text-xs text-app-text-secondary font-semibold bg-app-muted px-2.5 py-0.5 rounded-md border border-app-border self-start sm:self-auto">
            {pendingRequests.length} Pending Review
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            variant="success"
            title="No Emergency Requests Currently Awaiting Clearance"
            description="All active hospital requests have been fulfilled or are currently being coordinated with nearby volunteer donors."
          />
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 hover:border-app-border-strong hover:bg-app-muted/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-app-text bg-app-surface px-2 py-0.5 rounded border border-app-border text-xs">
                      {req.referenceCode}
                    </span>
                    <span className="font-bold text-brand text-sm font-display">
                      {req.bloodGroup} {req.component}
                    </span>
                    <span className="bg-warning-light text-warning-dark font-bold px-2 py-0.5 rounded text-[11px] border border-warning-border">
                      {req.unitsCoordinated} / {req.unitsRequired} Coordinated
                    </span>
                  </div>
                  <p className="text-app-text-secondary text-xs">
                    Hospital: <strong className="text-app-text font-semibold">{req.hospitalName}</strong> • Attendant: {req.contactName} ({req.contactPhone})
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate('/communication')}
                    className="border border-app-border bg-app-surface hover:bg-app-muted text-app-text font-semibold px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-info" />
                    <span>Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => verifyAndFulfillRequest(req.id, activeCentre.id, 1)}
                    className="bg-brand hover:bg-brand-hover text-white font-bold px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs"
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
