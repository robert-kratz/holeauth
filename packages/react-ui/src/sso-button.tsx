'use client';
import { useSso } from '@holeauth/react';
import type { ElementType, MouseEvent, ReactNode } from 'react';
import { forwardPoly } from './internal/forward-poly.js';

export interface SsoButtonOwnProps {
  /** Required: identifier of the OIDC/OAuth provider as configured on the IDP. */
  providerId: string;
  /** Optional path the IDP should redirect back to after authorisation. */
  redirectAfter?: string;
  children?: ReactNode;
}

/**
 * Atomic SSO trigger. Navigates the browser to `${basePath}/authorize/{providerId}`.
 * Use one button per provider.
 *
 * ```tsx
 * <SsoButton providerId="google" redirectAfter="/dashboard">
 *   Continue with Google
 * </SsoButton>
 * ```
 */
export const SsoButton = forwardPoly<'button', SsoButtonOwnProps>(function SsoButton(props, ref) {
  const { as, providerId, redirectAfter, children, onClick, ...rest } = props;
  const { start } = useSso(providerId);
  const Comp = (as ?? 'button') as ElementType;
  return (
    <Comp
      ref={ref}
      type="button"
      data-holeauth-sso=""
      data-provider={providerId}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
        if (e.defaultPrevented) return;
        start(redirectAfter);
      }}
      {...rest}
    >
      {children ?? `Continue with ${providerId}`}
    </Comp>
  );
});
