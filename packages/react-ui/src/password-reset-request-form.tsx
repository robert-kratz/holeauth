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
import { usePasswordReset } from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

interface Ctx {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  error: HoleauthErrorShape | null;
  submitted: boolean;
  submit: () => Promise<void>;
  ids: { email: string; error: string };
}

const { Provider, use: usePasswordResetRequestForm } =
  createStrictContext<Ctx>('PasswordResetRequestForm');
export { usePasswordResetRequestForm };

export interface PasswordResetRequestFormRootOwnProps {
  /** Called once the request has been accepted by the server (always succeeds). */
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  defaultEmail?: string;
  children: ReactNode;
}

const RootImpl = forwardPoly<'form', PasswordResetRequestFormRootOwnProps>(function Root(
  props,
  ref,
) {
  const { as, children, onSuccess, onError, defaultEmail = '', ...rest } = props;
  const { request, loading, error } = usePasswordReset();
  const [email, setEmail] = useState(defaultEmail);
  const [submitted, setSubmitted] = useState(false);

  const submit = useCallback(async () => {
    const res = await request(email);
    if (res.ok) {
      setSubmitted(true);
      onSuccess?.();
    } else if (error) {
      onError?.(error);
    }
  }, [request, email, onSuccess, onError, error]);

  const emailId = useId();
  const errorId = useId();
  const ctx: Ctx = {
    email,
    setEmail,
    loading,
    error,
    submitted,
    submit,
    ids: { email: emailId, error: errorId },
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
        data-holeauth-pwreset-request-form=""
        {...rest}
      >
        {children}
      </Comp>
    </Provider>
  );
});

export interface PasswordResetRequestFormEmailOwnProps {
  unmanaged?: boolean;
}

const EmailImpl = forwardPoly<'input', PasswordResetRequestFormEmailOwnProps>(function Email(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = usePasswordResetRequestForm();
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
      data-holeauth-pwreset-request-email=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

export interface PasswordResetRequestFormSubmitOwnProps {
  children?: ReactNode | ((s: { loading: boolean; disabled: boolean }) => ReactNode);
}

const SubmitImpl = forwardPoly<'button', PasswordResetRequestFormSubmitOwnProps>(function Submit(
  props,
  ref,
) {
  const { as, children, disabled, ...rest } = props;
  const ctx = usePasswordResetRequestForm();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? ctx.loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean; disabled: boolean }) => ReactNode)({
          loading: ctx.loading,
          disabled: isDisabled,
        })
      : (children ?? 'Send reset link');
  return (
    <Comp
      ref={ref}
      type="submit"
      disabled={isDisabled}
      data-holeauth-pwreset-request-submit=""
      data-loading={ctx.loading ? '' : undefined}
      {...rest}
    >
      {content}
    </Comp>
  );
});

export interface PasswordResetRequestFormErrorOwnProps {
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', PasswordResetRequestFormErrorOwnProps>(function Error_(
  props,
  ref,
) {
  const { as, alwaysRender, children, id, ...rest } = props;
  const ctx = usePasswordResetRequestForm();
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
      data-holeauth-pwreset-request-error=""
      {...rest}
    >
      {content}
    </Comp>
  );
});

export interface PasswordResetRequestFormSuccessOwnProps {
  children: ReactNode;
}

const SuccessImpl = forwardPoly<'div', PasswordResetRequestFormSuccessOwnProps>(function Success(
  props,
  ref,
) {
  const { as, children, ...rest } = props;
  const ctx = usePasswordResetRequestForm();
  if (!ctx.submitted) return null;
  const Comp = (as ?? 'div') as ElementType;
  return (
    <Comp ref={ref} role="status" data-holeauth-pwreset-request-success="" {...rest}>
      {children}
    </Comp>
  );
});

/**
 * Compound "request a password reset" form.
 *
 * ```tsx
 * <PasswordResetRequestForm.Root>
 *   <PasswordResetRequestForm.Email />
 *   <PasswordResetRequestForm.Submit />
 *   <PasswordResetRequestForm.Error />
 *   <PasswordResetRequestForm.Success>Check your inbox.</PasswordResetRequestForm.Success>
 * </PasswordResetRequestForm.Root>
 * ```
 */
export const PasswordResetRequestForm = {
  Root: RootImpl,
  Email: EmailImpl,
  Submit: SubmitImpl,
  Error: ErrorImpl,
  Success: SuccessImpl,
} as const;
