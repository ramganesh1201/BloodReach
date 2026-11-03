import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBloodStore } from '../../store/useBloodStore';
import { MOBILE_NAV_BY_ROLE } from '../../config/navigation';

export const MobileNav: React.FC = () => {
  const { currentRole } = useBloodStore();
  const location = useLocation();

  const mobileNavItems = MOBILE_NAV_BY_ROLE[currentRole] || MOBILE_NAV_BY_ROLE['patient'];

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
          const active = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);

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
