export { definePlugin } from './define.js';
export { buildRegistry, emptyRegistry, runOnInit } from './registry.js';
export type {
  HoleauthPlugin,
  PluginsApi,
  HoleauthHooks,
  PluginContext,
  PluginRoute,
  PluginRouteContext,
  PluginEvents,
  PluginLogger,
  PluginCoreSurface,
  ChallengeResult,
  RegisterHookInput,
  PasswordChangeHookInput,
  PasswordResetHookInput,
  SessionIssueHookData,
  SessionRotateHookData,
  SessionRevokeHookData,
} from './types.js';
export type { PluginRegistry, HookRunner } from './registry.js';
