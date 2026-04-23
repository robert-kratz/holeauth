import type { AdapterAuditEvent } from '../adapters/index.js';

/**
 * Event type is intentionally an open string. Core emits well-known
 * `user.*`, `session.*`, `account.*`, `sso.*` events; plugins emit under
 * their own `<pluginId>.<name>` namespace (e.g. `twofa.verified`).
 *
 * Well-known core event names (non-exhaustive):
 *   - user.registered, user.signed_in, user.signed_out
 *   - session.created, session.rotated, session.revoked, session.reuse_detected
 *   - account.linked, account.unlinked
 *   - sso.authorize, sso.callback_ok, sso.callback_failed
 *   - plugin.error
 */
export type HoleauthEventType = string;

export interface HoleauthEvent extends AdapterAuditEvent {
  type: HoleauthEventType;
}
