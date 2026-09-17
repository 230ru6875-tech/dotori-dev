const { test, expect } = require('@playwright/test');

const URL = 'https://strategybar.hnr2020.workers.dev/?view=1&tab=dashboard';

function finite(v){ return v !== null && v !== undefined && Number.isFinite(Number(v)); }

test('StrategyBar production watchdog', async ({ page }) => {
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console', msg => { if(msg.type()==='error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(String(err)));

  const response=await page.goto(URL,{waitUntil:'networkidle',timeout:60000});
  expect(response && response.ok(), 'production page HTTP').toBeTruthy();
  await page.waitForTimeout(3000);

  const body=await page.locator('body').innerText();
  expect(body).toContain('SNDK');
  expect(body).toContain('IONQ');
  expect(body.toUpperCase()).toContain('VIX');

  const api=await page.request.get('https://strategybar.hnr2020.workers.dev/api/market?force=1&t='+Date.now(),{timeout:60000});
  expect(api.ok(),'market API HTTP').toBeTruthy();
  const data=await api.json();

  for(const symbol of ['SNDK','IONQ']){
    const row=data.symbols?.[symbol];
    expect(row, symbol+' exists').toBeTruthy();
    expect(finite(row.price), symbol+' finite price').toBeTruthy();
    expect(Number(row.price)>0 && Number(row.price)<10000, symbol+' sane price').toBeTruthy();
    if(finite(row.previousClose) && finite(row.changePct)){
      const expected=(Number(row.price)/Number(row.previousClose)-1)*100;
      expect(Math.abs(expected-Number(row.changePct)),symbol+' price/change consistency').toBeLessThan(0.15);
    }
  }

  const vix=(data.market||[]).find(x=>x.key==='^VIX'||String(x.name||'').toUpperCase().includes('VIX'));
  expect(vix,'VIX market row').toBeTruthy();
  expect(finite(vix.value),'VIX finite').toBeTruthy();
  expect(Number(vix.value)>5 && Number(vix.value)<100,'VIX sane range').toBeTruthy();

  for(const key of ['DGS2','DGS10','DGS30']){
    const y=(data.market||[]).find(x=>x.key===key);
    expect(y,key+' Treasury row').toBeTruthy();
    expect(y.provider,key+' Npay provider').toBe('Npay 증권');
    expect(String(y.source||''),key+' source').toContain('Npay');
    expect(finite(y.value),key+' finite yield').toBeTruthy();
    expect(Number(y.value)>0 && Number(y.value)<20,key+' sane yield').toBeTruthy();
  }

  const marketGrid=await page.locator('.sb-market-responsive').count();
  expect(marketGrid,'Market Pulse card grid').toBeGreaterThan(0);
  const stockRows=await page.locator('.sb-stock-row').count();
  expect(stockRows,'stock row layout').toBeGreaterThanOrEqual(2);
  const vixReading=await page.locator('.sb-vix-reading').count();
  expect(vixReading,'VIX interpretation').toBeGreaterThan(0);

  expect(pageErrors,'page JavaScript errors: '+pageErrors.join(' | ')).toEqual([]);
  const fatalConsole=consoleErrors.filter(x=>/SyntaxError|ReferenceError|TypeError|Uncaught/i.test(x));
  expect(fatalConsole,'fatal console errors: '+fatalConsole.join(' | ')).toEqual([]);
});
