import { defineConfig, devices } from '@playwright/test';
import { applyPlaywrightBrowserPath } from './scripts/lib/playwright-env.js';

applyPlaywrightBrowserPath();

/** Extension smoke tests only — no landing dev server. */
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/extension.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome']
  }
});
