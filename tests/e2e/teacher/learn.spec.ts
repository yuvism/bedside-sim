import { expect, test } from '@playwright/test';

test('learn from a video: the AMAX4 example analyses into a reviewable draft', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  await page
    .locator('.tool-grid')
    .getByRole('link', { name: /^Learn from a video/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Learn from a video', level: 2 })).toBeVisible();
  await expect(page.getByText('Patient videos are confidential.')).toBeVisible();

  await page.getByRole('button', { name: 'Load the AMAX4 example' }).click();
  await expect(page.getByText(/AMAX4 Simulation MASTER/).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Case/ })).toHaveValue('asthma-02');
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

test('autofill with AI fills rows to check, then a draft is published to students', async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/learn');
  await expect(page.getByText('Mock mode: autofill returns the bundled AMAX4 rows')).toBeVisible();
  await page.getByRole('combobox', { name: /^Case/ }).selectOption('asthma-02');

  // The video stays in the browser until Autofill is pressed.
  await page
    .locator('input[type=file][accept="video/*"]')
    .setInputFiles('tests/e2e/teacher/tiny.mp4');
  await expect(page.getByText(/Video: tiny\.mp4/)).toBeVisible();
  const autofill = page.getByRole('button', { name: 'Autofill with AI' });
  await expect(autofill).toBeDisabled();
  await page.getByLabel(/This video is public/).check();
  await autofill.click();
  await expect(page.getByText(/^Filled \d+ rows \(mock\)/)).toBeVisible();

  const badges = page.locator('table.anno-table .ai-badge');
  const n = await badges.count();
  expect(n).toBeGreaterThan(10);
  const analyse = page.getByRole('button', { name: 'Analyse the video' });
  await expect(analyse).toBeDisabled();
  await page
    .locator('table.anno-table tbody tr')
    .first()
    .getByRole('button', { name: 'Checked' })
    .click();
  await expect(badges).toHaveCount(n - 1);
  await page.getByRole('button', { name: 'I’ve checked them all' }).click();
  await expect(badges).toHaveCount(0);

  await analyse.click();
  await expect(
    page.getByRole('heading', { name: 'How well the case follows the video' }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Create a draft for review' }).click();
  await page.getByRole('link', { name: 'Review it in the editor' }).click();

  await page.getByRole('button', { name: 'Publish to students' }).click();
  await expect(page.getByText(/^Published as asthma-02-video\./)).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Teacher console' })
    .getByRole('link', { name: 'Published' })
    .click();
  const item = page.locator('.published-list li').filter({ hasText: 'asthma-02-video' });
  await expect(item).toContainText("Can't ventilate (from video)");
  await item.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByText('Nothing published yet.')).toBeVisible();
});
