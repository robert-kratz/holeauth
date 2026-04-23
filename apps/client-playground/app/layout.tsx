import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Holeauth client playground',
  description: 'OIDC RP demo for holeauth',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900">
        <div className="mx-auto max-w-3xl p-6 space-y-6">
          <header className="flex items-center justify-between border-b pb-4">
            <Link href="/" className="text-lg font-semibold">
              holeauth · client playground
            </Link>
            <span className="text-xs rounded bg-indigo-100 px-2 py-1 text-indigo-700">
              :3001
            </span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
