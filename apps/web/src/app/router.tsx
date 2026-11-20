import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShellSkeleton } from '@/components/skeletons';
import { RequireAuth } from '@/features/auth/require-auth';
import { AdminLayout } from './layouts/admin-layout';
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
  // Public: the calculation methodology, every published edition.
  {
    path: '/methodology',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.methodology()).MethodologyPage }),
  },
  {
    path: '/methodology/editions/:editionId',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.methodology()).MethodologyPage }),
  },
  // Public: an invitation link, signed in or not (the page adapts to either).
  {
    path: '/invite/:token',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.invitation()).InvitationPage }),
  },
  // Public: the API reference, rendered from the API's own OpenAPI description.
  {
    path: '/docs',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.apiDocs()).ApiDocsPage }),
  },
  // Public: password reset (ask for a link, then use it). The token goes in the request
  // body, never in an API URL.
  {
    path: '/forgot-password',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.forgotPassword()).ForgotPasswordPage }),
  },
  {
    path: '/reset-password/:token',
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await pages.resetPassword()).ResetPasswordPage }),
  },
  // Development builds only: emails the API queued, with their links. Vite removes this
  // route (and its chunk) from production builds.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/mailbox',
          errorElement: <RouteErrorPage />,
          lazy: async () => ({
            Component: (await import('@/pages/dev-mailbox-page')).DevMailboxPage,
          }),
        },
      ]
    : []),
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      // Where signing in lands: the user's first organisation.
      { path: 'app', element: <OrganisationRedirectPage /> },
      // Platform administration: the methodology registry (no organisation data), inside
      // the app shell so administrators can always navigate on.
      {
        element: <AdminLayout />,
        hydrateFallbackElement: <AppShellSkeleton />,
        children: [
          {
            path: 'admin/methodology',
            lazy: async () => ({
              Component: (await pages.adminMethodology()).AdminMethodologyPage,
            }),
          },
          {
            path: 'admin/methodology/:editionId',
            lazy: async () => ({
              Component: (await pages.adminMethodology()).AdminMethodologyPage,
            }),
          },
          {
            path: 'admin/organisations',
            lazy: async () => ({
              Component: (await pages.adminOrganisations()).AdminOrganisationsPage,
            }),
          },
          // The signed-in person's own name and password, outside any organisation.
          {
            path: 'account',
            lazy: async () => ({ Component: (await pages.account()).AccountPage }),
          },
          {
            path: 'admin/platform-admins',
            lazy: async () => ({
              Component: (await pages.adminPlatformAdmins()).AdminPlatformAdminsPage,
            }),
          },
        ],
      },
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
            path: 'methodology',
            lazy: async () => ({ Component: (await pages.methodology()).MethodologyPage }),
          },
          {
            path: 'methodology/editions/:editionId',
            lazy: async () => ({ Component: (await pages.methodology()).MethodologyPage }),
          },
          {
            path: 'calculations/:calculationId',
            lazy: async () => ({ Component: (await pages.calculation()).CalculationPage }),
          },
          {
            path: 'reports',
            lazy: async () => ({ Component: (await pages.reports()).ReportsPage }),
          },
          {
            path: 'reports/print',
            lazy: async () => ({ Component: (await pages.reportPrint()).ReportPrintPage }),
          },
          {
            path: 'review',
            lazy: async () => ({ Component: (await pages.review()).ReviewPage }),
          },
          {
            path: 'members',
            lazy: async () => ({ Component: (await pages.members()).MembersPage }),
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
