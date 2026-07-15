import { describe, it, expect } from 'vitest';
import { sanitizeKey, detectProvider } from './detect.js';

describe('sanitizeKey', () => {
  it('trims surrounding whitespace and quotes', () => {
    expect(sanitizeKey('  gsk_abc123  ')).toBe('gsk_abc123');
    expect(sanitizeKey('"gsk_abc123"')).toBe('gsk_abc123');
    expect(sanitizeKey("'gsk_abc123'")).toBe('gsk_abc123');
  });

  it('strips invisible bidi marks pasted on RTL systems', () => {
    // U+200F RIGHT-TO-LEFT MARK embedded around the key — the exact class of
    // char that makes fetch() throw "value greater than 255" on the header.
    expect(sanitizeKey('‏gsk_abc123‏')).toBe('gsk_abc123');
    expect(sanitizeKey('gsk_‎abc123')).toBe('gsk_abc123');
  });

  it('strips non-breaking spaces, newlines, and smart quotes', () => {
    expect(sanitizeKey('gsk_abc 123')).toBe('gsk_abc123');
    expect(sanitizeKey('gsk_abc123\n')).toBe('gsk_abc123');
    expect(sanitizeKey('“gsk_abc123”')).toBe('gsk_abc123');
  });

  it('produces a header-safe (all printable ASCII) result', () => {
    const cleaned = sanitizeKey('‏gsk_ab c123');
    expect([...cleaned].every((ch) => ch.charCodeAt(0) >= 0x21 && ch.charCodeAt(0) <= 0x7e)).toBe(true);
  });

  it('leaves a clean key untouched and still auto-detects the provider', () => {
    const key = sanitizeKey('gsk_1234567890');
    expect(key).toBe('gsk_1234567890');
    expect(detectProvider(key)).toBe('groq');
  });
});
