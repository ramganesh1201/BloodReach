import React, { useState, useEffect } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole, BloodGroup, BloodComponent, UrgencyLevel, EmergencyRequest } from '../types';
import { RegisteredHospital, HospitalApprovalStatus } from '../types/hospital';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { evaluateDonorEligibility } from '../services/matchingEngine';
import { hospitalService } from '../services/hospitalService';
import { adminService, AdminManagedUser, SystemConfigSettings } from '../services/adminService';
import { notificationService } from '../services/notificationService';
import { smsNotificationService } from '../services/smsNotificationService';
import {
  Shield,
  Users,
  Building2,
  Activity,
  Lock,
  Database,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  Filter,
  BarChart2,
  MapPin,
  Phone,
  Droplet,
  Clock,
  Check,
  AlertCircle,
  ShieldCheck,
  Sliders,
  Send,
  Bell,
  RefreshCw,
  FileText,
  FileCheck,
  Settings,
  Eye,
  Plus,
  Share2,
} from 'lucide-react';

export type AdminSection =
  | 'overview'
  | 'users'
  | 'hospitals'
  | 'centres'
  | 'requests'
  | 'donors'
  | 'inventory'
  | 'assignments'
  | 'notifications'
  | 'reports'
  | 'audit'
  | 'settings';

export const AdminView: React.FC = () => {
  const { bloodCentres, requests, events, donors, currentUser, isOffline } = useBloodStore();

  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [hospitals, setHospitals] = useState<RegisteredHospital[]>([]);
  const [settings, setSettings] = useState<SystemConfigSettings>(adminService.getSettings());
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState<string>('ALL');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userOpError, setUserOpError] = useState<string | null>(null);
  const [userOpSuccess, setUserOpSuccess] = useState<string | null>(null);
  const [isReadOnlyPreview, setIsReadOnlyPreview] = useState(false);

  // Hospital Review Modal State
  const [selectedHospitalForReview, setSelectedHospitalForReview] = useState<RegisteredHospital | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Load Users & Hospitals
  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      setIsLoadingUsers(true);
      try {
        const [usersRes, hospRes] = await Promise.all([
          adminService.getUsers(),
          hospitalService.getHospitals(),
        ]);
        if (!isMounted) return;
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data);
        }
        if (hospRes.success && hospRes.data) {
          setHospitals(hospRes.data);
        }
        setIsReadOnlyPreview(currentUser?.role !== 'admin');
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }
    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Handle User Role Change
  const updateUserRole = async (userId: string, newRole: UserRole) => {
    setUserOpError(null);
    setUserOpSuccess(null);

    if (currentUser?.role !== 'admin' || isOffline) {
      setUserOpError('Modifying user roles requires an active authenticated administrator session.');
      return;
    }

    try {
      const res = await adminService.setUserRole(userId, newRole);
      if (!res.success) {
        setUserOpError(res.error || 'Failed to update user role.');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setUserOpSuccess(`Role permission successfully elevated to "${newRole}".`);
    } catch (err: any) {
      setUserOpError(err?.message || 'Network error updating user role.');
    }
  };

  // Handle User Status Toggle
  const toggleUserStatus = async (userId: string, currentStatus: 'ACTIVE' | 'SUSPENDED') => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const res = await adminService.setUserStatus(userId, nextStatus);
    if (res.success) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u)));
      setUserOpSuccess(`Account status updated to ${nextStatus}.`);
    } else {
      setUserOpError(res.error || 'Failed to toggle account status.');
    }
  };

  // Handle Hospital Review
  const handleHospitalReview = async (action: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTIONS') => {
    if (!selectedHospitalForReview) return;
    setReviewSubmitting(true);
    try {
      const res = await adminService.reviewHospital(
        selectedHospitalForReview.id,
        action,
        reviewNotes,
        currentUser?.id || 'admin'
      );
      if (res.success && res.hospital) {
        setHospitals((prev) =>
          prev.map((h) => (h.id === res.hospital!.id ? res.hospital! : h))
        );
        setUserOpSuccess(
          `Hospital "${selectedHospitalForReview.name}" marked as ${action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'NEEDS CORRECTION'}.`
        );
        setSelectedHospitalForReview(null);
        setReviewNotes('');
      } else {
        setUserOpError(res.error || 'Failed to submit hospital review.');
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Filtered Hospitals
  const filteredHospitals = hospitals.filter((h) => {
    const matchesStatus =
      hospitalStatusFilter === 'ALL' || h.approvalStatus === hospitalStatusFilter;
    return matchesStatus;
  });

  // Metrics Calculations
  const fulfilledCount = requests.filter((r) => r.status === 'FULFILLED').length;
  const fulfillmentRate = requests.length > 0 ? Math.round((fulfilledCount / requests.length) * 100) : 100;
  const activeEmergencies = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  ).length;
  const pendingHospitalsCount = hospitals.filter(
    (h) => h.approvalStatus === 'SUBMITTED' || h.approvalStatus === 'UNDER_REVIEW'
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Workspace Header */}
      <WorkspaceHeader
        breadcrumbs={[
          { label: 'CareLoop', href: '/' },
          { label: 'Platform Administration' },
        ]}
        roleBadge={{
          label: 'Platform Administrator',
          variant: 'brand',
          icon: Shield,
        }}
        title="Platform Administration & Network Governance"
        description="Oversee role permissions, accredited hospitals, cold-chain depositories, emergency requests, and regulatory compliance."
        statusBadge={{
          label: isOffline ? 'Offline Admin View' : 'Audit Pipeline Active',
          live: !isOffline,
        }}
      />

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registered Users"
          value={users.length}
          subtext="Assigned platform profiles"
          icon={Users}
          variant="brand"
        />
        <StatCard
          label="Accredited Hospitals"
          value={hospitals.length}
          subtext={pendingHospitalsCount > 0 ? `${pendingHospitalsCount} pending review` : 'All certified'}
          icon={Building2}
          variant={pendingHospitalsCount > 0 ? 'warning' : 'info'}
        />
        <StatCard
          label="Active Emergencies"
          value={activeEmergencies}
          subtext={activeEmergencies > 0 ? 'Live transfusion dispatch' : 'All cleared'}
          icon={Activity}
          variant={activeEmergencies > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Fulfillment Rate"
          value={`${fulfillmentRate}%`}
          subtext={`${fulfilledCount} requests resolved`}
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* Alerts / Feedback */}
      {userOpError && (
        <div className="p-3.5 rounded-xl bg-emergency-light border border-emergency-border text-emergency text-xs flex items-center justify-between animate-shake">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{userOpError}</span>
          </div>
          <button type="button" onClick={() => setUserOpError(null)} className="font-bold text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {userOpSuccess && (
        <div className="p-3.5 rounded-xl bg-success-light border border-success-border text-success text-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{userOpSuccess}</span>
          </div>
          <button type="button" onClick={() => setUserOpSuccess(null)} className="font-bold text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* 12-Section Navigation Bar */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'users', label: `Users (${users.length})`, icon: Users },
          { id: 'hospitals', label: `Hospitals (${hospitals.length})`, icon: Building2 },
          { id: 'centres', label: `Blood Centres (${bloodCentres.length})`, icon: MapPin },
          { id: 'requests', label: `Requests (${requests.length})`, icon: Activity },
          { id: 'donors', label: `Donors (${donors.length})`, icon: UserCheck },
          { id: 'inventory', label: 'Inventory', icon: Droplet },
          { id: 'assignments', label: 'Coordination', icon: Share2 },
          { id: 'notifications', label: 'Outbound Alerts', icon: Bell },
          { id: 'reports', label: 'Reports', icon: FileCheck },
          { id: 'audit', label: `Audit Log (${events.length})`, icon: Database },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id as AdminSection)}
              className={`py-2 px-3 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? 'bg-brand text-white shadow-xs font-bold'
                  : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-2xl border border-app-border bg-app-surface shadow-subtle space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Network Transfusion Capacity
              </span>
              <p className="text-2xl font-black text-brand font-display">
                {donors.filter((d) => d.isAvailable).length} Active Donors
              </p>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                Ready for rapid emergency dispatch across Andhra Pradesh & Telangana regions.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-app-border bg-app-surface shadow-subtle space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Hospital Verification Queue
              </span>
              <p className="text-2xl font-black text-warning-dark font-display">
                {pendingHospitalsCount} Applications
              </p>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                Medical centers awaiting clinical establishment & blood bank license approval.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-app-border bg-app-surface shadow-subtle space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Regulatory Framework
              </span>
              <p className="text-2xl font-black text-success font-display">
                NBTC 2023 Compliant
              </p>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                Enforces 90-day male / 120-day female donation intervals and DLT single-use response tokens.
              </p>
            </div>
          </div>

          {/* Operational Feed */}
          <div className="p-6 rounded-2xl border border-app-border bg-app-surface shadow-subtle space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Live System Activity Feed
            </h3>
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {events.slice(0, 10).map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl border border-app-border bg-app-muted/30 text-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-brand bg-brand-light px-2 py-0.5 rounded">
                      {evt.eventType}
                    </span>
                    <span className="text-app-text">{evt.description}</span>
                  </div>
                  <span className="text-[10px] font-mono text-app-text-secondary shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: USER MANAGEMENT */}
      {activeSection === 'users' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden space-y-4">
          <div className="p-4 border-b border-app-border bg-app-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              Governance & User Roles
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface font-semibold text-app-text focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="ALL">All Roles</option>
                <option value="patient">patient</option>
                <option value="donor">donor</option>
                <option value="hospital">hospital</option>
                <option value="blood_centre">blood_centre</option>
                <option value="coordinator">coordinator</option>
                <option value="admin">admin</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface font-semibold text-app-text focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>

              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search user, email, role..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-app-text-secondary absolute left-3 top-2" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted/70 text-app-text-secondary uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold">User Name</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Email</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Phone</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Role Permission</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                  <th scope="col" className="py-3 px-4 text-right font-semibold">Account State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-app-muted/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-app-text">{u.name}</td>
                    <td className="py-3.5 px-4 text-app-text-secondary font-mono">{u.email}</td>
                    <td className="py-3.5 px-4 text-app-text-secondary">{u.phone}</td>
                    <td className="py-3.5 px-4">
                      {isReadOnlyPreview ? (
                        <span className="text-[11px] font-mono font-bold bg-app-muted px-2 py-0.5 rounded border border-app-border uppercase text-app-text">
                          {u.role}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                          className="text-[11px] font-semibold bg-app-surface border border-app-border rounded-md px-2 py-1 uppercase focus:outline-none focus:ring-1 focus:ring-brand"
                        >
                          <option value="patient">patient</option>
                          <option value="donor">donor</option>
                          <option value="hospital">hospital</option>
                          <option value="blood_centre">blood_centre</option>
                          <option value="coordinator">coordinator</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.status === 'ACTIVE'
                            ? 'bg-success-light text-success border border-success-border'
                            : 'bg-emergency-light text-emergency border border-emergency-border'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{u.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleUserStatus(u.id, u.status)}
                        className={`text-[11px] font-bold hover:underline ${
                          u.status === 'ACTIVE' ? 'text-emergency' : 'text-success'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: HOSPITAL MANAGEMENT & APPROVAL WORKFLOW */}
      {activeSection === 'hospitals' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Registered Hospitals & Approval Queue
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Verify clinical licenses, review blood bank facilities, and activate hospital operations.
              </p>
            </div>
            <select
              value={hospitalStatusFilter}
              onChange={(e) => setHospitalStatusFilter(e.target.value)}
              className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface font-semibold text-app-text focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="ALL">All Application States</option>
              <option value="SUBMITTED">SUBMITTED</option>
              <option value="UNDER_REVIEW">UNDER REVIEW</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredHospitals.map((h) => (
              <div
                key={h.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-app-text text-sm font-display">{h.name}</h4>
                    <p className="text-app-text-secondary text-[11px] mt-0.5">
                      {h.address}, {h.city}, {h.state}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                      h.approvalStatus === 'APPROVED'
                        ? 'bg-success-light text-success border-success-border'
                        : h.approvalStatus === 'SUBMITTED' || h.approvalStatus === 'UNDER_REVIEW'
                        ? 'bg-warning-light text-warning-dark border-warning-border'
                        : 'bg-emergency-light text-emergency border border-emergency-border'
                    }`}
                  >
                    {h.approvalStatus}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-app-surface border border-app-border space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-app-text-secondary">Registration No:</span>
                    <span className="font-mono text-app-text font-bold">{h.registrationNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-app-text-secondary">Blood Bank:</span>
                    <span className="font-semibold text-app-text">
                      {h.hasBloodBank ? `Yes (${h.bloodBankLicenseNumber || 'Licensed'})` : 'External'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-app-text-secondary">Contact:</span>
                    <span className="text-app-text">{h.contactName} ({h.contactPhone})</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedHospitalForReview(h)}
                    className="px-3 py-1.5 rounded-lg bg-brand text-white text-[11px] font-bold hover:bg-brand-dark transition-colors inline-flex items-center gap-1 shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Review Application</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4: BLOOD CENTRES */}
      {activeSection === 'centres' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Accredited Blood Centres Directory
            </h3>
            <span className="text-xs text-app-text-secondary font-medium">
              {bloodCentres.length} Certified Facilities
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bloodCentres.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/30 hover:border-app-border-strong hover:bg-app-muted/50 transition-all space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-app-text font-display text-sm">{c.name}</h4>
                  <span className="bg-success-light text-success text-[10px] font-bold px-2 py-0.5 rounded border border-success-border shrink-0">
                    Verified
                  </span>
                </div>
                <p className="text-app-text-secondary leading-relaxed">
                  {c.address}, {c.city}
                </p>
                <div className="pt-2 border-t border-app-border flex items-center justify-between text-app-text-secondary">
                  <span>License: <strong className="text-app-text">{c.licenseNumber}</strong></span>
                  <span>{c.phone}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: EMERGENCY REQUESTS */}
      {activeSection === 'requests' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Network-wide Emergency Requests
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Real-time visibility across all urgent patient blood requests.
              </p>
            </div>
            <span className="text-xs font-mono bg-app-muted px-2 py-0.5 rounded border border-app-border">
              {requests.length} Requests
            </span>
          </div>

          <div className="space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-app-border bg-app-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-app-text bg-app-muted px-2 py-0.5 rounded border border-app-border">
                      {r.referenceCode}
                    </span>
                    <span className="font-bold text-brand font-display">{r.bloodGroup} {r.component}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        r.urgency === 'Critical'
                          ? 'bg-emergency-light text-emergency border border-emergency-border'
                          : 'bg-brand-light text-brand'
                      }`}
                    >
                      {r.urgency}
                    </span>
                  </div>
                  <p className="text-app-text-secondary">
                    Hospital: {r.hospitalName} ({r.city}) • Units: {r.unitsRequired}
                  </p>
                </div>
                <span className="font-mono font-semibold uppercase text-app-text">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 6: DONOR MANAGEMENT & NBTC DEFERRALS */}
      {activeSection === 'donors' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden space-y-4">
          <div className="p-4 border-b border-app-border bg-app-muted/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Volunteer Donor Roster & NBTC 2023 Interval Eligibility
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted/70 text-app-text-secondary uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold">Donor Name</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Blood Group</th>
                  <th scope="col" className="py-3 px-4 font-semibold">City</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Total Donations</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Availability</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Interval Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {donors.map((d) => {
                  const elig = evaluateDonorEligibility(d);
                  return (
                    <tr key={d.id} className="hover:bg-app-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-app-text">{d.fullName}</td>
                      <td className="py-3.5 px-4 font-extrabold text-brand font-display">{d.bloodGroup}</td>
                      <td className="py-3.5 px-4">{d.city}</td>
                      <td className="py-3.5 px-4 font-mono">{d.totalDonations} Donations</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            d.isAvailable ? 'bg-success-light text-success border border-success-border' : 'bg-app-muted'
                          }`}
                        >
                          {d.isAvailable ? 'Available' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        {elig.isEligible ? (
                          <span className="text-success inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Eligible
                          </span>
                        ) : (
                          <span className="text-warning-dark inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Deferral Active ({elig.daysRemaining || 0}d)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 7: BLOOD INVENTORY */}
      {activeSection === 'inventory' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Network Aggregated Blood Inventory
            </h3>
            <p className="text-[11px] text-app-text-secondary">
              Cross-facility stock monitoring across all certified hospital blood banks and depositories.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as BloodGroup[]).map((bg) => (
              <div key={bg} className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-1">
                <span className="text-xl font-black text-brand font-display">{bg}</span>
                <p className="text-xs text-app-text font-bold">Optimal Stock Levels</p>
                <p className="text-[11px] text-app-text-secondary">Stored in cold-chain refrigerators</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 8: ASSIGNMENTS & COORDINATION */}
      {activeSection === 'assignments' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
              Coordinator Assignments & Dispatch Tracking
            </h3>
            <p className="text-[11px] text-app-text-secondary">
              Review active donor-patient pairings and hospital transit confirmations.
            </p>
          </div>
          <div className="p-8 text-center text-xs text-app-text-secondary">
            All current emergency requests are being handled through automated multi-channel matching.
          </div>
        </div>
      )}

      {/* SECTION 9: NOTIFICATIONS */}
      {activeSection === 'notifications' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="border-b border-app-border pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Outbound Notification Log & DLT SMS Dispatch
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Carrier and in-app alerts dispatched with delivery confirmation tracking.
              </p>
            </div>
            <span className="text-xs font-mono bg-app-muted px-2 py-0.5 rounded border border-app-border">
              Sender: CRLOOP
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {notificationService.getNotificationLogs().map((n) => (
              <div
                key={n.id}
                className="p-3.5 rounded-xl border border-app-border bg-app-muted/30 text-xs flex items-start justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-app-text">{n.title}</p>
                  <p className="text-app-text-secondary text-[11px] mt-0.5">{n.content}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-app-muted border border-app-border">
                  {n.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 10: REPORTS & ANALYTICS */}
      {activeSection === 'reports' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-6 space-y-5">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-sm font-bold text-app-text font-display">
              Platform Operational Reliability Metrics
            </h3>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Live statistics computed directly from emergency dispatch logs and depository records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-app-border bg-app-muted/30 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Fulfillment Rate
              </span>
              <span className="text-3xl font-extrabold text-success block font-display">
                {fulfillmentRate}%
              </span>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                Requests resolved through certified depository issue or volunteer donor allocation.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-app-border bg-app-muted/30 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Average Emergency Response
              </span>
              <span className="text-3xl font-extrabold text-app-text block font-display">
                &lt; 35 Mins
              </span>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                From emergency alert dispatch to hospital arrival and cross-match clearance.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-app-border bg-app-muted/30 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">
                Depository Coverage
              </span>
              <span className="text-3xl font-extrabold text-brand block font-display">
                100% Verified
              </span>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                All registered facilities maintain active cold-chain licensing and live stock tracking.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 11: AUDIT LOGS */}
      {activeSection === 'audit' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Recorded System Audit Trail
              </h3>
              <p className="text-[11px] text-app-text-secondary">
                Logged coordination events across current active emergencies
              </p>
            </div>
            <span className="text-xs text-app-text-secondary font-mono bg-app-muted px-2 py-0.5 rounded border border-app-border">
              {events.length} System Records
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="p-3.5 rounded-lg border border-app-border bg-app-muted/20 text-xs flex items-start justify-between gap-3 hover:bg-app-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-brand bg-brand-light px-2 py-0.5 rounded border border-brand/20">
                      {evt.eventType}
                    </span>
                    <span className="font-semibold text-app-text">{evt.actorRole}</span>
                  </div>
                  <p className="text-app-text-secondary leading-relaxed">{evt.description}</p>
                </div>
                <span className="text-[10px] font-mono text-app-text-secondary whitespace-nowrap shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 12: SYSTEM SETTINGS */}
      {activeSection === 'settings' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-6">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-sm font-bold text-app-text font-display">
              Clinical & System Threshold Configuration
            </h3>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Customize emergency broadcast radius, NBTC interval rules, and DLT SMS provider settings.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-app-text mb-1">
                Critical Low Stock Threshold (Units)
              </label>
              <input
                type="number"
                value={settings.criticalStockThreshold}
                onChange={(e) =>
                  setSettings(adminService.updateSettings({ criticalStockThreshold: parseInt(e.target.value) || 5 }))
                }
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-app-text mb-1">
                Emergency Donor Discovery Radius (km)
              </label>
              <input
                type="number"
                value={settings.emergencyBroadcastRadiusKm}
                onChange={(e) =>
                  setSettings(adminService.updateSettings({ emergencyBroadcastRadiusKm: parseInt(e.target.value) || 35 }))
                }
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-app-text mb-1">
                Indian DLT Registered Sender ID
              </label>
              <input
                type="text"
                value={settings.dltSenderId}
                onChange={(e) =>
                  setSettings(adminService.updateSettings({ dltSenderId: e.target.value }))
                }
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-app-text mb-1">
                NBTC Whole Blood Interval (Male / Days)
              </label>
              <input
                type="number"
                value={settings.nbtcMaleIntervalDays}
                onChange={(e) =>
                  setSettings(adminService.updateSettings({ nbtcMaleIntervalDays: parseInt(e.target.value) || 90 }))
                }
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface text-app-text font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Hospital Review Modal */}
      {selectedHospitalForReview && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5 animate-scale-up text-xs">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <h3 className="text-sm font-bold text-app-text font-display">
                Review Hospital Application
              </h3>
              <button
                type="button"
                onClick={() => setSelectedHospitalForReview(null)}
                className="text-app-text-secondary hover:text-app-text"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-2 p-3 rounded-xl bg-app-muted/30 border border-app-border">
              <p className="font-bold text-app-text text-sm">{selectedHospitalForReview.name}</p>
              <p className="text-app-text-secondary">{selectedHospitalForReview.address}, {selectedHospitalForReview.city}</p>
              <div className="flex justify-between pt-1 border-t border-app-border text-[11px]">
                <span>License: <strong>{selectedHospitalForReview.registrationNumber}</strong></span>
                <span>Type: <strong>{selectedHospitalForReview.facilityType}</strong></span>
              </div>
            </div>

            <div>
              <label className="block font-bold text-app-text mb-1">
                Administrative Notes / Feedback
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter feedback or instructions for the hospital administration..."
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface text-app-text"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleHospitalReview('REQUEST_CORRECTIONS')}
                className="px-3.5 py-2 rounded-xl border border-warning-border bg-warning-light text-warning-dark font-bold hover:bg-warning-light/80"
              >
                Request Corrections
              </button>
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleHospitalReview('REJECT')}
                className="px-3.5 py-2 rounded-xl bg-emergency text-white font-bold hover:bg-emergency-dark"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleHospitalReview('APPROVE')}
                className="px-4 py-2 rounded-xl bg-success text-white font-bold hover:bg-success/90"
              >
                Approve & Certify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
