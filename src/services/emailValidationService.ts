/**
 * CareLoop — Email Validation & Security Service
 * 
 * Provides disposable email domain filtering, email normalization,
 * and rate-limiting for verification email dispatches.
 */

// Comprehensive denylist of known disposable and temporary email domains
const DISPOSABLE_DOMAINS = new Set<string>([
  '10minutemail.com',
  '10minutemail.net',
  '10minmail.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'mailinator.com',
  'mailinater.com',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'trashmail.net',
  'fakeinbox.com',
  'dispostable.com',
  'getairmail.com',
  'mohmal.com',
  'inboxkitten.com',
  'burnermail.io',
  'crazymailing.com',
  'fakemailgenerator.com',
  'generator.email',
  'getnada.com',
  'maildrop.cc',
  'mytemp.email',
  'nada.ltd',
  'nada.email',
  'receiveee.com',
  'tempail.com',
  'tempinbox.com',
  'tempm.com',
  'trashmail.me',
  'emailondeck.com',
  'dropmail.me',
  'mintemail.com',
  'mohmal.im',
  'disposablemail.com',
  'mailcatch.com',
  'tmailor.com',
  'byom.de',
  'nowmymail.com',
  'mailnesia.com',
  'incognitmail.com',
]);

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail?: string;
  isDisposable?: boolean;
  error?: string;
}

export const emailValidationService = {
  /**
   * Canonical normalization: trim whitespace and convert to lowercase
   */
  normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  },

  /**
   * Check if a domain belongs to a disposable/temporary email provider
   */
  isDisposableEmail(email: string): boolean {
    const normalized = this.normalizeEmail(email);
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex === -1) return false;
    const domain = normalized.slice(atIndex + 1);
    return DISPOSABLE_DOMAINS.has(domain);
  },

  /**
   * Validate email format and check against disposable email list
   */
  validate(email: string): EmailValidationResult {
    const normalized = this.normalizeEmail(email);

    if (!normalized) {
      return { valid: false, error: 'Email address is required.' };
    }

    if (normalized.length > 254) {
      return { valid: false, error: 'Email address is too long (maximum 254 characters).' };
    }

    if (!EMAIL_REGEX.test(normalized)) {
      return { valid: false, error: 'Please enter a valid email address format (e.g. name@example.com).' };
    }

    if (this.isDisposableEmail(normalized)) {
      return {
        valid: false,
        isDisposable: true,
        error: 'Temporary and disposable email addresses are not permitted for donor clinical verification.',
      };
    }

    return {
      valid: true,
      normalizedEmail: normalized,
      isDisposable: false,
    };
  },

  /**
   * Rate-limiting check for verification email resends (default 60s cooldown)
   */
  checkResendRateLimit(email: string, cooldownSeconds = 60): { allowed: boolean; waitSeconds: number } {
    if (typeof localStorage === 'undefined') {
      return { allowed: true, waitSeconds: 0 };
    }

    const normalized = this.normalizeEmail(email);
    const storageKey = `careloop_email_resend_${normalized}`;
    const lastSentStr = localStorage.getItem(storageKey);

    if (!lastSentStr) {
      return { allowed: true, waitSeconds: 0 };
    }

    const lastSent = Number(lastSentStr);
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastSent) / 1000);

    if (elapsedSeconds < cooldownSeconds) {
      return {
        allowed: false,
        waitSeconds: cooldownSeconds - elapsedSeconds,
      };
    }

    return { allowed: true, waitSeconds: 0 };
  },

  /**
   * Record that a verification email was dispatched to enforce cooldown
   */
  recordEmailSent(email: string): void {
    if (typeof localStorage === 'undefined') return;
    const normalized = this.normalizeEmail(email);
    const storageKey = `careloop_email_resend_${normalized}`;
    localStorage.setItem(storageKey, Date.now().toString());
  },
};
