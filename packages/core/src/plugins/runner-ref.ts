/**
 * Per-config hook runner attachment. Stored via WeakMap so the runner is
 * reachable from low-level helpers (session/issue, session/rotate, …)
 * without threading it through every signature.
 *
 * `defineHoleauth()` attaches the runner once at instance creation.
 */
import type { HoleauthConfig } from '../types/index.js';
import type { HookRunner } from './registry.js';

const runners = new WeakMap<HoleauthConfig, HookRunner>();

export function attachHookRunner(cfg: HoleauthConfig, runner: HookRunner): void {
  runners.set(cfg, runner);
}

const NOOP: HookRunner = {
  async runRegisterBefore() {},
  async runRegisterAfter() {},
  async runSignInBefore() {},
  async runSignInChallenge() { return null; },
  async runSignInAfter() {},
  async runSignOutAfter() {},
  async runRefreshBefore() {},
  async runRefreshAfter() {},
  async runPasswordChangeBefore() {},
  async runPasswordChangeAfter() {},
  async runPasswordResetBefore() {},
  async runPasswordResetAfter() {},
  async runUserUpdateAfter() {},
  async runUserDeleteAfter() {},
  async runSessionIssue() {},
  async runSessionRotate() {},
  async runSessionRevoke() {},
};

export function getHookRunner(cfg: HoleauthConfig): HookRunner {
  return runners.get(cfg) ?? NOOP;
}
