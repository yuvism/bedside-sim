import { expect, test } from '@playwright/test';

test('case list shows ten cases and filters by specialty, difficulty and text', async ({
  page,
}) => {
  await page.goto('./');
  const cards = page.locator('.case-card');
  await expect(cards).toHaveCount(10);
  await page.getByLabel('Specialty').selectOption('Trauma');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Difficulty').selectOption('advanced');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Specialty').selectOption('');
  await page.getByLabel('Difficulty').selectOption('');
  await page.getByLabel('Search').fill('ketoacidosis');
  await expect(cards).toHaveCount(0);
  await page.getByLabel('Search').fill('DKA');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('link').click();
  await expect(page).toHaveURL(/#\/case\/dka-01\?seed=\d+/);
  await expect(page.getByRole('heading', { name: 'Vomiting and breathing fast' })).toBeVisible();
});

test('cardiac arrest brings up the ALS panel with CPR and defibrillation', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('button', { name: '8×' }).click();
  // Untreated, this patient arrests at about 14 sim minutes (~105 s at 8×).
  await page.clock.runFor(130_000);
  const als = page.getByRole('region', { name: 'Cardiac arrest' });
  await expect(als).toBeVisible();
  await als.getByRole('button', { name: 'Start CPR' }).click();
  await expect(page.getByText('CPR started, 30:2.')).toBeVisible();
  await expect(als.getByRole('button', { name: 'Shock' })).toBeDisabled();
  await als.getByRole('button', { name: 'Attach pads' }).click();
  await expect(als.getByRole('button', { name: 'Shock' })).toBeEnabled();
  await als.getByRole('button', { name: 'Rhythm and pulse check' }).click();
  await expect(page.getByText(/^No pulse\./)).toBeVisible();
});
