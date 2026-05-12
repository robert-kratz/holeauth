'use client';
import { useSignOut } from '@holeauth/react';
import type { ElementType, MouseEvent, ReactNode } from 'react';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

export interface SignOutButtonOwnProps {
  /** Called after the sign-out request completes successfully. */
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  /** Children can be a function-as-child receiving `{ loading }`. */
  children?: ReactNode | ((state: { loading: boolean }) => ReactNode);
}

/**
 * Atomic sign-out button. Hits `${basePath}/signout`, clears the session,
 * and invokes `onSuccess`. Polymorphic via `as`.
 *
 * ```tsx
 * <SignOutButton onSuccess={() => router.replace('/login')}>Log out</SignOutButton>
 * ```
 */
export const SignOutButton = forwardPoly<'button', SignOutButtonOwnProps>(function SignOutButton(
  props,
  ref,
) {
  const { as, children, onClick, onSuccess, onError, disabled, ...rest } = props;
  const { signOut, loading, error } = useSignOut();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean }) => ReactNode)({ loading })
      : (children ?? 'Sign out');
  return (
    <Comp
      ref={ref}
      type="button"
      disabled={isDisabled}
      data-holeauth-signout=""
      data-loading={loading ? '' : undefined}
      onClick={async (e: MouseEvent<HTMLButtonElement>) => {
        (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
        if (e.defaultPrevented) return;
        const res = await signOut();
        if (res.ok) onSuccess?.();
        else if (error) onError?.(error);
      }}
      {...rest}
    >
      {content}
    </Comp>
  );
});
