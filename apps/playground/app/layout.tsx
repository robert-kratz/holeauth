import './globals.css';
import type { ReactNode } from 'react';
import { HoleauthProvider } from '@holeauth/react';

export const metadata = { title: 'holeauth — Playground' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <HoleauthProvider basePath="/api/auth">
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </HoleauthProvider>
      </body>
    </html>
  );
}
