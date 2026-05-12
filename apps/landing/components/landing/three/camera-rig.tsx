'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useScrollProgressRef } from '../hooks/use-scroll-progress';

const START = new THREE.Vector3(0, 2.4, 6.8);
const END = new THREE.Vector3(0, 0.6, 2.0);
const LOOK_START = new THREE.Vector3(0, -0.3, 0);
const LOOK_END = new THREE.Vector3(0, -1.2, 0);

export function CameraRig() {
  const scrollRef = useScrollProgressRef();
  const { camera, scene } = useThree();
  const target = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const p = scrollRef.current;
    // ease the curve so the deepening feels accelerating near the end
    const eased = p * p * (3 - 2 * p);
    target.current.lerpVectors(START, END, eased);
    lookAt.current.lerpVectors(LOOK_START, LOOK_END, eased);

    const k = 1 - Math.pow(0.001, Math.min(dt, 0.05));
    camera.position.lerp(target.current, k);
    camera.lookAt(lookAt.current);

    // Deepen the darkness on scroll
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.far = THREE.MathUtils.lerp(14, 5.5, eased);
      fog.near = THREE.MathUtils.lerp(3, 0.5, eased);
    }
  });

  return null;
}
