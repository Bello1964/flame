import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { pages } from '@/app/lazy-pages';

// Waits cover real asynchronous work (lazy chunks, mocked requests). On a loaded CI
// machine that can exceed Testing Library's 1 s default, which made tests flaky.
configure({ asyncUtilTimeout: 5000 });

// Transform and load the on-demand modules once per test file, before any test runs,
// so the first test that renders one does not pay the compilation cost inside a wait.
beforeAll(async () => {
  await Promise.all([
    import('@/features/auth/login-form'),
    ...Object.values(pages).map((load) => load()),
  ]);
});

afterEach(() => {
  cleanup();
});
