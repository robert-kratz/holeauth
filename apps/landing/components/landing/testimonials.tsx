interface Principle {
  label: string;
  headline: string;
  body: string;
}

const PRINCIPLES: Principle[] = [
  {
    label: 'composition',
    headline: 'small packages, one session.',
    body: 'every feature is its own package. enable 2fa today, passkeys next week, an oidc server next month — without rewriting your auth core.',
  },
  {
    label: 'no lock-in',
    headline: 'headless by default.',
    body: 'every adapter is replaceable. drizzle, prisma, raw sql, your own — same interface. ship react components or wire your own ui.',
  },
  {
    label: 'edge-first',
    headline: 'web fetch, all the way down.',
    body: 'app router and hono run on cloudflare workers and vercel edge. node-only paths fall back gracefully — no surprises at deploy time.',
  },
  {
    label: 'typesafe',
    headline: 'types follow the data.',
    body: 'session shape, rbac permissions, oauth scopes, audit events — all inferred from your schema and config. no any, no ceremony.',
  },
  {
    label: 'spec-compliant',
    headline: 'oauth2 / oidc by the book.',
    body: 'authorization code + pkce, jwks rotation, rfc 7009 revocation, rp-initiated logout, consent. drop-in for any standards-aware client.',
  },
  {
    label: 'observable',
    headline: 'every auth event, captured.',
    body: 'a built-in event bus emits login, logout, mfa, password change, consent grant. pipe it into your audit log or siem of choice.',
  },
];

export function WhyHoleauth() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            why holeauth
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            principles, <span className="gradient-text">not magic.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-ink-dim md:text-[15px]">
            the design decisions that make holeauth different — every one of them is observable in
            the source.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div
              key={p.label}
              className="group relative rounded-2xl border border-[var(--color-line)] bg-[#0c0c0f]/70 p-6 backdrop-blur-md transition hover:border-[var(--color-line-strong)]"
            >
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
                {p.label}
              </p>
              <p className="mt-3 text-[15px] font-medium text-ink">{p.headline}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
