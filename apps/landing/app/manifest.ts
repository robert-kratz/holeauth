import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'holeauth',
    short_name: 'holeauth',
    description:
      'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#0a0a0b',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
