import { useEffect } from 'react';
import { preloadAllPagesWhenIdle } from '@/app/lazy-pages';
import { Hero } from '@/features/landing/hero';
import { LandingHeader } from '@/features/landing/landing-header';
import {
  ClosingCta,
  Integrity,
  LandingFooter,
  PhotoBand,
  Problem,
  Questions,
  Reporting,
  Trace,
  Workflow,
} from '@/features/landing/sections';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The public homepage: FLAME's expressive register (dark Basalt, Instrument Serif,
 * restrained Oxide), alternating with Limestone editorial sections. Everyone can read it;
 * signed-in visitors also get a way into their organisation and a sign-out option.
 */
export function LandingPage() {
  // While a visitor reads, fetch the app's pages so signing in lands instantly.
  useEffect(preloadAllPagesWhenIdle, []);
  useEffect(() => {
    document.title = `${PRODUCT_NAME}: gas-flaring emissions accounting`;
    return () => {
      document.title = PRODUCT_NAME;
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-basalt">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-sm focus:bg-limestone focus:px-3 focus:py-2 focus:text-basalt"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main">
        <Hero />
        <Problem />
        <PhotoBand />
        <Workflow />
        <Trace />
        <Integrity />
        <Reporting />
        <Questions />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
