import Link from 'next/link';
import { Code2 } from 'lucide-react';
import {
  FRAMEWORK_SLUGS,
  FRAMEWORK_META,
  type Framework,
} from '@/lib/feature-frameworks';

interface Props {
  /** Feature slug — used to build subpage hrefs. */
  slug: string;
  /** The framework currently being shown, or `null` for the overview page. */
  active: Framework | null;
}

/**
 * Framework picker. On the overview page it links into the framework-specific
 * subpages; on a subpage it highlights the active framework and links back
 * to the overview as the first option.
 */
export function FrameworkSelector({ slug, active }: Props) {
  return (
    <div>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
        pick your stack
      </p>
      <p className="mb-5 text-[13.5px] leading-relaxed text-ink-dim">
        the boilerplate below adapts to the framework you ship on.
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* Overview tile */}
        <Link
          href={`/features/${slug}`}
          aria-current={active === null ? 'page' : undefined}
          className={[
            'group rounded-xl border px-4 py-3 transition-colors',
            active === null
              ? 'border-[#a78bfa]/50 bg-[#0c0c10]'
              : 'border-white/[0.08] bg-[#0c0c10] hover:border-white/20',
          ].join(' ')}
          style={
            active === null
              ? { boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.20)' }
              : undefined
          }
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            overview
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink-dim transition group-hover:text-ink">
            framework-agnostic
          </p>
        </Link>

        {FRAMEWORK_SLUGS.map((fw) => {
          const meta = FRAMEWORK_META[fw];
          const isActive = active === fw;
          return (
            <Link
              key={fw}
              href={`/features/${slug}/${fw}`}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'group rounded-xl border px-4 py-3 transition-colors',
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
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                <Code2 className="h-3 w-3" />
                {meta.short}
              </p>
              <p className="mt-1 text-[13px] font-medium text-ink-dim transition group-hover:text-ink">
                {meta.label}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
