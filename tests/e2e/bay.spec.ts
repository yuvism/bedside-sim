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
  // The handover covers the bedside until the case starts.
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.locator('.bay-stage')).toHaveCount(0);
  await expect(page.locator('.avatar')).toBeVisible();
});

test('clicking the patient in the 3D scene opens the Talk or Examine panel', async ({ page }) => {
  // Software WebGL in CI is slow, and each hover is a ray cast and a frame.
  test.setTimeout(90_000);
  // A fixed window: the camera is fixed too, so the patient sits at known spots in the stage.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: '3D view' }).click();
  const stage = page.locator('.bay-stage');
  await expect(stage).toHaveAttribute('data-fps', /^[1-9]\d*$/, { timeout: 20_000 });
  const box = await stage.boundingBox();
  if (!box) throw new Error('no stage');
  // Aim at the measured spot, then check a few points around it by hovering:
  // the scene names whatever is under the pointer.
  const aim = async (label: string, fx: number, fy: number) => {
    for (const [dx, dy] of [
      [0, 0],
      [0.02, 0],
      [-0.02, 0],
      [0, 0.03],
      [0, -0.03],
    ] as const) {
      const px = box.x + box.width * (fx + dx);
      const py = box.y + box.height * (fy + dy);
      await page.mouse.move(px, py);
      const tip = page.locator('.bay-tip');
      if ((await tip.count()) && (await tip.innerText()) === label) {
        await page.mouse.click(px, py);
        return;
      }
    }
    throw new Error(`${label} not found in the 3D scene`);
  };
  await aim('Examine the patient', 0.56, 0.56);
  await expect(page.getByRole('tab', { name: 'Examine' })).toHaveAttribute('aria-selected', 'true');
  await aim('Talk to the patient', 0.41, 0.345);
  await expect(page.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'true');
});

test('3D view fits a 375 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.locator('.bay-stage canvas')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
