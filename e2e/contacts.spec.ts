import { test, expect } from '@playwright/test';

test.describe('Contacts Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Contacts' }).click();
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  });

  test('shows campaign selector', async ({ page }) => {
    await expect(page.locator('select')).toBeVisible();
  });

  test('contact table has IVR column header', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'IVR' })).toBeVisible();
  });
});
