import { expect, test } from '@playwright/test';

test('case list shows eleven cases and filters by specialty, difficulty and text', async ({
  page,
}) => {
  await page.goto('./');
  const cards = page.locator('.case-card');
  await expect(cards).toHaveCount(11);
  await page.getByLabel('Specialty').selectOption('Trauma');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Difficulty').selectOption('advanced');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Specialty').selectOption('');
  await page.getByLabel('Difficulty').selectOption('');
  await page.getByLabel('Search', { exact: true }).fill('ketoacidosis');
  await expect(cards).toHaveCount(0);
  await page.getByLabel('Search', { exact: true }).fill('DKA');
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
  await page.clock.runFor(5_000);
  await expect(als.getByRole('button', { name: 'Shock' })).toBeEnabled();
  await als.getByRole('button', { name: 'Rhythm and pulse check' }).click();
  await expect(page.getByText(/^No pulse\./)).toBeVisible();
});

test('the nurse queries an IV drug with no access and offers a cannula first', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: /^Chlorphenamine/ }).click();
  await page.getByRole('radio', { name: /^IV/ }).check();
  await page.getByRole('button', { name: 'Give chlorphenamine' }).click();
  const nurse = page.getByRole('region', { name: 'Nurse' });
  await expect(nurse.getByText(/no IV access yet/)).toBeVisible();
  await nurse.getByRole('button', { name: 'Yes, cannula first' }).click();
  await expect(
    nurse.getByRole('list', { name: 'Tasks in progress' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page.clock.runFor(60_000);
  await expect(page.getByText('IV cannula inserted, bloods sent.')).toBeVisible();
  await expect(page.getByText('Chlorphenamine 10 mg IV given (dose 1).')).toBeVisible();
});

test('exam mode is chosen on the brief and shows the badge', async ({ page }) => {
  await page.goto('./#/case/asthma-01?seed=3');
  await page.getByRole('radio', { name: /^Exam/ }).check();
  await page.getByRole('button', { name: 'Start case' }).click();
  await expect(page.locator('.mode-badge')).toHaveText('Exam');
});

test('free-text questions work offline and the settings warn about the key', async ({ page }) => {
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  const box = page.getByLabel('Ask the patient anything');
  await box.fill('Are you allergic to anything?');
  await box.press('Enter');
  const log = page.locator('ol.log');
  await expect(log.getByText('You: Are you allergic to anything?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Any allergies?' })).toHaveClass(/is-done/);
  await box.fill('Who won the football?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(log.getByText(/don't know/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const dlg = page.getByRole('dialog', { name: 'Settings' });
  await expect(dlg.getByText('Your key stays in this browser.')).toBeVisible();
  await expect(dlg.getByLabel('Model')).toHaveValue('claude-opus-5-5');
  await expect(dlg.getByLabel('Anthropic API key')).toHaveAttribute('type', 'password');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toBeHidden();
});
