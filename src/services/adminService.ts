/**
 * CareLoop — Administrative Governance & Operations Service
 * 
 * Provides unified administrative capabilities across the 12 platform pillars:
 * 1. Overview & Operational Health Metrics
 * 2. User Governance & Role Allocation via `admin_set_user_role`
 * 3. Hospital Accreditation & Approval Workflow
 * 4. Blood Centre Depository Licensing
 * 5. Network-wide Emergency Request Oversight
 * 6. Clinical Donor Management & NBTC Deferral Oversight
 * 7. Cross-Facility Blood Inventory Aggregation
 * 8. Assignments & Clinical Coordination
 * 9. Outbound Multi-channel Notification Logs
 * 10. Platform Reliability & Transfusion Speed Analytics
 * 11. Immutable Audit Trail
 * 12. Dynamic System Thresholds & DLT Settings
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { hospitalService } from './hospitalService';
import { UserRole, BloodGroup, BloodComponent, UrgencyLevel, EmergencyRequest } from '../types';
import { RegisteredHospital, HospitalApprovalStatus } from '../types/hospital';

export interface AdminSystemMetrics {
  totalUsers: number;
  totalDonors: number;
  verifiedDonors: number;
  registeredHospitals: number;
  pendingHospitalApprovals: number;
  registeredBloodCentres: number;
  activeEmergencyRequests: number;
  fulfilledRequests: number;
  fulfillmentRatePercent: number;
  totalInventoryUnits: number;
  lowStockAlertsCount: number;
  auditEventsCount: number;
}

export interface AdminManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemConfigSettings {
  criticalStockThreshold: number;
  emergencyBroadcastRadiusKm: number;
  responseTimeoutMinutes: number;
  maxSmsPerDonorPerHour: number;
  nbtcMaleIntervalDays: number;
  nbtcFemaleIntervalDays: number;
  minHemoglobinGdl: number;
  dltSenderId: string;
  dltEntityId: string;
  dltTemplateId: string;
}

const DEFAULT_SYSTEM_SETTINGS: SystemConfigSettings = {
  criticalStockThreshold: 5,
  emergencyBroadcastRadiusKm: 35,
  responseTimeoutMinutes: 60,
  maxSmsPerDonorPerHour: 3,
  nbtcMaleIntervalDays: 90,
  nbtcFemaleIntervalDays: 120,
  minHemoglobinGdl: 12.5,
  dltSenderId: 'CRLOOP',
  dltEntityId: '1401569870000021345',
  dltTemplateId: '1407161234567890123',
};

const STORAGE_KEY_SYSTEM_SETTINGS = 'careloop_admin_system_settings';

class AdminService {
  private settings: SystemConfigSettings = DEFAULT_SYSTEM_SETTINGS;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SYSTEM_SETTINGS);
        if (saved) {
          this.settings = { ...DEFAULT_SYSTEM_SETTINGS, ...JSON.parse(saved) };
        }
      } catch {
        this.settings = DEFAULT_SYSTEM_SETTINGS;
      }
    }
  }

  public getSettings(): SystemConfigSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<SystemConfigSettings>): SystemConfigSettings {
    this.settings = { ...this.settings, ...updates };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SYSTEM_SETTINGS, JSON.stringify(this.settings));
      } catch {
        // storage quota
      }
    }
    return { ...this.settings };
  }

  /**
   * Fetch live users from Supabase profiles or fallback
   */
  public async getUsers(): Promise<{ success: boolean; data: AdminManagedUser[]; error?: string }> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, role, status, created_at, updated_at')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const mapped: AdminManagedUser[] = data.map((p: any) => ({
            id: p.id,
            name: p.full_name || 'CareLoop User',
            email: p.email || '—',
            phone: p.phone || '—',
            role: (p.role as UserRole) || 'patient',
            status: (p.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE',
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          }));
          return { success: true, data: mapped };
        }
      } catch (err: any) {
        console.warn('[AdminService] Supabase profiles fetch fallback:', err?.message);
      }
    }

    // Default seeded platform users
    const defaultUsers: AdminManagedUser[] = [
      { id: 'u-1', name: 'Robert Taylor', email: 'patient@careloop.health', phone: '+91 98490 55123', role: 'patient', status: 'ACTIVE' },
      { id: 'u-2', name: 'Sarah Jenkins', email: 'sarah.j@careloop.org', phone: '+91 98490 12345', role: 'donor', status: 'ACTIVE' },
      { id: 'u-3', name: 'Central Depot Ops', email: 'central@careloop.health', phone: '+91 40 2345 6789', role: 'blood_centre', status: 'ACTIVE' },
      { id: 'u-4', name: 'Dr. Evelyn Vance', email: 'coordinator@careloop.health', phone: '+91 40 2311 8899', role: 'coordinator', status: 'ACTIVE' },
      { id: 'u-5', name: 'System Admin', email: 't3115025@gmail.com', phone: '+91 40 2300 0000', role: 'admin', status: 'ACTIVE' },
      { id: 'u-6', name: 'Dr. Michael Chen', email: 'm.chen@hospital.org', phone: '+91 98490 12346', role: 'hospital', status: 'ACTIVE' },
      { id: 'u-7', name: 'Priya Sharma', email: 'priya.s@careloop.org', phone: '+91 98490 12347', role: 'donor', status: 'ACTIVE' },
    ];
    return { success: true, data: defaultUsers };
  }

  /**
   * Set user role via RPC admin_set_user_role
   */
  public async setUserRole(
    userId: string,
    newRole: UserRole
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        error: 'Database connection required to modify role permissions.',
      };
    }

    try {
      const { data, error } = await supabase.rpc('admin_set_user_role', {
        p_user_id: userId,
        p_new_role: newRole,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && data.success === false) {
        return { success: false, error: data.message || 'Failed to update user role.' };
      }

      return {
        success: true,
        message: data?.message || `User role updated to ${newRole}.`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error updating user role.' };
    }
  }

  /**
   * Toggle user account status (ACTIVE vs SUSPENDED)
   */
  public async setUserStatus(
    userId: string,
    newStatus: 'ACTIVE' | 'SUSPENDED'
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) {
      return { success: true }; // Local simulated update
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update account status.' };
    }
  }

  /**
   * Review hospital registration application
   */
  public async reviewHospital(
    hospitalId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTIONS',
    notes?: string,
    reviewerId?: string
  ): Promise<{ success: boolean; hospital?: RegisteredHospital; error?: string }> {
    return await hospitalService.reviewHospitalApplication(hospitalId, action, notes, reviewerId);
  }

  /**
   * Fetch audit logs from public.audit_logs or events
   */
  public async getAuditLogs(): Promise<{ success: boolean; data: any[]; error?: string }> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!error && data && data.length > 0) {
          return { success: true, data };
        }
      } catch (err: any) {
        console.warn('[AdminService] Supabase audit_logs fetch fallback:', err?.message);
      }
    }
    return { success: true, data: [] };
  }
}

export const adminService = new AdminService();

