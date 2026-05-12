'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { docsUrl } from '@/lib/docs-url';

export type Framework = 'app-router' | 'pages-router' | 'express' | 'hono';

const TABS: { id: Framework; label: string; badge?: string }[] = [
  { id: 'app-router',   label: 'Next.js', badge: 'App Router'   },
  { id: 'pages-router', label: 'Next.js', badge: 'Pages Router' },
  { id: 'express',      label: 'Express'                        },
  { id: 'hono',         label: 'Hono'                           },
];

interface Props {
  authTsHtml: string;
  routeHtml: Record<Framework, string>;
  routeFile: Record<Framework, string>;
}

export function QuickstartTabs({ authTsHtml, routeHtml, routeFile }: Props) {
  const [active, setActive] = useState<Framework>('app-router');

  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            quickstart
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            wire it up in <span className="gradient-text">two files.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-ink-dim md:text-[15px]">
            install the core, pick an adapter, drop in a catch-all route handler. plugins compose
            into the same auth instance — turn them on when you need them.
          </p>
        </div>

        {/* Code editor shell */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl">

          {/* Top chrome bar — traffic lights + framework tab switcher */}
          <div className="flex items-stretch border-b border-white/[0.08] bg-[#09090d]">
            {/* Traffic lights */}
            <div className="flex shrink-0 items-center gap-1.5 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>

            {/* Divider */}
            <span className="w-px self-stretch bg-white/[0.06]" />

            {/* Framework tabs — look like browser/IDE tabs */}
            <div className="flex overflow-x-auto">
              {TABS.map((t) => {
                const isActive = active === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className="relative flex shrink-0 items-center gap-1.5 border-r border-white/[0.06] px-5 py-3 text-[12.5px] transition-colors"
                    style={{ color: isActive ? '#ededed' : '#6e6e78' }}
                  >
                    {/* Active underline */}
                    {isActive && (
                      <span
                        className="absolute inset-x-0 bottom-0 h-[2px]"
                        style={{
                          background: 'linear-gradient(90deg, #a78bfa, #5eead4)',
                        }}
                      />
                    )}
                    <span className="font-medium">{t.label}</span>
                    {t.badge && (
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                        style={
                          isActive
                            ? { background: 'rgba(167,139,250,0.18)', color: '#c4b5fd' }
                            : { background: 'rgba(255,255,255,0.06)', color: '#6e6e78' }
                        }
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Two-column code pane */}
          <div className="grid divide-x divide-white/[0.06] md:grid-cols-2">
            {/* lib/auth.ts */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-[#0a0a0e]">
                <span className="h-2 w-2 rounded-sm bg-[#a78bfa]/40" />
                <span className="font-mono text-[11px] text-muted">lib/auth.ts</span>
              </div>
              <div
                className="flex-1 overflow-x-auto text-[12.5px] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:p-5"
                dangerouslySetInnerHTML={{ __html: authTsHtml }}
              />
            </div>

            {/* Route handler — switches with active tab */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-[#0a0a0e]">
                <span className="h-2 w-2 rounded-sm bg-[#5eead4]/40" />
                <span className="font-mono text-[11px] text-muted">{routeFile[active]}</span>
              </div>
              <div
                key={active}
                className="flex-1 overflow-x-auto text-[12.5px] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:p-5"
                dangerouslySetInnerHTML={{ __html: routeHtml[active] }}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href={docsUrl('/getting-started/nextjs-app-router')}
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-dim transition hover:text-ink"
          >
            see the full guide
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
