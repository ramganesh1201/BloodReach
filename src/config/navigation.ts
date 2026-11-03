import { UserRole } from '../types';
import {
  Home,
  Droplet,
  Bell,
  Building2,
  Activity,
  Shield,
  FlaskConical,
  Users,
  UserRound
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: any;
  exact?: boolean;
}

export const DEFAULT_WORKSPACE_BY_ROLE: Record<UserRole, string> = {
  patient: '/patient',
  donor: '/donor',
  blood_centre: '/blood-centre',
  coordinator: '/coordinator',
  admin: '/admin',
};

// Backward compatibility alias
export const ROLE_DEFAULT_ROUTES = DEFAULT_WORKSPACE_BY_ROLE;

export const DESKTOP_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  patient: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/patient', label: 'Patient Workspace', icon: UserRound },
    { path: '/request', label: 'Request Blood', icon: Droplet },
    { path: '/simulation', label: 'Workflow Test', icon: FlaskConical },
  ],
  donor: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/donor', label: 'Donor Alerts', icon: Bell },
    { path: '/simulation', label: 'Workflow Test', icon: FlaskConical },
  ],
  blood_centre: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/blood-centre', label: 'Inventory & Verification', icon: Building2 },
    { path: '/simulation', label: 'Workflow Test', icon: FlaskConical },
  ],
  coordinator: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/coordinator', label: 'Control Room', icon: Activity },
    { path: '/blood-centre', label: 'Blood Centres', icon: Building2 },
    { path: '/simulation', label: 'Workflow Test', icon: FlaskConical },
  ],
  admin: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/admin', label: 'System Admin', icon: Shield },
    { path: '/coordinator', label: 'Control Room', icon: Activity },
    { path: '/blood-centre', label: 'Blood Centres', icon: Building2 },
    { path: '/donor', label: 'Donor Hub', icon: Users },
    { path: '/simulation', label: 'Workflow Test', icon: FlaskConical },
  ],
};

export const MOBILE_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  patient: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/patient', label: 'Workspace', icon: UserRound },
    { path: '/request', label: 'Request', icon: Droplet },
    { path: '/simulation', label: 'Test', icon: FlaskConical },
  ],
  donor: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/donor', label: 'Alerts', icon: Bell },
    { path: '/simulation', label: 'Test', icon: FlaskConical },
  ],
  blood_centre: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/blood-centre', label: 'Inventory', icon: Building2 },
    { path: '/simulation', label: 'Test', icon: FlaskConical },
  ],
  coordinator: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/coordinator', label: 'Control', icon: Activity },
    { path: '/blood-centre', label: 'Centres', icon: Building2 },
    { path: '/simulation', label: 'Test', icon: FlaskConical },
  ],
  admin: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/admin', label: 'Admin', icon: Shield },
    { path: '/coordinator', label: 'Control', icon: Activity },
    { path: '/simulation', label: 'Test', icon: FlaskConical },
  ],
};

export const ROLE_ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['patient', 'donor', 'blood_centre', 'coordinator', 'admin'],
  '/patient': ['patient', 'admin'],
  '/request': ['patient', 'coordinator', 'admin'],
  '/donor': ['donor', 'admin'],
  '/blood-centre': ['blood_centre', 'coordinator', 'admin'],
  '/coordinator': ['coordinator', 'admin'],
  '/admin': ['admin'],
  '/simulation': ['patient', 'donor', 'blood_centre', 'coordinator', 'admin'],
};

export function isRouteAllowedForRole(pathname: string, role: UserRole): boolean {
  if (pathname === '/' || pathname === '/simulation') return true;
  if (pathname.startsWith('/patient')) return ROLE_ROUTE_PERMISSIONS['/patient'].includes(role);
  if (pathname.startsWith('/request')) return ROLE_ROUTE_PERMISSIONS['/request'].includes(role);
  if (pathname.startsWith('/donor')) return ROLE_ROUTE_PERMISSIONS['/donor'].includes(role);
  if (pathname.startsWith('/blood-centre')) return ROLE_ROUTE_PERMISSIONS['/blood-centre'].includes(role);
  if (pathname.startsWith('/coordinator')) return ROLE_ROUTE_PERMISSIONS['/coordinator'].includes(role);
  if (pathname.startsWith('/admin')) return ROLE_ROUTE_PERMISSIONS['/admin'].includes(role);
  return true;
}

