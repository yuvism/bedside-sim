import { expect, test } from '@playwright/test';

/**
 * Plays anaphylaxis-01 end to end. Playwright's fake clock fast-forwards the
 * sim loop, so ~12 sim minutes take a few seconds.
 */
test('anaphylaxis-01 can be played to a stabilised outcome', async ({ page }) => {
  test.setTimeout(120_000);
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
  // The nurse reads it back, then draws it up (30–60 sim seconds).
  await expect(page.getByText(/Nurse: “Adrenaline 0.5 mg IM. Drawing it up now.”/)).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(page.getByText('Adrenaline 0.5 mg IM given (dose 1).')).toBeVisible();
  await page.getByRole('button', { name: /^Give 500 ml crystalloid/ }).click();

  // Five sim minutes at 8× is 37.5 real seconds.
  await page.clock.runFor(40_000);
  await page.getByRole('button', { name: 'Give adrenaline' }).click();
  await page.clock.runFor(10_000);
  await expect(page.getByText('Adrenaline 0.5 mg IM given (dose 2).')).toBeVisible();

  await page.clock.runFor(150_000);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Arjun is stable' })).toBeVisible();

  // Debrief: score, checklist, chart with one marker per treatment, teaching, export.
  await expect(dialog.getByLabel(/^Score \d+ out of 100$/)).toBeVisible();
  await expect(dialog.getByText('Patient stabilised')).toBeVisible();
  await expect(dialog.locator('.vc-panel')).toHaveCount(4);
  const markers = dialog.locator('ol.markers li');
  await expect(markers).toHaveCount(6);
  await expect(markers.first()).toContainText('Called for help');
  await expect(dialog.getByRole('button', { name: 'Download JSON' })).toBeVisible();

  // Replay from minute 2 resumes paused, with the earlier log kept.
  await dialog.getByLabel('Replay from minute').selectOption({ label: '02:00' });
  await dialog.getByRole('button', { name: 'Replay from 02:00' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.getByText('Replaying from minute 2.')).toBeVisible();
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
