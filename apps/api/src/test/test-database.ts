/** Default matches docker-compose.yml; override with TEST_DATABASE_URL (e.g. in CI). */
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://carbon:carbon_local_dev_only@localhost:5434/carbon_accounting_test';

/** Test-only login for the restricted carbon_app role, created by the global setup. */
const TEST_APP_USER = 'carbon_app_test';
const TEST_APP_PASSWORD = 'carbon_app_test_only';

/**
 * Returns the test database URL (schema owner) and refuses anything whose database name
 * does not end in "_test", so the destructive test reset can never hit a dev or prod database.
 */
export function testDatabaseUrl(): string {
  const url = process.env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
  const name = testDatabaseName(url);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use "${name}" for tests: database name must end in "_test".`);
  }
  return url;
}

/**
 * The same test database, connected as the restricted app login — what the API uses in
 * tests, mirroring production. Override with TEST_APP_DATABASE_URL.
 */
export function testAppDatabaseUrl(): string {
  const override = process.env['TEST_APP_DATABASE_URL'];
  if (override) {
    if (testDatabaseName(override) !== testDatabaseName(testDatabaseUrl())) {
      throw new Error('TEST_APP_DATABASE_URL must point at the same _test database.');
    }
    return override;
  }
  const url = new URL(testDatabaseUrl());
  url.username = TEST_APP_USER;
  url.password = TEST_APP_PASSWORD;
  return url.toString();
}

export function testDatabaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}
