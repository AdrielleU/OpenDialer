import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navigates to all pages from sidebar', async ({ page }) => {
    await page.goto('/');
    const pages = ['Campaigns', 'Contacts', 'Recordings', 'Transcription', 'Analytics', 'Settings'];
    for (const p of pages) {
      await page.getByRole('link', { name: p }).click();
      await expect(page.getByRole('heading', { name: p, exact: true }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('admin sees Team link in sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
  });

  test('dialer page shows Ready to Dial state', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Ready to Dial')).toBeVisible();
  });

  test('sign out button exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sign Out')).toBeVisible();
  });
});
