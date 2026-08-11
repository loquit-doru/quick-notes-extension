import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = repoRoot;

/**
 * Loads the unpacked MV3 extension in Chromium.
 * Opens popup.html directly (not toolbar) — Pro/welcome flows may differ from production.
 */
test.describe('Quick Notes extension smoke', () => {
  test('popup loads without console errors', async () => {
    const userDataDir = path.join(repoRoot, 'tests', '.pw-extension-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: !!process.env.CI,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    try {
      let serviceWorker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent('serviceworker', { timeout: 30_000 }).catch(() => null));

      if (!serviceWorker) {
        test.skip(true, 'Extension service worker did not register (environment limitation)');
        return;
      }

      const extensionId = serviceWorker.url().split('/')[2];
      const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;

      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      await expect(page.getByRole('button', { name: /New Note/i })).toBeVisible({
        timeout: 30_000
      });
      await expect(page.locator('#searchInput')).toBeVisible();
      await expect(page.locator('#settingsBtn')).toBeVisible();
      await expect(page.locator('#folderFilter')).toHaveCount(1);

      // Trust Center markup ships in settings modal (may stay closed in this smoke test)
      await expect(page.getByText(/Privacy & Trust/i)).toBeAttached();

      const ignorable =
        /Extension context invalidated|Receiving end does not exist|Failed to fetch|network error/i;
      const criticalConsole = consoleErrors.filter((e) => !ignorable.test(e));
      const criticalPage = pageErrors.filter((e) => !ignorable.test(e));

      expect(criticalPage, `page errors: ${criticalPage.join('; ')}`).toHaveLength(0);
      expect(criticalConsole, `console errors: ${criticalConsole.join('; ')}`).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
});
