'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { depth } from './hole-grid';

// ── Physics constants ────────────────────────────────────────────────────────
const G              = 2.8;
const PARTICLE_COUNT = 126;   // ~30 % fewer particles
const TRAIL_LEN      = 20;
const TOTAL_POINTS   = PARTICLE_COUNT * TRAIL_LEN;
const R_EVENT        = 0.22;
const R_MAX          = 7.0;
const EPSILON        = 0.01;
const MIN_VR         = 0.015; // gravity always wins
const L_DECAY        = 0.55;  // angular-momentum bleed-off per second → no endless orbits
const MOUSE_RADIUS     = 3.0;
const MOUSE_REPULSION  = 3.5; // push strength
const MOUSE_OUTSIDE    = -99; // sentinel: mouse not over page

interface Particle {
  r: number;
  theta: number;
  vr: number;  // inward radial speed (always >= MIN_VR)
  L: number;   // specific angular momentum (always positive = clockwise orbit)
  colorIdx: number;
  size: number;
}

function spawnParticle(p: Particle, initial = false) {
  p.r = initial
    ? R_EVENT + Math.random() * (R_MAX - R_EVENT)
    : R_MAX * (0.78 + Math.random() * 0.22);
  p.theta = Math.random() * Math.PI * 2;
  const vrFall = Math.sqrt(Math.max(0, 2 * G * (1 / (p.r + EPSILON) - 1 / (R_MAX + EPSILON))));
  p.vr = Math.max(MIN_VR, vrFall + 0.03);
  // Small positive L → clockwise curve without completing full orbits
  p.L  = 0.04 + Math.random() * 0.11;
  p.colorIdx = Math.random() < 0.72 ? 0 : 1;
  p.size = 0.025 + Math.random() * 0.025;
}

function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function HoleParticles() {
  const glow       = useMemo(() => makeGlowTexture(), []);
  const { camera } = useThree();

  // ── Mouse tracking ───────────────────────────────────────────────────────
  const mouseNDC = useRef({ x: MOUSE_OUTSIDE, y: MOUSE_OUTSIDE });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseNDC.current = {
        x:  (e.clientX / window.innerWidth)  * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
    };
    // Reset to sentinel when mouse leaves the browser window entirely
    const onLeave = () => {
      mouseNDC.current = { x: MOUSE_OUTSIDE, y: MOUSE_OUTSIDE };
    };
    window.addEventListener('mousemove', onMove,  { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // ── Particles ────────────────────────────────────────────────────────────
  const particles = useMemo<Particle[]>(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: Particle = { r: 0, theta: 0, vr: 0, L: 0, size: 0, colorIdx: 0 };
      spawnParticle(p, true);
      arr.push(p);
    }
    return arr;
  }, []);

  // ── Trail ring buffer ────────────────────────────────────────────────────
  const trailBuf = useMemo(() => {
    const buf = new Float32Array(PARTICLE_COUNT * TRAIL_LEN * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p  = particles[i];
      const x0 = Math.cos(p.theta) * p.r;
      const z0 = Math.sin(p.theta) * p.r;
      const y0 = depth(p.r);
      for (let k = 0; k < TRAIL_LEN; k++) {
        const base = (i * TRAIL_LEN + k) * 3;
        buf[base] = x0; buf[base + 1] = y0; buf[base + 2] = z0;
      }
    }
    return buf;
  }, [particles]);

  const trailHead = useMemo(() => new Int32Array(PARTICLE_COUNT), []);
  const positions = useMemo(() => new Float32Array(TOTAL_POINTS * 3), []);
  const colors    = useMemo(() => new Float32Array(TOTAL_POINTS * 3), []);
  const geomRef   = useRef<THREE.BufferGeometry>(null);

  const violet = useMemo(() => new THREE.Color('#dd5e98'), []);
  const teal   = useMemo(() => new THREE.Color('#c1ae7c'), []);
  const mid    = useMemo(() => new THREE.Color('#cc4bc2'), []); // midpoint for trail spectrum
  const _v     = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);

    // ── Unproject mouse → world XZ plane at y≈0 ──────────────────────────
    _v.current.set(mouseNDC.current.x, mouseNDC.current.y, 0.5).unproject(camera);
    const rdx = _v.current.x - camera.position.x;
    const rdy = _v.current.y - camera.position.y;
    const rdz = _v.current.z - camera.position.z;
    const t0  = Math.abs(rdy) > 0.0001 ? -camera.position.y / rdy : 1e6;
    const mwx = camera.position.x + t0 * rdx;
    const mwz = camera.position.z + t0 * rdz;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p   = particles[i];
      const r2  = p.r * p.r + EPSILON;

      // ── Gravity integration (Euler) ──────────────────────────────────────
      const gravity     = G / r2;
      const centrifugal = (p.L * p.L) / (r2 * p.r + EPSILON);
      p.vr    += (gravity - centrifugal) * delta;
      p.vr     = Math.max(MIN_VR, p.vr);        // gravity always wins
      p.r     -= p.vr * delta;
      p.theta += (p.L / r2) * delta;
      // Bleed off angular momentum → spiral tightens, no endless orbiting
      p.L *= Math.max(0, 1 - L_DECAY * delta);

      // ── Mouse: repulsion — push particle away, gravity still wins ──────────
      const px  = Math.cos(p.theta) * p.r;
      const pz  = Math.sin(p.theta) * p.r;
      // Skip entirely when mouse is outside the page (sentinel value)
      const mouseActive = mouseNDC.current.x !== MOUSE_OUTSIDE;
      if (mouseActive) {
        const dmx = px - mwx;          // vector FROM mouse TO particle (repulsion)
        const dmz = pz - mwz;
        const dSq = dmx * dmx + dmz * dmz;
        if (dSq < MOUSE_RADIUS * MOUSE_RADIUS && dSq > 0.001) {
          const dist     = Math.sqrt(dSq);
          const strength = MOUSE_REPULSION * Math.pow(1 - dist / MOUSE_RADIUS, 2);
          // Project push onto radial and tangential axes
          const cosT = Math.cos(p.theta);
          const sinT = Math.sin(p.theta);
          // Radial component: positive = outward → fights infall, clamped to MIN_VR
          const f_r  = (dmx * cosT + dmz * sinT) / dist * strength;
          // Tangential component: deflects orbit angle
          const f_th = (dmx * (-sinT) + dmz * cosT) / dist * strength;
          // Slow the inward fall (but gravity always pulls it back)
          p.vr = Math.max(MIN_VR, p.vr - f_r * delta);
          // Deflect angle — keep orbit moving, prevents standing still
          p.theta += (f_th / (p.r + EPSILON)) * delta;
        }
      }

      if (p.r < R_EVENT) {
        spawnParticle(p, false);
        // recolor on spawn
        const c = p.colorIdx === 0 ? violet : teal;
        colors[(i * TRAIL_LEN) * 3]     = c.r;
        colors[(i * TRAIL_LEN) * 3 + 1] = c.g;
        colors[(i * TRAIL_LEN) * 3 + 2] = c.b;
      }

      const x = Math.cos(p.theta) * p.r;
      const z = Math.sin(p.theta) * p.r;
      const y = depth(p.r) + 0.025;

      // ── Push head into ring buffer ───────────────────────────────────────
      const slot    = trailHead[i];
      const bufBase = (i * TRAIL_LEN + slot) * 3;
      trailBuf[bufBase]     = x;
      trailBuf[bufBase + 1] = y;
      trailBuf[bufBase + 2] = z;
      trailHead[i] = (slot + 1) % TRAIL_LEN;

      // ── Write trail to render buffers ────────────────────────────────────
      const head = p.colorIdx === 0 ? violet : teal;
      const tail = p.colorIdx === 0 ? mid    : teal;
      const newHead = trailHead[i];

      for (let k = 0; k < TRAIL_LEN; k++) {
        const readSlot = (newHead - 1 - k + TRAIL_LEN) % TRAIL_LEN;
        const srcBase  = (i * TRAIL_LEN + readSlot) * 3;
        const dstBase  = (i * TRAIL_LEN + k) * 3;

        positions[dstBase]     = trailBuf[srcBase];
        positions[dstBase + 1] = trailBuf[srcBase + 1];
        positions[dstBase + 2] = trailBuf[srcBase + 2];

        // Quadratic brightness falloff: head bright, tail fades to darkness.
        // Colour shifts from head hue → midpoint as trail ages (spectrum sweep).
        const t    = k / TRAIL_LEN;
        const fade = Math.pow(1 - t, 2.2);
        // Lerp colour head → tail along spectrum
        const cr   = head.r + (tail.r - head.r) * t;
        const cg   = head.g + (tail.g - head.g) * t;
        const cb   = head.b + (tail.b - head.b) * t;

        colors[dstBase]     = cr * fade;
        colors[dstBase + 1] = cg * fade;
        colors[dstBase + 2] = cb * fade;
      }
    }

    const geom = geomRef.current;
    if (geom) {
      (geom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geom.getAttribute('color')    as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={TOTAL_POINTS}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={TOTAL_POINTS}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        map={glow}
        vertexColors
        transparent
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        alphaTest={0.004}
      />
    </points>
  );
}
