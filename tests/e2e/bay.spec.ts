import { expect, test } from '@playwright/test';

test('2D is the default; the 3D bay renders, opens panels and is remembered', async ({ page }) => {
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await expect(page.locator('.avatar')).toBeVisible();
  await expect(page.locator('.bay-stage')).toHaveCount(0);

  await page.getByRole('button', { name: '3D view' }).click();
  const stage = page.locator('.bay-stage');
  await expect(stage.locator('canvas')).toBeVisible();
  await expect(page.locator('.avatar')).toHaveCount(0);
  // The render loop reports its frame rate once a second.
  await expect(stage).toHaveAttribute('data-fps', /^[1-9]\d*$/, { timeout: 10_000 });

  const objects = page.getByRole('group', { name: 'Bedside objects' });
  await objects.getByRole('button', { name: 'Crash trolley' }).click();
  await expect(page.getByRole('tab', { name: 'Treat' })).toHaveAttribute('aria-selected', 'true');
  await objects.getByRole('button', { name: 'Examine the patient' }).click();
  await expect(page.getByRole('tab', { name: 'Examine' })).toHaveAttribute('aria-selected', 'true');
  await objects.getByRole('button', { name: 'Talk to the patient' }).click();
  await expect(page.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.locator('.bay-stage')).toHaveCount(0);
  await expect(page.locator('.avatar')).toBeVisible();
});

test('clicking the patient in the 3D scene opens the Talk or Examine panel', async ({ page }) => {
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: '3D view' }).click();
  const stage = page.locator('.bay-stage');
  await expect(stage).toHaveAttribute('data-fps', /^[1-9]\d*$/, { timeout: 10_000 });
  // Tall enough that opening a panel never scrolls the page under the pointer.
  await page.setViewportSize({ width: 1280, height: 1400 });
  const box = await stage.boundingBox();
  if (!box) throw new Error('no stage');
  // The default camera is fixed, so the torso and head sit at known spots in the stage.
  await page.mouse.click(box.x + box.width * 0.46, box.y + box.height * 0.48);
  await expect(page.getByRole('tab', { name: 'Examine' })).toHaveAttribute('aria-selected', 'true');
  await page.mouse.click(box.x + box.width * 0.39, box.y + box.height * 0.34);
  await expect(page.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'true');
});

test('3D view fits a 375 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.locator('.bay-stage canvas')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
