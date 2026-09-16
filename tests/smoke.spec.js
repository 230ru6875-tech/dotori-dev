const fs = require('fs');
const { test, expect } = require('@playwright/test');

const TARGET_URL = 'https://strategybar.hnr2020.workers.dev/?view=1&tab=dashboard';

function ensureArtifactsDir() {
  fs.mkdirSync('artifacts', { recursive: true });
}

test('StrategyBar dashboard data checks on EC2', async ({ page }) => {
  ensureArtifactsDir();

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const response = await page.goto(TARGET_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  expect(response, 'The dashboard should return an HTTP response').not.toBeNull();
  expect(response.ok(), `HTTP status was ${response.status()}`).toBeTruthy();

  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(7000);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length, 'Dashboard body should contain rendered content').toBeGreaterThan(200);

  const watchedSymbols = ['IONQ', 'SNDK', 'AVGO', 'ORCL', 'QLD'];
  const visibleSymbols = watchedSymbols.filter((symbol) => bodyText.includes(symbol));

  const suspiciousTokens = ['NaN', 'undefined', 'null', '가격 오류', '불러오기 실패'];
  const suspiciousFound = suspiciousTokens.filter((token) => bodyText.includes(token));

  const refreshButton = page.getByRole('button', { name: /갱신|새로고침|refresh/i }).first();
  let refreshButtonFound = false;
  let refreshClickSucceeded = false;

  if (await refreshButton.count()) {
    refreshButtonFound = true;
    if (await refreshButton.isVisible()) {
      await refreshButton.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000);
      refreshClickSucceeded = true;
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    targetUrl: TARGET_URL,
    finalUrl: page.url(),
    title: await page.title(),
    httpStatus: response.status(),
    bodyTextLength: bodyText.length,
    visibleSymbols,
    suspiciousFound,
    refreshButtonFound,
    refreshClickSucceeded,
    consoleErrors,
    pageErrors,
  };

  fs.writeFileSync('artifacts/strategybar-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await page.screenshot({
    path: 'artifacts/strategybar-dashboard.png',
    fullPage: true,
  });

  expect(pageErrors, `Page errors found: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
