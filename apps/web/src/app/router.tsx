import { createBrowserRouter } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { HomePage } from '@/pages/home-page';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
]);
