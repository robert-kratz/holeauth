import { NextResponse } from 'next/server';
import { refreshCurrentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const s = await refreshCurrentSession();
    if (!s) return NextResponse.redirect(new URL('/login', process.env.APP_URL ?? 'http://localhost:3001'));
    return NextResponse.redirect(new URL('/', process.env.APP_URL ?? 'http://localhost:3001'));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }
}
