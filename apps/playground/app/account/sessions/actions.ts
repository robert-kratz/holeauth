'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import {
  revokeSessionForUser,
  revokeAllOtherSessions,
} from '@/lib/sessions';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

export async function revokeOwnSessionAction(formData: FormData): Promise<void> {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return;
  // Never allow self-revoke of the current session from this action — the
  // user would end up with dangling cookies. Use /logout for that.
  if (sessionId === session.sessionId) {
    redirect(
      `/account/sessions?err=${encodeURIComponent('Use Sign out to revoke the current session.')}`,
    );
  }
  try {
    const ok = await revokeSessionForUser(sessionId, session.userId);
    if (!ok) {
      redirect(`/account/sessions?err=${encodeURIComponent('Session not found.')}`);
    }
  } catch (e) {
    redirect(`/account/sessions?err=${encodeURIComponent(errMsg(e))}`);
  }
  revalidatePath('/account/sessions');
}

export async function revokeAllOtherSessionsAction(): Promise<void> {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  try {
    await revokeAllOtherSessions(session.userId, session.sessionId);
  } catch (e) {
    redirect(`/account/sessions?err=${encodeURIComponent(errMsg(e))}`);
  }
  revalidatePath('/account/sessions');
}
