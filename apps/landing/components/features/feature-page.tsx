import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import type { FeatureData, CodeStep } from '@/lib/features-data';
import {
  ADAPTER_META,
  FRAMEWORK_META,
  hasAdapterVariant,
  hasFrameworkVariant,
  packagesForFramework,
  packagesForVariant,
  stepsForFramework,
  type AdapterName,
  type Framework,
} from '@/lib/feature-frameworks';
import { docsUrl } from '@/lib/docs-url';
import { Navbar } from '../landing/navbar';
import { Footer } from '../landing/footer';
import { CodeStepper } from './code-stepper';
import { InstallTabs } from './install-tabs';
import { FrameworkSelector } from './framework-selector';
import { AdapterSelector } from './adapter-selector';
import { highlight, highlightInstallCommands } from './shiki';

const CATEGORY_LABEL: Record<string, string> = {
  core: 'core',
  plugin: 'plugin',
  adapter: 'adapter',
};

interface Props {
  feature: FeatureData;
  /** When set, render the framework-specific variant. */
  framework?: Framework;
  /** Storage adapter (drizzle = default). Only meaningful on framework subpages. */
  adapter?: AdapterName;
}

function isInstallStep(step: CodeStep): boolean {
  if (step.language !== 'bash') return false;
  if (step.code.includes('\n')) return false;
  return /^(pnpm add|npm install|bun add)\s+/.test(step.code.trim());
}

function packagesFromInstallCode(code: string): string[] {
  return code
    .replace(/^(pnpm add|npm install|bun add)\s+/, '')
    .trim()
    .split(/\s+/);
}

/**
 * Server component for `/features/[slug]`, `/features/[slug]/[framework]`,
 * and `/features/[slug]/[framework]/[adapter]`.
 *
 * - `framework` set → framework-specific install + usage step
 * - `adapter` set    → storage step swapped (drizzle vs headless)
 */
export async function FeaturePage({ feature, framework, adapter }: Props) {
  // Resolve framework + adapter-specific data when applicable.
  const supportsFrameworks = hasFrameworkVariant(feature.slug);
  const supportsAdapters = hasAdapterVariant(feature.slug);
  const effectiveAdapter: AdapterName = adapter ?? 'drizzle';

  const effectivePackages = framework
    ? supportsAdapters
      ? packagesForVariant(feature.packages, feature.slug, framework, effectiveAdapter)
      : packagesForFramework(feature.packages, framework)
    : feature.packages;

  const effectiveSteps = framework
    ? stepsForFramework(
        feature.steps,
        feature.packages,
        feature.slug,
        framework,
        effectiveAdapter,
      )
    : feature.steps;

  const heroInstallHtml = await highlightInstallCommands(effectivePackages);

  const stepRenders = await Promise.all(
    effectiveSteps.map(async (step) => {
      if (isInstallStep(step)) {
        const pkgs = packagesFromInstallCode(step.code);
        const installHtml = await highlightInstallCommands(pkgs);
        return { step, installHtml, installPackages: pkgs };
      }
      const codeHtml = await highlight(step.code, step.language);
      return { step, codeHtml };
    }),
  );

  const fwMeta = framework ? FRAMEWORK_META[framework] : null;
  const adapterMeta =
    framework && supportsAdapters ? ADAPTER_META[effectiveAdapter] : null;

  // Back href: from `[adapter]` page → framework page; from framework → overview;
  // from overview → landing features section.
  const backHref = adapter
    ? `/features/${feature.slug}/${framework}`
    : framework
    ? `/features/${feature.slug}`
    : '/#features';
  const backLabel = adapter
    ? `back to ${fwMeta?.label.toLowerCase() ?? 'framework'}`
    : framework
    ? `back to ${feature.title.toLowerCase()}`
    : 'back to features';

  return (
    <>
      <Navbar />

      <main className="relative">
        <div className="mx-auto max-w-4xl px-6 pt-32 pb-24">
          {/* Back button */}
          <Link
            href={backHref}
            className="group inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#0c0c10] px-4 py-2 text-[13px] text-ink-dim transition hover:border-white/20 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            {backLabel}
          </Link>

          {/* Hero */}
          <header className="mt-10 mb-14">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 font-mono text-[11px] text-muted">
                {CATEGORY_LABEL[feature.category]}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 font-mono text-[11px] text-[#a78bfa]">
                {feature.badge}
              </span>
              {fwMeta && (
                <span className="rounded-full border border-[#5eead4]/30 bg-[#5eead4]/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-[#5eead4]">
                  {fwMeta.short}
                </span>
              )}
              {adapterMeta && (
                <span className="rounded-full border border-[#a78bfa]/30 bg-[#a78bfa]/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-[#c4b5fd]">
                  {adapterMeta.short}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-medium leading-[1.08] tracking-tight text-ink md:text-6xl">
              {feature.title.toLowerCase()}
            </h1>

            <p className="mt-5 max-w-2xl text-pretty text-[16px] leading-relaxed text-ink-dim md:text-[17px]">
              {fwMeta && adapterMeta
                ? `${feature.tagline} — wired for ${fwMeta.label} with the ${adapterMeta.label.toLowerCase()} adapter.`
                : fwMeta
                ? `${feature.tagline} — wired for ${fwMeta.label}.`
                : feature.tagline}
            </p>

            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted">
              {feature.description}
            </p>
          </header>

          {/* Framework selector — only for features that have variants */}
          {supportsFrameworks && (
            <section className="mb-12" aria-labelledby="framework-heading">
              <h2 id="framework-heading" className="sr-only">
                framework
              </h2>
              <FrameworkSelector
                slug={feature.slug}
                active={framework ?? null}
              />
            </section>
          )}

          {/* Adapter selector — only when on a framework subpage AND the
              feature is persistence-backed (plugins). */}
          {framework && supportsAdapters && (
            <section className="mb-16" aria-labelledby="adapter-heading">
              <h2 id="adapter-heading" className="sr-only">
                adapter
              </h2>
              <AdapterSelector
                slug={feature.slug}
                framework={framework}
                active={effectiveAdapter}
              />
            </section>
          )}

          {/* Install */}
          <section className="mb-16" aria-labelledby="install-heading">
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                id="install-heading"
                className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]"
              >
                install
              </h2>
              <span className="font-mono text-[10.5px] text-muted">
                {effectivePackages.length} package
                {effectivePackages.length === 1 ? '' : 's'}
              </span>
            </div>
            <InstallTabs packages={effectivePackages} html={heroInstallHtml} />
          </section>

          {/* Highlights */}
          <section className="mb-20" aria-labelledby="highlights-heading">
            <h2
              id="highlights-heading"
              className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]"
            >
              what you get
            </h2>
            <ul className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.08] sm:grid-cols-2">
              {feature.highlights.map((h, i) => (
                <li
                  key={h}
                  className="flex items-center gap-3 bg-[rgba(12,12,16,0.92)] px-4 py-3.5 text-[13.5px] text-ink-dim"
                  style={{
                    borderRight:
                      i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                    borderBottom:
                      i < feature.highlights.length - 2
                        ? '1px solid rgba(255,255,255,0.06)'
                        : undefined,
                  }}
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-black/40">
                    <Check
                      className="h-3 w-3 text-[#5eead4]"
                      strokeWidth={2.5}
                    />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </section>

          {/* Walkthrough */}
          <section className="mb-20" aria-labelledby="steps-heading">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
              walkthrough
            </p>
            <h2
              id="steps-heading"
              className="mb-10 text-2xl font-medium tracking-tight text-ink md:text-3xl"
            >
              ship it in{' '}
              <span className="gradient-text">
                {effectiveSteps.length} steps.
              </span>
            </h2>
            <CodeStepper items={stepRenders} />
          </section>

          {/* Packages */}
          <section className="mb-20" aria-labelledby="packages-heading">
            <h2
              id="packages-heading"
              className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]"
            >
              packages
            </h2>
            <ul className="flex flex-wrap gap-2">
              {effectivePackages.map((pkg) => (
                <li key={pkg}>
                  <a
                    href={`https://www.npmjs.com/package/${pkg}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#0c0c10] px-3.5 py-1.5 font-mono text-[12px] text-ink-dim transition hover:border-white/20 hover:text-ink"
                  >
                    {pkg}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* Concepts — deep dive into config knobs, env vars, etc. */}
          {feature.concepts && feature.concepts.length > 0 && (
            <section className="mb-20" aria-labelledby="concepts-heading">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
                deep dive
              </p>
              <h2
                id="concepts-heading"
                className="mb-8 text-2xl font-medium tracking-tight text-ink md:text-3xl"
              >
                <span className="gradient-text">how it works.</span>
              </h2>

              <div className="space-y-4">
                {feature.concepts.map((section) => (
                  <article
                    key={section.heading}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c10]"
                  >
                    <header className="border-b border-white/[0.06] bg-[#09090d] px-5 py-3">
                      <p className="font-mono text-[12px] text-ink">
                        {section.heading.toLowerCase()}
                      </p>
                    </header>
                    <div className="px-5 py-5">
                      {section.intro && (
                        <p className="mb-4 text-[13.5px] leading-relaxed text-ink-dim">
                          {section.intro}
                        </p>
                      )}
                      <ul className="space-y-3">
                        {section.items.map((item) => (
                          <li
                            key={item.label}
                            className="flex flex-col gap-1 border-l-2 border-white/[0.08] pl-4"
                          >
                            <span
                              className={
                                item.mono
                                  ? 'inline-block w-fit rounded-md border border-white/[0.08] bg-[#09090d] px-2 py-0.5 font-mono text-[12px] text-[#c4b5fd]'
                                  : 'text-[13.5px] font-medium text-ink'
                              }
                            >
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-[13px] leading-relaxed text-ink-dim">
                                {item.description}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0c0c10] px-8 py-10 md:px-12">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
              next steps
            </p>
            <h3 className="mb-3 text-2xl font-medium tracking-tight text-ink">
              ready to dive deeper?
            </h3>
            <p className="mb-8 max-w-lg text-[14px] leading-relaxed text-ink-dim">
              the full documentation covers every option, advanced configuration, and
              real-world recipes. or jump straight into the starter.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={feature.docsHref.startsWith('/docs') ? docsUrl(feature.docsHref.replace(/^\/docs/, '') || '/') : feature.docsHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-ink transition hover:bg-white/[0.08]"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                full documentation
              </Link>
              <Link
                href={docsUrl('/getting-started')}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black transition hover:opacity-90"
              >
                get started
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
