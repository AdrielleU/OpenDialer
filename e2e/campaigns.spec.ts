import { test, expect } from '@playwright/test';

test.describe('Campaign Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Campaigns' }).click();
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
  });

  test('creates a new campaign', async ({ page }) => {
    await page.click('button:has-text("New Campaign")');
    await page.fill('[placeholder*="Q2"]', 'E2E Test Campaign');
    await page.fill('[placeholder*="+1"]', '+15551234567');
    await page.click('button:has-text("Create Campaign")');
    await expect(page.getByText('E2E Test Campaign')).toBeVisible();
  });

  test('campaign form has IVR and call behavior sections', async ({ page }) => {
    await page.click('button:has-text("New Campaign")');
    await expect(page.getByText('Call Behavior')).toBeVisible();
    await expect(page.getByText('Drop if no operator available')).toBeVisible();
    await expect(page.getByText('IVR Navigation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Wait' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Press' })).toBeVisible();
  });

  test('IVR builder adds steps and shows sequence', async ({ page }) => {
    await page.click('button:has-text("New Campaign")');
    await page.getByRole('button', { name: 'Add Wait' }).click();
    await page.getByRole('button', { name: 'Add Press' }).click();
    await expect(page.getByText('Sequence:')).toBeVisible();
  });

  test('IVR greeting options appear after adding steps', async ({ page }) => {
    await page.click('button:has-text("New Campaign")');
    await page.getByRole('button', { name: 'Add Press' }).click();
    await expect(page.getByText('Greeting after IVR navigation')).toBeVisible();
    await expect(page.getByText('None — connect operator immediately')).toBeVisible();
    await expect(page.getByText('Play opener recording')).toBeVisible();
    await expect(page.getByText('Text-to-speech (dynamic per contact)')).toBeVisible();
  });

  test('TTS template field appears when TTS selected', async ({ page }) => {
    await page.click('button:has-text("New Campaign")');
    await page.getByRole('button', { name: 'Add Press' }).click();
    await page.click('text=Text-to-speech (dynamic per contact)');
    await expect(page.getByPlaceholder(/calling from ABC Insurance/)).toBeVisible();
  });
});
