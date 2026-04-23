/**
 * Email / numeric OTP helpers. The mailer itself is adapter-injected.
 */
export function generateNumericOtp(length = 6): string {
  const max = 10 ** length;
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % max;
  return n.toString().padStart(length, '0');
}

export interface OtpChallenge {
  code: string;
  expiresAt: number;
}

export function createChallenge(ttlSeconds = 600, length = 6): OtpChallenge {
  return { code: generateNumericOtp(length), expiresAt: Date.now() + ttlSeconds * 1000 };
}

export function isExpired(challenge: OtpChallenge): boolean {
  return Date.now() > challenge.expiresAt;
}
