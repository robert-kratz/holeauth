'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PkgMgr = 'npm' | 'pnpm' | 'bun';
type FW = 'app-router' | 'pages-router' | 'express' | 'hono';
type Plugin = '2fa' | 'passkey' | 'rbac' | 'oidc-provider' | 'idp-consumer';

// ─── Data ─────────────────────────────────────────────────────────────────────

const CMD: Record<PkgMgr, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
};

const FW_LABEL: Record<FW, string> = {
  'app-router': 'app router',
  'pages-router': 'pages router',
  express: 'express',
  hono: 'hono',
};

const FW_PKG: Record<FW, string> = {
  'app-router': '@holeauth/nextjs-app-router',
  'pages-router': '@holeauth/nextjs-pages-router',
  express: '@holeauth/express',
  hono: '@holeauth/hono',
};

const PLUGINS: { id: Plugin; label: string; pkg: string }[] = [
  { id: 'passkey', label: 'passkeys', pkg: '@holeauth/plugin-passkey' },
  { id: '2fa', label: '2FA', pkg: '@holeauth/plugin-2fa' },
  { id: 'rbac', label: 'RBAC', pkg: '@holeauth/plugin-rbac' },
  { id: 'oidc-provider', label: 'OIDC server', pkg: '@holeauth/plugin-idp' },
  { id: 'idp-consumer', label: 'IDP client', pkg: '@holeauth/plugin-idp-consumer' },
];

// Deterministic fake resolve times (no randomness on render)
const PLUGIN_TIMES: Record<number, string> = { 1: '0.5s', 2: '0.8s', 3: '1.1s', 4: '1.3s', 5: '1.6s' };

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-all"
      style={
        active
          ? {
              background:
                'linear-gradient(100deg, rgba(167,139,250,0.25), rgba(94,234,212,0.15))',
              borderColor: 'rgba(167,139,250,0.5)',
              color: '#ededed',
            }
          : {
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.08)',
              color: '#6e6e78',
            }
      }
    >
      {label}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalSnippet() {
  const [mgr, setMgr] = useState<PkgMgr>('pnpm');
  const [fw, setFw] = useState<FW>('app-router');
  const [plugins, setPlugins] = useState<Set<Plugin>>(new Set(['passkey', '2fa']));

  function toggle(p: Plugin) {
    setPlugins((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  const cmd = CMD[mgr];
  const corePkgs = `@holeauth/core ${FW_PKG[fw]}`;
  const pluginPkgs = PLUGINS.filter((p) => plugins.has(p.id)).map((p) => p.pkg);
  const pluginTime = PLUGIN_TIMES[Math.min(pluginPkgs.length, 5)] ?? '1.6s';

  return (
    <div className="gradient-border overflow-hidden rounded-2xl bg-black/60 backdrop-blur-xl">
      {/* ── Title bar ── */}
      <div className="flex items-center gap-1.5 border-b border-[var(--color-line)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-mono text-[11px] text-muted">terminal</span>
      </div>

      {/* ── Selector controls ── */}
      <div className="space-y-2.5 border-b border-[var(--color-line)] px-4 py-3">
        {/* Package manager */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-[4.5rem] shrink-0 font-mono text-[10px] text-muted">pkg mgr</span>
          <div className="flex flex-wrap gap-1.5">
            {(['npm', 'pnpm', 'bun'] as PkgMgr[]).map((m) => (
              <Pill key={m} label={m} active={mgr === m} onClick={() => setMgr(m)} />
            ))}
          </div>
        </div>

        {/* Framework */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-[4.5rem] shrink-0 font-mono text-[10px] text-muted">framework</span>
          <div className="flex flex-wrap gap-1.5">
            {(['app-router', 'pages-router', 'express', 'hono'] as FW[]).map((f) => (
              <Pill
                key={f}
                label={FW_LABEL[f]}
                active={fw === f}
                onClick={() => setFw(f)}
              />
            ))}
          </div>
        </div>

        {/* Plugins — multi-select toggles */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-[4.5rem] shrink-0 font-mono text-[10px] text-muted">plugins</span>
          <div className="flex flex-wrap gap-1.5">
            {PLUGINS.map((p) => (
              <Pill
                key={p.id}
                label={p.label}
                active={plugins.has(p.id)}
                onClick={() => toggle(p.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Command output ── */}
      <pre className="overflow-x-auto px-4 py-4 text-left font-mono text-[12.5px] leading-relaxed text-ink-dim">
        <span className="text-[#5eead4]">$</span>{' '}
        <span className="text-ink-dim">{cmd} </span>
        <span className="text-[#c4b5fd]">{corePkgs}</span>
        {'\n'}
        <span className="text-muted">✓ resolved in 1.2s</span>
        {pluginPkgs.length > 0 && (
          <>
            {'\n\n'}
            <span className="text-[#5eead4]">$</span>{' '}
            <span className="text-ink-dim">{cmd} </span>
            <span className="text-[#c4b5fd]">{pluginPkgs.join(' ')}</span>
            {'\n'}
            <span className="text-muted">✓ resolved in {pluginTime}</span>
          </>
        )}
      </pre>
    </div>
  );
}
