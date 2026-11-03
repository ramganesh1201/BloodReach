import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole } from '../types';
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
  RefreshCw,
  Eye,
  FileText,
  BarChart2,
  Settings
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
  const { bloodCentres, requests, events, donors } = useBloodStore();
  const [users, setUsers] = useState<ManagedUser[]>(INITIAL_MANAGED_USERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [adminTab, setAdminTab] = useState<'users' | 'centres' | 'donors' | 'audit' | 'reports'>('users');
  const [confirmModal, setConfirmModal] = useState<{
    action: string;
    userId: string;
    userName: string;
  } | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleUserStatus = (userId: string, currentStatus: 'ACTIVE' | 'SUSPENDED', userName: string) => {
    if (currentStatus === 'ACTIVE') {
      // Trigger confirmation dialog for destructive action
      setConfirmModal({
        action: 'SUSPEND',
        userId,
        userName,
      });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: 'ACTIVE' } : u))
      );
    }
  };

  const executeConfirmedAction = () => {
    if (confirmModal) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === confirmModal.userId ? { ...u, status: 'SUSPENDED' } : u
        )
      );
      setConfirmModal(null);
    }
  };

  const updateUserRole = (userId: string, newRole: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
  };

  // Metrics
  const fulfilledCount = requests.filter((r) => r.status === 'FULFILLED').length;
  const fulfillmentRate = requests.length > 0 ? Math.round((fulfilledCount / requests.length) * 100) : 100;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Destructive Action Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-app-surface rounded-xl p-6 max-w-md w-full shadow-elevated border border-app-border space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emergency-light text-emergency flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-app-text">Suspend User Account</h3>
                <p className="text-xs text-app-text-secondary">Are you sure you want to suspend access?</p>
              </div>
            </div>

            <p className="text-xs text-app-text leading-relaxed">
              Suspending <strong>{confirmModal.userName}</strong> will immediately invalidate their active sessions and prevent dispatch of blood coordination calls.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="py-2 px-4 rounded-lg border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="py-2 px-4 rounded-lg bg-emergency hover:bg-emergency-dark text-xs font-bold text-white shadow-xs transition-colors"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-brand" />
            <h1 className="text-2xl font-bold text-app-text tracking-tight">System Administration</h1>
          </div>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Platform governance, user authorization matrix, verified blood centre licensing, and immutable audit logs.
          </p>
        </div>

        <span className="text-xs bg-app-text text-white font-mono px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 self-start sm:self-auto shadow-xs">
          <Lock className="w-3.5 h-3.5 text-success" />
          <span>ADMIN PRIVILEGES GRANTED</span>
        </span>
      </div>

      {/* KPI System Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">Registered Users</span>
            <span className="text-2xl font-bold text-app-text mt-0.5 block">{users.length} Users</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-info-light text-info flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">Certified Centres</span>
            <span className="text-2xl font-bold text-app-text mt-0.5 block">{bloodCentres.length} Banks</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-success-light text-success flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">Total Emergencies</span>
            <span className="text-2xl font-bold text-app-text mt-0.5 block">{requests.length} Requests</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-warning-light text-warning-dark flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">Audit Events</span>
            <span className="text-2xl font-bold text-app-text mt-0.5 block">{events.length} Events</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-app-border pb-3 text-xs font-bold overflow-x-auto">
        <button
          type="button"
          onClick={() => setAdminTab('users')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            adminTab === 'users'
              ? 'bg-brand text-white shadow-xs'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Matrix ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('centres')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            adminTab === 'centres'
              ? 'bg-brand text-white shadow-xs'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Accredited Centres ({bloodCentres.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('donors')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            adminTab === 'donors'
              ? 'bg-brand text-white shadow-xs'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Donor Roster ({donors.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('audit')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            adminTab === 'audit'
              ? 'bg-brand text-white shadow-xs'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Audit Log ({events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('reports')}
          className={`py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
            adminTab === 'reports'
              ? 'bg-brand text-white shadow-xs'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Reports & Analytics</span>
        </button>
      </div>

      {/* Tab 1: User Management Matrix */}
      {adminTab === 'users' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-card overflow-hidden space-y-4">
          <div className="p-4 border-b border-app-border bg-app-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              Governance & User Roles
            </h3>
            <div className="flex items-center gap-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs border border-app-border rounded-lg px-2.5 py-1.5 bg-app-surface font-semibold text-app-text"
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
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <Search className="w-3.5 h-3.5 text-app-text-secondary absolute left-3 top-2" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted text-app-text uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role Permission</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-app-muted/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-app-text">{u.name}</td>
                    <td className="py-3 px-4 text-app-text-secondary font-mono">{u.email}</td>
                    <td className="py-3 px-4 text-app-text-secondary">{u.phone}</td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                        className="text-[11px] font-semibold bg-app-surface border border-app-border rounded-md px-2 py-1 uppercase"
                      >
                        <option value="patient">patient</option>
                        <option value="donor">donor</option>
                        <option value="blood_centre">blood_centre</option>
                        <option value="coordinator">coordinator</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
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
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(u.id, u.status, u.name)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                          u.status === 'ACTIVE'
                            ? 'text-emergency hover:bg-emergency-light'
                            : 'text-success hover:bg-success-light'
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

      {/* Tab 2: Centres */}
      {adminTab === 'centres' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text">Accredited Blood Centres Directory</h3>
            <span className="text-xs text-app-text-secondary">{bloodCentres.length} Certified Facilities</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bloodCentres.map((c) => (
              <div key={c.id} className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-2 text-xs">
                <div className="flex items-start justify-between">
                  <h4 className="font-bold text-app-text">{c.name}</h4>
                  <span className="bg-success-light text-success text-[10px] font-bold px-1.5 py-0.5 rounded border border-success-border">
                    Verified
                  </span>
                </div>
                <p className="text-app-text-secondary">{c.address}, {c.city}</p>
                <div className="pt-2 border-t border-app-border flex items-center justify-between text-app-text-secondary">
                  <span>License: <strong>{c.licenseNumber}</strong></span>
                  <span>{c.phone}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Donor Roster */}
      {adminTab === 'donors' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-card overflow-hidden">
          <div className="p-4 border-b border-app-border bg-app-muted/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text">Volunteer Donor Directory & Clearance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-app-text">
              <thead className="bg-app-muted text-app-text uppercase tracking-wider font-semibold text-[11px] border-b border-app-border">
                <tr>
                  <th className="py-3 px-4">Donor Name</th>
                  <th className="py-3 px-4">Blood Group</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Total Donations</th>
                  <th className="py-3 px-4">Availability</th>
                  <th className="py-3 px-4">Medical Clearance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {donors.map((d) => (
                  <tr key={d.id} className="hover:bg-app-muted/30 transition-colors">
                    <td className="py-3 px-4 font-bold">{d.fullName}</td>
                    <td className="py-3 px-4 font-bold text-brand">{d.bloodGroup}</td>
                    <td className="py-3 px-4">{d.city}</td>
                    <td className="py-3 px-4 font-mono">{d.totalDonations} Donations</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        d.isAvailable ? 'bg-success-light text-success' : 'bg-app-muted text-app-text-secondary'
                      }`}>
                        {d.isAvailable ? 'Available' : 'Paused'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-success font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Medically Cleared
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {adminTab === 'audit' && (
        <div className="bg-app-surface rounded-xl border border-app-border shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-app-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text">Immutable Security Audit Trail</h3>
            <span className="text-xs text-app-text-secondary font-mono">{events.length} System Records</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((evt) => (
              <div key={evt.id} className="p-3 rounded-lg border border-app-border bg-app-muted/20 text-xs flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-brand bg-brand-light px-1.5 py-0.2 rounded border border-brand/20">
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
        <div className="bg-app-surface rounded-xl border border-app-border shadow-card p-6 space-y-5">
          <div className="border-b border-app-border pb-3">
            <h3 className="text-sm font-bold text-app-text">Platform Operational Reliability Metrics</h3>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Live statistics computed directly from emergency dispatch logs and depository records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">Fulfillment Rate</span>
              <span className="text-2xl font-bold text-success block">{fulfillmentRate}%</span>
              <p className="text-[11px] text-app-text-secondary">Requests resolved through depository or volunteer issue.</p>
            </div>

            <div className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">Average Donor ETA</span>
              <span className="text-2xl font-bold text-app-text block">34 Mins</span>
              <p className="text-[11px] text-app-text-secondary">From alert acceptance to hospital transfusion wing arrival.</p>
            </div>

            <div className="p-4 rounded-xl border border-app-border bg-app-muted/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary">District Coverage</span>
              <span className="text-2xl font-bold text-brand block">100% Active</span>
              <p className="text-[11px] text-app-text-secondary">Automated dispatch active across Andhra Pradesh & Telangana.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
