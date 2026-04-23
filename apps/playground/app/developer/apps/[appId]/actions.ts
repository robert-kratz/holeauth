'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

async function requireUser(): Promise<string> {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  return session.userId;
}

export async function regenerateSecretAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const appId = String(formData.get('appId'));
  try {
    const { clientSecret } = await auth.idp.apps.regenerateSecret(userId, appId);
    redirect(`/developer/apps/${appId}?secret=${encodeURIComponent(clientSecret)}`);
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e;
    const msg = e instanceof Error ? e.message : 'failed';
    redirect(`/developer/apps/${appId}?err=${encodeURIComponent(msg)}`);
  }
}

export async function updateAppAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const appId = String(formData.get('appId'));
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const redirectUris = String(formData.get('redirectUris') ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedScopes = String(formData.get('allowedScopes') ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const requirePkce = formData.get('requirePkce') != null;
  try {
    await auth.idp.apps.update(userId, appId, {
      name,
      description: description || null,
      redirectUris,
      allowedScopes,
      requirePkce,
    });
    revalidatePath(`/developer/apps/${appId}`);
    redirect(`/developer/apps/${appId}?ok=Saved`);
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e;
    const msg = e instanceof Error ? e.message : 'failed';
    redirect(`/developer/apps/${appId}?err=${encodeURIComponent(msg)}`);
  }
}

export async function toggleDisabledAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const appId = String(formData.get('appId'));
  const disabled = String(formData.get('disabled')) === 'true';
  try {
    await auth.idp.apps.update(userId, appId, { disabled });
    revalidatePath(`/developer/apps/${appId}`);
    redirect(`/developer/apps/${appId}?ok=${disabled ? 'Disabled' : 'Enabled'}`);
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e;
    const msg = e instanceof Error ? e.message : 'failed';
    redirect(`/developer/apps/${appId}?err=${encodeURIComponent(msg)}`);
  }
}

export async function deleteAppAction(formData: FormData): Promise<void> {
  const userId = await requireUser();
  const appId = String(formData.get('appId'));
  try {
    await auth.idp.apps.delete(userId, appId);
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e;
    const msg = e instanceof Error ? e.message : 'failed';
    redirect(`/developer/apps/${appId}?err=${encodeURIComponent(msg)}`);
  }
  redirect('/developer/apps?ok=Deleted');
}
