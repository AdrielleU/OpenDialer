import { test, expect } from '@playwright/test';

test.describe('Transcription Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Transcription' }).click();
    await expect(page.getByRole('heading', { name: 'Transcription' })).toBeVisible();
  });

  test('shows transcription approach cards', async ({ page }) => {
    await expect(page.getByText('Telnyx Built-in')).toBeVisible();
    await expect(page.getByText('Bring Your Own STT')).toBeVisible();
  });

  test('BYO STT card shows provider options', async ({ page }) => {
    await expect(page.getByText(/Self-hosted Whisper/)).toBeVisible();
  });

  test('shows campaign settings and transcript history sections', async ({ page }) => {
    await expect(page.getByText('Campaign Settings')).toBeVisible();
    await expect(page.getByText('Transcript History')).toBeVisible();
  });
});
