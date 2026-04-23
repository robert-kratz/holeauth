'use server';

import { redirect } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export async function createAppAction(formData: FormData): Promise<void> {
  const { session } = await validateCurrentRequest(auth, {
    permissions: ['idp.apps.create'],
    redirectTo: '/login',
  });
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const type = String(formData.get('type') ?? 'confidential') as
    | 'public'
    | 'confidential';
  const redirectUris = String(formData.get('redirectUris') ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const requirePkce = formData.get('requirePkce') != null;

  if (!name || redirectUris.length === 0) {
    redirect('/developer/apps/new?err=Name+and+at+least+one+redirect_uri+required');
  }

  try {
    const { app, clientSecret } = await auth.idp.apps.create(session.userId, {
      name,
      description: description || null,
      type,
      redirectUris,
      requirePkce,
    });
    // Stash secret in query once; detail page renders + warns user to copy it.
    if (clientSecret) {
      redirect(
        `/developer/apps/${app.id}?secret=${encodeURIComponent(clientSecret)}`,
      );
    }
    redirect(`/developer/apps/${app.id}`);
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e; // next redirect
    const msg = e instanceof Error ? e.message : 'create failed';
    redirect(`/developer/apps/new?err=${encodeURIComponent(msg)}`);
  }
}
