'use client';
import {
  forwardRef as reactForwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
import type {
  PolymorphicForwardRef,
  PolymorphicProps,
  PolymorphicRef,
} from './polymorphic.js';
import type { ElementType, ReactElement } from 'react';

/**
 * Strongly-typed polymorphic forwardRef helper.
 *
 * Internally `forwardRef`'s generic signature cannot express polymorphism
 * over the `as` prop (TypeScript has no way to infer the ref target from
 * a runtime prop). This helper hides that fact behind a strict outer type
 * (`PolymorphicForwardRef<Default, OwnProps>`) while keeping the inner
 * render function compiling under strict mode.
 *
 * Consumers of the returned component get full IntelliSense for the
 * chosen `as` element's native props, refs, and event handlers.
 */
export function forwardPoly<Default extends ElementType, OwnProps>(
  render: (
    props: PolymorphicProps<Default, OwnProps>,
    ref: PolymorphicRef<Default>,
  ) => ReactElement | null,
): PolymorphicForwardRef<Default, OwnProps> {
  // Inner type-narrowing is impossible across an arbitrary `as`; the cast is
  // confined here and re-typed strictly at the boundary.
  const inner = reactForwardRef(render as never) as ForwardRefExoticComponent<
    PolymorphicProps<Default, OwnProps> & RefAttributes<unknown>
  >;
  return inner as unknown as PolymorphicForwardRef<Default, OwnProps>;
}
