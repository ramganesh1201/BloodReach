import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole } from '../types';
import { ROLE_DEFAULT_ROUTES } from '../config/navigation';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

interface AccessRestrictedViewProps {
  allowedRoles: UserRole[];
}

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  patient: 'Patient / Attendant',
  donor: 'Registered Donor',
  blood_centre: 'Blood Centre',
  coordinator: 'Coordinator',
  admin: 'Administrator',
};

export const AccessRestrictedView: React.FC<AccessRestrictedViewProps> = ({ allowedRoles }) => {
  const { currentRole } = useBloodStore();
  const navigate = useNavigate();

  const currentRoleName = ROLE_DISPLAY_NAMES[currentRole] || currentRole;
  const allowedRoleNames = allowedRoles.map((r) => ROLE_DISPLAY_NAMES[r]).join(' or ');
  const defaultWorkspace = ROLE_DEFAULT_ROUTES[currentRole] || '/';

  return (
    <div className="max-w-xl mx-auto py-16 px-4 space-y-6 text-center">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold text-red-600 uppercase tracking-wider">
            Authorization Boundary
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Access Restricted
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            You don't have permission to access this area under your current role context.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500 font-semibold">Your Current Role:</span>
            <strong className="text-slate-900 font-bold">{currentRoleName}</strong>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <span className="text-slate-500 font-semibold">Required Access Level:</span>
            <strong className="text-red-700 font-bold">{allowedRoleNames}</strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(defaultWorkspace)}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-colors shadow-sm inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to My Workspace
          </button>
          <Link
            to="/"
            className="w-full sm:w-auto bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold py-2.5 px-5 rounded-xl text-xs transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Home className="w-4 h-4" />
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
};
