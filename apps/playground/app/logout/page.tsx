'use client';
import { useEffect } from 'react';
import { useSignOut } from '@holeauth/react';

export default function LogoutPage() {
  const { signOut } = useSignOut();
  useEffect(() => {
    void signOut().then(() => {
      window.location.href = '/login';
    });
  }, [signOut]);
  return <main><p>Signing out…</p></main>;
}
