'use client';
import {
  createContext as reactCreateContext,
  useContext,
  type Context,
  type Provider,
} from 'react';

/**
 * Creates a fully type-safe React context + `useContext` hook pair that throws
 * a descriptive error when consumed outside its provider. The returned hook
 * has a strict non-nullable return type — no need for `!` assertions in
 * consumers.
 *
 * @param displayName Used both as the React DevTools display name and in the
 *                    "must be used inside <X>" error message.
 */
export function createStrictContext<T>(displayName: string): {
  Provider: Provider<T | null>;
  use: () => T;
  Context: Context<T | null>;
} {
  const Ctx = reactCreateContext<T | null>(null);
  Ctx.displayName = displayName;
  function use(): T {
    const v = useContext(Ctx);
    if (v === null) {
      throw new Error(
        `[holeauth/react-ui] ${displayName} compound component must be used inside its Root.`,
      );
    }
    return v;
  }
  return { Provider: Ctx.Provider, use, Context: Ctx };
}
