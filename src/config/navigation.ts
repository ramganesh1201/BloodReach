import { UserRole } from '../types';
import {
  Home,
  Droplet,
  Bell,
  Building2,
  Activity,
  Shield,
  Users,
  UserRound,
  MessageSquare,
  History,
  Layers,
  FileText,
  AlertTriangle,
  User,
  Settings
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
  hospital: '/hospital',
};

export const ROLE_DEFAULT_ROUTES = DEFAULT_WORKSPACE_BY_ROLE;

export const DESKTOP_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  patient: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/patient', label: 'My Requests', icon: UserRound },
    { path: '/request', label: 'Request Blood', icon: Droplet },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
  donor: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/donor', label: 'Find Requests', icon: Droplet },
    { path: '/donor?tab=history', label: 'My Donations', icon: History },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
  blood_centre: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/blood-centre', label: 'Overview & Inventory', icon: Building2 },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
  coordinator: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/coordinator', label: 'Control Room', icon: Activity },
    { path: '/blood-centre', label: 'Blood Centres', icon: Building2 },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
  admin: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/admin', label: 'Governance & Users', icon: Shield },
    { path: '/coordinator', label: 'Control Room', icon: Activity },
    { path: '/blood-centre', label: 'Centres', icon: Building2 },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
  hospital: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/hospital', label: 'Hospital Workspace', icon: Building2 },
    { path: '/request', label: 'Create Request', icon: Droplet },
    { path: '/communication', label: 'Communication', icon: MessageSquare },
  ],
};

export const MOBILE_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  patient: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/patient', label: 'My Requests', icon: UserRound },
    { path: '/request', label: 'Request', icon: Droplet },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
  ],
  donor: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/donor', label: 'Alerts', icon: Droplet, exact: true },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
    { path: '/donor?tab=profile', label: 'Profile', icon: User },
  ],
  blood_centre: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/blood-centre', label: 'Inventory', icon: Building2 },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
  ],
  coordinator: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/coordinator', label: 'Control', icon: Activity },
    { path: '/blood-centre', label: 'Centres', icon: Building2 },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
  ],
  admin: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/admin', label: 'Admin', icon: Shield },
    { path: '/coordinator', label: 'Control', icon: Activity },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
  ],
  hospital: [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/hospital', label: 'Hospital', icon: Building2 },
    { path: '/request', label: 'Request', icon: Droplet },
    { path: '/communication', label: 'Messages', icon: MessageSquare },
  ],
};

export const ROLE_ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['patient', 'donor', 'blood_centre', 'coordinator', 'admin', 'hospital'],
  '/patient': ['patient', 'coordinator', 'admin'],
  '/request': ['patient', 'coordinator', 'admin', 'hospital'],
  '/donor': ['donor', 'coordinator', 'admin'],
  '/blood-centre': ['blood_centre', 'coordinator', 'admin'],
  '/coordinator': ['coordinator', 'admin'],
  '/admin': ['admin'],
  '/hospital': ['hospital', 'blood_centre', 'coordinator', 'admin'],
  '/communication': ['patient', 'donor', 'blood_centre', 'coordinator', 'admin', 'hospital'],
};

export function isRouteAllowedForRole(pathname: string, role: UserRole): boolean {
  if (pathname === '/') return true;
  if (pathname.startsWith('/patient')) return ROLE_ROUTE_PERMISSIONS['/patient'].includes(role);
  if (pathname.startsWith('/request')) return ROLE_ROUTE_PERMISSIONS['/request'].includes(role);
  if (pathname.startsWith('/donor')) return ROLE_ROUTE_PERMISSIONS['/donor'].includes(role);
  if (pathname.startsWith('/blood-centre')) return ROLE_ROUTE_PERMISSIONS['/blood-centre'].includes(role);
  if (pathname.startsWith('/coordinator')) return ROLE_ROUTE_PERMISSIONS['/coordinator'].includes(role);
  if (pathname.startsWith('/admin')) return ROLE_ROUTE_PERMISSIONS['/admin'].includes(role);
  if (pathname.startsWith('/hospital')) return ROLE_ROUTE_PERMISSIONS['/hospital'].includes(role);
  if (pathname.startsWith('/communication')) return ROLE_ROUTE_PERMISSIONS['/communication'].includes(role);
  return true;
}
