import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { hospitalService } from '../services/hospitalService';
import {
  RegisteredHospital,
  HospitalInventoryItem,
  HospitalInventoryTransaction,
  HospitalStaffMember,
} from '../types/hospital';
import { BloodGroup, BloodComponent, EmergencyRequest } from '../types';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import {
  Building2,
  Droplet,
  Activity,
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  FileText,
  MapPin,
  Phone,
  Search,
  MessageSquare,
  AlertCircle,
  BarChart2,
  Lock,
} from 'lucide-react';

export const HospitalView: React.FC = () => {
  const navigate = useNavigate();
  const { requests, currentUser, isOffline, currentRole } = useBloodStore();

  const [hospitals, setHospitals] = useState<RegisteredHospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [inventory, setInventory] = useState<HospitalInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<HospitalInventoryTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'requests' | 'staff' | 'transactions'>('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State for Inventory Update (Intake / Transfusion)
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockAction, setStockAction] = useState<'INTAKE' | 'TRANSFUSION'>('INTAKE');
  const [modalBloodGroup, setModalBloodGroup] = useState<BloodGroup>('O+');
  const [modalComponent, setModalComponent] = useState<BloodComponent>('Packed RBC');
  const [modalUnits, setModalUnits] = useState<number>(2);
  const [modalReason, setModalReason] = useState<string>('Routine Emergency Stock Replenishment');
  const [stockOpSuccess, setStockOpSuccess] = useState<string | null>(null);

  // Load Hospitals
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const res = await hospitalService.getHospitals();
        if (!isMounted) return;
        const hospList = res.data || [];
        setHospitals(hospList);

        // Pick hospital linked to current user, or first hospital
        const defaultHosp =
          hospList.find((h) => currentUser?.id && h.authorizedUserIds?.includes(currentUser.id)) ||
          hospList[0];

        if (defaultHosp) {
          setSelectedHospitalId(defaultHosp.id);
          const inv = hospitalService.getHospitalInventory(defaultHosp.id);
          const txs = hospitalService.getHospitalTransactions(defaultHosp.id);
          if (isMounted) {
            setInventory(inv);
            setTransactions(txs);
          }
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // When selected hospital changes, reload its inventory
  const handleSelectHospital = (id: string) => {
    setSelectedHospitalId(id);
    setStockOpSuccess(null);
    const inv = hospitalService.getHospitalInventory(id);
    const txs = hospitalService.getHospitalTransactions(id);
    setInventory(inv);
    setTransactions(txs);
  };

  const activeHospital =
    hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0] || null;

  // Filter requests associated with this hospital
  const hospitalRequests = activeHospital
    ? requests.filter(
        (r) =>
          r.hospitalName.toLowerCase().includes(activeHospital.name.toLowerCase()) ||
          (activeHospital.city && r.city.toLowerCase() === activeHospital.city.toLowerCase())
      )
    : [];

  // Active emergencies in this hospital
  const activeEmergencies = hospitalRequests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  );

  // Total inventory units in stock
  const totalStockUnits = inventory.reduce((sum, item) => sum + item.availableUnits, 0);
  const lowStockItems = inventory.filter((item) => item.availableUnits <= 5);

  // Handle Inventory Update
  const handleUpdateStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHospital) return;

    const unitsDelta = stockAction === 'INTAKE' ? modalUnits : -modalUnits;

    const res = hospitalService.updateHospitalInventory(activeHospital.id, {
      bloodGroup: modalBloodGroup,
      component: modalComponent,
      unitsDelta,
      actionType: stockAction,
      performedBy: currentUser?.fullName || currentUser?.email || 'Authorized Hospital Officer',
      notes: modalReason,
    });

    if (res.success) {
      setStockOpSuccess(`Successfully logged ${stockAction.toLowerCase()} of ${modalUnits} units (${modalBloodGroup} ${modalComponent}).`);
      const updatedInv = hospitalService.getHospitalInventory(activeHospital.id);
      const updatedTxs = hospitalService.getHospitalTransactions(activeHospital.id);
      setInventory(updatedInv);
      setTransactions(updatedTxs);
      setShowStockModal(false);
    }
  };

  if (isLoading && hospitals.length === 0) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-app-text-secondary">Loading hospital operations desk...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Hospital Workspace Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Hospital Operations' },
        ]}
        roleBadge={{
          label: 'Hospital Operations & Blood Bank',
          variant: 'brand',
          icon: Building2,
        }}
        title={activeHospital ? `${activeHospital.name} Operations Desk` : 'Hospital Operations Portal'}
        description="Clinical emergency dispatch, on-site blood inventory tracking, donor transfusion coordination, and regulatory compliance."
        statusBadge={{
          label: activeHospital?.approvalStatus === 'APPROVED' ? 'Accredited Facility' : 'Review In Progress',
          live: activeHospital?.approvalStatus === 'APPROVED',
        }}
      />

      {/* Hospital Verification Status Banner */}
      {activeHospital && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
            activeHospital.approvalStatus === 'APPROVED'
              ? 'bg-success-light border-success-border text-success'
              : activeHospital.approvalStatus === 'SUBMITTED' || activeHospital.approvalStatus === 'UNDER_REVIEW'
              ? 'bg-info-light border-info-border text-info'
              : 'bg-emergency-light border-emergency-border text-emergency'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {activeHospital.approvalStatus === 'APPROVED' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <Clock className="w-5 h-5 shrink-0" />
            )}
            <div>
              <p className="font-bold">
                Verification Status: {activeHospital.approvalStatus.replace(/_/g, ' ')}
              </p>
              <p className="text-[11px] opacity-90">
                License: <span className="font-mono font-semibold">{activeHospital.registrationNumber}</span> • {activeHospital.address}, {activeHospital.city}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Hospital Selector for Coordinators/Admins */}
            {hospitals.length > 1 && (
              <select
                value={selectedHospitalId}
                onChange={(e) => handleSelectHospital(e.target.value)}
                className="text-xs bg-app-surface border border-app-border text-app-text rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.city})
                  </option>
                ))}
              </select>
            )}

            <Link
              to="/hospital/register"
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-[11px] font-bold hover:bg-brand-dark transition-colors inline-flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enroll Facility</span>
            </Link>
          </div>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="On-Site Units"
          value={totalStockUnits}
          subtext="Available in clinical cold storage"
          icon={Droplet}
          variant="brand"
        />
        <StatCard
          label="Active Transfusion Emergencies"
          value={activeEmergencies.length}
          subtext={activeEmergencies.length > 0 ? 'Donor coordination active' : 'All stabilized'}
          icon={Activity}
          variant={activeEmergencies.length > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Critical Reserve Warnings"
          value={lowStockItems.length}
          subtext={lowStockItems.length > 0 ? 'Stock below safety threshold' : 'All components healthy'}
          icon={AlertTriangle}
          variant={lowStockItems.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Authorized Staff"
          value={2}
          subtext="Medical Officers & Technicians"
          icon={Users}
          variant="info"
        />
      </div>

      {/* Success Notification */}
      {stockOpSuccess && (
        <div className="p-3.5 rounded-xl bg-success-light border border-success-border text-success text-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{stockOpSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setStockOpSuccess(null)}
            className="text-[11px] font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Operational Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
          }`}
        >
          <Droplet className="w-4 h-4" />
          <span>Cold-Chain Inventory ({inventory.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'requests'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Emergency Requests ({hospitalRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'staff'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Authorized Staff</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Stock Audit Log ({transactions.length})</span>
        </button>
      </div>

      {/* TAB 1: OPERATIONAL OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Action Bar */}
          <div className="bg-app-surface border border-app-border rounded-xl p-4 shadow-subtle flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-app-text uppercase tracking-wider font-display">
                Emergency Blood Bank Actions
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Log rapid units intake, register emergency transfusion, or trigger a coordinator alert.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setStockAction('INTAKE');
                  setShowStockModal(true);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-success text-white text-xs font-bold hover:bg-success/90 transition-colors shadow-xs"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Log Stock Intake</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockAction('TRANSFUSION');
                  setShowStockModal(true);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors shadow-xs"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Log Transfusion</span>
              </button>
            </div>
          </div>

          {/* Live Inventory Grid */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Current Cold-Chain Inventory Levels
              </h3>
              <span className="text-xs font-semibold text-app-text-secondary">
                {totalStockUnits} Total Available Units
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {inventory.slice(0, 8).map((item) => {
                const isLow = item.availableUnits <= 5;
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1 transition-all ${
                      isLow
                        ? 'border-warning-border bg-warning-light/30'
                        : 'border-app-border bg-app-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black text-brand font-display">
                        {item.bloodGroup}
                      </span>
                      {isLow && (
                        <span className="text-[10px] font-bold text-warning-dark bg-warning-light px-1.5 py-0.5 rounded border border-warning-border">
                          Low
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-app-text">{item.component}</p>
                    <div className="pt-1 flex items-baseline justify-between">
                      <span className="text-xl font-bold text-app-text font-mono">
                        {item.availableUnits}
                      </span>
                      <span className="text-[10px] text-app-text-secondary">
                        Total: {item.units}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Hospital Emergencies Feed */}
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 sm:p-6 shadow-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Emergency Dispatch Queue ({hospitalRequests.length})
              </h3>
              <Link
                to="/request"
                className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1"
              >
                <span>New Patient Request</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {hospitalRequests.length === 0 ? (
              <div className="py-8 text-center text-app-text-secondary text-xs">
                No active emergency requests recorded for this medical facility.
              </div>
            ) : (
              <div className="space-y-3">
                {hospitalRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border border-app-border bg-app-muted/20 hover:bg-app-muted/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-app-text bg-app-muted px-2 py-0.5 rounded border border-app-border">
                          {req.referenceCode}
                        </span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                            req.urgency === 'Critical'
                              ? 'bg-emergency-light text-emergency border border-emergency-border animate-pulse'
                              : 'bg-brand-light text-brand border border-brand/20'
                          }`}
                        >
                          {req.urgency}
                        </span>
                        <span className="text-app-text-secondary">Status: <strong>{req.status}</strong></span>
                      </div>
                      <p className="text-app-text font-medium">
                        Patient Need: <strong className="text-brand">{req.bloodGroup} {req.component}</strong> ({req.unitsRequired} Units)
                      </p>
                      <p className="text-[11px] text-app-text-secondary">
                        Contact: {req.contactName} ({req.contactPhone})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => navigate('/communication')}
                        className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Coordinate</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COLD-CHAIN INVENTORY TABLE */}
      {activeTab === 'inventory' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle overflow-hidden space-y-4">
          <div className="p-4 border-b border-app-border bg-app-muted/30 flex items-center justify-between">
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              On-Site Blood Units Matrix
            </h3>
            <button
              type="button"
              onClick={() => {
                setStockAction('INTAKE');
                setShowStockModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors shadow-xs inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Update Stock</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted/70 text-app-text-secondary uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold">Blood Group</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Component</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Available Units</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Reserved Units</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Total Stored</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                  <th scope="col" className="py-3 px-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {inventory.map((item) => {
                  const isLow = item.availableUnits <= 5;
                  return (
                    <tr key={item.id} className="hover:bg-app-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-extrabold text-brand font-display text-sm">
                        {item.bloodGroup}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-app-text">{item.component}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-sm">
                        {item.availableUnits} Units
                      </td>
                      <td className="py-3.5 px-4 font-mono text-app-text-secondary">
                        {item.reservedUnits} Units
                      </td>
                      <td className="py-3.5 px-4 font-mono text-app-text">
                        {item.units} Units
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isLow
                              ? 'bg-warning-light text-warning-dark border border-warning-border'
                              : 'bg-success-light text-success border border-success-border'
                          }`}
                        >
                          {isLow ? 'Critical Low' : 'Optimal'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setModalBloodGroup(item.bloodGroup);
                            setModalComponent(item.component);
                            setStockAction('TRANSFUSION');
                            setShowStockModal(true);
                          }}
                          className="text-brand hover:underline font-bold text-[11px]"
                        >
                          Transfuse
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: EMERGENCY REQUESTS */}
      {activeTab === 'requests' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Hospital Inpatient Emergency Requests
            </h3>
            <span className="text-xs text-app-text-secondary font-semibold">
              {hospitalRequests.length} Total Records
            </span>
          </div>

          <div className="space-y-3">
            {hospitalRequests.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-app-text bg-app-muted px-2 py-0.5 rounded border border-app-border">
                      {r.referenceCode}
                    </span>
                    <span className="font-bold text-brand font-display">{r.bloodGroup} {r.component}</span>
                    <span className="text-app-text-secondary">({r.unitsRequired} Units)</span>
                  </div>
                  <p className="text-app-text-secondary">
                    Hospital Ward / Address: {r.hospitalAddress}
                  </p>
                  <p className="text-[11px] text-app-text-secondary">
                    Reported by: {r.contactName} ({r.contactPhone}) • Priority: {r.urgency}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono bg-app-muted px-2 py-1 rounded border border-app-border font-bold uppercase">
                    {r.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/communication')}
                    className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors inline-flex items-center gap-1 shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open Comms</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AUTHORIZED STAFF */}
      {activeTab === 'staff' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Authorized Clinical & Transfusion Staff
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Designated personnel authorized to issue blood units and dispatch emergency requests.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                id: 'staff-1',
                name: activeHospital?.contactName || 'Dr. K. Srinivas Rao',
                email: activeHospital?.contactEmail || 'transfusion@hospital.org',
                phone: activeHospital?.contactPhone || '+91 40 2345 6789',
                role: 'Medical Superintendent / Transfusion In-Charge',
              },
              {
                id: 'staff-2',
                name: 'Nurse Kavitha Reddy',
                email: 'bloodbank.desk@hospital.org',
                phone: '+91 98490 88211',
                role: 'Senior Blood Bank Officer',
              },
            ].map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-app-text text-sm">{s.name}</span>
                  <span className="bg-brand-light text-brand text-[10px] font-bold px-2 py-0.5 rounded border border-brand/20">
                    Active
                  </span>
                </div>
                <p className="text-app-text-secondary font-mono text-[11px]">{s.email}</p>
                <p className="text-app-text-secondary">{s.phone}</p>
                <p className="text-[11px] font-medium text-app-text pt-1 border-t border-app-border">{s.role}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: INVENTORY AUDIT LOG / TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="bg-app-surface border border-app-border rounded-xl shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Immutable Stock Movement Log
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Logged intake and transfusion transactions for clinical traceability.
              </p>
            </div>
            <span className="text-xs font-mono bg-app-muted px-2 py-0.5 rounded border border-app-border">
              {transactions.length} Events
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 rounded-lg border border-app-border bg-app-muted/20 text-xs flex items-start justify-between gap-3 hover:bg-app-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                        tx.transactionType === 'INTAKE'
                          ? 'bg-success-light text-success border-success-border'
                          : 'bg-brand-light text-brand border-brand/20'
                      }`}
                    >
                      {tx.transactionType}
                    </span>
                    <span className="font-bold text-app-text font-display">
                      {tx.units} Units of {tx.bloodGroup} {tx.component}
                    </span>
                  </div>
                  <p className="text-app-text-secondary leading-relaxed">
                    Performed by: <strong>{tx.performedBy}</strong> {tx.notes ? `• ${tx.notes}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-app-text-secondary whitespace-nowrap shrink-0">
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Update Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <h3 className="text-sm font-bold text-app-text font-display">
                {stockAction === 'INTAKE' ? 'Record Stock Intake' : 'Record Patient Transfusion'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStockModal(false)}
                className="text-app-text-secondary hover:text-app-text text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleUpdateStock} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">Blood Group</label>
                  <select
                    value={modalBloodGroup}
                    onChange={(e) => setModalBloodGroup(e.target.value as BloodGroup)}
                    className="w-full p-2 rounded-xl border border-app-border bg-app-surface text-app-text font-bold"
                  >
                    {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as BloodGroup[]).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text mb-1">Component</label>
                  <select
                    value={modalComponent}
                    onChange={(e) => setModalComponent(e.target.value as BloodComponent)}
                    className="w-full p-2 rounded-xl border border-app-border bg-app-surface text-app-text font-semibold"
                  >
                    {(['Packed RBC', 'Whole Blood', 'Platelets', 'Plasma'] as BloodComponent[]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text mb-1">Number of Units</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={modalUnits}
                  onChange={(e) => setModalUnits(parseInt(e.target.value) || 1)}
                  className="w-full p-2 rounded-xl border border-app-border bg-app-surface text-app-text font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text mb-1">Clinical Note / Reason</label>
                <input
                  type="text"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. ICU Surgery Unit or Routine Depository Delivery"
                  className="w-full p-2 rounded-xl border border-app-border bg-app-surface text-app-text"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="px-4 py-2 rounded-xl border border-app-border text-app-text-secondary text-xs hover:bg-app-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white text-xs font-bold ${
                    stockAction === 'INTAKE' ? 'bg-success hover:bg-success/90' : 'bg-brand hover:bg-brand-dark'
                  }`}
                >
                  Confirm {stockAction}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
