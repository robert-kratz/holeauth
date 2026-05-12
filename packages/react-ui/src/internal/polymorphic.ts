'use client';
import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  ElementType,
  ReactElement,
} from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Strict polymorphic component types — patterned after Radix UI / Chakra v2.
 * Lets us write components that accept an `as` prop while keeping full
 * type-safety on the rendered element's native props.
 *
 * Usage in a component file:
 *   type Props<As extends ElementType> = PolymorphicProps<As, OwnProps>;
 *   export const Foo = forwardRef(<As extends ElementType = 'div'>(
 *     { as, ...rest }: Props<As>,
 *     ref: PolymorphicRef<As>,
 *   ) => { ... }) as PolymorphicForwardRef<'div', OwnProps>;
 */

/** Props that intersect with native HTML element props for the chosen `as`. */
export type PolymorphicProps<
  As extends ElementType,
  OwnProps = Record<never, never>,
> = OwnProps & {
  /** Render as a different HTML element / component. */
  as?: As;
} & Omit<ComponentPropsWithoutRef<As>, keyof OwnProps | 'as'>;

/** Ref type for the chosen `as` element. */
export type PolymorphicRef<As extends ElementType> = ComponentPropsWithRef<As>['ref'];

/**
 * Signature of a polymorphic forwardRef component. Use as the cast target
 * after `forwardRef(...)`. Generic over the default element (`Default`) and
 * the component's own props (`OwnProps`).
 */
export type PolymorphicForwardRef<Default extends ElementType, OwnProps = Record<never, never>> = <
  As extends ElementType = Default,
>(
  props: PolymorphicProps<As, OwnProps> & { ref?: PolymorphicRef<As> },
) => ReactElement | null;
