const fs = require('fs');
const { test, expect } = require('@playwright/test');

const TARGET_URL = 'https://strategybar.hnr2020.workers.dev/?view=1&tab=dashboard';
const CORE_SYMBOLS = ['SNDK', 'IONQ'];
const WATCHED_SYMBOLS = ['SNDK', 'IONQ', 'AVGO', 'ORCL'];

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

function calcChangePct(price, previousClose) {
  const p = Number(price);
  const prev = Number(previousClose);
  if (!Number.isFinite(p) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((p - prev) / prev) * 100;
}

function buildPriceIntegrity(item) {
  if (!item) return { valid: false, reason: 'missing symbol payload' };
  const price = Number(item.price);
  const previousClose = Number(item.previousClose);
  const reportedChangePct = Number(item.changePct);
  const calculatedChangePct = calcChangePct(price, previousClose);
  const changePctDelta = Number.isFinite(calculatedChangePct) && Number.isFinite(reportedChangePct)
    ? Math.abs(calculatedChangePct - reportedChangePct)
    : null;
  return {
    validPrice: Number.isFinite(price) && price > 0,
    validPreviousClose: Number.isFinite(previousClose) && previousClose > 0,
    validReportedChangePct: Number.isFinite(reportedChangePct),
    price,
    previousClose,
    reportedChangePct,
    calculatedChangePct,
    changePctDelta,
    internallyConsistent: changePctDelta === null ? null : changePctDelta <= 0.25,
    provider: item.provider || null,
    source: item.source || null,
    priceSession: item.priceSession || null,
    sessionLabel: item.sessionLabel || null,
    asOf: item.asOf || null,
  };
}

test('StrategyBar SNDK and IONQ core diagnostics on EC2', async ({ page }) => {
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
        return { url, status: res.status, ok: res.ok, body, text: text.slice(0, 2000) };
      } catch (error) {
        return { url, status: null, ok: false, error: String(error) };
      }
    }
    const market = await getJson(`/api/market?force=1&t=${Date.now()}`);
    const sndkOnly = await getJson(`/api/market?only=SNDK&force=1&t=${Date.now()}`);
    const ionqOnly = await getJson(`/api/market?only=IONQ&force=1&t=${Date.now()}`);
    return { market, sndkOnly, ionqOnly };
  });

  const marketSymbols = Object.keys(apiDiagnostics.market?.body?.symbols || {}).sort();
  const corePayloads = {
    SNDK: {
      defaultMarket: apiDiagnostics.market?.body?.symbols?.SNDK || null,
      directMarket: apiDiagnostics.sndkOnly?.body?.symbols?.SNDK || null,
    },
    IONQ: {
      defaultMarket: apiDiagnostics.market?.body?.symbols?.IONQ || null,
      directMarket: apiDiagnostics.ionqOnly?.body?.symbols?.IONQ || null,
    },
  };

  for (const symbol of CORE_SYMBOLS) {
    const payload = corePayloads[symbol];
    expect(payload.defaultMarket, `${symbol} missing from default /api/market response`).not.toBeNull();
    expect(payload.directMarket, `${symbol} missing from direct /api/market response`).not.toBeNull();
    expect(Number(payload.directMarket.price), `${symbol} price must be a positive number`).toBeGreaterThan(0);
    expect(['PREMARKET', 'REGULAR', 'AFTER_HOURS']).toContain(String(payload.directMarket.priceSession || 'REGULAR'));
  }

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

  const coreDiagnostics = {};
  for (const symbol of CORE_SYMBOLS) {
    const ui = symbolDiagnostics.find((item) => item.symbol === symbol) || null;
    const defaultMarket = corePayloads[symbol].defaultMarket;
    const directMarket = corePayloads[symbol].directMarket;
    const integrity = buildPriceIntegrity(directMarket || defaultMarket);
    coreDiagnostics[symbol] = { ui, defaultMarket, directMarket, integrity };
    expect(ui?.found, `${symbol} must be visible on the dashboard`).toBeTruthy();
  }

  const report = {
    checkedAt: new Date().toISOString(),
    targetUrl: TARGET_URL,
    finalUrl: page.url(),
    title: await page.title(),
    httpStatus: response.status(),
    bodyTextLength: bodyText.length,
    coreSymbols: CORE_SYMBOLS,
    visibleSymbols,
    missingSymbols,
    suspiciousFoundBeforeRefresh,
    suspiciousFound,
    refreshButtonFound,
    refreshClickSucceeded,
    symbolDiagnostics,
    coreDiagnostics,
    marketApi: {
      status: apiDiagnostics.market?.status,
      ok: apiDiagnostics.market?.ok,
      symbolCount: marketSymbols.length,
      symbols: marketSymbols,
      rawError: apiDiagnostics.market?.error || null,
    },
    directApis: {
      SNDK: {
        status: apiDiagnostics.sndkOnly?.status,
        ok: apiDiagnostics.sndkOnly?.ok,
        responseOk: apiDiagnostics.sndkOnly?.body?.ok ?? null,
        responseError: apiDiagnostics.sndkOnly?.body?.error ?? null,
        rawError: apiDiagnostics.sndkOnly?.error || null,
      },
      IONQ: {
        status: apiDiagnostics.ionqOnly?.status,
        ok: apiDiagnostics.ionqOnly?.ok,
        responseOk: apiDiagnostics.ionqOnly?.body?.ok ?? null,
        responseError: apiDiagnostics.ionqOnly?.body?.error ?? null,
        rawError: apiDiagnostics.ionqOnly?.error || null,
      },
    },
    consoleErrors,
    pageErrors,
  };

  fs.writeFileSync('artifacts/strategybar-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'artifacts/strategybar-dashboard.png', fullPage: true });

  expect(pageErrors, `Page errors found: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
