'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CodeStep } from '@/lib/features-data';
import type { PkgManager } from './shiki';
import { InstallTabs } from './install-tabs';

interface StepRender {
  step: CodeStep;
  /** Pre-rendered Shiki HTML for non-install steps. */
  codeHtml?: string;
  /** Pre-rendered install tabs (npm/pnpm/bun). */
  installHtml?: Record<PkgManager, string>;
  /** Packages for the install step — drives copy fallback. */
  installPackages?: string[];
}

interface Props {
  items: StepRender[];
}

const LANG_LABEL: Record<string, string> = {
  bash: 'shell',
  typescript: 'ts',
  yaml: 'yaml',
};

/**
 * Vertical timeline. Cards match the landing-page Quickstart editor exactly.
 */
export function CodeStepper({ items }: Props) {
  return (
    <ol className="relative space-y-0">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const s = item.step;
        return (
          <li key={s.step} className="flex gap-5">
            {/* Timeline rail */}
            <div className="flex flex-col items-center">
              <div className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-[#0c0c10] font-mono text-[11px] text-ink-dim">
                {s.step}
              </div>
              {!isLast && (
                <div className="mt-1 w-px flex-1 bg-white/[0.08]" />
              )}
            </div>

            {/* Content */}
            <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-12'}`}>
              <p className="mb-1.5 text-[15px] font-medium text-ink">{s.title}</p>
              <p className="mb-5 max-w-2xl text-[13.5px] leading-relaxed text-ink-dim">
                {s.description}
              </p>

              {item.installHtml && item.installPackages ? (
                <InstallTabs
                  packages={item.installPackages}
                  html={item.installHtml}
                />
              ) : (
                <ShikiCard
                  filename={s.filename}
                  language={s.language}
                  rawCode={s.code}
                  html={item.codeHtml ?? ''}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Plain code card ─────────────────────────────────────────────────────────

function ShikiCard({
  filename,
  language,
  rawCode,
  html,
}: {
  filename?: string;
  language: string;
  rawCode: string;
  html: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl">
      {/* Header strip — matches Quickstart `bg-[#0a0a0e]` */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0a0a0e] px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-sm bg-[#a78bfa]/40" />
          {filename ? (
            <span className="font-mono text-[11px] text-muted">{filename}</span>
          ) : (
            <span className="font-mono text-[11px] text-muted">
              {LANG_LABEL[language] ?? language}
            </span>
          )}
        </div>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] text-ink-dim transition hover:border-white/20 hover:bg-white/[0.08] hover:text-ink"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[#5eead4]" strokeWidth={2.5} />
              copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              copy
            </>
          )}
        </button>
      </div>

      <div className="shiki-block" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
