'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { adminRevokeSession } from '@/lib/sessions';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

export async function adminRevokeSessionAction(formData: FormData): Promise<void> {
  await validateCurrentRequest(auth, {
    permissions: ['admin.sessions.write'],
    redirectTo: '/login',
  });
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return;
  try {
    const ok = await adminRevokeSession(sessionId);
    if (!ok) {
      redirect(`/admin/sessions?err=${encodeURIComponent('Session not found.')}`);
    }
  } catch (e) {
    redirect(`/admin/sessions?err=${encodeURIComponent(errMsg(e))}`);
  }
  revalidatePath('/admin/sessions');
}
