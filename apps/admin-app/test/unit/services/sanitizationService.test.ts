import { sanitizationService } from '../../../src/services/sanitizationService';

describe('sanitizationService', () => {
  describe('sanitize', () => {
    test('redacts email addresses', async () => {
      const input = 'Contact john.doe@example.com for details';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Contact [EMAIL REDACTED] for details');
    });

    test('redacts multiple email addresses', async () => {
      const input = 'Send to alice@test.com and bob@corp.org';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Send to [EMAIL REDACTED] and [EMAIL REDACTED]');
    });

    test('redacts phone numbers', async () => {
      const input = 'Call me at 555-123-4567';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Call me at [PHONE REDACTED]');
    });

    test('redacts phone numbers with country code', async () => {
      const input = 'Call +1-555-123-4567 now';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Call [PHONE REDACTED] now');
    });

    test('redacts phone numbers with parentheses', async () => {
      const input = 'Call (555) 123-4567';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Call [PHONE REDACTED]');
    });

    test('redacts SSNs', async () => {
      const input = 'SSN: 123-45-6789';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('SSN: [SSN REDACTED]');
    });

    test('redacts SSNs without dashes', async () => {
      const input = 'SSN: 123456789';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('SSN: [SSN REDACTED]');
    });

    test('redacts credit card numbers', async () => {
      const input = 'Card: 4111-1111-1111-1111';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Card: [CARD REDACTED]');
    });

    test('redacts credit card numbers with spaces', async () => {
      const input = 'Card: 4111 1111 1111 1111';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Card: [CARD REDACTED]');
    });

    test('redacts IP addresses', async () => {
      const input = 'Server at 192.168.1.100 is down';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Server at [IP REDACTED] is down');
    });

    test('returns content unchanged when no PII present', async () => {
      const input = 'This is a normal meeting transcript with no sensitive data.';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe(input);
    });

    test('handles empty string', async () => {
      const result = await sanitizationService.sanitize('');
      expect(result).toBe('');
    });

    test('redacts mixed PII content', async () => {
      const input = 'Email john@test.com, call 555-123-4567, IP 10.0.0.1';
      const result = await sanitizationService.sanitize(input);
      expect(result).toContain('[EMAIL REDACTED]');
      expect(result).toContain('[PHONE REDACTED]');
      expect(result).toContain('[IP REDACTED]');
      expect(result).not.toContain('john@test.com');
      expect(result).not.toContain('555-123-4567');
      expect(result).not.toContain('10.0.0.1');
    });

    test('handles already redacted content', async () => {
      const input = 'Contact [EMAIL REDACTED] for info';
      const result = await sanitizationService.sanitize(input);
      expect(result).toBe('Contact [EMAIL REDACTED] for info');
    });

    test('supports custom rules', async () => {
      const customRules = [
        { name: 'custom', pattern: /SECRET-\d+/g, replacement: '[CUSTOM REDACTED]' },
      ];
      const input = 'Code is SECRET-12345 and john@test.com';
      const result = await sanitizationService.sanitize(input, customRules);
      expect(result).toBe('Code is [CUSTOM REDACTED] and john@test.com');
    });
  });

  describe('getRules', () => {
    test('returns default redaction rules', () => {
      const rules = sanitizationService.getRules();
      expect(rules).toBeInstanceOf(Array);
      expect(rules.length).toBe(5);

      const names = rules.map(r => r.name);
      expect(names).toContain('email');
      expect(names).toContain('phone');
      expect(names).toContain('ssn');
      expect(names).toContain('credit_card');
      expect(names).toContain('ip_address');
    });

    test('each rule has name, pattern, and replacement', () => {
      const rules = sanitizationService.getRules();
      for (const rule of rules) {
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('pattern');
        expect(rule).toHaveProperty('replacement');
        expect(rule.pattern).toBeInstanceOf(RegExp);
        expect(typeof rule.replacement).toBe('string');
      }
    });
  });
});
