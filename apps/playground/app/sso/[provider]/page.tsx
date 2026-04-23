'use client';
import { useSso } from '@holeauth/react';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

export default function SsoStartPage() {
  const params = useParams<{ provider: string }>();
  const providerId = params?.provider ?? '';
  const { start } = useSso(providerId);

  useEffect(() => {
    if (providerId) start('/');
  }, [providerId, start]);

  return (
    <main>
      <p>Redirecting to <code>{providerId}</code>…</p>
    </main>
  );
}
