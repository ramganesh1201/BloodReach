import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole, BloodGroup } from '../../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../../config/navigation';
import {
  Shield,
  Lock,
  X,
  ArrowRight,
  UserCheck,
  Building2,
  ClipboardList,
  UserRound,
  Mail,
  Phone,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ChevronRight
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const ROLE_EXPLANATIONS: Record<UserRole, { title: string; desc: string; icon: any }> = {
  patient: {
    title: 'Patient / Attendant',
    desc: 'For individuals seeking emergency blood or components for a hospital patient.',
    icon: UserRound,
  },
  donor: {
    title: 'Registered Volunteer Donor',
    desc: 'For eligible donors ready to receive local emergency transfusion calls.',
    icon: UserCheck,
  },
  blood_centre: {
    title: 'Accredited Blood Centre Staff',
    desc: 'For hospital transfusion wings managing cold-chain stocks and unit clearance.',
    icon: Building2,
  },
  coordinator: {
    title: 'Emergency Coordinator',
    desc: 'For triage managers resolving deficits, radiuses, and atomic donor matching.',
    icon: ClipboardList,
  },
  admin: {
    title: 'System Administrator',
    desc: 'For platform governance, centre licensing, user status, and audit logs.',
    icon: Shield,
  },
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'signin' }) => {
  const { signIn, signUp, resetPassword, isAuthLoading, authError } = useBloodStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'otp'>(initialMode);
  
  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('coordinator@careloop.health');
  const [signInPassword, setSignInPassword] = useState('careloop2026');

  // Sign Up Form State
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('patient');
  const [regBloodGroup, setRegBloodGroup] = useState<BloodGroup>('O+');
  const [regCity, setRegCity] = useState('Hyderabad');

  // OTP State
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Forgot Password Form State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const result = await signIn(signInEmail, signInPassword);
    if (result.success) {
      onClose();
      let role: UserRole = 'patient';
      if (signInEmail.includes('admin')) role = 'admin';
      else if (signInEmail.includes('coordinator')) role = 'coordinator';
      else if (signInEmail.includes('centre') || signInEmail.includes('blood')) role = 'blood_centre';
      else if (signInEmail.includes('donor') || signInEmail.includes('sarah')) role = 'donor';
      navigate(DEFAULT_WORKSPACE_BY_ROLE[role] || '/');
    } else {
      setFormError(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!regFullName.trim() || !regEmail.trim() || !regPhone.trim()) {
      setFormError('Please complete all mandatory profile fields.');
      return;
    }

    const result = await signUp({
      email: regEmail,
      password: regPassword || 'careloop2026',
      fullName: regFullName,
      phone: regPhone,
      role: regRole,
      bloodGroup: regRole === 'donor' ? regBloodGroup : undefined,
      city: regCity,
    });

    if (result.success) {
      onClose();
      navigate(DEFAULT_WORKSPACE_BY_ROLE[regRole] || '/');
    } else {
      setFormError(result.error || 'Registration failed. Please check input data.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setForgotMessage(null);

    if (!forgotEmail) {
      setFormError('Please enter your registered email address.');
      return;
    }

    const res = await resetPassword(forgotEmail);
    if (res.success) {
      setForgotMessage(res.message);
    }
  };

  const setQuickPersona = (role: UserRole, email: string) => {
    setSignInEmail(email);
    setSignInPassword('careloop2026');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-text/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-app-surface rounded-xl border border-app-border shadow-elevated max-w-lg w-full overflow-hidden transition-all">
        {/* Header */}
        <div className="bg-app-text text-white p-5 relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand text-white flex items-center justify-center font-bold shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">CareLoop Access Portal</h2>
              <p className="text-xs text-app-muted/80">Authorized medical, coordinator & responder access</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-app-muted/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 bg-app-muted border-b border-app-border text-xs font-bold">
          <button
            type="button"
            onClick={() => { setMode('signin'); setFormError(null); }}
            className={`py-3 text-center transition-colors border-b-2 ${
              mode === 'signin'
                ? 'bg-app-surface text-app-text border-brand'
                : 'text-app-text-secondary hover:text-app-text border-transparent'
            }`}
          >
            Sign In to Workspace
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setFormError(null); }}
            className={`py-3 text-center transition-colors border-b-2 ${
              mode === 'signup'
                ? 'bg-app-surface text-app-text border-brand'
                : 'text-app-text-secondary hover:text-app-text border-transparent'
            }`}
          >
            Register Account
          </button>
        </div>

        {/* Error Alert Box */}
        {(formError || authError) && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emergency-light border border-emergency-border text-xs text-emergency flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError || authError}</span>
          </div>
        )}

        {/* 1. SIGN IN MODE */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="p-6 space-y-4">
            {/* Quick Persona Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider block">
                Quick Persona Access
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPersona('patient', 'patient@careloop.health')}
                  className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    signInEmail.includes('patient')
                      ? 'border-brand bg-brand-light text-brand font-bold ring-1 ring-brand'
                      : 'border-app-border hover:border-app-text/30 bg-app-surface text-app-text'
                  }`}
                >
                  <UserRound className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-xs truncate">Patient Attendant</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickPersona('donor', 'sarah.j@careloop.org')}
                  className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    signInEmail.includes('sarah') || signInEmail.includes('donor')
                      ? 'border-brand bg-brand-light text-brand font-bold ring-1 ring-brand'
                      : 'border-app-border hover:border-app-text/30 bg-app-surface text-app-text'
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-success shrink-0" />
                  <span className="text-xs truncate">Registered Donor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickPersona('coordinator', 'coordinator@careloop.health')}
                  className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    signInEmail.includes('coordinator')
                      ? 'border-brand bg-brand-light text-brand font-bold ring-1 ring-brand'
                      : 'border-app-border hover:border-app-text/30 bg-app-surface text-app-text'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-info shrink-0" />
                  <span className="text-xs truncate">Coordinator</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickPersona('blood_centre', 'central@careloop.health')}
                  className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    signInEmail.includes('central')
                      ? 'border-brand bg-brand-light text-brand font-bold ring-1 ring-brand'
                      : 'border-app-border hover:border-app-text/30 bg-app-surface text-app-text'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-warning-dark shrink-0" />
                  <span className="text-xs truncate">Blood Centre Staff</span>
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <Mail className="w-4 h-4 text-app-text-secondary absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-app-text">Password</label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] text-brand hover:underline font-semibold"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <Lock className="w-4 h-4 text-app-text-secondary absolute left-3 top-2.5" />
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-app-border">
              <span className="text-[11px] text-app-text-secondary">Secured role-based login</span>
              <button
                type="submit"
                disabled={isAuthLoading}
                className="py-2.5 px-6 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAuthLoading ? 'Authenticating...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* 2. REGISTRATION MODE WITH ROLE EXPLANATIONS */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-app-text block mb-1.5">Select User Role</label>
              <div className="space-y-1.5">
                {(['patient', 'donor', 'blood_centre', 'coordinator'] as UserRole[]).map((r) => {
                  const info = ROLE_EXPLANATIONS[r];
                  const Icon = info.icon;
                  const isSelected = regRole === r;

                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegRole(r)}
                      className={`w-full p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-all ${
                        isSelected
                          ? 'border-brand bg-brand-light ring-1 ring-brand'
                          : 'border-app-border bg-app-surface hover:bg-app-muted'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isSelected ? 'bg-brand text-white' : 'bg-app-muted text-app-text-secondary'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className={`text-xs font-bold block ${isSelected ? 'text-brand' : 'text-app-text'}`}>
                          {info.title}
                        </span>
                        <p className="text-[11px] text-app-text-secondary leading-snug">{info.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Full Legal Name</label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Kumar"
                  required
                  className="w-full px-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+91 98490 00000"
                  required
                  className="w-full px-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Email Address</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full px-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Password</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="w-full px-3 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand"
                />
              </div>
            </div>

            {regRole === 'donor' && (
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Your Blood Group</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {BLOOD_GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setRegBloodGroup(g)}
                      className={`py-1.5 text-xs font-bold rounded-md border ${
                        regBloodGroup === g ? 'bg-brand text-white border-brand' : 'bg-app-surface text-app-text border-app-border'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 flex items-center justify-between border-t border-app-border">
              <span className="text-[11px] text-app-text-secondary">Strict data privacy</span>
              <button
                type="submit"
                disabled={isAuthLoading}
                className="py-2.5 px-6 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAuthLoading ? 'Creating Account...' : 'Complete Registration'}
              </button>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD MODE */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-app-text">Password Reset Verification</h3>
              <p className="text-xs text-app-text-secondary mt-0.5">
                Enter your registered email address to receive secure recovery instructions.
              </p>
            </div>

            {forgotMessage && (
              <div className="p-3 rounded-lg bg-success-light border border-success-border text-xs text-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{forgotMessage}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-app-text block mb-1">Email Address</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-3.5 py-2 text-xs border border-app-border rounded-lg bg-app-surface text-app-text focus:border-brand"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-app-border">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-xs text-app-text-secondary hover:text-app-text font-semibold"
              >
                Back to Sign In
              </button>
              <button
                type="submit"
                className="py-2 px-5 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-xs"
              >
                Dispatch Reset Link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
