import Link from 'next/link';
import { Database, Code2 } from 'lucide-react';
import {
  ADAPTER_SLUGS,
  ADAPTER_META,
  type AdapterName,
  type Framework,
} from '@/lib/feature-frameworks';

interface Props {
  slug: string;
  framework: Framework;
  /** Currently active adapter — `'drizzle'` is the default on the 2-segment URL. */
  active: AdapterName;
}

const ICONS: Record<AdapterName, React.ComponentType<{ className?: string }>> = {
  drizzle: Database,
  headless: Code2,
};

/**
 * Adapter switcher rendered on every plugin framework subpage.
 * The 2-segment URL (no `/[adapter]`) is treated as the drizzle default.
 */
export function AdapterSelector({ slug, framework, active }: Props) {
  return (
    <div>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
        choose your storage
      </p>
      <p className="mb-5 text-[13.5px] leading-relaxed text-ink-dim">
        drizzle is the canonical path — headless lets you back it with anything.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ADAPTER_SLUGS.map((a) => {
          const meta = ADAPTER_META[a];
          const Icon = ICONS[a];
          const isActive = active === a;
          // Drizzle = canonical, lives at the 2-segment URL.
          const href =
            a === 'drizzle'
              ? `/features/${slug}/${framework}`
              : `/features/${slug}/${framework}/${a}`;
          return (
            <Link
              key={a}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                isActive
                  ? 'border-[#a78bfa]/50 bg-[#0c0c10]'
                  : 'border-white/[0.08] bg-[#0c0c10] hover:border-white/20',
              ].join(' ')}
              style={
                isActive
                  ? { boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.20)' }
                  : undefined
              }
            >
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.10] bg-black/40">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  {meta.short}
                  {a === 'drizzle' && (
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[9px] tracking-[0.18em] text-[#a78bfa]">
                      default
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[13px] font-medium text-ink-dim transition group-hover:text-ink">
                  {meta.label}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {meta.tagline}
                </p>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
