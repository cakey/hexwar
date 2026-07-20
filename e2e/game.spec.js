import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('renders a playable WebGL battlefield without browser errors', async ({ page }) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(pathToFileURL(resolve('dist/index.html')).href);

  await expect(page.getByRole('heading', { name: 'HexWar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Violet moves' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  const canvas = page.getByLabel('Interactive HexWar battlefield');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute('data-rendered')).toBe('true');

  const hasWebGL = await canvas.evaluate((element) => Boolean(
    element.getContext('webgl2') || element.getContext('webgl'),
  ));
  expect(hasWebGL).toBe(true);

  const scores = await page.locator('.score > span').allTextContents();
  expect(scores.map(Number).reduce((total, score) => total + score, 0)).toBe(85);

  await page.screenshot({ path: 'test-results/hexwar.png' });

  await page.getByRole('button', { name: 'New match' }).click();
  await expect(page.getByText('Turn 1')).toBeVisible();
  expect(browserErrors).toEqual([]);
});
