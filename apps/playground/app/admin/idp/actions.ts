'use server';

import { redirect } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export async function rotateKeysAction(): Promise<void> {
  await validateCurrentRequest(auth, {
    permissions: ['idp.keys.rotate'],
    redirectTo: '/login',
  });
  await auth.idp.keys.rotate();
  redirect('/admin/idp?ok=Key+rotated');
}
