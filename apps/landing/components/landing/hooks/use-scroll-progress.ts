'use client';

import { useEffect, useRef } from 'react';

/**
 * Returns a stable ref whose `.current` is the normalized page scroll progress (0..1).
 * Updating the ref does NOT trigger re-renders — read it inside useFrame.
 */
export function useScrollProgressRef() {
  const ref = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ref.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      raf = 0;
    };
    const onScroll = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
