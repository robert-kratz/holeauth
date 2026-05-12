import type { AdapterAuditEvent } from '../adapters/index.js';

/**
 * Well-known event types emitted by @holeauth/core.
 *
 * IDEs will autocomplete these names when calling `subscribe()` or
 * `auth.on()`. The type is intentionally open-ended: plugins emit
 * additional events under their own `<pluginId>.<name>` namespace
 * (e.g. `twofa.verified`, `rbac.group_assigned`). Those names are
 * accepted via the `(string & {})` escape hatch.
 */
export type CoreHoleauthEventType =
  // User lifecycle
  | 'user.registered'
  | 'user.signed_in'
  | 'user.signed_out'
  | 'user.updated'
  | 'user.deleted'
  // Session lifecycle
  | 'session.created'
  | 'session.rotated'
  | 'session.revoked'
  | 'session.reuse_detected'
  // Password
  | 'password.changed'
  | 'password.reset_requested'
  | 'password.reset_consumed'
  // OAuth account linking
  | 'account.linked'
  | 'account.unlinked'
  // SSO flows
  | 'sso.authorize'
  | 'sso.callback_ok'
  | 'sso.callback_failed'
  // Invites
  | 'invite.created'
  | 'user.invite_consumed'
  | 'invite.revoked'
  // Infrastructure
  | 'plugin.error';

/**
 * The discriminant of all holeauth events. Extends `CoreHoleauthEventType`
 * with an open-string escape hatch so plugin-namespaced events still type-
 * check, while preserving IDE autocomplete for the well-known names.
 */
export type HoleauthEventType = CoreHoleauthEventType | (string & {});

export interface HoleauthEvent extends AdapterAuditEvent {
  type: HoleauthEventType;
}
