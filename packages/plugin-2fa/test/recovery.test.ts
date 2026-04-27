import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateRecoveryCodes,
  constantTimeEquals,
  consumeRecoveryCode,
  normalizeRecoveryCode,
  formatRecoveryCodesAsText,
  recoveryCodesToBlob,
  downloadRecoveryCodesAsTxt,
} from '../src/recovery.js';

describe('generateRecoveryCodes', () => {
  it('produces `count` codes of shape XXXX-XXXX-XXXX', () => {
    const codes = generateRecoveryCodes(5);
    expect(codes).toHaveLength(5);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // excluded easily-confused chars
      expect(c).not.toMatch(/[OI10]/);
    }
  });

  it('uses default count=10 when not specified', () => {
    expect(generateRecoveryCodes()).toHaveLength(10);
  });

  it('codes are unique across a generation batch', () => {
    const codes = generateRecoveryCodes(50);
    expect(new Set(codes).size).toBe(50);
  });

  it('produces zero codes when count=0', () => {
    expect(generateRecoveryCodes(0)).toEqual([]);
  });
});

describe('constantTimeEquals', () => {
  it('returns false for different lengths', () => {
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
  it('returns true for equal strings', () => {
    expect(constantTimeEquals('same', 'same')).toBe(true);
  });
  it('returns false when a single char differs', () => {
    expect(constantTimeEquals('abcd', 'abce')).toBe(false);
  });
  it('empty strings are equal', () => {
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('consumeRecoveryCode', () => {
  const codes = ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF', 'GGGG-HHHH-JJJJ'];

  it('returns null when code is not present', () => {
    expect(consumeRecoveryCode(codes, 'XXXX-YYYY-ZZZZ')).toBeNull();
  });

  it('returns a new array without the matching code (no mutation)', () => {
    const next = consumeRecoveryCode(codes, 'DDDD-EEEE-FFFF');
    expect(next).toEqual(['AAAA-BBBB-CCCC', 'GGGG-HHHH-JJJJ']);
    expect(codes).toHaveLength(3); // original untouched
  });

  it('only consumes the first matching instance', () => {
    const dup = ['XXXX', 'YYYY', 'XXXX'];
    expect(consumeRecoveryCode(dup, 'XXXX')).toEqual(['YYYY', 'XXXX']);
  });
});

describe('normalizeRecoveryCode', () => {
  it('canonicalises a fully-formed code (trim + upper)', () => {
    expect(normalizeRecoveryCode('  aaaa-bbbb-cccc  ')).toBe('AAAA-BBBB-CCCC');
  });

  it('inserts dashes when user supplied only alphanumerics', () => {
    expect(normalizeRecoveryCode('aaaabbbbcccc')).toBe('AAAA-BBBB-CCCC');
  });

  it('returns cleaned (no dashes added) when length != 12', () => {
    expect(normalizeRecoveryCode('foo')).toBe('FOO');
    expect(normalizeRecoveryCode('a-b-c')).toBe('ABC');
  });

  it('strips whitespace within the code', () => {
    expect(normalizeRecoveryCode('aa aa-bb bb-cc cc')).toBe('AAAA-BBBB-CCCC');
  });
});

describe('formatRecoveryCodesAsText', () => {
  it('emits heading, metadata, and codes', () => {
    const txt = formatRecoveryCodesAsText(['A-B-C'], {
      accountLabel: 'alice@example.com',
      issuer: 'Holeauth',
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(txt).toContain('Holeauth 2FA Recovery Codes');
    expect(txt).toContain('Issuer:   Holeauth');
    expect(txt).toContain('Account:  alice@example.com');
    expect(txt).toContain('Generated: 2024-01-01T00:00:00.000Z');
    expect(txt).toContain('A-B-C');
  });

  it('supports custom heading and line endings', () => {
    const txt = formatRecoveryCodesAsText(['X'], {
      heading: 'Custom',
      lineEnding: '\r\n',
    });
    expect(txt).toContain('Custom');
    expect(txt).toContain('\r\n');
  });

  it('defaults generatedAt to now when omitted', () => {
    const txt = formatRecoveryCodesAsText(['X']);
    expect(txt).toMatch(/Generated: \d{4}-\d{2}-\d{2}T/);
  });

  it('omits issuer/account lines when not supplied', () => {
    const txt = formatRecoveryCodesAsText(['X']);
    expect(txt).not.toContain('Issuer:');
    expect(txt).not.toContain('Account:');
  });
});

describe('recoveryCodesToBlob', () => {
  it('returns a text/plain Blob containing the formatted text', async () => {
    const blob = recoveryCodesToBlob(['AAA-BBB-CCC'], { issuer: 'X' });
    expect(blob.type).toBe('text/plain;charset=utf-8');
    const text = await blob.text();
    expect(text).toContain('AAA-BBB-CCC');
  });

  it('throws when Blob global is missing', () => {
    const original = (globalThis as { Blob?: unknown }).Blob;
    (globalThis as { Blob?: unknown }).Blob = undefined;
    try {
      expect(() => recoveryCodesToBlob(['X'])).toThrow(/Blob is not available/);
    } finally {
      (globalThis as { Blob?: unknown }).Blob = original;
    }
  });
});

describe('downloadRecoveryCodesAsTxt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when not in a browser environment', () => {
    expect(() => downloadRecoveryCodesAsTxt(['X'])).toThrow(/can only be called in a browser/);
  });

  it('dispatches a synthetic click when browser globals are present', () => {
    const clickSpy = vi.fn();
    const removeSpy = vi.fn();
    const appendSpy = vi.fn();
    const revokeSpy = vi.fn();
    const anchor: Record<string, unknown> = {
      href: '',
      download: '',
      rel: '',
      click: clickSpy,
      remove: removeSpy,
    };
    const g = globalThis as unknown as Record<string, unknown>;
    const prev = {
      document: g.document,
      URL: g.URL,
      setTimeout: g.setTimeout,
    };
    g.document = {
      createElement: () => anchor,
      body: { appendChild: appendSpy },
    };
    g.URL = {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: revokeSpy,
    };
    g.setTimeout = (cb: () => void) => {
      cb();
      return 0;
    };
    try {
      downloadRecoveryCodesAsTxt(['AAA'], { fileName: 'my.txt' });
      expect(anchor.href).toBe('blob:mock');
      expect(anchor.download).toBe('my.txt');
      expect(anchor.rel).toBe('noopener');
      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
    } finally {
      g.document = prev.document;
      g.URL = prev.URL;
      g.setTimeout = prev.setTimeout;
    }
  });

  it('falls back to default filename when none supplied', () => {
    const anchor: Record<string, unknown> = {
      href: '',
      download: '',
      rel: '',
      click: () => {},
      remove: () => {},
    };
    const g = globalThis as unknown as Record<string, unknown>;
    const prev = { document: g.document, URL: g.URL, setTimeout: g.setTimeout };
    g.document = { createElement: () => anchor, body: { appendChild: () => {} } };
    g.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    g.setTimeout = undefined; // exercise optional branch
    try {
      downloadRecoveryCodesAsTxt(['A']);
      expect(anchor.download).toBe('recovery-codes.txt');
    } finally {
      g.document = prev.document;
      g.URL = prev.URL;
      g.setTimeout = prev.setTimeout;
    }
  });
});
