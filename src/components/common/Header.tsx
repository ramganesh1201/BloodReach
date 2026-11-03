import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { DESKTOP_NAV_BY_ROLE, ROLE_DEFAULT_ROUTES, isRouteAllowedForRole } from '../../config/navigation';
import { Menu, X, LogOut, Shield } from 'lucide-react';

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  patient: 'Patient / Attendant',
  donor: 'Registered Donor',
  blood_centre: 'Blood Centre',
  coordinator: 'Coordinator',
  admin: 'Administrator',
};

export const Header: React.FC = () => {
  const { currentRole, demoExperience, authenticatedRole, exitDemoMode, resetDemoData, signOut } = useBloodStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const desktopNavItems = DESKTOP_NAV_BY_ROLE[currentRole] || DESKTOP_NAV_BY_ROLE['patient'];

  const handleExitDemo = () => {
    exitDemoMode();
    navigate('/');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-subtle">
      {/* Authenticated Role Banner */}
      {authenticatedRole ? (
        <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">
                AUTHENTICATED
              </span>
              <span className="text-white font-bold text-[11px]">
                {ROLE_DISPLAY_NAMES[authenticatedRole]}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold px-2.5 py-1 rounded transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3 text-red-400" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      ) : demoExperience ? (
        /* Demo Mode Banner */
        <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
                DEMO MODE
              </span>
              <span className="text-slate-300 font-semibold text-[11px]">
                {ROLE_DISPLAY_NAMES[demoExperience]} Experience
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExitDemo}
                className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold px-2.5 py-1 rounded transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3 text-amber-400" />
                Exit Demo
              </button>
              <button
                type="button"
                onClick={resetDemoData}
                className="text-[11px] text-slate-400 hover:text-white underline"
                title="Reset simulation data"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Official Brand Identity: Logo Symbol + BloodReach Text + Tagline with Red Dots */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <img
              src="/logo.png"
              alt="BloodReach logo"
              className="h-8 sm:h-9 w-auto object-contain shrink-0 transition-opacity group-hover:opacity-90"
            />
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Blood<span className="text-red-600">Reach</span>
              </span>
              <div className="hidden sm:flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 font-medium tracking-wide">
                <span>Donate</span>
                <span className="text-red-600 font-extrabold text-[12px]">•</span>
                <span>Connect</span>
                <span className="text-red-600 font-extrabold text-[12px]">•</span>
                <span>Save Lives</span>
              </div>
            </div>
          </Link>

          {/* Role-Derived Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`transition-colors py-1 border-b-2 flex items-center gap-1.5 ${
                    active
                      ? 'border-red-600 text-slate-900 font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Header Action Button */}
          <div className="hidden md:flex items-center gap-3">
            {isRouteAllowedForRole('/request', currentRole) && (
              <Link
                to="/request"
                className="bg-red-600 text-white hover:bg-red-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm inline-flex items-center gap-2"
              >
                <img src="/logo.png" alt="" className="w-4 h-5 object-contain" />
                Emergency Request
              </Link>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-4 space-y-2">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium ${
                  active ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
};
