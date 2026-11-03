import React from 'react';
import { Navigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../../config/navigation';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { currentRole, isAuthLoading, authError, signOut } = useBloodStore();

  // 1. Loading state during auth session / profile loading
  if (isAuthLoading) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto shadow-sm" />
        <h3 className="text-base font-bold text-slate-900">Preparing your BloodReach workspace...</h3>
        <p className="text-xs text-slate-500">Verifying authorization and resolving workspace permissions.</p>
      </div>
    );
  }

  // 2. Role resolution error state
  if (authError) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card space-y-5">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Workspace Unavailable</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              We couldn't determine your BloodReach role. Please try again or contact an administrator.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold py-2 px-4 rounded-xl text-xs transition-colors inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authorization check
  const isAllowed = allowedRoles.includes(currentRole);

  // 4. If unauthorized, redirect to the user's authorized workspace to avoid dead ends / access-restricted screens
  if (!isAllowed) {
    const targetWorkspace = DEFAULT_WORKSPACE_BY_ROLE[currentRole] || '/';
    return <Navigate to={targetWorkspace} replace />;
  }

  return <>{children}</>;
};

