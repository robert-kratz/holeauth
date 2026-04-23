'use server';

import { redirect } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export async function revokeAllTokensAction(formData: FormData): Promise<void> {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const appId = String(formData.get('appId'));
  await auth.idp.tokens.revokeAllForApp(session.userId, appId);
  redirect(`/developer/apps/${appId}/tokens?ok=Revoked+all`);
}
