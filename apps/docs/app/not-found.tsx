import type { Metadata } from 'next';
import { landingUrl } from '@/lib/landing-url';

export const metadata: Metadata = {
  title: '404 — Page not found',
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '0 24px',
        background: 'var(--color-fd-background, #0a0a0b)',
        color: 'var(--color-fd-foreground, #ededed)',
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
          width: 36,
          height: 36,
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, #c1ae7c 0%, #e16f7c 25%, #dd5e98 50%, #cc4bc2 75%, #6c3a5c 100%)',
          boxShadow:
            '0 0 32px rgba(204,75,194,0.30), 0 0 8px rgba(193,174,124,0.18)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-fd-muted-foreground, #b8b8c0)',
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 'clamp(22px, 4vw, 36px)',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-fd-muted-foreground, #b8b8c0)',
            maxWidth: 360,
          }}
        >
          This docs page doesn&apos;t exist yet or has been moved.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 18px',
            borderRadius: 8,
            background:
              'white',
            color: 'black',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Docs home
        </a>
        <a
          href={landingUrl('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 18px',
            borderRadius: 8,
            border: '1px solid var(--color-fd-border, rgba(255,255,255,0.1))',
            background: 'var(--color-fd-accent, rgba(255,255,255,0.04))',
            color: 'var(--color-fd-foreground, #ededed)',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          holeauth.dev
        </a>
      </div>
    </div>
  );
}
