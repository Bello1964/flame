import { useEffect } from 'react';
import { preloadAllPagesWhenIdle } from '@/app/lazy-pages';
import { Hero } from '@/features/landing/hero';
import { LandingHeader } from '@/features/landing/landing-header';
import {
  ClosingCta,
  Integrity,
  LandingFooter,
  Pillars,
  Roadmap,
  Workflow,
} from '@/features/landing/sections';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The public home page. Everyone can read it; signed-in visitors also get a way into
 * their organisation and a sign-out option in the header.
 */
export function LandingPage() {
  // While a visitor reads, fetch the app's pages so signing in lands instantly.
  useEffect(preloadAllPagesWhenIdle, []);
  useEffect(() => {
    document.title = `${PRODUCT_NAME}: gas-flaring activity and emissions management`;
    return () => {
      document.title = PRODUCT_NAME;
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-mint focus:px-3 focus:py-2 focus:text-forest"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main">
        <Hero />
        <Pillars />
        <Workflow />
        <Integrity />
        <Roadmap />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
