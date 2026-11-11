import { expect, test } from '@playwright/test';

test('the welcome screen offers learning by topic or an unknown patient', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'How do you want to practise?' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: /Learn by topic/ }).click();
  await expect(page).toHaveURL(/#\/topics$/);
  await expect(page.getByRole('heading', { name: 'Choose a condition to practise' })).toBeVisible();
  await expect(page.locator('.case-card')).toHaveCount(11);
  await expect(page.getByRole('link', { name: 'Anaphylaxis', exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Unknown patient' }).click();
  await expect(page.getByRole('heading', { name: 'Patients waiting to be seen' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Unknown patient' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('an unknown patient hides the specialty and diagnosis until the debrief', async ({ page }) => {
  await page.goto('./#/patients');
  const board = page.locator('ol.board');
  await expect(board.locator('.patient-card')).toHaveCount(11);
  // Only what a triage nurse would know: no specialties, topic tags or diagnoses.
  for (const hidden of ['Emergency medicine', 'Endocrinology', 'Anaphylaxis', 'DKA']) {
    await expect(board.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await page.getByLabel('Search', { exact: true }).fill('lunch');
  await expect(board.locator('.patient-card')).toHaveCount(1);
  await board.getByRole('link', { name: 'Collapse after lunch' }).click();

  await expect(page).toHaveURL(/#\/patient\/[0-9a-z]{6}\?seed=\d+$/);
  expect(page.url()).not.toContain('anaphylaxis');
  await expect(page.getByText('Unknown patient · Collapse after lunch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start case' })).toBeVisible();
  await expect(
    page.getByText('Educational simulation. Simplified physiology. Not clinical guidance.'),
  ).toBeVisible();
});

test('surprise me opens a random patient by code', async ({ page }) => {
  await page.goto('./#/patients');
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page).toHaveURL(/#\/patient\/[0-9a-z]{6}\?seed=\d+$/);
  await expect(page.getByText(/^Unknown patient · /)).toBeVisible();
});

test('the welcome and patient pages fit a 375 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ['./', './#/topics', './#/patients', './#/how', './#/teach']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
