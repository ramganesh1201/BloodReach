import React, { useState } from 'react';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole } from '../types';
import { Shield, Users, Building2, Activity, Lock, Database, Search, CheckCircle2 } from 'lucide-react';

interface MockUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
}

const MOCK_USERS: MockUser[] = [
  { id: 'u-1', name: 'Robert Taylor', email: 'robert.t@example.com', phone: '+1 555-012-3456', role: 'patient', status: 'ACTIVE' },
  { id: 'u-2', name: 'Sarah Jenkins', email: 'sarah.j@example.com', phone: '+1 555-0101', role: 'donor', status: 'ACTIVE' },
  { id: 'u-3', name: 'Metro Blood Staff', email: 'ops@metroblood.org', phone: '+1 555-019-2831', role: 'blood_centre', status: 'ACTIVE' },
  { id: 'u-4', name: 'Dr. Evelyn Vance', email: 'evelyn.v@bloodreach.org', phone: '+1 555-018-7711', role: 'coordinator', status: 'ACTIVE' },
  { id: 'u-5', name: 'System Admin', email: 'admin@bloodreach.org', phone: '+1 555-010-0000', role: 'admin', status: 'ACTIVE' },
];

export const AdminView: React.FC = () => {
  const { bloodCentres, requests, events } = useBloodStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = MOCK_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Administration</h1>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Platform governance, user authorization rules, organization verified status, and security audit logs.
          </p>
        </div>

        <span className="text-xs bg-slate-900 text-white font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 self-start sm:self-auto">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          ADMIN PRIVILEGES ACTIVE
        </span>
      </div>

      {/* KPI System Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Registered</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{MOCK_USERS.length} Users</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Verified Banks</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{bloodCentres.length} Banks</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Emergencies</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{requests.length} Requests</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Audit Events</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{events.length} Events</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden space-y-4">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">User Authorization Matrix</h3>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search user name, email, role..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-900 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">User Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                  <td className="py-3 px-4 text-slate-600 font-mono">{u.email}</td>
                  <td className="py-3 px-4 text-slate-600">{u.phone}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white uppercase">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
