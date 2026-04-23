import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { AuthenticatedProvider } from '@holeauth/react';
import { auth } from '@/lib/auth';
import { HomeContent } from './home-content';
import { HomeSkeleton } from './home-skeleton';

export default function HomePage() {
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">holeauth — Playground</h1>
      <p className="text-sm opacity-70">
        Protected dashboard — your home base when signed in.
      </p>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeAuthBoundary />
      </Suspense>
    </main>
  );
}

async function HomeAuthBoundary() {
  // Server-side gate: redirect anonymous visitors to /login.
  const validated = await validateCurrentRequest(auth, {
    loadUser: true,
    redirectTo: '/login',
  });
  return (
    <AuthenticatedProvider value={validated}>
      <HomeContent />
    </AuthenticatedProvider>
  );
}

