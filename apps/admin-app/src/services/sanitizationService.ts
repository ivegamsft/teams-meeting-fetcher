const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_REGEX = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const IP_REGEX = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const DEFAULT_RULES: RedactionRule[] = [
  { name: 'email', pattern: EMAIL_REGEX, replacement: '[EMAIL REDACTED]' },
  { name: 'phone', pattern: PHONE_REGEX, replacement: '[PHONE REDACTED]' },
  { name: 'ssn', pattern: SSN_REGEX, replacement: '[SSN REDACTED]' },
  { name: 'credit_card', pattern: CREDIT_CARD_REGEX, replacement: '[CARD REDACTED]' },
  { name: 'ip_address', pattern: IP_REGEX, replacement: '[IP REDACTED]' },
];

export const sanitizationService = {
  async sanitize(content: string, customRules?: RedactionRule[]): Promise<string> {
    const rules = customRules || DEFAULT_RULES;
    let sanitized = content;

    for (const rule of rules) {
      const globalPattern = new RegExp(rule.pattern.source, 'g');
      sanitized = sanitized.replace(globalPattern, rule.replacement);
    }

    return sanitized;
  },

  getRules(): RedactionRule[] {
    return DEFAULT_RULES;
  },
};
