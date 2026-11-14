import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { MOBILE_NAV_BY_ROLE, NavItem } from '../../config/navigation';
import { Home, Droplet, Shield, Activity, Heart, MessageSquare, UserRound } from 'lucide-react';

const PUBLIC_MOBILE_NAV: NavItem[] = [
  { path: '/', label: 'Home', icon: Home, exact: true },
  { path: '/request', label: 'Request Blood', icon: Droplet },
  { path: '/request/track', label: 'Track Request', icon: Activity },
  { path: '/login', label: 'Sign In', icon: Shield },
];

export const MobileNav: React.FC = () => {
  const { authenticatedRole, demoExperience, isRegisteredDonor } = useBloodStore();
  const location = useLocation();

  const effectiveRole = authenticatedRole || demoExperience;
  let mobileNavItems: NavItem[] = effectiveRole ? (MOBILE_NAV_BY_ROLE[effectiveRole] || PUBLIC_MOBILE_NAV) : PUBLIC_MOBILE_NAV;

  if (effectiveRole === 'patient' && isRegisteredDonor) {
    mobileNavItems = [
      { path: '/', label: 'Home', icon: Home, exact: true },
      { path: '/patient', label: 'Requests', icon: UserRound },
      { path: '/request', label: 'Request', icon: Droplet },
      { path: '/donor', label: 'Donor Hub', icon: Heart },
      { path: '/communication', label: 'Messages', icon: MessageSquare },
    ];
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-app-surface/95 backdrop-blur-md border-t border-app-border z-50 px-2 py-1 shadow-elevated pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Mobile Navigation"
    >
      <div className={`grid gap-1 max-w-md mx-auto ${
        mobileNavItems.length === 2 ? 'grid-cols-2' : mobileNavItems.length === 3 ? 'grid-cols-3' : mobileNavItems.length === 4 ? 'grid-cols-4' : 'grid-cols-5'
      }`}>
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const [itemPath, itemQuery] = item.path.split('?');
          let active = false;

          if (itemQuery) {
            active = location.pathname === itemPath && location.search.includes(itemQuery);
          } else if (item.exact) {
            active = location.pathname === itemPath && (!location.search || location.search === '');
          } else {
            active = location.pathname === itemPath || (itemPath !== '/' && location.pathname.startsWith(`${itemPath}/`));
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs transition-colors min-h-[48px] active:scale-95 ${
                active
                  ? 'text-brand font-bold bg-brand-light/70'
                  : 'text-app-text-secondary hover:text-app-text'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 mb-0.5 ${active ? 'stroke-[2.5px] text-brand' : 'stroke-2 text-app-text-secondary'}`} />
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-brand rounded-full" />
                )}
              </div>
              <span className="truncate text-[10px] font-semibold mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
