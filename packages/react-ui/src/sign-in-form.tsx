'use client';
import {
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type ElementType,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useSignIn, usePasskeyLogin, type ClientSession } from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape, PendingChallenge } from './internal/types.js';

/* ────────────────────────── Context ────────────────────────── */

interface SignInFormCtx {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  passkeyLoading: boolean;
  error: HoleauthErrorShape | null;
  pending: PendingChallenge | null;
  submit: () => Promise<void>;
  triggerPasskey: () => Promise<void>;
  /** Stable ids for accessibility (label-input wiring). */
  ids: { email: string; password: string; error: string };
}

const { Provider, use: useSignInForm } = createStrictContext<SignInFormCtx>('SignInForm');
export { useSignInForm };

/* ─────────────────────────── Root ──────────────────────────── */

/**
 * Sign-in success metadata. `method: 'password'` carries the resolved
 * session; `method: 'passkey'` does not (passkey login refreshes the
 * provider session internally — read it via `useSession()` afterwards).
 */
export type SignInFormSuccess =
  | { method: 'password'; session: ClientSession }
  | { method: 'passkey' };

export interface SignInFormRootOwnProps {
  /** Called after a successful, non-pending sign-in. */
  onSuccess?: (payload: SignInFormSuccess) => void;
  /** Called when sign-in is paused on a plugin challenge (e.g. 2FA). */
  onPending?: (pending: PendingChallenge) => void;
  /** Called whenever sign-in fails. The error is also exposed via context. */
  onError?: (error: HoleauthErrorShape) => void;
  /** Optional initial values; uncontrolled — updates do NOT overwrite input. */
  defaultEmail?: string;
  defaultPassword?: string;
  children: ReactNode;
}

const RootImpl = forwardPoly<'form', SignInFormRootOwnProps>(function SignInFormRoot(props, ref) {
  const {
    as,
    onSuccess,
    onPending,
    onError,
    defaultEmail = '',
    defaultPassword = '',
    children,
    ...rest
  } = props;

  const { signIn, loading, error, pending: hookPending } = useSignIn();
  const { login: passkeyLogin, loading: passkeyLoading, error: passkeyError } = usePasskeyLogin();

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [pending, setPending] = useState<PendingChallenge | null>(null);

  const errorShape: HoleauthErrorShape | null =
    error ?? (passkeyError ? { message: passkeyError.message } : null);

  const submit = useCallback(async () => {
    const res = await signIn({ email, password });
    if (!res.ok) {
      if (res.error) onError?.(res.error);
      return;
    }
    if ('pending' in res && res.pending) {
      setPending(res.pending);
      onPending?.(res.pending);
      return;
    }
    if ('session' in res && res.session) {
      onSuccess?.({ method: 'password', session: res.session });
    }
  }, [email, password, signIn, onSuccess, onPending, onError]);

  const triggerPasskey = useCallback(async () => {
    const res = await passkeyLogin(email || undefined);
    if (res.ok) {
      onSuccess?.({ method: 'passkey' });
    } else if (passkeyError) {
      onError?.({ message: passkeyError.message });
    }
  }, [email, passkeyLogin, passkeyError, onSuccess, onError]);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const ctx: SignInFormCtx = {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    passkeyLoading,
    error: errorShape,
    pending: pending ?? hookPending,
    submit,
    triggerPasskey,
    ids: { email: emailId, password: passwordId, error: errorId },
  };

  const Comp = (as ?? 'form') as ElementType;
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit();
  };

  return (
    <Provider value={ctx}>
      <Comp ref={ref} onSubmit={handleSubmit} data-holeauth-signin-form="" {...rest}>
        {children}
      </Comp>
    </Provider>
  );
});

/* ─────────────────────────── Email ─────────────────────────── */

export interface SignInFormEmailOwnProps {
  /** Disable internal value/onChange wiring; caller owns the state. */
  unmanaged?: boolean;
}

const EmailImpl = forwardPoly<'input', SignInFormEmailOwnProps>(function SignInFormEmail(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useSignInForm();
  const Comp = (as ?? 'input') as ElementType;
  const managed = !unmanaged
    ? {
        value: ctx.email,
        onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setEmail(e.target.value),
      }
    : null;
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.email}
      type="email"
      autoComplete="email"
      required
      data-holeauth-signin-email=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

/* ────────────────────────── Password ───────────────────────── */

export interface SignInFormPasswordOwnProps {
  unmanaged?: boolean;
}

const PasswordImpl = forwardPoly<'input', SignInFormPasswordOwnProps>(function SignInFormPassword(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useSignInForm();
  const Comp = (as ?? 'input') as ElementType;
  const managed = !unmanaged
    ? {
        value: ctx.password,
        onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setPassword(e.target.value),
      }
    : null;
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.password}
      type="password"
      autoComplete="current-password"
      required
      data-holeauth-signin-password=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

/* ─────────────────────────── Submit ────────────────────────── */

export interface SignInFormSubmitOwnProps {
  /** Function-as-child receives the current loading/disabled state. */
  children?: ReactNode | ((state: { loading: boolean; disabled: boolean }) => ReactNode);
}

const SubmitImpl = forwardPoly<'button', SignInFormSubmitOwnProps>(function SignInFormSubmit(
  props,
  ref,
) {
  const { as, children, disabled, ...rest } = props;
  const ctx = useSignInForm();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? ctx.loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean; disabled: boolean }) => ReactNode)({
          loading: ctx.loading,
          disabled: isDisabled,
        })
      : (children ?? 'Sign in');
  return (
    <Comp
      ref={ref}
      type="submit"
      disabled={isDisabled}
      data-holeauth-signin-submit=""
      data-loading={ctx.loading ? '' : undefined}
      {...rest}
    >
      {content}
    </Comp>
  );
});

/* ──────────────────────────── Error ────────────────────────── */

export interface SignInFormErrorOwnProps {
  /** Render even when there's no error (useful for stable layout). */
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', SignInFormErrorOwnProps>(function SignInFormError(props, ref) {
  const { as, alwaysRender, children, id, ...rest } = props;
  const ctx = useSignInForm();
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
      data-holeauth-signin-error=""
      {...rest}
    >
      {content}
    </Comp>
  );
});

/* ──────────────────── Passkey button (compound) ───────────────────── */

export interface SignInFormPasskeyButtonOwnProps {
  children?: ReactNode | ((state: { loading: boolean }) => ReactNode);
}

const PasskeyButtonImpl = forwardPoly<'button', SignInFormPasskeyButtonOwnProps>(
  function SignInFormPasskeyButton(props, ref) {
    const { as, children, disabled, onClick, ...rest } = props;
    const ctx = useSignInForm();
    const Comp = (as ?? 'button') as ElementType;
    const isDisabled = (disabled as boolean | undefined) ?? ctx.passkeyLoading;
    const content =
      typeof children === 'function'
        ? (children as (s: { loading: boolean }) => ReactNode)({ loading: ctx.passkeyLoading })
        : (children ?? 'Sign in with passkey');
    return (
      <Comp
        ref={ref}
        type="button"
        disabled={isDisabled}
        data-holeauth-signin-passkey=""
        data-loading={ctx.passkeyLoading ? '' : undefined}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          if (!e.defaultPrevented) void ctx.triggerPasskey();
        }}
        {...rest}
      >
        {content}
      </Comp>
    );
  },
);

/* ─────────────────────── Pending (2FA) slot ────────────────────────── */

export interface SignInFormPendingOwnProps {
  children: ReactNode | ((pending: PendingChallenge) => ReactNode);
}

const PendingImpl = forwardPoly<'div', SignInFormPendingOwnProps>(function SignInFormPending(
  props,
  ref,
) {
  const { as, children, ...rest } = props;
  const ctx = useSignInForm();
  if (!ctx.pending) return null;
  const Comp = (as ?? 'div') as ElementType;
  const content =
    typeof children === 'function'
      ? (children as (p: PendingChallenge) => ReactNode)(ctx.pending)
      : children;
  return (
    <Comp ref={ref} data-holeauth-signin-pending="" {...rest}>
      {content}
    </Comp>
  );
});

/* ─────────────────────────── Namespace ─────────────────────────── */

/**
 * Compound sign-in form.
 *
 * ```tsx
 * <SignInForm.Root onSuccess={() => router.push('/')}>
 *   <SignInForm.Email />
 *   <SignInForm.Password />
 *   <SignInForm.Error />
 *   <SignInForm.Submit>Sign in</SignInForm.Submit>
 *   <SignInForm.PasskeyButton />
 *   <SignInForm.Pending>
 *     {(p) => <a href={`/2fa/verify?token=${p.token}`}>Continue</a>}
 *   </SignInForm.Pending>
 * </SignInForm.Root>
 * ```
 */
export const SignInForm = {
  Root: RootImpl,
  Email: EmailImpl,
  Password: PasswordImpl,
  Submit: SubmitImpl,
  Error: ErrorImpl,
  PasskeyButton: PasskeyButtonImpl,
  Pending: PendingImpl,
} as const;
