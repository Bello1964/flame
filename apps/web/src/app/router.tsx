import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShellSkeleton } from '@/components/skeletons';
import { RequireAuth } from '@/features/auth/require-auth';
import { OrganisationLayout } from './layouts/organisation-layout';
import { RouteErrorPage } from './route-error-page';
import { pages } from './lazy-pages';
import { LandingPage } from '@/pages/landing-page';
import { LoginPage } from '@/pages/login-page';
import { OrganisationRedirectPage } from '@/pages/organisation-redirect-page';
import { NotFoundPage } from '@/pages/not-found-page';

/*
 * Sign-in, the session guard and the app shell are in the main bundle so the first
 * screen appears immediately. Each organisation page is a separate chunk (see
 * lazy-pages.ts), preloaded in the background once the user reaches sign-in or the shell.
 */
export const routes: RouteObject[] = [
  // Public: everyone can read the landing page, signed in or not.
  { path: '/', element: <LandingPage />, errorElement: <RouteErrorPage /> },
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      // Where signing in lands: the user's first organisation.
      { path: 'app', element: <OrganisationRedirectPage /> },
      {
        path: 'o/:organisationId',
        element: <OrganisationLayout />,
        // Shown on a first visit straight to an organisation page while its chunk loads.
        // The session guard above still renders, so the session check runs in parallel.
        hydrateFallbackElement: <AppShellSkeleton />,
        children: [
          { index: true, element: <Navigate to="facilities" replace /> },
          {
            path: 'facilities',
            lazy: async () => ({ Component: (await pages.facilities()).FacilitiesPage }),
          },
          {
            path: 'facilities/:facilityId',
            lazy: async () => ({ Component: (await pages.facility()).FacilityPage }),
          },
          {
            path: 'assets/:assetId',
            lazy: async () => ({ Component: (await pages.asset()).AssetPage }),
          },
          {
            path: 'flare-sources/:flareSourceId',
            lazy: async () => ({ Component: (await pages.flareSource()).FlareSourcePage }),
          },
          {
            path: 'activity-records/:recordId',
            lazy: async () => ({ Component: (await pages.activityRecord()).ActivityRecordPage }),
          },
          {
            path: 'settings',
            lazy: async () => ({ Component: (await pages.settings()).SettingsPage }),
          },
          {
            path: 'system',
            lazy: async () => ({ Component: (await pages.system()).HomePage }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
