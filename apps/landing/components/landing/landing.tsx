import { Navbar } from './navbar';
import { Hero } from './hero';
import { Features } from './features';
import { Motivation } from './motivation';
import { CompatMatrix } from './compat-matrix';
import { Quickstart } from './quickstart';
import { WhyHoleauth } from './testimonials';
import { FAQ } from './faq';
import { Footer } from './footer';
import { BlackHoleSceneLazy } from './three/black-hole-scene-lazy';
import { FadeSection } from './fade-section';

export function Landing() {
  return (
    <>
      <BlackHoleSceneLazy />
      <div className="relative z-10">
        <Navbar />
        <main>
          {/* Hero has its own staggered hero-risein animations — no FadeSection wrapper */}
          <Hero />
          {/* Below-fold sections fade in on scroll via IntersectionObserver */}
          <FadeSection>
            <Features />
          </FadeSection>
          <FadeSection delay={60}>
            <Motivation />
          </FadeSection>
          <FadeSection delay={60}>
            <CompatMatrix />
          </FadeSection>
          <FadeSection delay={60}>
            <Quickstart />
          </FadeSection>
          <FadeSection delay={60}>
            <WhyHoleauth />
          </FadeSection>
          <FadeSection delay={60}>
            <FAQ />
          </FadeSection>
        </main>
        <FadeSection delay={80}>
          <Footer />
        </FadeSection>
      </div>
    </>
  );
}
