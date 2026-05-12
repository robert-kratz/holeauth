'use client';
import {
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type ElementType,
  type FormEvent,
  type ReactNode,
} from 'react';
import { use2faVerify } from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

interface Ctx {
  code: string;
  setCode: (v: string) => void;
  loading: boolean;
  error: HoleauthErrorShape | null;
  submit: () => Promise<void>;
  ids: { code: string; error: string };
}

const { Provider, use: useTwoFactorVerifyForm } = createStrictContext<Ctx>('TwoFactorVerifyForm');
export { useTwoFactorVerifyForm };

export interface TwoFactorVerifyFormRootOwnProps {
  /** REQUIRED — the pending-token returned by `useSignIn()` on a 2FA challenge. */
  pendingToken: string;
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  children: ReactNode;
}

const RootImpl = forwardPoly<'form', TwoFactorVerifyFormRootOwnProps>(function Root(props, ref) {
  const { as, pendingToken, children, onSuccess, onError, ...rest } = props;
  const { verify, loading, error } = use2faVerify();
  const [code, setCode] = useState('');

  const submit = useCallback(async () => {
    const res = await verify({ pendingToken, code });
    if (res.ok) onSuccess?.();
    else if (error) onError?.(error);
  }, [verify, pendingToken, code, onSuccess, onError, error]);

  const codeId = useId();
  const errorId = useId();
  const ctx: Ctx = {
    code,
    setCode,
    loading,
    error,
    submit,
    ids: { code: codeId, error: errorId },
  };

  const Comp = (as ?? 'form') as ElementType;
  return (
    <Provider value={ctx}>
      <Comp
        ref={ref}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          void submit();
        }}
        data-holeauth-2fa-verify-form=""
        {...rest}
      >
        {children}
      </Comp>
    </Provider>
  );
});

export interface TwoFactorVerifyFormCodeOwnProps {
  unmanaged?: boolean;
}

const CodeImpl = forwardPoly<'input', TwoFactorVerifyFormCodeOwnProps>(function Code(props, ref) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useTwoFactorVerifyForm();
  const Comp = (as ?? 'input') as ElementType;
  const managed = !unmanaged
    ? {
        value: ctx.code,
        onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setCode(e.target.value),
      }
    : null;
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.code}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      required
      data-holeauth-2fa-verify-code=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

export interface TwoFactorVerifyFormSubmitOwnProps {
  children?: ReactNode | ((s: { loading: boolean; disabled: boolean }) => ReactNode);
}

const SubmitImpl = forwardPoly<'button', TwoFactorVerifyFormSubmitOwnProps>(function Submit(
  props,
  ref,
) {
  const { as, children, disabled, ...rest } = props;
  const ctx = useTwoFactorVerifyForm();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? ctx.loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean; disabled: boolean }) => ReactNode)({
          loading: ctx.loading,
          disabled: isDisabled,
        })
      : (children ?? 'Verify');
  return (
    <Comp
      ref={ref}
      type="submit"
      disabled={isDisabled}
      data-holeauth-2fa-verify-submit=""
      data-loading={ctx.loading ? '' : undefined}
      {...rest}
    >
      {content}
    </Comp>
  );
});

export interface TwoFactorVerifyFormErrorOwnProps {
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', TwoFactorVerifyFormErrorOwnProps>(function Error_(props, ref) {
  const { as, alwaysRender, children, id, ...rest } = props;
  const ctx = useTwoFactorVerifyForm();
  if (!ctx.error && !alwaysRender) return null;
  const Comp = (as ?? 'p') as ElementType;
  const content =
    typeof children === 'function' && ctx.error
      ? (children as (e: HoleauthErrorShape) => ReactNode)(ctx.error)
      : (children ?? ctx.error?.message ?? null);
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.error}
      role="alert"
      data-holeauth-2fa-verify-error=""
      {...rest}
    >
      {content}
    </Comp>
  );
});

/**
 * Compound 2FA verification form. Used after `useSignIn()` returns a pending
 * challenge with `type === 'totp'`.
 *
 * ```tsx
 * <TwoFactorVerifyForm.Root pendingToken={token} onSuccess={() => router.push('/')}>
 *   <TwoFactorVerifyForm.Code />
 *   <TwoFactorVerifyForm.Submit />
 *   <TwoFactorVerifyForm.Error />
 * </TwoFactorVerifyForm.Root>
 * ```
 */
export const TwoFactorVerifyForm = {
  Root: RootImpl,
  Code: CodeImpl,
  Submit: SubmitImpl,
  Error: ErrorImpl,
} as const;
