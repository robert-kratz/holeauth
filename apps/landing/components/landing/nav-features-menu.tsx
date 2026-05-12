'use client';

import { useEffect, useRef, useState } from 'react';
import { docsUrl } from '@/lib/docs-url';
import {
  Shield,
  Fingerprint,
  Users,
  LogIn,
  Building2,
  Code2,
  Database,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';
import { FEATURES_BY_CATEGORY, type FeatureData } from '@/lib/features-data';
import Link from 'next/link';

/** Maps a feature's docsHref (legacy '/docs/...' or '/...') to an absolute docs subdomain URL. */
function featureDocsUrl(feature: FeatureData): string {
  const path = feature.docsHref.replace(/^\/docs/, '') || '/';
  return docsUrl(path);
}

const CATEGORY_META = {
  core: { label: 'core', hint: 'foundation' },
  plugin: { label: 'plugins', hint: 'feature extensions' },
  adapter: { label: 'adapters', hint: 'database connectors' },
} as const;

const ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  Shield,
  Fingerprint,
  Users,
  LogIn,
  Building2,
  Code2,
  Database,
};

/**
 * Features popover for the marketing header.
 *
 * Visual style: solid #0c0c10 surface with #09090d header strip, matching the
 * Quickstart editor and feature cards. Wider than the previous version, with
 * a responsive collapse so it never overflows on tablets.
 */
export function NavFeaturesMenu() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FeatureData | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setOpen(true);
  }
  function handleLeave() {
    leaveTimer.current = setTimeout(() => setOpen(false), 140);
  }

  const categories = (['core', 'adapter', 'plugin'] as const).filter(
    (c) => FEATURES_BY_CATEGORY[c].length > 0,
  );

  const previewFeature: FeatureData | null =
    preview ?? (categories[0] != null ? FEATURES_BY_CATEGORY[categories[0]]?.[0] : undefined) ?? null;
  const PreviewIcon = previewFeature ? ICON_MAP[previewFeature.iconName] : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Trigger */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-[13px] text-ink-dim transition hover:bg-white/5 hover:text-ink"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        features
        <ChevronDown
          className="h-3 w-3 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Hover bridge */}
      {open && (
        <div
          aria-hidden
          className="absolute left-1/2 top-full h-3 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2"
        />
      )}

      {/* Panel */}
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-3 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0c0c10] shadow-2xl"
        >
          {/* Header strip — same chrome as the Quickstart editor */}
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#09090d] px-5 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
              features
            </p>
            <span className="font-mono text-[10.5px] text-muted">
              modular · headless · edge-native
            </span>
          </div>

          {/* Body — collapses to single column under md */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px]">
            {/* Categories */}
            <div className="grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
              {categories.map((cat) => {
                const meta = CATEGORY_META[cat];
                return (
                  <div key={cat} className="p-4">
                    <div className="mb-3 px-2">
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
                        {meta.label}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted/70">
                        {meta.hint}
                      </p>
                    </div>

                    <ul className="space-y-0.5">
                      {FEATURES_BY_CATEGORY[cat].map((feature) => {
                        const Icon = ICON_MAP[feature.iconName];
                        const isActive = previewFeature?.slug === feature.slug;
                        return (
                          <li key={feature.slug}>
                            <a
                              href={featureDocsUrl(feature)}
                              onClick={() => setOpen(false)}
                              onMouseEnter={() => setPreview(feature)}
                              onFocus={() => setPreview(feature)}
                              role="menuitem"
                              className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                              style={
                                isActive
                                  ? { background: 'rgba(167,139,250,0.08)' }
                                  : undefined
                              }
                            >
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.10] bg-black/40">
                                {Icon && (
                                  <Icon
                                    className="h-3.5 w-3.5"
                                    style={{ color: '#c4b5fd' }}
                                  />
                                )}
                              </span>
                              <span className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-ink-dim transition group-hover:text-ink">
                                  {feature.title}
                                </p>
                                <p className="truncate font-mono text-[10.5px] text-muted">
                                  {feature.badge}
                                </p>
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Preview pane — hidden on mobile to keep popover compact */}
            {previewFeature && (
              <div className="hidden border-l border-white/[0.06] bg-[#0a0a0e] p-5 md:block">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.10] bg-black/40">
                    {PreviewIcon && (
                      <PreviewIcon
                        className="h-4 w-4"
                        style={{ color: '#c4b5fd' }}
                      />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {previewFeature.title}
                    </p>
                    <p className="truncate font-mono text-[10.5px] text-muted">
                      {previewFeature.badge}
                    </p>
                  </div>
                </div>

                <p className="mb-4 text-[12.5px] leading-relaxed text-ink-dim">
                  {previewFeature.tagline}
                </p>

                <div className="mb-4 overflow-hidden rounded-lg border border-white/[0.08] bg-[#09090d] px-3 py-2 font-mono text-[11px] text-ink-dim">
                  <span className="text-[#5eead4]">$</span>{' '}
                  <span className="break-all">{previewFeature.installCmd}</span>
                </div>

                <a
                  href={featureDocsUrl(previewFeature)}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-[12px] text-ink-dim transition hover:text-ink"
                >
                  read the docs
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.06] bg-[#09090d] px-5 py-2.5">
            <Link
              href={docsUrl('/packages')}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted transition hover:text-ink-dim"
            >
              browse all packages in the docs
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
