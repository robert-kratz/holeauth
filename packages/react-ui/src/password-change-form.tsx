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
import { usePasswordChange } from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

interface Ctx {
  current: string;
  setCurrent: (v: string) => void;
  next: string;
  setNext: (v: string) => void;
  loading: boolean;
  error: HoleauthErrorShape | null;
  submitted: boolean;
  submit: () => Promise<void>;
  ids: { current: string; next: string; error: string };
}

const { Provider, use: usePasswordChangeForm } = createStrictContext<Ctx>('PasswordChangeForm');
export { usePasswordChangeForm };

export interface PasswordChangeFormRootOwnProps {
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  /** Default `false`. If `true`, other sessions are revoked server-side. */
  revokeOtherSessions?: boolean;
  children: ReactNode;
}

const RootImpl = forwardPoly<'form', PasswordChangeFormRootOwnProps>(function Root(props, ref) {
  const { as, children, onSuccess, onError, revokeOtherSessions, ...rest } = props;
  const { change, loading, error } = usePasswordChange();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useCallback(async () => {
    const res = await change({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions,
    });
    if (res.ok) {
      setSubmitted(true);
      setCurrent('');
      setNext('');
      onSuccess?.();
    } else if (error) {
      onError?.(error);
    }
  }, [change, current, next, revokeOtherSessions, onSuccess, onError, error]);

  const currentId = useId();
  const nextId = useId();
  const errorId = useId();
  const ctx: Ctx = {
    current,
    setCurrent,
    next,
    setNext,
    loading,
    error,
    submitted,
    submit,
    ids: { current: currentId, next: nextId, error: errorId },
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
        data-holeauth-pwchange-form=""
        {...rest}
      >
        {children}
      </Comp>
    </Provider>
  );
});

export interface PasswordChangeFormFieldOwnProps {
  unmanaged?: boolean;
}

const CurrentPasswordImpl = forwardPoly<'input', PasswordChangeFormFieldOwnProps>(
  function CurrentPassword(props, ref) {
    const { as, unmanaged, id, ...rest } = props;
    const ctx = usePasswordChangeForm();
    const Comp = (as ?? 'input') as ElementType;
    const managed = !unmanaged
      ? {
          value: ctx.current,
          onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setCurrent(e.target.value),
        }
      : null;
    return (
      <Comp
        ref={ref}
        id={id ?? ctx.ids.current}
        type="password"
        autoComplete="current-password"
        required
        data-holeauth-pwchange-current=""
        aria-describedby={ctx.error ? ctx.ids.error : undefined}
        {...managed}
        {...rest}
      />
    );
  },
);

const NewPasswordImpl = forwardPoly<'input', PasswordChangeFormFieldOwnProps>(function NewPassword(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = usePasswordChangeForm();
  const Comp = (as ?? 'input') as ElementType;
  const managed = !unmanaged
    ? {
        value: ctx.next,
        onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setNext(e.target.value),
      }
    : null;
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.next}
      type="password"
      autoComplete="new-password"
      required
      data-holeauth-pwchange-new=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

export interface PasswordChangeFormSubmitOwnProps {
  children?: ReactNode | ((s: { loading: boolean; disabled: boolean }) => ReactNode);
}

const SubmitImpl = forwardPoly<'button', PasswordChangeFormSubmitOwnProps>(function Submit(
  props,
  ref,
) {
  const { as, children, disabled, ...rest } = props;
  const ctx = usePasswordChangeForm();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? ctx.loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean; disabled: boolean }) => ReactNode)({
          loading: ctx.loading,
          disabled: isDisabled,
        })
      : (children ?? 'Change password');
  return (
    <Comp
      ref={ref}
      type="submit"
      disabled={isDisabled}
      data-holeauth-pwchange-submit=""
      data-loading={ctx.loading ? '' : undefined}
      {...rest}
    >
      {content}
    </Comp>
  );
});

export interface PasswordChangeFormErrorOwnProps {
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', PasswordChangeFormErrorOwnProps>(function Error_(props, ref) {
  const { as, alwaysRender, children, id, ...rest } = props;
  const ctx = usePasswordChangeForm();
  if (!ctx.error && !alwaysRender) return null;
  const Comp = (as ?? 'p') as ElementType;
  const content =
    typeof children === 'function' && ctx.error
      ? (children as (e: HoleauthErrorShape) => ReactNode)(ctx.error)
      : (children ?? ctx.error?.message ?? null);
  return (
    <Comp ref={ref} id={id ?? ctx.ids.error} role="alert" data-holeauth-pwchange-error="" {...rest}>
      {content}
    </Comp>
  );
});

export interface PasswordChangeFormSuccessOwnProps {
  children: ReactNode;
}

const SuccessImpl = forwardPoly<'div', PasswordChangeFormSuccessOwnProps>(function Success(
  props,
  ref,
) {
  const { as, children, ...rest } = props;
  const ctx = usePasswordChangeForm();
  if (!ctx.submitted) return null;
  const Comp = (as ?? 'div') as ElementType;
  return (
    <Comp ref={ref} role="status" data-holeauth-pwchange-success="" {...rest}>
      {children}
    </Comp>
  );
});

/**
 * Compound password-change form. Uses `usePasswordChange()` under the hood.
 *
 * ```tsx
 * <PasswordChangeForm.Root revokeOtherSessions onSuccess={...}>
 *   <PasswordChangeForm.CurrentPassword />
 *   <PasswordChangeForm.NewPassword />
 *   <PasswordChangeForm.Submit />
 *   <PasswordChangeForm.Error />
 *   <PasswordChangeForm.Success>Updated.</PasswordChangeForm.Success>
 * </PasswordChangeForm.Root>
 * ```
 */
export const PasswordChangeForm = {
  Root: RootImpl,
  CurrentPassword: CurrentPasswordImpl,
  NewPassword: NewPasswordImpl,
  Submit: SubmitImpl,
  Error: ErrorImpl,
  Success: SuccessImpl,
} as const;
