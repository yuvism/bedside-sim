import { expect, test, type Locator, type Page } from '@playwright/test';

const section = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Case sections' })
    .getByRole('button', { name, exact: true });

/** The newest item in a list fieldset (new items open automatically). */
const lastItem = (page: Page, legend: string): Locator =>
  page
    .locator('fieldset.field-group')
    .filter({ has: page.locator(`legend:text-is("${legend}")`) })
    .locator('details.array-item')
    .last();

test('a case built only in the editor is playable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('./#/teach');
  await page.getByRole('link', { name: /^Case editor/ }).click();
  await page.getByRole('button', { name: 'New case' }).click();

  await page.getByLabel('Title', { exact: true }).fill('Editor-built case');
  await page.getByLabel('ID', { exact: true }).fill('editor-case-01');

  await section(page, 'Patient').click();
  await page.getByLabel('Name', { exact: true }).fill('Alex Morgan');

  await section(page, 'Talk').click();
  await page.getByRole('button', { name: '+ Add question' }).click();
  const question = lastItem(page, 'Dialogue');
  await question.getByLabel('ID', { exact: true }).fill('pain');
  await question.getByLabel('Question', { exact: true }).fill('Where does it hurt?');
  // One answer per severity band, mildest first.
  await question.getByRole('button', { name: '+ Add answer' }).click();
  await question.getByRole('button', { name: '+ Add answer' }).click();
  const answers = question.getByLabel(/^Answers/);
  await answers.nth(0).fill('It hurts in my chest.');
  await answers.nth(1).fill('My chest… it hurts.');
  await answers.nth(2).fill('(points to chest)');

  await section(page, 'Scoring').click();
  await page.getByRole('button', { name: '+ Add rule' }).click();
  const rule = lastItem(page, 'Scoring');
  await rule.getByLabel('Label', { exact: true }).fill('Asked about the pain');
  await rule.getByLabel('Weight', { exact: true }).fill('10');
  await rule.getByLabel('Test type').selectOption({ label: 'Asked' });
  await rule.getByLabel('IDs', { exact: true }).first().fill('pain');

  await expect(page.getByText('Valid: ready to test-run')).toBeVisible();
  await page.getByRole('button', { name: 'Test run' }).click();

  await expect(page).toHaveURL(/#\/test\/d[a-z0-9]+\?seed=\d+/);
  await expect(page.getByRole('heading', { name: 'Editor-built case' })).toBeVisible();
  await expect(page.getByText(/Test run of an editor draft/)).toBeVisible();
  await page.getByRole('button', { name: 'Start case' }).click();
  await page.getByRole('button', { name: '8×' }).click();
  await page.getByRole('button', { name: 'Where does it hurt?' }).click();
  // Severity starts at 50, in the middle band, so the patient gives the second answer.
  await expect(page.locator('.bubble')).toHaveText('“My chest… it hurts.”');
  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: /^High-flow oxygen/ }).click();

  // Severity 50 falls 2.5/min on oxygen: about 11 sim minutes, ~85 s at 8×.
  for (let i = 0; i < 6; i++) await page.clock.runFor(20_000);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Alex is stable' })).toBeVisible();
  const asked = dialog.locator('ul.check li').filter({ hasText: 'Asked about the pain' });
  await expect(asked).toHaveClass(/done/);

  // Back to the editor; the draft is still there.
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Back to editor' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Editor-built case');
});

test('duplicate, export, import and jump to a problem', async ({ page }) => {
  await page.goto('./#/editor');
  await page.getByLabel('Duplicate a library case').selectOption('anaphylaxis-01');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('ID', { exact: true })).toHaveValue('anaphylaxis-01-copy');
  await expect(page.getByText('Valid: ready to test-run')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('anaphylaxis-01-copy.json');

  // Break a field, then follow the problem link back to it.
  await page.getByLabel('Title', { exact: true }).fill('');
  await expect(page.getByText('1 problem', { exact: true })).toBeVisible();
  await section(page, 'Scoring').click();
  await page.locator('.problems').getByRole('button', { name: 'Title' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();

  await page.getByRole('link', { name: 'All drafts' }).click();
  await expect(page.locator('.card.draft')).toHaveCount(1);
  await page.getByLabel('Case JSON file').setInputFiles({
    name: 'mine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ id: 'imported-01', title: 'Imported case' })),
  });
  await expect(page.getByText('Case editor · Imported case')).toBeVisible();
  await expect(page.locator('.problems summary')).toContainText('Problems');
  await page.getByRole('link', { name: 'All drafts' }).click();
  await expect(page.locator('.card.draft')).toHaveCount(2);
});
