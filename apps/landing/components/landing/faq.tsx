import { ChevronDown } from 'lucide-react';

interface QA {
  q: string;
  a: string;
}

const QAS: QA[] = [
  {
    q: 'what is holeauth?',
    a: 'a modular, edge-native authentication framework for typescript. one auth core, four framework adapters (next.js app router, next.js pages router, express, hono), five drizzle adapters, and headless plugins for 2fa, passkeys, rbac, sso consumer, and a full oauth2 / oidc provider.',
  },
  {
    q: 'how is it different from better-auth or auth.js?',
    a: 'composable adapters and plugins instead of a monolith. you turn features on independently — there is no "feature flag" bloat, no opinionated ui, no hidden runtime. the oidc provider is first-class, not a side project.',
  },
  {
    q: 'can i self-host the identity provider?',
    a: 'yes. @holeauth/plugin-idp ships a complete oauth2 / oidc authorization server: discovery, jwks, authorization code + pkce, refresh rotation with family revoke, rfc 7009 revocation, rp-initiated logout, multi-tenant app registry, and consent management.',
  },
  {
    q: 'does it run on the edge?',
    a: 'app router and hono adapters are fully edge-compatible. @holeauth/core dynamically imports @node-rs/argon2 and falls back to web crypto when unavailable. pages router and express are node-only by design.',
  },
  {
    q: 'is it production-ready?',
    a: 'current release is v0.0.2-alpha.0 — the public api is stabilizing and breaking changes are still possible. early adopters welcome; check the compatibility matrix for per-feature support tiers before depending on it for a regulated workload.',
  },
  {
    q: 'what is the license?',
    a: 'mit. free to use in any project — commercial, private, or open-source. the copyright notice and author attribution must be kept in all copies or substantial portions of the software. questions? contact@holeauth.dev.',
  },
];

export function FAQ() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            frequently asked questions
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            the <span className="gradient-text">honest answers.</span>
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#0c0c0f]/70 backdrop-blur-xl">
          {QAS.map((item, i) => (
            <details
              key={item.q}
              className={
                i === 0
                  ? 'group'
                  : 'group border-t border-[var(--color-line)]'
              }
            >
              <summary className="flex items-center justify-between px-6 py-5 text-[14.5px] text-ink transition hover:bg-white/[0.02]">
                <span>{item.q}</span>
                <ChevronDown className="faq-chevron h-4 w-4 text-muted" />
              </summary>
              <div className="px-6 pb-6 text-[13.5px] leading-relaxed text-ink-dim">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
