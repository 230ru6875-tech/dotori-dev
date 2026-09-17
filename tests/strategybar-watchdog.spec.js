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

  const market=data.market||[];
  const vix=market.find(x=>x.key==='^VIX'||String(x.name||'').toUpperCase().includes('VIX'));
  expect(vix,'VIX market row').toBeTruthy();
  expect(finite(vix.value),'VIX finite').toBeTruthy();
  expect(Number(vix.value)>5 && Number(vix.value)<100,'VIX sane range').toBeTruthy();

  const treasuryRows={};
  for(const key of ['DGS2','DGS10','DGS30']){
    const y=market.find(x=>x.key===key);
    treasuryRows[key]=y;
    expect(y,key+' Treasury row').toBeTruthy();
    expect(y.provider,key+' Npay provider').toBe('Npay 증권');
    expect(String(y.source||''),key+' source').toContain('Npay');
    expect(finite(y.value),key+' finite yield').toBeTruthy();
    expect(Number(y.value)>0 && Number(y.value)<20,key+' sane yield').toBeTruthy();
  }

  // Validate the actual user-visible Market Pulse instead of implementation CSS.
  await expect(page.getByRole('heading',{name:'시장 체온',exact:true}),'Market Pulse heading').toBeVisible();
  const requiredLabels=['S&P 500','나스닥 100','필라델피아 반도체','러셀 2000','VIX','달러지수 DXY','원/달러 환율','WTI 국제유가','금 1G 국내시세','미 2년물','미 10년물','미 30년물'];
  for(const label of requiredLabels){
    await expect(page.getByText(label,{exact:true}).first(),label+' visible').toBeVisible();
  }

  const visibleText=await page.locator('body').innerText();
  expect(visibleText,'VIX value visible').toContain(Number(vix.value).toFixed(2));
  expect(visibleText,'2Y yield visible').toContain(Number(treasuryRows.DGS2.value).toFixed(3)+'%');
  expect(visibleText,'10Y yield visible').toContain(Number(treasuryRows.DGS10.value).toFixed(3)+'%');
  expect(visibleText,'30Y yield visible').toContain(Number(treasuryRows.DGS30.value).toFixed(3)+'%');
  expect(visibleText,'VIX interpretation visible').toMatch(/불안 완화|보통|긴장|공포/);

  await expect(page.getByText('샌디스크',{exact:true}).first(),'SNDK stock row visible').toBeVisible();
  await expect(page.getByText('아이온큐',{exact:true}).first(),'IONQ stock row visible').toBeVisible();
  await expect(page.getByRole('button',{name:/지금 갱신/}),'refresh button visible').toBeVisible();

  expect(pageErrors,'page JavaScript errors: '+pageErrors.join(' | ')).toEqual([]);
  const fatalConsole=consoleErrors.filter(x=>/SyntaxError|ReferenceError|TypeError|Uncaught/i.test(x));
  expect(fatalConsole,'fatal console errors: '+fatalConsole.join(' | ')).toEqual([]);
});
