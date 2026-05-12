import Link from 'next/link';
import type { Metadata } from 'next';
import { docsUrl } from '@/lib/docs-url';

export const metadata: Metadata = {
  title: '404 — Page not found',
};

export default function NotFound() {
  return (
    <div
      className="landing-root"
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '0 24px',
        background: '#0a0a0b',
        color: '#ededed',
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        textAlign: 'center',
      }}
    >
      {/* Gradient orb */}
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 40,
          height: 40,
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, #c1ae7c 0%, #e16f7c 25%, #dd5e98 50%, #cc4bc2 75%, #6c3a5c 100%)',
          boxShadow:
            '0 0 40px rgba(204,75,194,0.35), 0 0 10px rgba(193,174,124,0.20)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#b8b8c0',
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 'clamp(24px, 5vw, 40px)',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
          }}
        >
          Page not found
        </h1>
        <p style={{ fontSize: 15, color: '#b8b8c0', maxWidth: 380 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 20px',
            borderRadius: 8,
            background:
              'white',
            color: 'black',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to home
        </Link>
        <a
          href={docsUrl('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '9px 20px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: '#ededed',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Documentation
        </a>
      </div>
    </div>
  );
}
