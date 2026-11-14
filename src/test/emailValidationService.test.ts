import { describe, it, expect, beforeEach } from 'vitest';
import { emailValidationService } from '../services/emailValidationService';

describe('emailValidationService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes valid emails to lowercase trimmed format', () => {
    const raw = '  User.Test@Example.COM  ';
    expect(emailValidationService.normalizeEmail(raw)).toBe('user.test@example.com');
  });

  it('identifies disposable email domains', () => {
    expect(emailValidationService.isDisposableEmail('burner@10minutemail.com')).toBe(true);
    expect(emailValidationService.isDisposableEmail('test@mailinator.com')).toBe(true);
    expect(emailValidationService.isDisposableEmail('anon@guerrillamail.com')).toBe(true);
    expect(emailValidationService.isDisposableEmail('realuser@gmail.com')).toBe(false);
    expect(emailValidationService.isDisposableEmail('doctor@apollohospitals.com')).toBe(false);
  });

  it('validates legitimate emails successfully', () => {
    const res = emailValidationService.validate('donor@careloop.org');
    expect(res.valid).toBe(true);
    expect(res.normalizedEmail).toBe('donor@careloop.org');
    expect(res.isDisposable).toBe(false);
  });

  it('rejects disposable emails with clear error', () => {
    const res = emailValidationService.validate('fake@tempmail.com');
    expect(res.valid).toBe(false);
    expect(res.isDisposable).toBe(true);
    expect(res.error).toContain('Temporary and disposable');
  });

  it('rejects malformed email formats', () => {
    expect(emailValidationService.validate('notanemail').valid).toBe(false);
    expect(emailValidationService.validate('missing@domain').valid).toBe(false);
    expect(emailValidationService.validate('@nodomain.com').valid).toBe(false);
  });

  it('enforces resend rate-limiting cooldown', () => {
    const email = 'cooldown@test.com';
    expect(emailValidationService.checkResendRateLimit(email).allowed).toBe(true);

    emailValidationService.recordEmailSent(email);
    const limitCheck = emailValidationService.checkResendRateLimit(email, 60);
    expect(limitCheck.allowed).toBe(false);
    expect(limitCheck.waitSeconds).toBeGreaterThan(0);
    expect(limitCheck.waitSeconds).toBeLessThanOrEqual(60);
  });
});
