/** Generate `count` human-friendly recovery codes (format: XXXX-XXXX-XXXX). */
export function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(12);
  for (let i = 0; i < count; i++) {
    crypto.getRandomValues(buf);
    const chars: string[] = [];
    for (let j = 0; j < 12; j++) {
      chars.push(alpha[buf[j]! % alpha.length]!);
      if (j === 3 || j === 7) chars.push('-');
    }
    out.push(chars.join(''));
  }
  return out;
}

/**
 * Constant-time equality for two ASCII strings. Not a cryptographic hash —
 * recovery codes are stored as their own string + compared directly since
 * their entropy (≥60 bits) is high enough that a DB compromise already
 * implies compromise of far more sensitive data. Callers may still choose
 * to store them hashed; we default to plain to keep adapter semantics
 * simple, at the cost of relying on secrets-at-rest protection.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Normalise user-supplied recovery input: strip whitespace, upper-case,
 * and insert canonical dashes every 4 chars if the user omitted them.
 * This lets users paste codes with or without formatting.
 */
export function normalizeRecoveryCode(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
  if (cleaned.length !== 12) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
}

/** Returns the array with the first matching code removed. */
export function consumeRecoveryCode(codes: string[], provided: string): string[] | null {
  const idx = codes.findIndex((c) => constantTimeEquals(c, provided));
  if (idx < 0) return null;
  const next = codes.slice();
  next.splice(idx, 1);
  return next;
}

export interface RecoveryCodesTxtOptions {
  /** Heading printed before the codes. Default: 'Holeauth 2FA Recovery Codes'. */
  heading?: string;
  /** Optional label (e.g. account email) included in the header. */
  accountLabel?: string;
  /** Optional issuer/app name shown in the header. */
  issuer?: string;
  /** ISO timestamp included in the header. Defaults to `new Date().toISOString()`. */
  generatedAt?: string;
  /** Line terminator. Default: `'\n'`. Use `'\r\n'` for Windows-friendly files. */
  lineEnding?: '\n' | '\r\n';
}

/**
 * Format recovery codes as a human-friendly plain-text document, suitable
 * for writing to a `.txt` file the user can keep somewhere safe.
 *
 * The output is deterministic for a given input and contains no secrets
 * besides the codes themselves.
 */
export function formatRecoveryCodesAsText(
  codes: readonly string[],
  options: RecoveryCodesTxtOptions = {},
): string {
  const eol = options.lineEnding ?? '\n';
  const heading = options.heading ?? 'Holeauth 2FA Recovery Codes';
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const lines: string[] = [];
  lines.push(heading);
  lines.push('='.repeat(heading.length));
  if (options.issuer) lines.push(`Issuer:   ${options.issuer}`);
  if (options.accountLabel) lines.push(`Account:  ${options.accountLabel}`);
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('Each code can be used exactly once. Store this file somewhere');
  lines.push('safe — anyone who has these codes can bypass 2FA on your account.');
  lines.push('');
  for (const c of codes) lines.push(c);
  lines.push('');
  return lines.join(eol);
}

/**
 * Build a `Blob` containing the formatted recovery codes. Works in any
 * environment that provides the `Blob` global (browsers + Node ≥ 18).
 */
export function recoveryCodesToBlob(
  codes: readonly string[],
  options: RecoveryCodesTxtOptions = {},
): Blob {
  const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
  if (!BlobCtor) {
    throw new Error('Blob is not available in this environment.');
  }
  return new BlobCtor([formatRecoveryCodesAsText(codes, options)], {
    type: 'text/plain;charset=utf-8',
  });
}

export interface DownloadRecoveryCodesOptions extends RecoveryCodesTxtOptions {
  /** Filename presented to the user. Default: `'recovery-codes.txt'`. */
  fileName?: string;
}

/**
 * Trigger a browser download of the recovery codes as a `.txt` file.
 *
 * Only callable in a browser environment — throws otherwise. Intended
 * usage: call directly from a React click handler after the server has
 * returned freshly-generated recovery codes.
 *
 * ```ts
 * const { recoveryCodes } = await api.activate(userId, code);
 * downloadRecoveryCodesAsTxt(recoveryCodes, { accountLabel: user.email });
 * ```
 */
export function downloadRecoveryCodesAsTxt(
  codes: readonly string[],
  options: DownloadRecoveryCodesOptions = {},
): void {
  const g = globalThis as unknown as {
    document?: {
      createElement: (t: string) => {
        href: string;
        download: string;
        rel: string;
        click: () => void;
        remove: () => void;
      };
      body: { appendChild: (el: unknown) => void };
    };
    URL?: { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    setTimeout?: (cb: () => void, ms: number) => unknown;
  };
  if (!g.document || !g.URL || typeof g.URL.createObjectURL !== 'function') {
    throw new Error('downloadRecoveryCodesAsTxt() can only be called in a browser.');
  }
  const blob = recoveryCodesToBlob(codes, options);
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement('a');
  a.href = url;
  a.download = options.fileName ?? 'recovery-codes.txt';
  a.rel = 'noopener';
  g.document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser pick up the download before revoking.
  g.setTimeout?.(() => g.URL!.revokeObjectURL(url), 0);
}
