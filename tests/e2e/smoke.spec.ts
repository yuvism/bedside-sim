import { expect, test } from '@playwright/test';

test('app loads and shows the safety disclaimer', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Bedside sim' })).toBeVisible();
  await expect(
    page.getByText('Educational simulation. Simplified physiology. Not clinical guidance.'),
  ).toBeVisible();
});
