/**
 * CareLoop — Privacy-Preserving Discoverable Emergency Requests Endpoint
 * Runtime: Vercel Serverless Function (Node.js)
 * File: api/discover-requests.ts
 * 
 * SECURITY MANDATE:
 * 1. Sanitized public projection of active emergency blood requests.
 * 2. Excludes patient contact details (contact_name, contact_phone, contact_method),
 *    submitter identity (created_by), and private notes.
 * 3. Only projects open active states ('CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED').
 * 4. Bypasses client-side RLS blockers while strictly upholding patient privacy.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getServerSupabaseClient(authHeader?: string): SupabaseClient | null {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://uzwtchnqmveapzehuafb.supabase.co';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_zBAqRhIEnx0_4OPm4GLttQ_U3ra_svx';

  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
    return;
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization'] || '') as string;
  const supabase = getServerSupabaseClient(authHeader);
  if (!supabase) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Database configuration missing.' }));
    return;
  }

  try {
    // 1. First attempt: call get_discoverable_emergency_requests RPC if available
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_discoverable_emergency_requests', {
        p_blood_group: null,
        p_city: null,
      });

      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ success: true, data: rpcData }));
        return;
      }
    } catch {
      // Fall through to direct table query
    }

    // 2. Direct table query with strict privacy projection
    const { data, error } = await supabase
      .from('emergency_requests')
      .select(`
        id,
        reference_code,
        blood_group,
        component,
        units_required,
        units_coordinated,
        urgency,
        hospital_name,
        hospital_address,
        city,
        district,
        state,
        lat,
        lng,
        status,
        escalation_level,
        created_at,
        updated_at
      `)
      .in('status', ['CREATED', 'MATCHING_RESPONDERS', 'AWAITING_RESPONSE', 'SHORTAGE_IDENTIFIED'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: error.message }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ success: true, data: data || [] }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Server error fetching requests.' }));
  }
}
