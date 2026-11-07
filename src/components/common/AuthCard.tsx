import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { DEFAULT_WORKSPACE_BY_ROLE } from '../../config/navigation';
import {
  Shield,
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  X
} from 'lucide-react';

interface AuthCardProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
  onSuccess?: (role: UserRole) => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  initialMode = 'signin',
  onSuccess,
  isModal = false,
  onClose,
}) => {
  const { signIn, signUp, resetPassword, isAuthLoading, authError } = useBloodStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);

  // Sign In State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Registration State
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // General feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setForgotSuccess(null);
  };

  const handleModeChange = (newMode: 'signin' | 'signup' | 'forgot') => {
    setMode(newMode);
    clearMessages();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!signInEmail.trim() || !signInPassword) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    const result = await signIn(signInEmail, signInPassword);

    if (result.success && result.role) {
      if (onSuccess) {
        onSuccess(result.role);
      } else {
        const redirectPath = (location.state as any)?.from || DEFAULT_WORKSPACE_BY_ROLE[result.role] || '/patient';
        navigate(redirectPath, { replace: true });
      }
    } else {
      setErrorMessage(result.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!regFullName.trim() || !regEmail.trim() || !regPhone.trim() || !regPassword) {
      setErrorMessage('Please complete all mandatory registration fields.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password entry.');
      return;
    }

    const result = await signUp({
      fullName: regFullName.trim(),
      email: regEmail.trim(),
      phone: regPhone.trim(),
      password: regPassword,
    });

    if (result.success) {
      if (result.needsEmailConfirmation) {
        setSuccessMessage('Registration successful! Please check your email inbox to verify your account before signing in.');
        setMode('signin');
      } else if (result.role) {
        if (onSuccess) {
          onSuccess(result.role);
        } else {
          navigate(DEFAULT_WORKSPACE_BY_ROLE[result.role] || '/patient', { replace: true });
        }
      }
    } else {
      setErrorMessage(result.error || 'Registration failed. Please check your information and try again.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    const result = await resetPassword(forgotEmail.trim());
    if (result.success) {
      setForgotSuccess(result.message);
    } else {
      setErrorMessage(result.error || 'Unable to dispatch recovery email. Please try again.');
    }
  };

  return (
    <div className="bg-app-surface rounded-2xl border border-app-border shadow-elevated overflow-hidden max-w-md w-full mx-auto transition-all">
      {/* Brand Header */}
      <div className="bg-app-text text-white p-6 relative flex items-center justify-between border-b border-app-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-white">CareLoop Portal</h2>
            <p className="text-xs text-app-muted/80">Authorized healthcare & emergency access</p>
          </div>
        </div>

        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-app-muted/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close portal modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Mode Navigation Tabs */}
      <div className="grid grid-cols-2 bg-app-muted/60 border-b border-app-border text-xs font-bold">
        <button
          type="button"
          onClick={() => handleModeChange('signin')}
          className={`py-3 text-center transition-colors border-b-2 ${
            mode === 'signin' || mode === 'forgot'
              ? 'bg-app-surface text-app-text border-brand'
              : 'text-app-text-secondary hover:text-app-text border-transparent'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('signup')}
          className={`py-3 text-center transition-colors border-b-2 ${
            mode === 'signup'
              ? 'bg-app-surface text-app-text border-brand'
              : 'text-app-text-secondary hover:text-app-text border-transparent'
          }`}
        >
          Register Account
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Error Alert Box */}
        {(errorMessage || authError) && (
          <div className="p-3.5 rounded-xl bg-emergency-light border border-emergency-border text-xs text-emergency flex items-start gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage || authError}</span>
          </div>
        )}

        {/* General Success Alert Box */}
        {successMessage && (
          <div className="p-3.5 rounded-xl bg-success-light border border-success-border text-xs text-success-dark flex items-start gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-success" />
            <span className="leading-relaxed">{successMessage}</span>
          </div>
        )}

        {/* 1. SIGN IN FORM */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-app-text">Welcome back</h3>
              <p className="text-xs text-app-text-secondary">Enter your email and password to access your workspace.</p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Mail className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-app-text">Password</label>
                  <button
                    type="button"
                    onClick={() => handleModeChange('forgot')}
                    className="text-caption text-brand hover:underline font-semibold"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showSignInPassword ? 'text' : 'password'}
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Lock className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    className="absolute right-3 top-2.5 text-app-text-secondary hover:text-app-text p-0.5 rounded focus:outline-none"
                    aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs sm:text-sm transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {isAuthLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2 border-t border-app-border">
              <span className="text-xs text-app-text-secondary">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('signup')}
                  className="text-brand font-bold hover:underline"
                >
                  Register here
                </button>
              </span>
            </div>
          </form>
        )}

        {/* 2. REGISTRATION FORM */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-app-text">Register for CareLoop</h3>
              <p className="text-xs text-app-text-secondary">Create a personal patient or attendant account.</p>
            </div>

            {/* Role Notice */}
            <div className="p-3 rounded-xl bg-app-muted/70 border border-app-border text-[11px] text-app-text-secondary leading-relaxed">
              <strong className="text-app-text block mb-0.5">Account Provisioning Notice:</strong>
              Public accounts are registered with standard Patient & Attendant access. Clinical staff, emergency coordinators, and transfusion facility roles are provisioned internally by system administrators.
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Full Legal Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Ramesh Reddy"
                    autoComplete="name"
                    required
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <User className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Mail className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Phone Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+91 98490 00000"
                    autoComplete="tel"
                    required
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Phone className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Password (min 6 characters)</label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Create password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Lock className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-2.5 text-app-text-secondary hover:text-app-text p-0.5 rounded focus:outline-none"
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-app-text block mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showRegConfirmPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={isAuthLoading}
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                  />
                  <Lock className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    className="absolute right-3 top-2.5 text-app-text-secondary hover:text-app-text p-0.5 rounded focus:outline-none"
                    aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs sm:text-sm transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {isAuthLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2 border-t border-app-border">
              <span className="text-xs text-app-text-secondary">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('signin')}
                  className="text-brand font-bold hover:underline"
                >
                  Sign in here
                </button>
              </span>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD FORM */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1">
              <div className="w-9 h-9 rounded-lg bg-brand-light text-brand flex items-center justify-center font-bold mb-2">
                <KeyRound className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-app-text">Reset Password</h3>
              <p className="text-xs text-app-text-secondary leading-relaxed">
                Enter your registered email address and we'll dispatch a secure recovery link.
              </p>
            </div>

            {forgotSuccess ? (
              <div className="space-y-4 pt-2">
                <div className="p-3.5 rounded-xl bg-success-light border border-success-border text-xs text-success-dark flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-success" />
                  <span className="leading-relaxed">{forgotSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleModeChange('signin')}
                  className="w-full py-2.5 px-4 rounded-xl border border-app-border text-xs font-semibold text-app-text hover:bg-app-muted transition-colors"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <>
                <div className="pt-1">
                  <label className="text-xs font-semibold text-app-text block mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      required
                      disabled={isAuthLoading}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-app-border rounded-xl bg-app-surface text-app-text focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                    />
                    <Mail className="w-4 h-4 text-app-text-secondary absolute left-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs sm:text-sm transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isAuthLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Link...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Recovery Link</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2 border-t border-app-border">
                  <button
                    type="button"
                    onClick={() => handleModeChange('signin')}
                    className="text-xs text-app-text-secondary hover:text-app-text font-semibold"
                  >
                    Remembered password? Back to Sign In
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
