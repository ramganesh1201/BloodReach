import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthCard } from '../components/common/AuthCard';
import { Droplet, ArrowLeft, ShieldCheck, Lock, Activity } from 'lucide-react';

interface LoginViewProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export const LoginView: React.FC<LoginViewProps> = ({ initialMode }) => {
  const location = useLocation();
  const isRegisterPath = location.pathname === '/register';
  const resolvedMode = initialMode || (isRegisterPath ? 'signup' : 'signin');

  return (
    <div className="min-h-[85vh] flex flex-col justify-center py-10 sm:py-16 px-4 sm:px-6 lg:px-8 bg-app-bg animate-fade-in">
      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-6">
        {/* Top Back Link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-text-secondary hover:text-app-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to CareLoop Overview</span>
        </Link>

        {/* Central Logo & System Identifier */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-brand-light text-brand px-3 py-1 rounded-full text-xs font-bold border border-brand/20 shadow-subtle">
            <Droplet className="w-3.5 h-3.5 fill-current" />
            <span>National Emergency Blood Coordination Grid</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-app-text tracking-tight font-display">
            CareLoop Access Portal
          </h1>
          <p className="text-xs sm:text-sm text-app-text-secondary max-w-sm mx-auto">
            Unified authentication for patients, volunteer donors, accredited blood centres, and coordinators.
          </p>
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <AuthCard initialMode={resolvedMode} isModal={false} />
      </div>

      {/* Trust & Clinical Governance Footer Badges */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md mt-8 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-app-text-secondary">
          <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-app-surface border border-app-border">
            <Lock className="w-4 h-4 text-brand" />
            <span className="font-semibold text-app-text">Encrypted</span>
            <span className="text-[10px] text-app-text-secondary">TLS 1.3 End-to-End</span>
          </div>

          <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-app-surface border border-app-border">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span className="font-semibold text-app-text">Verified</span>
            <span className="text-[10px] text-app-text-secondary">Role Access Control</span>
          </div>

          <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-app-surface border border-app-border">
            <Activity className="w-4 h-4 text-info" />
            <span className="font-semibold text-app-text">Audited</span>
            <span className="text-[10px] text-app-text-secondary">Immutable Log Trail</span>
          </div>
        </div>

        <p className="text-[11px] text-center text-app-text-secondary leading-relaxed px-4">
          Emergency Notice: For immediate critical trauma or life-threatening hemorrhage, notify the hospital transfusion service and local ambulance (108/112) immediately.
        </p>
      </div>
    </div>
  );
};

export default LoginView;
