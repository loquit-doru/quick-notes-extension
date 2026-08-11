import { defineConfig, devices } from '@playwright/test';
import { applyPlaywrightBrowserPath } from './scripts/lib/playwright-env.js';

applyPlaywrightBrowserPath();

/** Extension popup E2E — no landing dev server. */
export default defineConfig({
  testDir: 'tests/extension-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome']
  }
});
