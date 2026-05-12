'use client';
import {
  useCallback,
  useState,
  type ElementType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  usePasskeyDelete,
  usePasskeyList,
  usePasskeyRegister,
  type PasskeySummary,
} from '@holeauth/react';
import { createStrictContext } from './internal/context.js';
import { forwardPoly } from './internal/forward-poly.js';
import type { HoleauthErrorShape } from './internal/types.js';

interface Ctx {
  passkeys: PasskeySummary[] | null;
  listLoading: boolean;
  registerLoading: boolean;
  deleteLoading: boolean;
  error: HoleauthErrorShape | null;
  register: (deviceName?: string) => Promise<void>;
  remove: (credentialId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const { Provider, use: usePasskeySetup } = createStrictContext<Ctx>('PasskeySetup');
export { usePasskeySetup };

export interface PasskeySetupRootOwnProps {
  onRegisterSuccess?: () => void;
  onDeleteSuccess?: (credentialId: string) => void;
  onError?: (error: HoleauthErrorShape) => void;
  children: ReactNode;
}

const RootImpl = forwardPoly<'div', PasskeySetupRootOwnProps>(function Root(props, ref) {
  const { as, children, onRegisterSuccess, onDeleteSuccess, onError, ...rest } = props;
  const { passkeys, loading: listLoading, error: listError, refresh } = usePasskeyList();
  const {
    register: registerHook,
    loading: registerLoading,
    error: registerError,
  } = usePasskeyRegister();
  const {
    delete: deleteHook,
    loading: deleteLoading,
    error: deleteError,
  } = usePasskeyDelete();

  const error: HoleauthErrorShape | null = registerError ?? deleteError ?? listError;

  const register = useCallback(
    async (deviceName?: string) => {
      const res = await registerHook(deviceName);
      if (res.ok) {
        await refresh();
        onRegisterSuccess?.();
      } else if (registerError) {
        onError?.(registerError);
      }
    },
    [registerHook, refresh, onRegisterSuccess, onError, registerError],
  );

  const remove = useCallback(
    async (credentialId: string) => {
      const res = await deleteHook(credentialId);
      if (res.ok) {
        await refresh();
        onDeleteSuccess?.(credentialId);
      } else if (deleteError) {
        onError?.(deleteError);
      }
    },
    [deleteHook, refresh, onDeleteSuccess, onError, deleteError],
  );

  const ctx: Ctx = {
    passkeys,
    listLoading,
    registerLoading,
    deleteLoading,
    error,
    register,
    remove,
    refresh,
  };

  const Comp = (as ?? 'div') as ElementType;
  return (
    <Provider value={ctx}>
      <Comp ref={ref} data-holeauth-passkey-setup="" {...rest}>
        {children}
      </Comp>
    </Provider>
  );
});

export interface PasskeySetupListOwnProps {
  children: (
    state:
      | { state: 'loading' }
      | { state: 'empty' }
      | { state: 'ready'; passkeys: PasskeySummary[] },
  ) => ReactNode;
}

const ListImpl = forwardPoly<'div', PasskeySetupListOwnProps>(function List(props, ref) {
  const { as, children, ...rest } = props;
  const ctx = usePasskeySetup();
  const Comp = (as ?? 'div') as ElementType;
  const state: Parameters<PasskeySetupListOwnProps['children']>[0] =
    ctx.passkeys === null
      ? { state: 'loading' }
      : ctx.passkeys.length === 0
        ? { state: 'empty' }
        : { state: 'ready', passkeys: ctx.passkeys };
  return (
    <Comp ref={ref} data-holeauth-passkey-list="" data-state={state.state} {...rest}>
      {children(state)}
    </Comp>
  );
});

export interface PasskeySetupRegisterButtonOwnProps {
  /** Optional human-readable device name shown in the list afterwards. */
  deviceName?: string;
  children?: ReactNode | ((s: { loading: boolean }) => ReactNode);
}

const RegisterButtonImpl = forwardPoly<'button', PasskeySetupRegisterButtonOwnProps>(
  function RegisterButton(props, ref) {
    const { as, children, deviceName, onClick, disabled, ...rest } = props;
    const ctx = usePasskeySetup();
    const Comp = (as ?? 'button') as ElementType;
    const isDisabled = (disabled as boolean | undefined) ?? ctx.registerLoading;
    const [name, setName] = useState(deviceName);
    void setName;
    const content =
      typeof children === 'function'
        ? (children as (s: { loading: boolean }) => ReactNode)({ loading: ctx.registerLoading })
        : (children ?? 'Add passkey');
    return (
      <Comp
        ref={ref}
        type="button"
        disabled={isDisabled}
        data-holeauth-passkey-register=""
        data-loading={ctx.registerLoading ? '' : undefined}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          if (e.defaultPrevented) return;
          void ctx.register(name);
        }}
        {...rest}
      >
        {content}
      </Comp>
    );
  },
);

export interface PasskeySetupDeleteButtonOwnProps {
  /** REQUIRED — the credential id from a `PasskeySummary`. */
  credentialId: string;
  children?: ReactNode | ((s: { loading: boolean }) => ReactNode);
}

const DeleteButtonImpl = forwardPoly<'button', PasskeySetupDeleteButtonOwnProps>(
  function DeleteButton(props, ref) {
    const { as, credentialId, children, onClick, disabled, ...rest } = props;
    const ctx = usePasskeySetup();
    const Comp = (as ?? 'button') as ElementType;
    const isDisabled = (disabled as boolean | undefined) ?? ctx.deleteLoading;
    const content =
      typeof children === 'function'
        ? (children as (s: { loading: boolean }) => ReactNode)({ loading: ctx.deleteLoading })
        : (children ?? 'Remove');
    return (
      <Comp
        ref={ref}
        type="button"
        disabled={isDisabled}
        data-holeauth-passkey-delete=""
        data-loading={ctx.deleteLoading ? '' : undefined}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          (onClick as ((ev: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
          if (e.defaultPrevented) return;
          void ctx.remove(credentialId);
        }}
        {...rest}
      >
        {content}
      </Comp>
    );
  },
);

export interface PasskeySetupErrorOwnProps {
  alwaysRender?: boolean;
  children?: ReactNode | ((error: HoleauthErrorShape) => ReactNode);
}

const ErrorImpl = forwardPoly<'p', PasskeySetupErrorOwnProps>(function Error_(props, ref) {
  const { as, alwaysRender, children, ...rest } = props;
  const ctx = usePasskeySetup();
  if (!ctx.error && !alwaysRender) return null;
  const Comp = (as ?? 'p') as ElementType;
  const content =
    typeof children === 'function' && ctx.error
      ? (children as (e: HoleauthErrorShape) => ReactNode)(ctx.error)
      : (children ?? ctx.error?.message ?? null);
  return (
    <Comp ref={ref} role="alert" data-holeauth-passkey-error="" {...rest}>
      {content}
    </Comp>
  );
});

/**
 * Compound passkey management surface. Combines list / register / delete in
 * a single Provider so callers can compose the UI freely.
 *
 * ```tsx
 * <PasskeySetup.Root>
 *   <PasskeySetup.List>
 *     {(s) => s.state === 'ready'
 *       ? s.passkeys.map((p) => (
 *           <div key={p.id}>
 *             <span>{p.deviceName ?? p.credentialId.slice(0, 8)}</span>
 *             <PasskeySetup.DeleteButton credentialId={p.credentialId} />
 *           </div>
 *         ))
 *       : s.state === 'empty'
 *         ? <p>No passkeys yet.</p>
 *         : <p>Loading…</p>}
 *   </PasskeySetup.List>
 *   <PasskeySetup.RegisterButton deviceName="MacBook" />
 *   <PasskeySetup.Error />
 * </PasskeySetup.Root>
 * ```
 */
export const PasskeySetup = {
  Root: RootImpl,
  List: ListImpl,
  RegisterButton: RegisterButtonImpl,
  DeleteButton: DeleteButtonImpl,
  Error: ErrorImpl,
} as const;
