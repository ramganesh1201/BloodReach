import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../store/useBloodStore';
import { UserRole } from '../types';
import { ROLE_DEFAULT_ROUTES } from '../config/navigation';
import { DonorOnboardingModal } from '../components/donor/DonorOnboardingModal';
import { ShieldAlert, ArrowLeft, Home, Heart } from 'lucide-react';

interface AccessRestrictedViewProps {
  allowedRoles: UserRole[];
}

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  patient: 'Patient / Attendant',
  donor: 'Registered Blood Donor',
  blood_centre: 'Blood Centre',
  coordinator: 'Coordinator',
  admin: 'Administrator',
};

export const AccessRestrictedView: React.FC<AccessRestrictedViewProps> = ({ allowedRoles }) => {
  const { currentRole } = useBloodStore();
  const navigate = useNavigate();
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const currentRoleName = ROLE_DISPLAY_NAMES[currentRole] || currentRole;
  const allowedRoleNames = allowedRoles.map((r) => ROLE_DISPLAY_NAMES[r]).join(' or ');
  const defaultWorkspace = ROLE_DEFAULT_ROUTES[currentRole] || '/';
  const canApplyAsDonor = allowedRoles.includes('donor') && currentRole === 'patient';

  return (
    <div className="max-w-xl mx-auto py-16 px-4 space-y-6 text-center">
      <div className="bg-app-surface rounded-xl border border-app-border p-8 shadow-card space-y-6">
        <div className="w-14 h-14 rounded-full bg-red-50 text-emergency flex items-center justify-center mx-auto border border-red-100">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="text-caption font-semibold text-emergency uppercase tracking-wider">
            Authorization Boundary
          </span>
          <h1 className="text-2xl font-bold text-app-text-primary tracking-tight">
            Access Restricted
          </h1>
          <p className="text-secondary text-app-text-secondary leading-relaxed max-w-sm mx-auto">
            You don't have authorization to access this workspace under your current credentialed role.
          </p>
        </div>

        <div className="bg-app-bg p-4 rounded-lg border border-app-border text-xs text-left space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-app-text-secondary font-medium">Your Current Role:</span>
            <strong className="text-app-text-primary font-bold">{currentRoleName}</strong>
          </div>
          <div className="flex justify-between items-center border-t border-app-border pt-2">
            <span className="text-app-text-secondary font-medium">Required Role Level:</span>
            <strong className="text-emergency font-bold">{allowedRoleNames}</strong>
          </div>
        </div>

        {canApplyAsDonor && (
          <div className="bg-brand-light/30 border border-brand/20 rounded-xl p-4 text-left space-y-3">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-brand shrink-0" />
              <strong className="text-xs font-bold text-app-text">Interested in becoming a Blood Donor?</strong>
            </div>
            <p className="text-[11px] text-app-text-secondary leading-relaxed">
              CareLoop welcomes eligible voluntary donors. Complete our clinical onboarding questionnaire to submit your profile for coordinator review and activation.
            </p>
            <button
              type="button"
              onClick={() => setIsOnboardingModalOpen(true)}
              className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Heart className="w-3.5 h-3.5" />
              Register as Volunteer Donor
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(defaultWorkspace)}
            className="w-full sm:w-auto bg-app-surface border border-app-border text-app-text-primary hover:bg-app-muted font-medium py-2.5 px-6 rounded-lg text-xs transition-colors shadow-sm inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Authorized Workspace
          </button>
          <Link
            to="/"
            className="w-full sm:w-auto bg-app-surface border border-app-border text-app-text-primary hover:bg-app-muted font-medium py-2.5 px-5 rounded-lg text-xs transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Home className="w-4 h-4 text-app-text-secondary" />
            Platform Overview
          </Link>
        </div>
      </div>

      <DonorOnboardingModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
};
