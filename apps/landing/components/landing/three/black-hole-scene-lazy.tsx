'use client';

import dynamic from 'next/dynamic';

export const BlackHoleSceneLazy = dynamic(
  () => import('./black-hole-scene').then((m) => m.BlackHoleScene),
  { ssr: false },
);
