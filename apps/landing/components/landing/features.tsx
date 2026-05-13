'use client';

import { useRef, useState } from 'react';
import {
  Shield,
  Fingerprint,
  Users,
  Mail,
  LogIn,
  Building2,
  Code2,
  Cloud,
  Database,
  LayoutTemplate,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FadeSection } from './fade-section';
import { docsUrl } from '@/lib/docs-url';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Path inside docs (without /docs prefix). */
  docsPath: string;
}

const FEATURES: Feature[] = [
  {
    icon: Shield,
    title: '2fa / totp',
    description: 'enrollment, verification, recovery codes, qr generation, built-in rate limiting.',
    docsPath: '/packages/plugin-2fa',
  },
  {
    icon: Fingerprint,
    title: 'passkeys',
    description: 'webauthn / fido2 registration and login. credential management out of the box.',
    docsPath: '/packages/plugin-passkey',
  },
  {
    icon: Users,
    title: 'rbac + groups',
    description:
      'roles, groups, wildcard permissions, direct user overrides, ttl-cached lookups, yaml config.',
    docsPath: '/packages/plugin-rbac',
  },
  {
    icon: Mail,
    title: 'magic link / otp',
    description:
      'passwordless sign-in via one-click links or six-digit email codes. hash-only storage, rate-limited.',
    docsPath: '/packages/plugin-magic-link',
  },
  {
    icon: LogIn,
    title: 'sso consumer',
    description: 'google, github, discord, microsoft, plus generic oidc — one consumer plugin.',
    docsPath: '/sso/consumer',
  },
  {
    icon: Building2,
    title: 'oidc provider',
    description: 'spec-compliant authz code + pkce, jwks rotation, consent, rfc 7009 revocation.',
    docsPath: '/sso/provider',
  },
  {
    icon: Code2,
    title: 'trpc integration',
    description: 'auth-aware context, transparent refresh rotation, rbac-gated procedures.',
    docsPath: '/integrations/trpc',
  },
  {
    icon: Cloud,
    title: 'edge-ready',
    description:
      'app router and hono run on the edge. argon2 falls back to web crypto when unavailable.',
    docsPath: '/concepts/adapters',
  },
  {
    icon: Database,
    title: 'drizzle adapters',
    description:
      'postgres, mysql, sqlite — for core, 2fa, passkey, rbac, idp. headless if you prefer.',
    docsPath: '/packages/adapter-drizzle',
  },
  // {
  //   icon: LayoutTemplate,
  //   title: 'headless react ui',
  //   description:
  //     'signin, signup, password reset, 2fa verify, passkey setup, sso button — bring your own styles.',
  //   docsPath: '/packages/react-ui',
  // },
];

/** Individual feature card with mouse-position spotlight hover. */
function FeatureCard({ icon: Icon, title, description, docsPath }: Feature) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50 });
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={docsUrl(docsPath)}
      ref={cardRef}
      onMouseMove={(e) => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        setSpot({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative block border-r border-b border-white/[0.08] p-7 backdrop-blur-sm"
      style={{
        background: hovered
          ? `radial-gradient(circle at ${spot.x}% ${spot.y}%, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.04) 40%, rgba(12,12,16,0.92) 75%)`
          : 'rgba(12,12,16,0.90)',
        boxShadow: hovered
          ? `inset 0 0 0 1px rgba(167,139,250,${0.12 + (spot.x / 100) * 0.06})`
          : 'inset 0 0 0 1px rgba(255,255,255,0)',
        transition: 'background 0.25s ease, box-shadow 0.25s ease',
        textDecoration: 'none',
      }}
    >
      {/* Icon */}
      <div
        className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line-strong)] bg-black/40 transition-all duration-300"
        style={{
          boxShadow: hovered
            ? '0 0 24px rgba(167,139,250,0.22) inset, 0 0 8px rgba(167,139,250,0.12)'
            : '0 0 18px rgba(167,139,250,0.10) inset',
        }}
      >
        <Icon
          className="h-4 w-4 transition-colors duration-300"
          style={{ color: hovered ? '#e4d4ff' : '#c4b5fd' }}
        />
      </div>
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[12px] text-muted transition-colors duration-200 group-hover:text-ink-dim">
        learn more
        <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}

export function Features() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <FadeSection className="mb-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            the platform
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            one core. <span className="gradient-text">every primitive.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-ink-dim md:text-[15px]">
            holeauth ships as small, composable packages. enable only what you need; everything
            speaks to the same session and audit layer.
          </p>
        </FadeSection>

        <FadeSection delay={100}>
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.10] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </FadeSection>
      </div>
    </section>
  );
}
