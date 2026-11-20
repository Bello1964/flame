// Types only (erased at runtime): jest-dom's matcher types on Vitest's `expect`.
import type {} from '@testing-library/jest-dom/vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { afterEach, beforeAll, expect } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { pages } from '@/app/lazy-pages';

// jest-dom's matchers are registered on the `expect` this setup file receives, which is
// the one the tests use. The '@testing-library/jest-dom/vitest' entry imports `vitest`
// from node_modules itself, and on some runs that resolved to a different instance,
// failing most of the suite with "Invalid Chai property: toBeInTheDocument".
expect.extend(jestDomMatchers);

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
