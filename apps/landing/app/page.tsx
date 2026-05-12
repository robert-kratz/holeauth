import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  alternates: { canonical: 'https://holeauth.dev' },
};

export default function HomePage() {
  return <Landing />;
}
