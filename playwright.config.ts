import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    storageState: 'e2e/.auth.json',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command:
      'DEFAULT_ADMIN_PASSWORD=testpass123 DEFAULT_ADMIN_EMAIL=admin@localhost REQUIRE_MFA=false DATABASE_URL=./data/e2e-test.db node packages/server/dist/index.js',
    port: 3000,
    timeout: 15_000,
    reuseExistingServer: false,
  },
  globalSetup: './e2e/global-setup.js',
});
