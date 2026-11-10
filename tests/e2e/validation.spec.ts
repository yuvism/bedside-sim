import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('the sample reference loads, compares and exports', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Validation' }).click();
  await expect(page.getByRole('heading', { name: 'Video validation', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Load sample' }).click();

  await expect(page.getByText('anaphylaxis-01-sample.csv: 34 rows')).toBeVisible();
  await expect(page.getByText(/Synthetic example/)).toBeVisible();
  await expect(page.locator('.cmp-panel')).toHaveCount(6);
  await expect(page.locator('.cmp-panel svg.recharts-surface')).toHaveCount(6);
  await expect(page.getByText('Replayed 6 of 9 events')).toBeVisible();

  const metrics = page.locator('table.metrics tbody tr');
  await expect(metrics).toHaveCount(6);
  await expect(metrics.filter({ hasText: 'SpO₂' })).toContainText('Diverges');
  await expect(metrics.filter({ hasText: 'Systolic BP' })).toContainText('Within');
  await expect(page.locator('.tr-result')).toContainText('sim responds later');

  // A tighter tolerance flags systolic BP too.
  await page
    .getByRole('group', { name: /Tolerance/ })
    .getByRole('spinbutton')
    .nth(1)
    .fill('2');
  await expect(metrics.filter({ hasText: 'Systolic BP' })).toContainText('Diverges');

  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download report (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toBe('validation-anaphylaxis-01-seed1.json');
  const report = JSON.parse(await readFile(await json.path(), 'utf8')) as {
    tolerances: { sbp: number };
    vitals: { vital: string; flagged: boolean }[];
  };
  expect(report.tolerances.sbp).toBe(2);
  expect(report.vitals.find((v) => v.vital === 'sbp')?.flagged).toBe(true);

  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download charts (PNG)' }).click(),
  ]);
  const bytes = await readFile(await png.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});

test('an imported CSV reports what it could not replay', async ({ page }) => {
  await page.goto('./#/validate');
  await page.getByLabel('Reference CSV file').setInputFiles({
    name: 'mine.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        't_sec,hr,sbp,spo2,notes,event',
        '0,110,90,95,,',
        '30,112,,96,,drug:unicorn:IV',
        '60,bad,95,97,,device:o2_nrb:on',
      ].join('\n'),
    ),
  });
  await expect(page.getByText('mine.csv: 3 rows')).toBeVisible();
  await expect(page.getByText('Ignored columns: notes.')).toBeVisible();
  await expect(page.getByText(/hr "bad" isn't a number/)).toBeVisible();
  await expect(page.getByText('Unknown drug "unicorn".')).toBeVisible();
  await expect(page.getByText('Replayed 1 of 2 events')).toBeVisible();
});

test('validation fits a 375 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#/validate');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(page.locator('.cmp-panel')).toHaveCount(6);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
