import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TerminalSnippet } from './terminal-snippet';
import { TypedWord } from './typed-word';
import { docsUrl } from '@/lib/docs-url';

export function Hero() {
  return (
    <section className="relative flex min-h-screen w-full items-center justify-center px-6 pt-24">
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <div
          className="hero-risein mb-6 inline-flex flex-wrap items-center justify-center gap-2"
          style={{ animationDelay: '100ms' }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-black/40 px-3 py-1 text-[12px] text-ink-dim backdrop-blur-md">
            modular auth · edge-native · v0.0.2-alpha
          </span>
          {/* TypeScript badge */}
          <span className="inline-flex items-center gap-1 rounded-full border border-[#3178c6]/40 bg-[#3178c6]/10 px-2.5 py-1 text-[11px] font-medium text-[#60a5e8]">
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#3178c6]" aria-hidden>
              <path d="M0 12v12h24V0H0zm19.341-.956c.61.152 1.074.423 1.501.865.221.236.549.666.575.769.008.03-1.036.73-1.668 1.123-.023.015-.115-.084-.217-.236-.31-.45-.633-.644-1.128-.678-.728-.05-1.196.331-1.192.967a.88.88 0 0 0 .102.45c.16.331.458.53 1.39.933 1.719.74 2.454 1.227 2.911 1.92.51.773.625 2.008.278 2.926-.38.998-1.325 1.676-2.655 1.9-.411.073-1.386.062-1.828-.018-.964-.172-1.878-.648-2.442-1.273-.221-.243-.652-.88-.625-.925.011-.016.11-.077.22-.141.108-.061.511-.294.892-.515l.69-.4.145.214c.202.308.643.731.91.872.766.404 1.817.347 2.335-.118a.883.883 0 0 0 .313-.72c0-.278-.035-.4-.18-.61-.186-.266-.567-.49-1.649-.96-1.238-.533-1.771-.864-2.259-1.39a3.165 3.165 0 0 1-.659-1.2c-.091-.339-.114-1.189-.042-1.531.255-1.197 1.158-2.03 2.461-2.278.423-.08 1.406-.05 1.821.053z"/>
              <path d="M13.196 12.098v1.019h-3.23V22.1H8.577v-8.983H5.35v-1.002c0-.557.012-1.015.028-1.023.013-.006 1.764-.009 3.89-.007l3.867.006z"/>
            </svg>
            TypeScript
          </span>
          {/* npm badge */}
          <a
            href="https://www.npmjs.com/org/holeauth"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[#cb3837]/40 bg-[#cb3837]/10 px-2.5 py-1 text-[11px] font-medium text-[#f87171] transition hover:bg-[#cb3837]/20"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#cb3837]" aria-hidden>
              <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.331h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331z"/>
            </svg>
            npm
          </a>
        </div>

        <h1
          className="hero-risein text-5xl font-medium leading-[1.1] tracking-tight md:text-7xl"
          style={{ animationDelay: '280ms' }}
        >
          {/* Typed word on its own line so longer words (identification, permissions)
              never push the static phrase onto a 3rd line. */}
          <span className="block min-h-[1.1em]">
            <TypedWord />
          </span>
          <span className="text-ink">that disappears into the background.</span>
        </h1>

        <p
          className="hero-risein mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-dim md:text-base"
          style={{ animationDelay: '440ms' }}
        >
          one auth core. every framework. compose 2fa, passkeys, rbac, sso and a full oauth2/oidc
          server from headless adapters — no lock-in, no magic.
        </p>

        {/* npm install snippet */}
        <div
          className="hero-risein mx-auto mt-5 flex max-w-sm items-center justify-between rounded-xl border border-[var(--color-line)] bg-black/50 px-4 py-2.5 font-mono text-[12.5px] backdrop-blur-md"
          style={{ animationDelay: '510ms' }}
        >
          <span className="text-ink-dim">
            <span className="text-[#a78bfa]">pnpm</span>
            {' install '}
            <span className="text-[#5eead4]">@holeauth/core</span>
          </span>
          <a
            href="https://www.npmjs.com/org/holeauth"
            target="_blank"
            rel="noreferrer"
            className="ml-3 shrink-0 rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-[11px] text-ink-dim transition hover:border-white/20 hover:text-ink"
          >
            see on npm →
          </a>
        </div>

        <div
          className="hero-risein mt-9 mb-64 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: '580ms' }}
        >
          <Link
            href={docsUrl('/getting-started')}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-medium text-black transition hover:opacity-90"
            style={{
              background: '#ffffff',
              boxShadow: '0 0 20px rgba(255,255,255,0.10)',
            }}
          >
            get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={docsUrl('/packages')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-black/30 px-5 py-2.5 text-[13px] font-medium text-ink backdrop-blur-md transition hover:bg-white/5"
          >
            browse packages
          </Link>
        </div>

        <div
          className="hero-risein mx-auto mt-14 max-w-2xl"
          style={{ animationDelay: '720ms' }}
        >
            {/*  */}
          {/* <TerminalSnippet /> */}

        </div>
      </div>

      {/* Animated scroll indicator — z-20 so it sits above the z-10 content */}
      <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
        {/* Mouse / phone outline */}
        <div
          className="flex h-9 w-5 items-start justify-center rounded-full border border-white/25 pt-1.5"
          aria-hidden
        >
          <span className="scroll-dot h-1.5 w-1 rounded-full bg-white/60" />
        </div>
        {/* Chevron — double arrow pointing down */}
        <svg
          aria-hidden
          viewBox="0 0 16 10"
          fill="none"
          className="scroll-chevron h-2.5 w-4 text-white/40"
        >
          <path d="M1 1l7 7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </section>
  );
}
