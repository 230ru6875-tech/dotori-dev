const { test, expect } = require('@playwright/test');

test('EC2 Playwright can open a real webpage', async ({ page }) => {
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Example Domain/);
  await expect(page.locator('h1')).toHaveText('Example Domain');
});
