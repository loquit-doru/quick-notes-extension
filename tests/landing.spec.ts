import { test, expect } from '@playwright/test';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/quick-notes/nompejhpnnehhnedkgklfgpdgcfhkfem';
const EDGE_STORE_URL =
  'https://microsoftedge.microsoft.com/addons/detail/quick-notes/bpflnjinelkgbnbbjjddggnahdjhmadn';
const CONTACT_MAILTO = 'mailto:quicknotes.extension@gmail.com';

test.describe('Quick Notes landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage loads with Quick Notes in title', async ({ page }) => {
    await expect(page).toHaveTitle(/Quick Notes/i);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Add to Chrome link points to Chrome Web Store', async ({ page }) => {
    const chrome = page.getByRole('link', { name: /Add to Chrome/i }).first();
    await expect(chrome).toHaveAttribute('href', CHROME_STORE_URL);
    await expect(chrome).toHaveAttribute('target', '_blank');
  });

  test('Add to Edge link points to Microsoft Edge Add-ons', async ({ page }) => {
    const edge = page.getByRole('link', { name: /Add to Edge/i }).first();
    await expect(edge).toHaveAttribute('href', EDGE_STORE_URL);
    await expect(edge).toHaveAttribute('target', '_blank');
  });

  test('Privacy Policy link is present and valid', async ({ page }) => {
    const privacy = page.getByRole('link', { name: /Privacy Policy/i }).first();
    await expect(privacy).toBeVisible();
    const href = await privacy.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('#');
    if (href!.startsWith('http')) {
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  test('Contact link uses mailto', async ({ page }) => {
    const contact = page.getByRole('link', { name: /^Contact$/i }).first();
    await expect(contact).toHaveAttribute('href', CONTACT_MAILTO);
  });

  test('layout is usable at 390px mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  });

  test('no Chrome-only positioning in body copy', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/chrome\s+only/i);
    expect(bodyText).not.toMatch(/only\s+for\s+google\s+chrome/i);
    expect(bodyText).toMatch(/Add to Chrome/);
    expect(bodyText).toMatch(/Edge/i);
  });
});
