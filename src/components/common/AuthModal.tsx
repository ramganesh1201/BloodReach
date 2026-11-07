import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard } from './AuthCard';
import { UserRole } from '../../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../../config/navigation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSuccess = (role: UserRole) => {
    onClose();
    const targetWorkspace = DEFAULT_WORKSPACE_BY_ROLE[role] || '/patient';
    navigate(targetWorkspace);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="CareLoop Access Portal"
    >
      <div className="w-full max-w-md my-8">
        <AuthCard
          initialMode={initialMode}
          onSuccess={handleSuccess}
          isModal={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
