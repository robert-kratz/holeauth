'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { PkgManager } from './shiki';
import { buildInstallCommands } from './shiki';

interface Props {
  /** Package list — drives the copy fallback. */
  packages: string[];
  /** Pre-rendered Shiki HTML for each manager. */
  html: Record<PkgManager, string>;
}

const TABS: { id: PkgManager; label: string }[] = [
  { id: 'npm', label: 'npm' },
  { id: 'pnpm', label: 'pnpm' },
  { id: 'bun', label: 'bun' },
];

/**
 * Terminal/code block with npm / pnpm / bun tabs.
 *
 * Visual language is borrowed 1:1 from the Quickstart editor on the landing
 * page (#0c0c10 surface, #09090d chrome, traffic-light dots, purple→teal
 * underline). The bash command is pre-highlighted with Shiki server-side.
 */
export function InstallTabs({ packages, html }: Props) {
  const [active, setActive] = useState<PkgManager>('pnpm');
  const [copied, setCopied] = useState(false);

  const cmds = buildInstallCommands(packages);

  async function copy() {
    await navigator.clipboard.writeText(cmds[active]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl">
      {/* Chrome bar */}
      <div className="flex items-stretch border-b border-white/[0.08] bg-[#09090d]">
        {/* Traffic lights */}
        <div className="flex shrink-0 items-center gap-1.5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>

        <span className="w-px self-stretch bg-white/[0.06]" />

        {/* Manager tabs */}
        <div className="flex overflow-x-auto">
          {TABS.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className="relative flex shrink-0 items-center px-5 py-3 text-[12.5px] font-medium transition-colors"
                style={{ color: isActive ? '#ededed' : '#6e6e78' }}
              >
                {isActive && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-[2px]"
                    style={{
                      background: 'linear-gradient(90deg, #a78bfa, #5eead4)',
                    }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Copy on the right */}
        <div className="flex flex-1 items-center justify-end px-3">
          <button
            onClick={copy}
            aria-label="Copy install command"
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
      </div>

      {/* Code body — toggled via display so Shiki HTML stays intact. */}
      <div className="shiki-block">
        {(['npm', 'pnpm', 'bun'] as PkgManager[]).map((mgr) => (
          <div
            key={mgr}
            style={{ display: mgr === active ? 'block' : 'none' }}
            dangerouslySetInnerHTML={{ __html: html[mgr] }}
          />
        ))}
      </div>
    </div>
  );
}
