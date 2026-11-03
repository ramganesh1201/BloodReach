import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../../config/navigation';
import { Shield, Lock, X, ArrowRight, UserCheck, KeyRound, Building2, ClipboardList, UserRound } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInAsRole } = useBloodStore();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [email, setEmail] = useState('admin@bloodreach.org');
  const [password, setPassword] = useState('••••••••••••');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      signInAsRole(selectedRole);
      setIsLoading(false);
      onClose();
      const targetWorkspace = DEFAULT_WORKSPACE_BY_ROLE[selectedRole] || '/';
      navigate(targetWorkspace);
    }, 400);
  };

  const handleQuickPersonaSelect = (role: UserRole, defaultEmail: string) => {
    setSelectedRole(role);
    setEmail(defaultEmail);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden space-y-0">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Sign in to Workspace</h2>
              <p className="text-xs text-slate-300">Authenticate with your authorized credentials</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSignIn} className="p-6 space-y-5">
          {/* Quick Persona Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Select Authorized Workspace Role
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickPersonaSelect('admin', 'admin@bloodreach.org')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  selectedRole === 'admin'
                    ? 'border-red-600 bg-red-50/80 text-red-900 font-bold ring-2 ring-red-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 text-slate-700'
                }`}
              >
                <Shield className={`w-4 h-4 shrink-0 ${selectedRole === 'admin' ? 'text-red-600' : 'text-slate-500'}`} />
                <div>
                  <span className="text-xs font-bold block leading-tight">Administrator</span>
                  <span className="text-[10px] text-slate-500 font-normal">Full Control</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPersonaSelect('coordinator', 'coordinator@bloodreach.org')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  selectedRole === 'coordinator'
                    ? 'border-red-600 bg-red-50/80 text-red-900 font-bold ring-2 ring-red-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 text-slate-700'
                }`}
              >
                <ClipboardList className={`w-4 h-4 shrink-0 ${selectedRole === 'coordinator' ? 'text-red-600' : 'text-slate-500'}`} />
                <div>
                  <span className="text-xs font-bold block leading-tight">Coordinator</span>
                  <span className="text-[10px] text-slate-500 font-normal">Control Room</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPersonaSelect('blood_centre', 'centre@metroblood.org')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  selectedRole === 'blood_centre'
                    ? 'border-red-600 bg-red-50/80 text-red-900 font-bold ring-2 ring-red-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 text-slate-700'
                }`}
              >
                <Building2 className={`w-4 h-4 shrink-0 ${selectedRole === 'blood_centre' ? 'text-red-600' : 'text-slate-500'}`} />
                <div>
                  <span className="text-xs font-bold block leading-tight">Blood Centre</span>
                  <span className="text-[10px] text-slate-500 font-normal">Inventory Staff</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPersonaSelect('donor', 'donor@bloodreach.org')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  selectedRole === 'donor'
                    ? 'border-red-600 bg-red-50/80 text-red-900 font-bold ring-2 ring-red-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 text-slate-700'
                }`}
              >
                <UserCheck className={`w-4 h-4 shrink-0 ${selectedRole === 'donor' ? 'text-red-600' : 'text-slate-500'}`} />
                <div>
                  <span className="text-xs font-bold block leading-tight">Registered Donor</span>
                  <span className="text-[10px] text-slate-500 font-normal">Volunteer</span>
                </div>
              </button>
            </div>
          </div>

          {/* Form Inputs */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="py-2.5 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Workspace'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
