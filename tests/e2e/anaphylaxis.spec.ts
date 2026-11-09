import { expect, test } from '@playwright/test';

/**
 * Plays anaphylaxis-01 end to end. Playwright's fake clock fast-forwards the
 * sim loop, so ~12 sim minutes take a few seconds.
 */
test('anaphylaxis-01 can be played to a stabilised outcome', async ({ page }) => {
  await page.clock.install();
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('button', { name: '8×' }).click();

  await page.getByRole('tab', { name: 'Examine' }).click();
  await page.getByRole('button', { name: /Airway$/ }).click();
  await expect(page.getByText(/^Airway: /)).toBeVisible();

  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: /^Call for help/ }).click();
  await page.getByRole('button', { name: /^High-flow oxygen/ }).click();
  await page.getByRole('button', { name: /^IV cannula/ }).click();
  await page.getByRole('button', { name: /^Adrenaline/ }).click();
  await page.getByRole('radio', { name: /^IM/ }).check();
  await page.getByRole('button', { name: /^Standard dose/ }).click();
  await page.getByRole('button', { name: 'Give adrenaline' }).click();
  await expect(page.getByText('Adrenaline 0.5 mg IM given (dose 1).')).toBeVisible();
  await page.getByRole('button', { name: /^Give 500 ml crystalloid/ }).click();

  // Five sim minutes at 8× is 37.5 real seconds.
  await page.clock.runFor(40_000);
  await page.getByRole('button', { name: 'Give adrenaline' }).click();
  await expect(page.getByText('Adrenaline 0.5 mg IM given (dose 2).')).toBeVisible();

  await page.clock.runFor(150_000);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Arjun is stable' })).toBeVisible();
});

test('bedside fits a 375 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await expect(page.getByRole('button', { name: 'Start case' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
