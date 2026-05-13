import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './css-vars.css';
import './landing.css';

const SITE_URL = 'https://holeauth.dev';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'holeauth — modular auth, edge-native',
    template: '%s | holeauth',
  },
  description:
    'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server — composed from headless adapters.',
  keywords: [
    'authentication',
    'auth',
    'TypeScript',
    'Next.js',
    'passkeys',
    'WebAuthn',
    '2FA',
    'TOTP',
    'RBAC',
    'OIDC',
    'OAuth',
    'SSO',
    'Drizzle',
    'edge',
    'holeauth',
  ],
  authors: [{ name: 'Robert Kratz', url: 'https://github.com/robert-kratz' }],
  creator: 'Robert Kratz',
  publisher: 'holeauth',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'holeauth',
    title: 'holeauth — modular auth, edge-native',
    description:
      'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server — composed from headless adapters.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'holeauth — modular auth, edge-native',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'holeauth — modular auth, edge-native',
    description:
      'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server — composed from headless adapters.',
    images: ['/og-image.png'],
    creator: '@robertjkratz',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://holeauth.dev/#organization',
        name: 'holeauth',
        url: 'https://holeauth.dev',
        logo: {
          '@type': 'ImageObject',
          url: 'https://holeauth.dev/logo.png',
          width: 512,
          height: 512,
        },
        image: {
          '@type': 'ImageObject',
          url: 'https://holeauth.dev/og-image.png',
          width: 1200,
          height: 630,
        },
        sameAs: [
          'https://github.com/robert-kratz/holeauth',
          'https://www.npmjs.com/org/holeauth',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://holeauth.dev/#website',
        url: 'https://holeauth.dev',
        name: 'holeauth',
        description:
          'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server — composed from headless adapters.',
        publisher: { '@id': 'https://holeauth.dev/#organization' },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: 'https://holeauth.dev/docs?q={search_term_string}' },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://holeauth.dev/#software',
        name: 'holeauth',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any',
        url: 'https://holeauth.dev',
        description:
          'Modular, edge-native authentication for TypeScript. Email + password, passkeys, 2FA, RBAC, SSO, and a full OAuth 2.0 / OIDC server — composed from headless adapters.',
        author: { '@id': 'https://holeauth.dev/#organization' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        softwareVersion: 'latest',
        downloadUrl: 'https://www.npmjs.com/org/holeauth',
        releaseNotes: 'https://github.com/robert-kratz/holeauth/releases',
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <div className="landing-root min-h-screen">{children}</div>
      </body>
    </html>
  );
}
