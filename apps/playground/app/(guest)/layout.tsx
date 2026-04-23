import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getFullSession } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

/**
 * Layout for routes that should only be visible to *unauthenticated* visitors
 * (login, register, forgot/reset password, passkey login). Authenticated users
 * are bounced back to the home/dashboard page.
 */
export default async function GuestLayout({ children }: { children: ReactNode }) {
  const validated = await getFullSession(auth);
  if (validated) redirect('/');
  return children;
}
