import type { HoleauthConfig } from '../types/index.js';
import type { HoleauthEvent } from './types.js';

type Handler = (e: HoleauthEvent) => void | Promise<void>;

interface EventBus {
  byType: Map<string, Set<Handler>>;
  wildcard: Set<Handler>;
}

const busByConfig = new WeakMap<HoleauthConfig, EventBus>();

function getBus(cfg: HoleauthConfig): EventBus {
  let bus = busByConfig.get(cfg);
  if (!bus) {
    bus = { byType: new Map(), wildcard: new Set() };
    busByConfig.set(cfg, bus);
  }
  return bus;
}

/** Subscribe to an event type. Use '*' to match all events. Returns an unsubscribe fn. */
export function subscribe(cfg: HoleauthConfig, type: string, handler: Handler): () => void {
  const bus = getBus(cfg);
  if (type === '*') {
    bus.wildcard.add(handler);
    return () => bus.wildcard.delete(handler);
  }
  let set = bus.byType.get(type);
  if (!set) {
    set = new Set();
    bus.byType.set(type, set);
  }
  set.add(handler);
  return () => set!.delete(handler);
}

export function unsubscribe(cfg: HoleauthConfig, type: string, handler: Handler): void {
  const bus = getBus(cfg);
  if (type === '*') {
    bus.wildcard.delete(handler);
    return;
  }
  bus.byType.get(type)?.delete(handler);
}

/**
 * emit() persists the event via the mandatory AuditLogAdapter and
 * additionally fans out to all subscribers (typed + wildcard) plus the
 * legacy `cfg.onEvent` hook — all fire-and-forget so business flows are
 * never blocked by observer failures.
 *
 * Callers MUST await emit(): audit persistence is a hard requirement.
 */
export async function emit(cfg: HoleauthConfig, event: HoleauthEvent): Promise<void> {
  const withTimestamp: HoleauthEvent = { at: new Date(), ...event };
  await cfg.adapters.auditLog.record(withTimestamp);

  const bus = getBus(cfg);
  const typed = bus.byType.get(withTimestamp.type);
  const fire = (h: Handler) => {
    Promise.resolve()
      .then(() => h(withTimestamp))
      .catch(() => { /* observer errors do not propagate */ });
  };
  if (typed) for (const h of typed) fire(h);
  for (const h of bus.wildcard) fire(h);

  if (cfg.onEvent) {
    Promise.resolve()
      .then(() => cfg.onEvent?.(withTimestamp))
      .catch(() => { /* observer errors do not propagate */ });
  }
}
