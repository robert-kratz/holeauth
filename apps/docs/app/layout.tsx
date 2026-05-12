import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import 'fumadocs-ui/style.css';
import './css-vars.css';
import './globals.css';
import './docs-theme.css';

const SITE_URL = 'https://docs.holeauth.dev';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'holeauth docs',
    template: '%s | holeauth docs',
  },
  description:
    'Documentation for holeauth — modular, edge-native authentication for TypeScript.',
  icons: {
    icon: '/favicon.ico',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'holeauth docs',
    title: 'holeauth docs',
    description:
      'Documentation for holeauth — modular, edge-native authentication for TypeScript.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'holeauth docs',
    description:
      'Documentation for holeauth — modular, edge-native authentication for TypeScript.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ defaultTheme: 'dark' }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
