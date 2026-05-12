/** Common error shape returned by holeauth hooks. */
export interface HoleauthErrorShape {
  message: string;
  code?: string;
}

/** Pending challenge info returned from sign-in when 2FA is required. */
export interface PendingChallenge {
  token: string;
  type: string;
}
