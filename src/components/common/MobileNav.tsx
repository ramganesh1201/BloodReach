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
      className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-50 px-2 py-1 shadow-lg"
      aria-label="Mobile navigation"
    >
      <div className={`grid gap-1 max-w-md mx-auto ${
        mobileNavItems.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
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
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs transition-colors min-h-[44px] ${
                active
                  ? 'text-red-600 font-bold bg-red-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span className="truncate text-[11px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
