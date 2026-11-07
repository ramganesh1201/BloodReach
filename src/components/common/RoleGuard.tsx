import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { AccessRestrictedView } from '../../views/AccessRestrictedView';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { currentRole, authenticatedRole, currentUser, isAuthLoading, authError, signOut } = useBloodStore();
  const location = useLocation();

  // 1. Loading state during auth session / profile loading from Supabase
  if (isAuthLoading) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto shadow-sm" />
        <h3 className="text-base font-semibold text-app-text">Securing workspace session...</h3>
        <p className="text-xs text-app-text-secondary">Verifying clinical credentials and workspace permissions.</p>
      </div>
    );
  }

  // 2. Role resolution error state
  if (authError) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="bg-app-surface rounded-xl border border-app-border p-8 shadow-card space-y-5">
          <div className="w-12 h-12 rounded-full bg-emergency-light text-emergency flex items-center justify-center mx-auto border border-emergency-border">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-app-text tracking-tight">Workspace Unavailable</h2>
            <p className="text-xs text-app-text-secondary leading-relaxed">
              We couldn't determine your CareLoop authorization role. Please verify your credentials or contact the network administrator.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-brand hover:bg-brand-dark text-white font-medium py-2 px-4 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="bg-app-surface border border-app-border text-app-text hover:bg-app-muted font-medium py-2 px-4 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-app-text-secondary" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthenticated user: Not signed in with a verified session
  if (!authenticatedRole || !currentUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 4. Authenticated user authorization check
  const isAllowed = allowedRoles.includes(authenticatedRole);

  // 5. If unauthorized, render AccessRestrictedView to clearly show the authorization boundary
  if (!isAllowed) {
    return <AccessRestrictedView allowedRoles={allowedRoles} />;
  }

  return <>{children}</>;
};
