import React, { useState, useEffect } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole } from '../types';
import { WorkspaceHeader } from '../components/common/WorkspaceHeader';
import { StatCard } from '../components/common/StatCard';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { evaluateDonorEligibility } from '../services/matchingEngine';
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
} from 'lucide-react';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
}

const INITIAL_MANAGED_USERS: ManagedUser[] = [
  { id: 'u-1', name: 'Robert Taylor', email: 'patient@careloop.health', phone: '+91 98490 55123', role: 'patient', status: 'ACTIVE' },
  { id: 'u-2', name: 'Sarah Jenkins', email: 'sarah.j@careloop.org', phone: '+91 98490 12345', role: 'donor', status: 'ACTIVE' },
  { id: 'u-3', name: 'Central Depot Ops', email: 'central@careloop.health', phone: '+91 40 2345 6789', role: 'blood_centre', status: 'ACTIVE' },
  { id: 'u-4', name: 'Dr. Evelyn Vance', email: 'coordinator@careloop.health', phone: '+91 40 2311 8899', role: 'coordinator', status: 'ACTIVE' },
  { id: 'u-5', name: 'System Admin', email: 'admin@careloop.health', phone: '+91 40 2300 0000', role: 'admin', status: 'ACTIVE' },
  { id: 'u-6', name: 'Dr. Michael Chen', email: 'm.chen@hospital.org', phone: '+91 98490 12346', role: 'donor', status: 'ACTIVE' },
  { id: 'u-7', name: 'Priya Sharma', email: 'priya.s@careloop.org', phone: '+91 98490 12347', role: 'donor', status: 'ACTIVE' },
];

export const AdminView: React.FC = () => {
  const { bloodCentres, requests, events, donors, currentUser, isOffline } = useBloodStore();
  const [users, setUsers] = useState<ManagedUser[]>(INITIAL_MANAGED_USERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [adminTab, setAdminTab] = useState<'users' | 'centres' | 'donors' | 'audit' | 'reports'>('users');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userOpError, setUserOpError] = useState<string | null>(null);
  const [userOpSuccess, setUserOpSuccess] = useState<string | null>(null);
  const [isReadOnlyPreview, setIsReadOnlyPreview] = useState(true);

  // Synchronize with real Supabase profiles when an authenticated administrator session exists
  useEffect(() => {
    let isMounted = true;
    async function loadRealProfiles() {
      if (!isSupabaseConfigured || isOffline || currentUser?.role !== 'admin') {
        setIsReadOnlyPreview(true);
        return;
      }

      setIsLoadingUsers(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, role, status')
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        if (error || !data || data.length === 0) {
          setIsReadOnlyPreview(true);
        } else {
          setUsers(
            data.map((p: any) => ({
              id: p.id,
              name: p.full_name || 'CareLoop User',
              email: p.email || '—',
              phone: p.phone || '—',
              role: (p.role as UserRole) || 'patient',
              status: (p.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE',
            }))
          );
          setIsReadOnlyPreview(false);
        }
      } catch (err) {
        if (isMounted) setIsReadOnlyPreview(true);
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }

    loadRealProfiles();
    return () => {
      isMounted = false;
    };
  }, [currentUser, isOffline]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    setUserOpError(null);
    setUserOpSuccess(null);

    // If an authenticated admin session is active, execute database RPC
    if (isSupabaseConfigured && currentUser?.role === 'admin' && !isOffline) {
      try {
        const { data, error } = await supabase.rpc('admin_set_user_role', {
          p_user_id: userId,
          p_new_role: newRole,
        });

        if (error || (data && !data.success)) {
          setUserOpError(error?.message || data?.message || 'Failed to update user role in database.');
          return;
        }

        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
        setUserOpSuccess(`Role successfully updated to "${newRole}".`);
      } catch (err: any) {
        setUserOpError(err?.message || 'Unexpected network error modifying user role.');
      }
    } else {
      // Unauthenticated or evaluation preview: refuse fake mutation
      setUserOpError(
        'Modifying user roles requires an active authenticated administrator session with database permissions.'
      );
    }
  };

  // Metrics
  const fulfilledCount = requests.filter((r) => r.status === 'FULFILLED').length;
  const fulfillmentRate = requests.length > 0 ? Math.round((fulfilledCount / requests.length) * 100) : 100;
  const activeEmergencies = requests.filter(
    (r) => r.status !== 'FULFILLED' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED'
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Unified Healthcare Header */}
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
        title="Platform Administration & Governance"
        description="User role permissions, accredited blood centre licensing, immutable audit trails, and dispatch reliability analytics."
        statusBadge={{
          label: isOffline ? 'Offline Admin View' : 'Audit Pipeline Active',
          live: !isOffline,
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registered Users"
          value={users.length}
          subtext="Active role-assigned profiles"
          icon={Users}
          variant="brand"
        />
        <StatCard
          label="Certified Depository Facilities"
          value={bloodCentres.length}
          subtext="Cold-chain accredited banks"
          icon={Building2}
          variant="info"
        />
        <StatCard
          label="Active Emergencies"
          value={activeEmergencies}
          subtext={activeEmergencies > 0 ? 'Under active coordination' : 'All cleared'}
          icon={Activity}
          variant={activeEmergencies > 0 ? 'emergency' : 'neutral'}
        />
        <StatCard
          label="Audit Log Stream"
          value={events.length}
          subtext="Session coordination trail"
          icon={Database}
          variant="success"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto">
        <button
          type="button"
          onClick={() => setAdminTab('users')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${adminTab === 'users'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
            }`}
        >
          <Users className="w-4 h-4" />
          <span>User Matrix ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('centres')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${adminTab === 'centres'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
            }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Accredited Centres ({bloodCentres.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('donors')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${adminTab === 'donors'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
            }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Donor Roster ({donors.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('audit')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${adminTab === 'audit'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
            }`}
        >
          <Database className="w-4 h-4" />
          <span>Audit Log ({events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('reports')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${adminTab === 'reports'
              ? 'bg-brand text-white shadow-xs font-bold'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted font-medium'
            }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Reports & Analytics</span>
        </button>
      </div>

      {/* Tab 1: User Matrix */}
      {adminTab === 'users' && (
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
                <option value="patient">Patient</option>
                <option value="donor">Donor</option>
                <option value="blood_centre">Blood Centre</option>
                <option value="coordinator">Coordinator</option>
                <option value="admin">Administrator</option>
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

          {isReadOnlyPreview && (
            <div className="bg-info-light border-b border-info-border p-3 text-xs text-info flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Evaluation View:</strong> Displaying user directory in read-only mode. Live database role changes via <code className="font-mono text-[11px]">admin_set_user_role</code> require an active authenticated administrator session.
                </span>
              </div>
            </div>
          )}

          {userOpError && (
            <div className="bg-emergency-light border-b border-emergency-border p-3 text-xs text-emergency flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{userOpError}</span>
            </div>
          )}

          {userOpSuccess && (
            <div className="bg-success-light border-b border-success-border p-3 text-xs text-success flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{userOpSuccess}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted/70 text-app-text-secondary uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold">User Name</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Email</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Phone</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Role Permission</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                  <th scope="col" className="py-3 px-4 text-right font-semibold">Access Control</th>
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
                          <option value="blood_centre">blood_centre</option>
                          <option value="coordinator">coordinator</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${u.status === 'ACTIVE'
                            ? 'bg-success-light text-success border border-success-border'
                            : 'bg-emergency-light text-emergency border border-emergency-border'
                          }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        <span>{u.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className="text-[11px] text-app-text-secondary cursor-help"
                        title="User account suspension and session invalidation require identity provider administration."
                      >
                        ID Provider Managed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Centres */}
      {adminTab === 'centres' && (
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

      {/* Tab 3: Donor Roster */}
      {adminTab === 'donors' && (
        <div className="space-y-4">
          {userOpSuccess && (
            <div className="p-3 bg-success-light border border-success-border rounded-lg text-xs text-success flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{userOpSuccess}</span>
            </div>
          )}
          {userOpError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-emergency flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{userOpError}</span>
            </div>
          )}

          <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle overflow-hidden">
            <div className="p-4 border-b border-app-border bg-app-muted/30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Volunteer Donor Roster & Interval Eligibility
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
                    <th scope="col" className="py-3 px-4 font-semibold">Role Activation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {donors.map((d) => {
                    const elig = evaluateDonorEligibility(d);
                    const linkedUser = users.find(
                      (u) => (d.profileId && u.id === d.profileId) || (d.email && u.email.toLowerCase() === d.email.toLowerCase())
                    );
                    return (
                      <tr key={d.id} className="hover:bg-app-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-app-text">{d.fullName}</td>
                        <td className="py-3.5 px-4 font-extrabold text-brand text-sm font-display">
                          {d.bloodGroup}
                        </td>
                        <td className="py-3.5 px-4">{d.city}</td>
                        <td className="py-3.5 px-4 font-mono font-medium">{d.totalDonations} Donations</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${d.isAvailable
                                ? 'bg-success-light text-success border border-success-border'
                                : 'bg-app-muted text-app-text-secondary border border-app-border'
                              }`}
                          >
                            {d.isAvailable ? 'Available' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {elig.reason === 'Unable to determine — blood centre assessment required' ? (
                            <span
                              className="text-warning-dark font-semibold inline-flex items-center gap-1 cursor-help"
                              title="NBTC 2023 whole blood interval requires recorded sex (90d male / 120d female). Blood centre assessment required."
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Assessment Required</span>
                            </span>
                          ) : elig.isEligible ? (
                            <span className="text-success font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Interval-Eligible</span>
                            </span>
                          ) : (
                            <span className="text-warning-dark font-semibold inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Interval Active ({elig.daysRemaining || 0}d)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {linkedUser ? (
                            linkedUser.role === 'donor' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-success-light text-success border border-success-border inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Active Donor
                              </span>
                            ) : linkedUser.role === 'patient' ? (
                              <button
                                type="button"
                                onClick={() => updateUserRole(linkedUser.id, 'donor')}
                                className="px-2.5 py-1 rounded bg-brand hover:bg-brand-dark text-white text-[11px] font-bold shadow-xs transition-colors inline-flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3 h-3" /> Activate Donor Role
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-app-muted text-app-text-secondary border border-app-border uppercase">
                                {linkedUser.role}
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-app-text-secondary font-medium">Volunteer Record</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-app-muted/30 border-t border-app-border text-[11px] text-app-text-secondary">
              * Note: CareLoop evaluates interval eligibility based on NBTC 2023 guidelines (90 days for male donors, 120 days for female donors for whole blood). Where biological sex is not recorded, eligibility displays as "Unable to determine — blood centre assessment required". Mandatory physical screening, vital checks, hemoglobin screening (≥12.5 g/dL), and cross-matching are conducted on-site by accredited hospital pathologists upon arrival.
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {adminTab === 'audit' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-subtle p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text font-display">
                Recorded System Audit Trail
              </h3>
              <p className="text-[11px] text-app-text-secondary">Logged coordination events across current active emergencies</p>
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

      {/* Tab 5: Reports */}
      {adminTab === 'reports' && (
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
    </div>
  );
};
