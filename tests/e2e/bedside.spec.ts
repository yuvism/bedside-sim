import { expect, test } from '@playwright/test';

test('the board shows bays, triage observations and NEWS2', async ({ page }) => {
  await page.goto('./#/patients');
  const cards = page.locator('ol.board .patient-card');
  await expect(cards).toHaveCount(11);
  await expect(cards.first().locator('.bay-badge')).toHaveText('Bay 1');
  await expect(cards.first().getByLabel('Observations on arrival')).toContainText('HR');
  // Every adult patient has a NEWS2 score with a risk label, not colour alone.
  await expect(
    page.locator('.news2').filter({ hasText: /NEWS2 \d+\s*(Low|Medium|High)/ }),
  ).not.toHaveCount(0);
  await expect(page.getByText(/Royal College of Physicians/)).toBeVisible();
});

test('the patient is in a bed you can interact with, in the same bay as on the board', async ({
  page,
}) => {
  await page.goto('./#/patients');
  const card = page.locator('ol.board .patient-card').filter({ hasText: 'Collapse after lunch' });
  const bay = ((await card.locator('.bay-badge').textContent()) ?? '').trim();
  await card.getByRole('link', { name: 'Collapse after lunch' }).click();

  // The handover is on top of the bedside until the case starts.
  const handover = page.getByRole('region', { name: 'Handover' });
  await expect(handover.getByText(`Handover · ${bay}`)).toBeVisible();
  await expect(
    page.getByText(new RegExp(`^${bay} · Unknown patient · Collapse after lunch`)),
  ).toBeVisible();
  await expect(page.locator('.bed-scene .bay-sign')).toHaveText(bay.toUpperCase());
  await handover.getByRole('button', { name: 'Start case' }).click();
  await expect(handover).toBeHidden();

  // Clicking the patient or the equipment opens the matching panel.
  const scene = page.locator('.bed-scene');
  await expect(scene).toBeVisible();
  // The chest moves with each breath, so it never counts as "stable" for a normal click.
  await scene.locator('.hot[data-target="body"]').dispatchEvent('click');
  await expect(page.getByRole('tab', { name: 'Examine' })).toHaveAttribute('aria-selected', 'true');
  await scene.locator('.hot[data-target="cart"]').click();
  await expect(page.getByRole('tab', { name: 'Treat' })).toHaveAttribute('aria-selected', 'true');
  await scene.locator('.hot[data-target="head"]').click();
  await expect(page.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'true');

  // Keyboard users get the same objects as buttons.
  const objects = page.getByRole('group', { name: 'Bedside objects' });
  await objects.getByRole('button', { name: 'Examine the patient' }).focus();
  await expect(objects).toBeVisible();

  // Oxygen goes on the face in the scene.
  await page.getByRole('tab', { name: 'Treat' }).click();
  await page.getByRole('button', { name: /^High-flow oxygen/ }).click();
  await expect(page.locator('.scene-strip').getByText('High-flow oxygen')).toBeVisible();

  // The brief can be read again during the case.
  await page.getByRole('button', { name: 'Brief' }).click();
  const brief = page.getByRole('dialog', { name: 'Collapse after lunch' });
  await expect(brief).toContainText('brought to the emergency department');
  await brief.getByRole('button', { name: 'Back to the patient' }).click();
  await expect(brief).toBeHidden();
});

test('the speed control says what it does', async ({ page }) => {
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  const speed = page.getByRole('group', { name: 'Simulation speed' });
  await expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('title', /Real time/);
  await expect(speed.getByRole('button', { name: '4×' })).toHaveAttribute(
    'title',
    /one simulated minute takes 15 seconds/,
  );
});

test('the bedside fits one screen on a laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./#/case/anaphylaxis-01?seed=1');
  await page.getByRole('button', { name: 'Start case' }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#monitor')).toBeInViewport();
  await expect(page.locator('#actions')).toBeInViewport();
});
