import { expect, test } from '@playwright/test';

test('loads the app shell and canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Game Architecture/i);
  await expect(page.locator('#canvas')).toBeVisible();
});
