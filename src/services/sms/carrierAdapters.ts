/**
 * CareLoop — Carrier Authentication Adapters & Replay Protection
 * 
 * Secure inbound webhook verification for Indian & Global SMS providers:
 * - MSG91 Inbound Webhook
 * - Karix / Gupshup Inbound Webhook
 * - Twilio Messaging Inbound Webhook
 * - Generic HMAC / Secret Webhook
 * 
 * SECURITY MANDATES:
 * 1. Constant-time signature comparison to prevent timing attacks.
 * 2. Strict replay protection (10-minute maximum timestamp freshness window).
 * 3. Carrier message ID idempotency buffer (prevents duplicate webhook retransmissions).
 * 4. Fail-closed in production: Unauthenticated requests or missing secrets strictly rejected.
 */

import crypto from 'crypto';
import type { IncomingMessage } from 'http';

export type CarrierProvider = 'msg91' | 'karix' | 'twilio' | 'generic';

export interface ExtractedSmsMessage {
  sender: string;
  message: string;
  timestamp?: string;
  messageId?: string;
  provider: CarrierProvider;
}

export interface VerificationResult {
  valid: boolean;
  provider: CarrierProvider;
  reason?: string;
}

// In-memory idempotency cache for carrier message IDs (prevents replay/duplicate delivery within 1 hour)
const processedMessageIds = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_IDEMPOTENCY_CACHE_SIZE = 5000;

function cleanupIdempotencyCache(): void {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      processedMessageIds.delete(id);
    }
  }
}

/**
 * Checks if a carrier message ID has already been processed (replay protection)
 */
export function isMessageAlreadyProcessed(messageId?: string): boolean {
  if (!messageId) return false;
  cleanupIdempotencyCache();
  return processedMessageIds.has(messageId);
}

/**
 * Marks a carrier message ID as processed
 */
export function recordProcessedMessageId(messageId?: string): void {
  if (!messageId) return;
  if (processedMessageIds.size > MAX_IDEMPOTENCY_CACHE_SIZE) {
    cleanupIdempotencyCache();
  }
  processedMessageIds.set(messageId, Date.now());
}

/**
 * Constant-time string equality check to mitigate timing side-channel attacks
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates timestamp freshness to prevent stale replay attacks
 * Allowed tolerance: max 10 minutes in the past, max 2 minutes in the future (clock skew)
 */
export function validateTimestampFreshness(rawTimestamp?: string | number): { valid: boolean; reason?: string } {
  if (!rawTimestamp) {
    // If provider does not supply timestamp, proceed (carrier may omit in some tiers)
    return { valid: true };
  }

  let timestampMs: number;
  if (typeof rawTimestamp === 'number') {
    // Check if seconds or milliseconds
    timestampMs = rawTimestamp > 1e11 ? rawTimestamp : rawTimestamp * 1000;
  } else {
    timestampMs = Date.parse(rawTimestamp);
    if (isNaN(timestampMs)) {
      const num = Number(rawTimestamp);
      if (!isNaN(num)) {
        timestampMs = num > 1e11 ? num : num * 1000;
      } else {
        return { valid: false, reason: 'Malformed carrier timestamp format' };
      }
    }
  }

  const now = Date.now();
  const maxAgeMs = 10 * 60 * 1000; // 10 minutes
  const maxFutureMs = 2 * 60 * 1000; // 2 minutes

  if (now - timestampMs > maxAgeMs) {
    return { valid: false, reason: 'Stale webhook request rejected (timestamp > 10 minutes old)' };
  }
  if (timestampMs - now > maxFutureMs) {
    return { valid: false, reason: 'Future-dated webhook request rejected (clock skew > 2 minutes)' };
  }

  return { valid: true };
}

/**
 * Twilio Inbound Webhook Signature Verification
 * Uses HMAC-SHA1 over the full request URL + sorted POST form parameters.
 */
export function verifyTwilioSignature(
  req: IncomingMessage,
  parsedBody: Record<string, any>,
  expectedAuthToken?: string
): boolean {
  const authToken = expectedAuthToken || process.env.TWILIO_AUTH_TOKEN || process.env.SMS_GATEWAY_API_KEY;
  if (!authToken || authToken === 'REPLACE_ME') {
    return false;
  }

  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) {
    return false;
  }

  // Construct full URL
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers['host'] || 'localhost';
  const fullUrl = `${proto}://${host}${req.url || '/'}`;

  // Twilio algorithm: Sort keys, concatenate key + value, append to URL, compute HMAC-SHA1
  let dataToSign = fullUrl;
  const sortedKeys = Object.keys(parsedBody).sort();
  for (const key of sortedKeys) {
    dataToSign += `${key}${parsedBody[key]}`;
  }

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(dataToSign, 'utf8'))
    .digest('base64');

  return safeEqual(signature, expectedSignature);
}

/**
 * MSG91 Inbound Webhook Verification
 * Validates MSG91 Flow auth token / webhook secret
 */
export function verifyMsg91Webhook(
  req: IncomingMessage,
  parsedBody: Record<string, any>,
  secretToken?: string
): boolean {
  const secret = secretToken || process.env.MSG91_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET || process.env.SMS_GATEWAY_API_KEY;
  if (!secret || secret === 'REPLACE_ME') {
    return false;
  }

  const headerToken = (
    req.headers['authkey'] ||
    req.headers['x-msg91-signature'] ||
    req.headers['x-careloop-webhook-secret'] ||
    req.headers['x-webhook-secret']
  ) as string;

  const urlObj = new URL(req.url || '/', `http://${req.headers['host'] || 'localhost'}`);
  const queryToken = urlObj.searchParams.get('secret') || urlObj.searchParams.get('token') || urlObj.searchParams.get('authkey');

  const bodyToken = parsedBody?.authkey || parsedBody?.secret;

  if (headerToken && safeEqual(headerToken, secret)) return true;
  if (queryToken && safeEqual(queryToken, secret)) return true;
  if (bodyToken && safeEqual(String(bodyToken), secret)) return true;

  return false;
}

/**
 * Karix / Gupshup Inbound Webhook Verification
 */
export function verifyKarixWebhook(
  req: IncomingMessage,
  parsedBody: Record<string, any>,
  secretToken?: string
): boolean {
  const secret = secretToken || process.env.KARIX_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET || process.env.SMS_GATEWAY_API_KEY;
  if (!secret || secret === 'REPLACE_ME') {
    return false;
  }

  const headerToken = (
    req.headers['x-karix-signature'] ||
    req.headers['x-api-key'] ||
    req.headers['x-careloop-webhook-secret']
  ) as string;

  const authHeader = req.headers['authorization'] as string;
  let bearerToken = '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers['host'] || 'localhost'}`);
  const queryToken = urlObj.searchParams.get('secret') || urlObj.searchParams.get('token');

  if (headerToken && safeEqual(headerToken, secret)) return true;
  if (bearerToken && safeEqual(bearerToken, secret)) return true;
  if (queryToken && safeEqual(queryToken, secret)) return true;

  return false;
}

/**
 * Generic Webhook Secret Verification
 */
export function verifyGenericWebhookSecret(
  req: IncomingMessage,
  secretToken?: string
): boolean {
  const secret = secretToken || process.env.SMS_WEBHOOK_SECRET;
  if (!secret || secret === 'REPLACE_ME') {
    return false;
  }

  const headerToken = (
    req.headers['x-careloop-webhook-secret'] ||
    req.headers['x-webhook-secret']
  ) as string;

  const urlObj = new URL(req.url || '/', `http://${req.headers['host'] || 'localhost'}`);
  const queryToken = urlObj.searchParams.get('secret');

  if (headerToken && safeEqual(headerToken, secret)) return true;
  if (queryToken && safeEqual(queryToken, secret)) return true;

  return false;
}

/**
 * Detects carrier provider and verifies authorization
 */
export function authenticateInboundWebhook(
  req: IncomingMessage,
  parsedBody: Record<string, any>,
  isProduction: boolean
): VerificationResult {
  // 1. Detect provider from headers or payload structure
  const hasTwilioSig = Boolean(req.headers['x-twilio-signature']);
  const hasTwilioFields = Boolean(parsedBody.From && (parsedBody.Body !== undefined));

  const hasMsg91Header = Boolean(req.headers['authkey'] || req.headers['x-msg91-signature']);
  const hasMsg91Fields = Boolean(parsedBody.sender && (parsedBody.content !== undefined || parsedBody.message !== undefined));

  const hasKarixHeader = Boolean(req.headers['x-karix-signature']);
  const hasKarixFields = Boolean(parsedBody.mobile && parsedBody.message !== undefined);

  // Twilio Check
  if (hasTwilioSig || (hasTwilioFields && !hasMsg91Fields)) {
    const valid = verifyTwilioSignature(req, parsedBody) || verifyGenericWebhookSecret(req);
    if (!valid && isProduction) {
      return { valid: false, provider: 'twilio', reason: 'Unauthorized: Invalid or missing Twilio signature/secret' };
    }
    return { valid: !isProduction || valid, provider: 'twilio' };
  }

  // Karix Check
  if (hasKarixHeader || (hasKarixFields && !hasMsg91Header)) {
    const valid = verifyKarixWebhook(req, parsedBody) || verifyGenericWebhookSecret(req);
    if (!valid && isProduction) {
      return { valid: false, provider: 'karix', reason: 'Unauthorized: Invalid or missing Karix authentication secret' };
    }
    return { valid: !isProduction || valid, provider: 'karix' };
  }

  // MSG91 Check
  if (hasMsg91Header || hasMsg91Fields) {
    const valid = verifyMsg91Webhook(req, parsedBody) || verifyGenericWebhookSecret(req);
    if (!valid && isProduction) {
      return { valid: false, provider: 'msg91', reason: 'Unauthorized: Invalid or missing MSG91 authentication secret' };
    }
    return { valid: !isProduction || valid, provider: 'msg91' };
  }

  // Generic Secret Check
  const genericValid = verifyGenericWebhookSecret(req);
  if (genericValid) {
    return { valid: true, provider: 'generic' };
  }

  if (isProduction) {
    return {
      valid: false,
      provider: 'generic',
      reason: 'Unauthorized: Production inbound SMS webhook requires valid carrier signature or configured SMS_WEBHOOK_SECRET',
    };
  }

  // Non-production test/development mode fallback
  return { valid: true, provider: 'generic' };
}

/**
 * Normalizes multi-carrier payload into standard extracted format
 */
export function extractCarrierMessage(
  parsedBody: Record<string, any>,
  provider: CarrierProvider
): ExtractedSmsMessage {
  const sender =
    parsedBody.sender ||
    parsedBody.mobile ||
    parsedBody.From ||
    parsedBody.from ||
    parsedBody.msisdn ||
    parsedBody.phone ||
    '';

  const message =
    parsedBody.content ||
    parsedBody.message ||
    parsedBody.Body ||
    parsedBody.body ||
    parsedBody.text ||
    parsedBody.rawText ||
    '';

  const timestamp =
    parsedBody.timestamp ||
    parsedBody.date_sent ||
    parsedBody.DateSent ||
    parsedBody.sent_at ||
    parsedBody.created_at ||
    undefined;

  const messageId =
    parsedBody.messageId ||
    parsedBody.msg_id ||
    parsedBody.SmsMessageSid ||
    parsedBody.MessageSid ||
    parsedBody.sms_id ||
    parsedBody.id ||
    undefined;

  return {
    sender: String(sender).trim(),
    message: String(message).trim(),
    timestamp: timestamp ? String(timestamp) : undefined,
    messageId: messageId ? String(messageId) : undefined,
    provider,
  };
}
