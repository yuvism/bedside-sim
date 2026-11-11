import { expect, test } from '@playwright/test';

test('learn from a video: the AMAX4 example analyses into a reviewable draft', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/teach');
  await page.getByRole('link', { name: /^Learn from a video/ }).click();
  await expect(page.getByRole('heading', { name: 'Learn from a video', level: 2 })).toBeVisible();
  await expect(page.getByText('Patient videos are confidential.')).toBeVisible();

  await page.getByRole('button', { name: 'Load the AMAX4 example' }).click();
  await expect(page.getByText(/AMAX4 Simulation MASTER/).first()).toBeVisible();
  await expect(page.getByLabel('Case')).toHaveValue('asthma-02');
  const rows = page.locator('table.anno-table tbody tr');
  expect(await rows.count()).toBeGreaterThan(10);

  await page.getByRole('button', { name: 'Analyse the video' }).click();
  await expect(
    page.getByRole('heading', { name: 'How well the case follows the video' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('table.fit-table tbody tr').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Add what’s missing/ })).toBeVisible();

  await page.getByRole('button', { name: 'Create a draft for review' }).click();
  const ok = page.getByRole('status').filter({ hasText: 'Draft created.' });
  await expect(ok).toBeVisible();
  await ok.getByRole('link', { name: 'test-run it' }).click();
  await expect(page.getByRole('heading', { name: "Can't ventilate (from video)" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start case' })).toBeVisible();
  await expect(
    page.getByText('Educational simulation. Simplified physiology. Not clinical guidance.'),
  ).toBeVisible();
});
