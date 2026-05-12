'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const RADIAL_SEGMENTS  = 64;
const ANGULAR_SEGMENTS = 96;
const R_INNER          = 0.18;
const R_OUTER          = 7.5;
const WELL_STRENGTH    = 1.35;

// ── Mouse gravity-well constants ─────────────────────────────────────────────
// The mouse acts like a secondary point mass sitting on the grid plane.
// Its influence is completely additive on top of the central black-hole depth
// — they do not interact.
//
//  Δy   = -G_Y  / (r + SOFT)         — 1/r potential → funnel dip
//  ΔxΔz = -G_XZ * d̂ / (r² + SOFT²) — 1/r² force  → spatial drag toward mouse
const G_Y        = 8.5;   // vertical dip amplitude
const G_XZ       = 1.6;   // horizontal drag amplitude
const MOUSE_SOFT = 0.35;  // softening radius — sharper, more localized funnel
const FALLOFF_SQ = 26.0;  // Gaussian σ² in world-unit²; exp(-r²/σ²) envelope
const LERP_BACK  = 4.5;   // blend speed when mouse leaves (world units/s)

const MOUSE_OUTSIDE = -99; // sentinel — mouse off page

// ─────────────────────────────────────────────────────────────────────────────
// Exported so HoleParticles can reuse the same y(r) function.
function depth(r: number): number {
  return (
    -WELL_STRENGTH / (r * r + 0.05) +
    WELL_STRENGTH  / (R_OUTER * R_OUTER + 0.05)
  );
}

// ── Build helpers ─────────────────────────────────────────────────────────────

/** Canonical (unwarped) vertex positions — central well depth baked in. */
function buildBasePositions(): Float32Array {
  const n   = RADIAL_SEGMENTS * ANGULAR_SEGMENTS;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const t = i / (RADIAL_SEGMENTS - 1);
    const r = R_INNER + (R_OUTER - R_INNER) * Math.pow(t, 1.35);
    for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
      const a   = (j / ANGULAR_SEGMENTS) * Math.PI * 2;
      const idx = (i * ANGULAR_SEGMENTS + j) * 3;
      arr[idx]     = Math.cos(a) * r;
      arr[idx + 1] = depth(r);
      arr[idx + 2] = Math.sin(a) * r;
    }
  }
  return arr;
}

/** Per-vertex RGB brightness (alpha-like fade at rim and center). */
function buildColors(): Float32Array {
  const n   = RADIAL_SEGMENTS * ANGULAR_SEGMENTS;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const t         = i / (RADIAL_SEGMENTS - 1);
    const edgeFade  = THREE.MathUtils.smoothstep(t, 0.0, 0.06);
    const rimFade   = 1 - THREE.MathUtils.smoothstep(t, 0.88, 1.0);
    const alpha     = Math.min(edgeFade, rimFade);
    for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
      const idx    = (i * ANGULAR_SEGMENTS + j) * 3;
      arr[idx]     = alpha;
      arr[idx + 1] = alpha;
      arr[idx + 2] = alpha;
    }
  }
  return arr;
}

/** Primary (even) and secondary (odd) index arrays. */
function buildIndices(): [number[], number[]] {
  const primary: number[]   = [];
  const secondary: number[] = [];

  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const target = i % 2 === 0 ? primary : secondary;
    for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
      target.push(
        i * ANGULAR_SEGMENTS + j,
        i * ANGULAR_SEGMENTS + ((j + 1) % ANGULAR_SEGMENTS),
      );
    }
  }
  for (let j = 0; j < ANGULAR_SEGMENTS; j++) {
    const target = j % 2 === 0 ? primary : secondary;
    for (let i = 0; i < RADIAL_SEGMENTS - 1; i++) {
      target.push(i * ANGULAR_SEGMENTS + j, (i + 1) * ANGULAR_SEGMENTS + j);
    }
  }
  return [primary, secondary];
}

// ─────────────────────────────────────────────────────────────────────────────

export function HoleGrid() {
  // ── Immutable base data ────────────────────────────────────────────────────
  const basePos = useMemo(() => buildBasePositions(), []);
  const colors  = useMemo(() => buildColors(), []);
  const [primaryIdx, secondaryIdx] = useMemo(() => buildIndices(), []);

  // ── Mutable work buffer (mutated every frame) ──────────────────────────────
  const workPos = useMemo(() => new Float32Array(basePos), [basePos]);

  // Shared live BufferAttribute — both geometries reference the same object
  const posAttr = useMemo(
    () => new THREE.Float32BufferAttribute(workPos, 3),
    [workPos],
  );
  const colAttr = useMemo(
    () => new THREE.Float32BufferAttribute(colors, 3),
    [colors],
  );

  const [primaryGeom, secondaryGeom] = useMemo(() => {
    const make = (idx: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', posAttr);
      g.setAttribute('color',    colAttr);
      g.setIndex(idx);
      // Disable automatic frustum culling: the bounding sphere is computed
      // once from the rest pose and would incorrectly cull the deformed grid.
      // We handle visibility ourselves via fog + opacity.
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
      return g;
    };
    return [make(primaryIdx), make(secondaryIdx)];
  }, [posAttr, colAttr, primaryIdx, secondaryIdx]);

  // ── Mouse tracking ─────────────────────────────────────────────────────────
  const mouseNDC = useRef({ x: MOUSE_OUTSIDE, y: MOUSE_OUTSIDE });
  useEffect(() => {
    const onMove  = (e: MouseEvent) => {
      mouseNDC.current = {
        x:  (e.clientX / window.innerWidth)  * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
    };
    const onLeave = () => { mouseNDC.current = { x: MOUSE_OUTSIDE, y: MOUSE_OUTSIDE }; };
    window.addEventListener('mousemove', onMove,  { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const _v = useRef(new THREE.Vector3());

  // ── Per-frame update ───────────────────────────────────────────────────────
  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.025;

    const mouseActive = mouseNDC.current.x !== MOUSE_OUTSIDE;

    if (!mouseActive) {
      // Blend workPos smoothly back to basePos
      const k = Math.min(1, LERP_BACK * delta);
      let dirty = false;
      for (let i = 0; i < workPos.length; i++) {
        const diff = basePos[i]! - workPos[i]!;
        if (Math.abs(diff) > 5e-5) { workPos[i] = workPos[i]! + diff * k; dirty = true; }
      }
      if (dirty) posAttr.needsUpdate = true;
      return;
    }

    // ── Unproject mouse NDC → world XZ plane (y ≈ 0) ──────────────────────
    _v.current.set(mouseNDC.current.x, mouseNDC.current.y, 0.5).unproject(camera);
    const rdx = _v.current.x - camera.position.x;
    const rdy = _v.current.y - camera.position.y;
    const rdz = _v.current.z - camera.position.z;
    const t0  = Math.abs(rdy) > 1e-4 ? -camera.position.y / rdy : 1e6;
    const mwx = camera.position.x + t0 * rdx;
    const mwz = camera.position.z + t0 * rdz;

    // ── Transform mouse from WORLD → GROUP LOCAL space ─────────────────────
    // The group only rotates around Y by `rotation.y`.
    // Local = inverse-Y-rotate(world).
    const angle = groupRef.current ? groupRef.current.rotation.y : 0;
    const cosA  =  Math.cos(angle);
    const sinA  =  Math.sin(angle);
    const lmx   = cosA * mwx + sinA * mwz;   //  R_y^-1 * world
    const lmz   = -sinA * mwx + cosA * mwz;

    // ── Apply gravitational warp to each vertex ────────────────────────────
    const n = RADIAL_SEGMENTS * ANGULAR_SEGMENTS;
    for (let k = 0; k < n; k++) {
      const base = k * 3;
      const bx   = basePos[base]!;
      const by   = basePos[base + 1]!;
      const bz   = basePos[base + 2]!;

      const dx   = bx - lmx;          // vector: mouse → vertex
      const dz   = bz - lmz;
      const r2   = dx * dx + dz * dz;
      const r    = Math.sqrt(r2);

      // Gaussian envelope: exp(-r²/σ²) — warp fades to zero at large distances
      const envelope = Math.exp(-r2 / FALLOFF_SQ);

      // Vertical dip: 1/r gravitational potential → concave funnel at mouse
      // Independent of the central-hole depth (purely additive)
      const dY = (-G_Y / (r + MOUSE_SOFT)) * envelope;

      // Horizontal drag: 1/r² gravitational force toward mouse
      const force = (G_XZ / (r2 + MOUSE_SOFT * MOUSE_SOFT)) * envelope;
      const dX    = -dx * force;   // negative: toward mouse
      const dZ    = -dz * force;

      workPos[base]     = bx + dX;
      workPos[base + 1] = by + dY;
      workPos[base + 2] = bz + dZ;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <group ref={groupRef} rotation={[0, 0, 0]}>
      {/* Primary lines — full opacity */}
      <lineSegments geometry={primaryGeom} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.30} depthWrite={false} color="#ffffff" />
      </lineSegments>
      {/* Secondary lines — 70 % of primary */}
      <lineSegments geometry={secondaryGeom} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.21} depthWrite={false} color="#ffffff" />
      </lineSegments>
      {/* Violet accent overlay — primary */}
      <lineSegments geometry={primaryGeom} position={[0, 0.001, 0]} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors transparent opacity={0.10} depthWrite={false}
          color="#a78bfa" blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      {/* Violet accent overlay — secondary */}
      <lineSegments geometry={secondaryGeom} position={[0, 0.001, 0]} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors transparent opacity={0.07} depthWrite={false}
          color="#a78bfa" blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

export { depth };
