import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('renders a playable WebGL battlefield without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
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

  const hasWebGL = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return Boolean(canvasElement.getContext('webgl2') || canvasElement.getContext('webgl'));
  });
  expect(hasWebGL).toBe(true);

  const scores = await page.locator('.score > span').allTextContents();
  expect(scores.map(Number).reduce((total, score) => total + score, 0)).toBe(113);

  await page.getByRole('button', { name: /Scout Rapid probe/ }).click();
  await expect(
    page.locator('.selected-unit').getByRole('heading', { name: 'Scout' }),
  ).toBeVisible();
  await page.mouse.click(531, 478);
  await expect(canvas).toHaveAttribute('data-planned-action', /move:violet-scout-1/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New match' }).click();

  await page.mouse.move(640, 360);
  await expect(page.locator('.tile-intel')).toBeVisible();
  await expect(page.locator('.tile-intel')).toContainText('share');
  await expect(page.locator('.tile-intel')).toContainText('influence');
  await expect(page.locator('.tile-intel')).toContainText(/needs \d+ more influence to capture/);

  const cameraBefore = await canvas.getAttribute('data-camera-target');
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.mouse.move(780, 350, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute('data-camera-target')).not.toBe(cameraBefore);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');

  await page.screenshot({ path: 'test-results/hexwar.png' });

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('heading', { name: 'Win through influence' })).toBeVisible();
  await page.getByRole('button', { name: 'Close how to play' }).click();

  await page.getByRole('button', { name: 'Pass' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: 'Crimson moves' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Violet moves' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Round 2/)).toBeVisible();

  await page.getByRole('button', { name: 'Hotseat' }).click();
  await page.getByRole('button', { name: 'Pass' }).click();
  await expect(page.getByText('Pass this turn')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-planned-action', 'pass');
  await page.keyboard.press('Escape');
  await expect(canvas).not.toHaveAttribute('data-planned-action', 'pass');
  await page.getByRole('button', { name: 'Pass' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Crimson moves' })).toBeVisible();

  await page.getByRole('button', { name: 'New match' }).click();
  await expect(page.getByText(/Round 1/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Violet moves' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-keyboard-stage', 'pieces');
  await expect(
    page.locator('.selected-unit').getByRole('heading', { name: 'Scout' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-keyboard-stage', 'destinations');
  await expect(canvas).toHaveAttribute('data-keyboard-hex', /.+/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-planned-action', /move:violet-scout-1/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Crimson moves' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
