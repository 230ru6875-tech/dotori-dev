const fs = require('fs');
const { test, expect } = require('@playwright/test');

const TARGET_URL = 'https://strategybar.hnr2020.workers.dev/?view=1&tab=dashboard';
const WATCHED_SYMBOLS = ['IONQ', 'SNDK', 'AVGO', 'ORCL', 'QLD'];

function ensureArtifactsDir() {
  fs.mkdirSync('artifacts', { recursive: true });
}

function normalizeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractNumberCandidates(text) {
  const priceMatches = [...text.matchAll(/(?:\$|₩)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/g)]
    .map((m) => m[0].trim())
    .filter((value) => !/^20\d{2}$/.test(value.replace(/[^0-9]/g, '')));
  const percentMatches = [...text.matchAll(/[+-]?\d+(?:\.\d+)?%/g)].map((m) => m[0]);
  return {
    priceCandidates: [...new Set(priceMatches)].slice(0, 12),
    percentCandidates: [...new Set(percentMatches)].slice(0, 8),
  };
}

function buildSymbolDiagnostics(lines, symbol) {
  const indexes = [];
  lines.forEach((line, index) => {
    if (line.includes(symbol)) indexes.push(index);
  });
  if (!indexes.length) return { symbol, found: false, context: [], priceCandidates: [], percentCandidates: [] };
  const first = indexes[0];
  const context = lines.slice(Math.max(0, first - 3), Math.min(lines.length, first + 8));
  return { symbol, found: true, context, ...extractNumberCandidates(context.join(' | ')) };
}

test('StrategyBar dashboard data checks on EC2', async ({ page }) => {
  ensureArtifactsDir();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  expect(response, 'The dashboard should return an HTTP response').not.toBeNull();
  expect(response.ok(), `HTTP status was ${response.status()}`).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(8000);

  let bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length, 'Dashboard body should contain rendered content').toBeGreaterThan(200);

  const suspiciousTokens = ['NaN', 'undefined', 'null', '가격 오류', '불러오기 실패'];
  const suspiciousFoundBeforeRefresh = suspiciousTokens.filter((token) => bodyText.includes(token));

  const apiDiagnostics = await page.evaluate(async () => {
    async function getJson(url) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch {}
        return { url, status: res.status, ok: res.ok, body, text: text.slice(0, 1000) };
      } catch (error) {
        return { url, status: null, ok: false, error: String(error) };
      }
    }
    const market = await getJson(`/api/market?force=1&t=${Date.now()}`);
    const qldOnly = await getJson(`/api/market?only=QLD&force=1&t=${Date.now()}`);
    return { market, qldOnly };
  });

  const marketSymbols = Object.keys(apiDiagnostics.market?.body?.symbols || {}).sort();
  const qldFromMarket = apiDiagnostics.market?.body?.symbols?.QLD || null;
  const qldFromOnly = apiDiagnostics.qldOnly?.body?.symbols?.QLD || null;

  const refreshButton = page.getByRole('button', { name: /갱신|새로고침|refresh/i }).first();
  let refreshButtonFound = false;
  let refreshClickSucceeded = false;
  if (await refreshButton.count()) {
    refreshButtonFound = true;
    if (await refreshButton.isVisible()) {
      try {
        await refreshButton.click({ timeout: 10000 });
        refreshClickSucceeded = true;
        await page.waitForTimeout(5000);
        bodyText = await page.locator('body').innerText();
      } catch (error) {
        console.log(`REFRESH_CLICK_ERROR=${String(error)}`);
      }
    }
  }

  const lines = normalizeLines(bodyText);
  const symbolDiagnostics = WATCHED_SYMBOLS.map((symbol) => buildSymbolDiagnostics(lines, symbol));
  const visibleSymbols = symbolDiagnostics.filter((item) => item.found).map((item) => item.symbol);
  const missingSymbols = symbolDiagnostics.filter((item) => !item.found).map((item) => item.symbol);
  const suspiciousFound = suspiciousTokens.filter((token) => bodyText.includes(token));

  const report = {
    checkedAt: new Date().toISOString(),
    targetUrl: TARGET_URL,
    finalUrl: page.url(),
    title: await page.title(),
    httpStatus: response.status(),
    bodyTextLength: bodyText.length,
    visibleSymbols,
    missingSymbols,
    suspiciousFoundBeforeRefresh,
    suspiciousFound,
    refreshButtonFound,
    refreshClickSucceeded,
    symbolDiagnostics,
    marketApi: {
      status: apiDiagnostics.market?.status,
      ok: apiDiagnostics.market?.ok,
      symbolCount: marketSymbols.length,
      symbols: marketSymbols,
      qld: qldFromMarket,
      rawError: apiDiagnostics.market?.error || null,
    },
    qldOnlyApi: {
      status: apiDiagnostics.qldOnly?.status,
      ok: apiDiagnostics.qldOnly?.ok,
      qld: qldFromOnly,
      responseOk: apiDiagnostics.qldOnly?.body?.ok ?? null,
      responseError: apiDiagnostics.qldOnly?.body?.error ?? null,
      rawError: apiDiagnostics.qldOnly?.error || null,
    },
    consoleErrors,
    pageErrors,
  };

  fs.writeFileSync('artifacts/strategybar-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'artifacts/strategybar-dashboard.png', fullPage: true });
  expect(pageErrors, `Page errors found: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
