import type { HTMLAttributes } from 'react';

/**
 * Tiny shimmering placeholder. Server-renderable (no client boundary needed).
 */
export function Skeleton({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className}`}
    />
  );
}
