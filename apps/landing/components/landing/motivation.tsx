import { ArrowRight, Cpu, Clock, Puzzle } from 'lucide-react';
import { docsUrl } from '@/lib/docs-url';

const POINTS = [
  {
    icon: Cpu,
    label: 'ai-native world',
    headline: 'auth ships on day one.',
    body: "in the ai era, scaffolding a project takes minutes. the authentication layer is still the part that takes days — fragmented packages, config that never quite fits, and security decisions you shouldn't have to make alone.",
  },
  {
    icon: Clock,
    label: 'time is the cost',
    headline: 'stop repeating yourself.',
    body: 'session management, token rotation, mfa flows, consent screens — every team rewrites the same primitives. holeauth solves them once, correctly, and lets you focus on what actually differentiates your product.',
  },
  {
    icon: Puzzle,
    label: 'zero lock-in',
    headline: 'headless, end to end.',
    body: 'no opinionated ui, no vendor cloud, no hidden schema. bring your own database, your own components, your own deployment. holeauth is just the auth layer — nothing more, nothing less.',
  },
];

export function Motivation() {
  return (
    <section className="relative px-6 py-32">
      {/* subtle ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[480px] w-[700px] rounded-full bg-violet-600/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        {/* heading */}
        <div className="mb-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            motivation
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            auth is <span className="gradient-text">always first.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-ink-dim md:text-[15px]">
            every project starts with the same question: how do we handle login? holeauth answers
            it — completely, headlessly, without getting in your way.
          </p>
        </div>

        {/* cards */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, label, headline, body }) => (
            <div
              key={label}
              className="group relative rounded-2xl border border-[var(--color-line)] bg-[#0c0c0f]/70 p-6 backdrop-blur-md transition hover:border-[var(--color-line-strong)]"
            >
              <div className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line-strong)] bg-black/40 transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(167,139,250,0.22)_inset,0_0_8px_rgba(167,139,250,0.12)]">
                <Icon className="h-4 w-4 text-[#c4b5fd] transition-colors duration-300 group-hover:text-[#e4d4ff]" />
              </div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
                {label}
              </p>
              <p className="mt-3 text-[15px] font-medium text-ink">{headline}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">{body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 flex justify-center">
          <a
            href={docsUrl('/skills')}
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[#0c0c0f]/70 px-5 py-2.5 text-[13px] text-ink-dim backdrop-blur-md transition hover:border-[var(--color-line-strong)] hover:text-ink"
          >
            use holeauth skills with your ai agent
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
