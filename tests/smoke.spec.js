const { test, expect } = require('@playwright/test');

const TARGET_URL = 'https://strategybar.hnr2020.workers.dev/?view=1&tab=dashboard';

test('StrategyBar dashboard opens on EC2', async ({ page }) => {
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const response = await page.goto(TARGET_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  expect(response, 'The dashboard should return an HTTP response').not.toBeNull();
  expect(response.ok(), `HTTP status was ${response.status()}`).toBeTruthy();

  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(5000);

  const title = await page.title();
  console.log(`PAGE_TITLE=${title}`);
  console.log(`FINAL_URL=${page.url()}`);

  if (consoleErrors.length) {
    console.log('BROWSER_CONSOLE_ERRORS:');
    for (const error of consoleErrors) console.log(`- ${error}`);
  }

  await page.screenshot({
    path: 'artifacts/strategybar-dashboard.png',
    fullPage: true,
  });
});
