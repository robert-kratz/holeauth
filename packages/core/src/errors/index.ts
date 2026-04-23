export class HoleauthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'HoleauthError';
    this.code = code;
    this.status = status;
  }
}
export class InvalidTokenError extends HoleauthError {
  constructor(message = 'Invalid token') { super('INVALID_TOKEN', message, 401); }
}
export class SessionExpiredError extends HoleauthError {
  constructor(message = 'Session expired') { super('SESSION_EXPIRED', message, 401); }
}
export class AdapterError extends HoleauthError {
  constructor(message = 'Adapter error') { super('ADAPTER_ERROR', message, 500); }
}
export class ProviderError extends HoleauthError {
  constructor(message = 'Provider error') { super('PROVIDER_ERROR', message, 502); }
}
export class CsrfError extends HoleauthError {
  constructor(message = 'CSRF validation failed') { super('CSRF_FAILED', message, 403); }
}
export class CredentialsError extends HoleauthError {
  constructor(message = 'Invalid credentials') { super('INVALID_CREDENTIALS', message, 401); }
}
export class AccountConflictError extends HoleauthError {
  constructor(message = 'Account conflict') { super('ACCOUNT_CONFLICT', message, 409); }
}
export class RefreshReuseError extends HoleauthError {
  constructor(message = 'Refresh token reuse detected') { super('REFRESH_REUSE', message, 401); }
}
export class PendingChallengeError extends HoleauthError {
  constructor(message = 'Pending challenge required') { super('PENDING_CHALLENGE', message, 401); }
}
export class RegistrationDisabledError extends HoleauthError {
  constructor(message = 'Self-registration is disabled') { super('REGISTRATION_DISABLED', message, 403); }
}
export class NotSupportedError extends HoleauthError {
  constructor(message = 'Operation not supported by adapter') { super('NOT_SUPPORTED', message, 501); }
}
