import { defineConfig, devices } from '@playwright/test';
import { applyPlaywrightBrowserPath } from './scripts/lib/playwright-env.js';

applyPlaywrightBrowserPath();

/**
 * Playwright is used for:
 * - Landing page rendered checks (store links, 390px layout, title)
 * - Optional Chromium extension smoke (loads unpacked MV3)
 *
 * Install: npm install && npx playwright install chromium
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'landing',
      testMatch: '**/landing.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3456'
      }
    }
  ],
  webServer: {
    command: 'npm run build && npm run start -- -p 3456',
    cwd: './landing',
    url: 'http://127.0.0.1:3456',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
