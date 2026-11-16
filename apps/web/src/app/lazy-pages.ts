/**
 * Each page is its own chunk, downloaded the first time it is needed. The browser caches
 * the module after the first import(), so preloading and route loading share one request.
 */
export const pages = {
  facilities: () => import('@/pages/facilities-page'),
  facility: () => import('@/pages/facility-page'),
  asset: () => import('@/pages/asset-page'),
  flareSource: () => import('@/pages/flare-source-page'),
  system: () => import('@/pages/home-page'),
  activityRecord: () => import('@/pages/activity-record-page'),
  review: () => import('@/pages/review-page'),
  calculation: () => import('@/pages/calculation-page'),
  methodology: () => import('@/pages/methodology-page'),
  adminMethodology: () => import('@/pages/admin-methodology-page'),
  settings: () => import('@/pages/settings-page'),
};

export type PageName = keyof typeof pages;

/** Starts downloading a page's code without rendering it, e.g. on link hover. */
export function preloadPage(name: PageName): void {
  pages[name]().catch(() => {
    // A failed preload is harmless; navigating retries the import and reports errors.
  });
}

let preloadedAll = false;

/**
 * Downloads every page while the browser is idle (for example while the user types a
 * password), so later navigation does not wait for the network. Runs once per load.
 */
export function preloadAllPagesWhenIdle(): void {
  if (preloadedAll) return;
  preloadedAll = true;
  const run = () => {
    for (const name of Object.keys(pages) as PageName[]) preloadPage(name);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
}
