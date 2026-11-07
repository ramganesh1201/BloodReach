import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { UserRole } from '../../types';
import { DESKTOP_NAV_BY_ROLE } from '../../config/navigation';
import { AuthModal } from './AuthModal';
import {
  Menu,
  X,
  LogOut,
  Shield,
  Bell,
  Droplet,
  User,
  CheckCircle2,
  Clock,
  WifiOff,
  ChevronDown,
  MessageSquare,
  Building2,
  Radio,
  Home,
  Search
} from 'lucide-react';

const PUBLIC_DESKTOP_NAV = [
  { path: '/', label: 'Home', icon: Home, exact: true },
  { path: '/request', label: 'Request Blood', icon: Droplet },
  { path: '/request/track', label: 'Track Request', icon: Search },
];

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  patient: 'Patient / Attendant',
  donor: 'Registered Donor',
  blood_centre: 'Blood Centre Staff',
  coordinator: 'Clinical Coordinator',
  admin: 'System Administrator',
};

export const Header: React.FC = () => {
  const {
    currentRole,
    demoExperience,
    authenticatedRole,
    dataSource,
    currentUser,
    notifications,
    unreadNotificationCount,
    isOffline,
    lastSyncTimestamp,
    exitDemoMode,
    signOut,
    acknowledgeAllNotifications,
    acknowledgeNotification
  } = useBloodStore();

  const location = useLocation();
  const navigate = useNavigate();
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const desktopNavItems = (authenticatedRole || demoExperience)
    ? (DESKTOP_NAV_BY_ROLE[currentRole] || DESKTOP_NAV_BY_ROLE['patient'])
    : PUBLIC_DESKTOP_NAV;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifDropdownOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExitDemo = () => {
    exitDemoMode();
    navigate('/');
  };

  const handleSignOut = async () => {
    await signOut();
    setProfileDropdownOpen(false);
    navigate('/');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <header className="sticky top-0 z-40 bg-app-surface/95 backdrop-blur-md border-b border-app-border shadow-subtle transition-all">
        {/* Top Status & Role Indicator Bar */}
        {authenticatedRole ? (
          <div className="bg-app-text text-app-muted text-xs py-1.5 px-4 border-b border-app-text/20">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-success/20 text-success-light border border-success/30 uppercase tracking-wider">
                  VERIFIED SESSION
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
                  PostgreSQL Mode
                </span>
                <span className="text-white font-semibold text-xs">
                  {currentUser?.fullName || ROLE_DISPLAY_NAMES[authenticatedRole]}
                </span>
                <span className="text-app-muted/70 text-[11px]">({ROLE_DISPLAY_NAMES[authenticatedRole]})</span>
              </div>

              <div className="flex items-center gap-3">
                {isOffline && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning-light bg-warning-dark/50 px-2 py-0.5 rounded-sm">
                    <WifiOff className="w-3 h-3" /> Offline Mode
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-app-muted hover:text-white text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3 h-3 text-brand-light" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        ) : demoExperience ? (
          <div className="bg-app-text text-app-muted text-xs py-1.5 px-4 border-b border-app-text/20">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-warning/20 text-warning-light border border-warning/30 uppercase tracking-wider">
                  ROLE PREVIEW
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                  Demo Fixtures
                </span>
                <span className="text-app-muted font-medium text-xs">
                  Active as <strong className="text-white">{ROLE_DISPLAY_NAMES[demoExperience]}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExitDemo}
                  className="bg-app-text/60 hover:bg-app-text text-white text-xs font-semibold px-2 py-0.5 rounded-sm transition-colors flex items-center gap-1 border border-app-border/30"
                >
                  <LogOut className="w-3 h-3 text-warning" />
                  <span>Exit Role Preview</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Main Navbar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* CareLoop Brand Identity */}
            <Link to="/" className="flex items-center gap-3 group shrink-0">
              <div className="w-8 h-8 rounded-lg bg-brand text-white p-1.5 flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition-transform">
                <Droplet className="w-5 h-5 fill-current" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-bold tracking-tight text-app-text leading-none">
                    Care<span className="text-brand">Loop</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-light text-brand px-1.5 py-0.5 rounded-sm border border-brand/20">
                    Platform
                  </span>
                </div>
                <span className="hidden xl:inline text-[11px] text-app-text-secondary font-medium tracking-wide">
                  Emergency Blood Donation & Coordination
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              {desktopNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path, item.exact);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-brand-light text-brand font-bold border border-brand/20'
                        : 'text-app-text-secondary hover:text-app-text hover:bg-app-muted'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-brand' : 'text-app-text-secondary'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right Action Controls: Notification Bell + Session / Persona trigger */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notification Popover Drawer */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className="relative p-2 rounded-md text-app-text-secondary hover:text-app-text hover:bg-app-muted transition-colors"
                  aria-label="View notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emergency text-[9px] font-bold text-white">
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  )}
                </button>

                {/* Dropdown Container */}
                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-app-surface shadow-elevated border border-app-border py-3 z-50 animate-fade-in">
                    <div className="flex items-center justify-between px-4 pb-2.5 border-b border-app-border">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-app-text">System Notifications</span>
                        <span className="bg-brand-light text-brand text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                          {notifications.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={acknowledgeAllNotifications}
                        className="text-[11px] text-brand hover:text-brand-dark font-semibold"
                      >
                        Mark all acknowledged
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-app-border">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-xs text-app-text-secondary">
                          No alerts recorded.
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n) => (
                          <div
                            key={n.id}
                            onClick={() => acknowledgeNotification(n.id)}
                            className={`p-3 text-xs cursor-pointer hover:bg-app-muted/50 transition-colors ${
                              n.status !== 'ACKNOWLEDGED' ? 'bg-brand-light/30' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-app-text leading-tight">
                                {n.title || 'Notification Alert'}
                              </span>
                              <span className="text-[10px] font-mono text-app-text-secondary whitespace-nowrap">
                                {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-app-text-secondary mt-1 leading-relaxed">
                              {n.content}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-app-text-secondary">
                              <span className="uppercase font-mono text-[9px] px-1.5 py-0.2 rounded bg-app-muted border border-app-border">
                                {n.channel}
                              </span>
                              <span>•</span>
                              <span className="capitalize">{n.status.toLowerCase()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sign In / Active Session Menu */}
              {authenticatedRole || demoExperience ? (
                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-app-border hover:bg-app-muted text-xs font-semibold text-app-text transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-brand-light text-brand flex items-center justify-center font-bold text-xs">
                      {currentUser?.fullName?.charAt(0) || currentRole.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden sm:inline truncate max-w-[120px]">
                      {currentUser?.fullName || ROLE_DISPLAY_NAMES[currentRole]}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-app-text-secondary" />
                  </button>

                  {profileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl bg-app-surface shadow-elevated border border-app-border py-1.5 z-50 animate-fade-in text-xs">
                      <div className="px-3.5 py-2 border-b border-app-border">
                        <span className="font-bold text-app-text block truncate">
                          {currentUser?.fullName || 'Active Session'}
                        </span>
                        <span className="text-app-text-secondary text-[11px] block">
                          Role: {ROLE_DISPLAY_NAMES[currentRole]}
                        </span>
                      </div>

                      <div className="py-1">
                        <Link
                          to={currentRole === 'patient' ? '/patient' : currentRole === 'donor' ? '/donor' : currentRole === 'blood_centre' ? '/blood-centre' : currentRole === 'coordinator' ? '/coordinator' : '/admin'}
                          onClick={() => setProfileDropdownOpen(false)}
                          className="px-3.5 py-2 hover:bg-app-muted flex items-center gap-2 text-app-text"
                        >
                          <User className="w-3.5 h-3.5 text-app-text-secondary" />
                          <span>My Workspace</span>
                        </Link>
                        <Link
                          to="/communication"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="px-3.5 py-2 hover:bg-app-muted flex items-center gap-2 text-app-text"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-app-text-secondary" />
                          <span>Communication Hub</span>
                        </Link>
                      </div>

                      <div className="border-t border-app-border pt-1">
                        {authenticatedRole ? (
                          <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full px-3.5 py-2 text-left hover:bg-app-muted text-emergency flex items-center gap-2 font-semibold"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign Out</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleExitDemo}
                            className="w-full px-3.5 py-2 text-left hover:bg-app-muted text-warning-dark flex items-center gap-2 font-semibold"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Exit Role Preview</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-brand hover:bg-brand-dark text-white font-bold text-xs py-2 px-3.5 rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Access Portal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
