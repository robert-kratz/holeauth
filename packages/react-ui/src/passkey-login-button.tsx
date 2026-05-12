'use client';
import { usePasskeyLogin } from '@holeauth/react';
import type { ElementType, MouseEvent, ReactNode } from 'react';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

export interface PasskeyLoginButtonOwnProps {
  /**
   * Optional email hint. When supplied, the server limits the WebAuthn
   * challenge to credentials owned by that user (useful in two-step UIs).
   * When omitted, the browser shows all platform passkeys.
   */
  email?: string;
  /** Called after a successful passkey login (session is already refreshed). */
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  children?: ReactNode | ((state: { loading: boolean }) => ReactNode);
}

/**
 * Standalone passkey login button. Triggers WebAuthn assertion via
 * `usePasskeyLogin()` and surfaces success/error to the caller.
 *
 * ```tsx
 * <PasskeyLoginButton onSuccess={() => router.push('/')} />
 * ```
 */
export const PasskeyLoginButton = forwardPoly<'button', PasskeyLoginButtonOwnProps>(
  function PasskeyLoginButton(props, ref) {
    const { as, children, email, onClick, onSuccess, onError, disabled, ...rest } = props;
    const { login, loading, error } = usePasskeyLogin();
    const Comp = (as ?? 'button') as ElementType;
    const isDisabled = (disabled as boolean | undefined) ?? loading;
    const content =
      typeof children === 'function'
        ? (children as (s: { loading: boolean }) => ReactNode)({ loading })
        : (children ?? 'Sign in with passkey');
    return (
      <Comp
        ref={ref}
        type="button"
        disabled={isDisabled}
        data-holeauth-passkey-login=""
        data-loading={loading ? '' : undefined}
        onClick={async (e: MouseEvent<HTMLButtonElement>) => {
          (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          if (e.defaultPrevented) return;
          const res = await login(email);
          if (res.ok) onSuccess?.();
          else if (error) onError?.(error);
        }}
        {...rest}
      >
        {content}
      </Comp>
    );
  },
);
