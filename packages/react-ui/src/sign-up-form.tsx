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
import { useSignUp } from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

interface SignUpFormCtx {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  loading: boolean;
  error: HoleauthErrorShape | null;
  submit: () => Promise<void>;
  ids: { email: string; password: string; name: string; error: string };
}

const { Provider, use: useSignUpForm } = createStrictContext<SignUpFormCtx>('SignUpForm');
export { useSignUpForm };

export interface SignUpFormRootOwnProps {
  /** Called after a successful registration (and, by default, auto sign-in). */
  onSuccess?: () => void;
  onError?: (error: HoleauthErrorShape) => void;
  defaultEmail?: string;
  defaultName?: string;
  /** Default `true`: signs the user in immediately after registration. */
  autoSignIn?: boolean;
  children: ReactNode;
}

const RootImpl = forwardPoly<'form', SignUpFormRootOwnProps>(function SignUpFormRoot(props, ref) {
  const {
    as,
    onSuccess,
    onError,
    defaultEmail = '',
    defaultName = '',
    autoSignIn = true,
    children,
    ...rest
  } = props;
  const { signUp, loading, error } = useSignUp();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState(defaultName);

  const submit = useCallback(async () => {
    const res = await signUp({ email, password, name: name || undefined, autoSignIn });
    if (!res.ok) {
      if (res.error) onError?.(res.error);
      return;
    }
    onSuccess?.();
  }, [signUp, email, password, name, autoSignIn, onSuccess, onError]);

  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();
  const errorId = useId();

  const ctx: SignUpFormCtx = {
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    loading,
    error,
    submit,
    ids: { email: emailId, password: passwordId, name: nameId, error: errorId },
  };

  const Comp = (as ?? 'form') as ElementType;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit();
  };
  return (
    <Provider value={ctx}>
      <Comp ref={ref} onSubmit={onSubmit} data-holeauth-signup-form="" {...rest}>
        {children}
      </Comp>
    </Provider>
  );
});

export interface SignUpFormFieldOwnProps {
  unmanaged?: boolean;
}

const NameImpl = forwardPoly<'input', SignUpFormFieldOwnProps>(function SignUpFormName(props, ref) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useSignUpForm();
  const Comp = (as ?? 'input') as ElementType;
  const managed = !unmanaged
    ? {
        value: ctx.name,
        onChange: (e: ChangeEvent<HTMLInputElement>) => ctx.setName(e.target.value),
      }
    : null;
  return (
    <Comp
      ref={ref}
      id={id ?? ctx.ids.name}
      type="text"
      autoComplete="name"
      data-holeauth-signup-name=""
      {...managed}
      {...rest}
    />
  );
});

const EmailImpl = forwardPoly<'input', SignUpFormFieldOwnProps>(function SignUpFormEmail(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useSignUpForm();
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
      data-holeauth-signup-email=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

const PasswordImpl = forwardPoly<'input', SignUpFormFieldOwnProps>(function SignUpFormPassword(
  props,
  ref,
) {
  const { as, unmanaged, id, ...rest } = props;
  const ctx = useSignUpForm();
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
      autoComplete="new-password"
      required
      data-holeauth-signup-password=""
      aria-describedby={ctx.error ? ctx.ids.error : undefined}
      {...managed}
      {...rest}
    />
  );
});

export interface SignUpFormSubmitOwnProps {
  children?: ReactNode | ((s: { loading: boolean; disabled: boolean }) => ReactNode);
}

const SubmitImpl = forwardPoly<'button', SignUpFormSubmitOwnProps>(function SignUpFormSubmit(
  props,
  ref,
) {
  const { as, children, disabled, ...rest } = props;
  const ctx = useSignUpForm();
  const Comp = (as ?? 'button') as ElementType;
  const isDisabled = (disabled as boolean | undefined) ?? ctx.loading;
  const content =
    typeof children === 'function'
      ? (children as (s: { loading: boolean; disabled: boolean }) => ReactNode)({
          loading: ctx.loading,
          disabled: isDisabled,
        })
      : (children ?? 'Create account');
  return (
    <Comp
      ref={ref}
      type="submit"
      disabled={isDisabled}
      data-holeauth-signup-submit=""
      data-loading={ctx.loading ? '' : undefined}
      {...rest}
    >
      {content}
    </Comp>
  );
});

export interface SignUpFormErrorOwnProps {
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', SignUpFormErrorOwnProps>(function SignUpFormError(props, ref) {
  const { as, alwaysRender, children, id, ...rest } = props;
  const ctx = useSignUpForm();
  if (!ctx.error && !alwaysRender) return null;
  const Comp = (as ?? 'p') as ElementType;
  const content =
    typeof children === 'function' && ctx.error
      ? (children as (e: HoleauthErrorShape) => ReactNode)(ctx.error)
      : (children ?? ctx.error?.message ?? null);
  return (
    <Comp ref={ref} id={id ?? ctx.ids.error} role="alert" data-holeauth-signup-error="" {...rest}>
      {content}
    </Comp>
  );
});

/**
 * Compound sign-up form.
 *
 * ```tsx
 * <SignUpForm.Root onSuccess={() => router.push('/')}>
 *   <SignUpForm.Name />
 *   <SignUpForm.Email />
 *   <SignUpForm.Password />
 *   <SignUpForm.Error />
 *   <SignUpForm.Submit />
 * </SignUpForm.Root>
 * ```
 */
export const SignUpForm = {
  Root: RootImpl,
  Name: NameImpl,
  Email: EmailImpl,
  Password: PasswordImpl,
  Submit: SubmitImpl,
  Error: ErrorImpl,
} as const;
