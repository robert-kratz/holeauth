import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Verify2faClient from './verify-client';

export default async function Verify2faPage() {
  const jar = await cookies();
  const pending = jar.get('holeauth.pending');
  if (!pending?.value) {
    redirect('/login');
  }
  return <Verify2faClient />;
}
