/**
 * CareLoop — Inbound Two-Way SMS Webhook Endpoint
 * Runtime: Vercel Serverless Function (Node.js)
 * File: api/sms-webhook.ts
 * 
 * Supports carrier webhook callbacks from Indian & Global SMS Gateways:
 * - MSG91 Inbound Webhook (sender, content, timestamp)
 * - Karix / Gupshup Inbound Webhook (mobile, message)
 * - Twilio Messaging Inbound (From, Body)
 * - CareLoop Test / Simulated Gateway
 * 
 * SECURITY MANDATES:
 * 1. Optional Webhook Secret Verification via SMS_WEBHOOK_SECRET header or query param.
 * 2. Strict payload size limit (max 16KB).
 * 3. Never leaks patient names, phone numbers, or clinical details in SMS responses.
 * 4. Idempotent reply processing — duplicate webhook deliveries do not double-accept.
 * 5. Honest carrier status: clearly indicates live vs pending configuration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { processInboundSms, InboundSmsPayload } from '../src/services/sms/inboundSmsProcessor';

const MAX_PAYLOAD_BYTES = 16384; // 16 KB payload guard

function getServerSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function parseRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_PAYLOAD_BYTES) {
        reject(new Error('Payload size exceeds 16KB limit'));
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw || raw.trim().length === 0) {
        resolve({});
        return;
      }

      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(raw);
          const parsed: Record<string, string> = {};
          params.forEach((v, k) => {
            parsed[k] = v;
          });
          resolve(parsed);
        } catch {
          reject(new Error('Invalid URL-encoded payload'));
        }
      } else {
        // Fallback text parsing
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({ rawText: raw });
        }
      }
    });

    req.on('error', (err) => reject(err));
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-careloop-webhook-secret');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // GET probe for carrier verification or health checks
  if (req.method === 'GET') {
    const isCarrierConfigured = Boolean(
      process.env.SMS_GATEWAY_API_KEY &&
      process.env.SMS_GATEWAY_API_KEY !== 'REPLACE_ME'
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'OK',
        service: 'CareLoop Inbound Two-Way SMS Webhook',
        carrierConfigured: isCarrierConfigured,
        supportedCommands: ['1 (ACCEPT)', '2 (DECLINE)', 'HELP'],
        dltRegistered: isCarrierConfigured,
      })
    );
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // 1. Webhook Secret Authentication (if configured)
  const webhookSecret = process.env.SMS_WEBHOOK_SECRET;
  if (webhookSecret && webhookSecret !== 'REPLACE_ME') {
    const headerSecret = req.headers['x-careloop-webhook-secret'];
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const querySecret = urlObj.searchParams.get('secret');

    if (headerSecret !== webhookSecret && querySecret !== webhookSecret) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid webhook secret token' }));
      return;
    }
  }

  // 2. Parse Incoming Payload
  let body: any = {};
  try {
    body = await parseRequestBody(req);
  } catch (err: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Failed to parse request body' }));
    return;
  }

  // Normalize multi-carrier payload fields:
  // MSG91: sender, content / message, timestamp
  // Karix / Gupshup: mobile, message
  // Twilio: From, Body
  const sender =
    body.sender ||
    body.mobile ||
    body.From ||
    body.from ||
    body.msisdn ||
    body.phone ||
    '';

  const message =
    body.content ||
    body.message ||
    body.Body ||
    body.body ||
    body.text ||
    body.rawText ||
    '';

  if (!sender || !message) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'Missing required sender phone or message text in webhook payload.',
        receivedKeys: Object.keys(body),
      })
    );
    return;
  }

  // 3. Connect to Supabase Backend
  const supabase = getServerSupabaseClient();
  if (!supabase) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'Database configuration missing on server.',
      })
    );
    return;
  }

  // 4. Process Inbound SMS via Core Engine
  const inboundPayload: InboundSmsPayload = {
    sender: String(sender).trim(),
    message: String(message).trim(),
    timestamp: body.timestamp || new Date().toISOString(),
    provider: body.provider || (body.From ? 'twilio' : 'msg91'),
    rawPayload: body,
  };

  const result = await processInboundSms(inboundPayload, supabase);

  // Return standard response
  res.statusCode = result.success ? 200 : 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      success: result.success,
      action: result.action,
      replyMessage: result.replyMessage,
      donorId: result.donorId,
      donorName: result.donorName,
      requestId: result.requestId,
      referenceCode: result.referenceCode,
      isDuplicate: result.isDuplicate,
      conversationId: result.conversationId,
      error: result.error,
    })
  );
}
