import { supabase, isSupabaseConfigured } from './supabaseClient';
import { BloodCentre, BloodInventoryItem, BloodGroup, BloodComponent } from '../types';

export interface InventoryTransaction {
  id: string;
  bloodCentreId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  deltaUnits: number;
  previousUnits: number;
  newUnits: number;
  reason: string;
  performedBy?: string;
  createdAt: string;
}

export interface InventoryAdjustmentResult {
  success: boolean;
  centreId?: string;
  bloodGroup?: BloodGroup;
  component?: BloodComponent;
  previousUnits?: number;
  newUnits?: number;
  deltaUnits?: number;
  error?: string;
  message?: string;
}

export const mapDbToBloodCentre = (row: any): BloodCentre => ({
  id: row.id,
  name: row.name,
  licenseNumber: row.license_number || '',
  address: row.address,
  city: row.city,
  district: row.district || '',
  state: row.state || 'Andhra Pradesh',
  phone: row.phone,
  email: row.email || '',
  verified: Boolean(row.verified),
  operatingHours: row.operating_hours || '24/7 Emergency Service',
  inventoryUpdatedAt: row.inventory_updated_at || row.created_at || new Date().toISOString(),
  lat: row.lat ? Number(row.lat) : undefined,
  lng: row.lng ? Number(row.lng) : undefined,
});

export const mapDbToInventoryItem = (row: any): BloodInventoryItem => ({
  id: row.id,
  bloodCentreId: row.blood_centre_id,
  bloodGroup: row.blood_group as BloodGroup,
  component: row.component as BloodComponent,
  units: Number(row.units),
  updatedAt: row.updated_at || new Date().toISOString(),
});

export const mapDbToTransaction = (row: any): InventoryTransaction => ({
  id: row.id,
  bloodCentreId: row.blood_centre_id,
  bloodGroup: row.blood_group as BloodGroup,
  component: row.component as BloodComponent,
  deltaUnits: Number(row.delta_units),
  previousUnits: Number(row.previous_units),
  newUnits: Number(row.new_units),
  reason: row.reason,
  performedBy: row.performed_by,
  createdAt: row.created_at,
});

/**
 * Fetch all verified blood centres from Supabase
 */
export async function fetchBloodCentres(): Promise<{ data: BloodCentre[]; error?: string }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('blood_centres')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('[InventoryService] Error fetching blood centres:', error.message);
      return { data: [], error: error.message };
    }

    return { data: (data || []).map(mapDbToBloodCentre) };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch blood centres' };
  }
}

/**
 * Fetch blood inventory from Supabase, optionally scoped to a specific centre
 */
export async function fetchInventory(centreId?: string): Promise<{ data: BloodInventoryItem[]; error?: string }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase is not configured' };
  }

  try {
    let query = supabase.from('blood_inventory').select('*');
    if (centreId) {
      query = query.eq('blood_centre_id', centreId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[InventoryService] Error fetching inventory:', error.message);
      return { data: [], error: error.message };
    }

    return { data: (data || []).map(mapDbToInventoryItem) };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch inventory' };
  }
}

/**
 * Atomically adjust blood inventory quantity by a delta (+/- units)
 * Enforces row lock, authorization, and prevents negative stock.
 */
export async function adjustInventoryAtomic(params: {
  centreId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  deltaUnits: number;
  reason: string;
}): Promise<InventoryAdjustmentResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase.rpc('adjust_inventory_atomic', {
      p_centre_id: params.centreId,
      p_blood_group: params.bloodGroup,
      p_component: params.component,
      p_delta_units: params.deltaUnits,
      p_reason: params.reason,
    });

    if (error) {
      console.error('[InventoryService] RPC error adjust_inventory_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.message || 'Inventory adjustment rejected',
        message: data?.message,
      };
    }

    return {
      success: true,
      centreId: data.centre_id,
      bloodGroup: data.blood_group,
      component: data.component,
      previousUnits: data.previous_units,
      newUnits: data.new_units,
      deltaUnits: data.delta_units,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected inventory adjustment error' };
  }
}

/**
 * Atomically set absolute inventory quantity
 */
export async function setInventoryAtomic(params: {
  centreId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  newUnits: number;
  reason: string;
}): Promise<InventoryAdjustmentResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase.rpc('set_inventory_atomic', {
      p_centre_id: params.centreId,
      p_blood_group: params.bloodGroup,
      p_component: params.component,
      p_new_units: params.newUnits,
      p_reason: params.reason,
    });

    if (error) {
      console.error('[InventoryService] RPC error set_inventory_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.message || 'Inventory update rejected',
        message: data?.message,
      };
    }

    return {
      success: true,
      centreId: data.centre_id,
      bloodGroup: data.blood_group,
      component: data.component,
      previousUnits: data.previous_units,
      newUnits: data.new_units,
      deltaUnits: data.delta_units,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected inventory update error' };
  }
}

/**
 * Fetch immutable inventory transaction audit ledger
 */
export async function fetchInventoryTransactions(centreId?: string, limit = 50): Promise<{ data: InventoryTransaction[]; error?: string }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase is not configured' };
  }

  try {
    let query = supabase
      .from('inventory_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (centreId) {
      query = query.eq('blood_centre_id', centreId);
    }

    const { data, error } = await query;
    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data || []).map(mapDbToTransaction) };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch inventory transactions' };
  }
}

/**
 * Realtime subscription to inventory changes
 */
export function subscribeToInventory(onUpdate: (item: BloodInventoryItem) => void): () => void {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel('public:blood_inventory')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'blood_inventory' },
      (payload) => {
        if (payload.new && (payload.new as any).id) {
          onUpdate(mapDbToInventoryItem(payload.new));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

