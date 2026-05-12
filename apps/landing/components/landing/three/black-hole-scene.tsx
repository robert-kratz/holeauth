'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { HoleGrid } from './hole-grid';
import { HoleParticles } from './hole-particles';
import { CameraRig } from './camera-rig';
import { useReducedMotion } from '../hooks/use-reduced-motion';

function StaticFallback() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        background:
          'radial-gradient(ellipse 60% 50% at 50% 60%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 50% 70%, rgba(20,184,166,0.12), transparent 70%), #0a0a0b',
      }}
    />
  );
}

export function BlackHoleScene() {
  const reduced = useReducedMotion();

  // Direct DOM ref for cursor halo — avoids React re-renders on every mousemove
  const cursorHaloRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = cursorHaloRef.current;
      if (!el) return;
      el.style.background = `radial-gradient(circle 220px at ${e.clientX}px ${e.clientY}px, rgba(10,10,11,0.18) 0%, rgba(10,10,11,0.06) 55%, transparent 100%)`;
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  if (reduced) return <StaticFallback />;

  return (
    <div className="scene-fadein pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Canvas
        camera={{ position: [0, 2.4, 6.8], fov: 50, near: 0.1, far: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0a0a0b']} />
        <fog attach="fog" args={['#0a0a0b', 3, 14]} />
        <ambientLight intensity={0.4} />
        <Suspense fallback={null}>
          <HoleGrid />
          <HoleParticles />
        </Suspense>
        <CameraRig />
      </Canvas>
      {/* Cursor dark halo — simulates gravitational mass at mouse position */}
      <div ref={cursorHaloRef} className="pointer-events-none absolute inset-0" />
      {/* Soft top + bottom vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,10,11,0.90) 0%, rgba(10,10,11,0) 16%, rgba(10,10,11,0) 72%, rgba(10,10,11,0.98) 100%)',
        }}
      />
      {/* Radial edge vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 72% 52% at 50% 40%, rgba(10,10,11,0) 0%, rgba(10,10,11,0) 26%, rgba(10,10,11,0.55) 58%, rgba(10,10,11,0.88) 100%)',
        }}
      />
    </div>
  );
}
