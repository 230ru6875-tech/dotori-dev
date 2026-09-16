import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const treasuryBlock = String.raw`
async function fetchOfficialTreasuryYields() {
  const year = new Date().getUTCFullYear();
  const url = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=' + year;
  const response = await fetch(url, { headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8', 'user-agent': 'StrategyBar/1.0' } });
  if (!response.ok) throw new Error('Treasury HTTP ' + response.status);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry[\s\S]*?<m:properties>([\s\S]*?)<\/m:properties>[\s\S]*?<\/entry>/g)].map((m) => m[1]);
  if (entries.length < 2) throw new Error('Treasury yield data unavailable');
  const parse = (block, tag) => { const match=block.match(new RegExp('<d:' + tag + '[^>]*>([^<]+)<\\/d:' + tag + '>')); return match?Number(match[1]):null; };
  const dateOf = block => { const match=block.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/); return match?match[1].slice(0,10):null; };
  const current=entries.at(-1), previous=entries.at(-2);
  return [['BC_2YEAR','UST2Y','미 2년물'],['BC_10YEAR','UST10Y','미 10년물'],['BC_30YEAR','UST30Y','미 30년물']].map(([tag,key,label])=>{
    const value=parse(current,tag), prior=parse(previous,tag); if(!Number.isFinite(value)) throw new Error('Treasury '+label+' unavailable');
    return {key,label,name:label,value:round(value,3),previousClose:Number.isFinite(prior)?round(prior,3):null,changeValue:Number.isFinite(prior)?round((value-prior)*100,1):null,changePct:Number.isFinite(prior)&&prior!==0?round((value/prior-1)*100,3):null,changeUnit:'bp',unit:'percent',observationDate:dateOf(current),asOf:dateOf(current),source:'U.S. Treasury Daily Treasury Par Yield Curve',provider:'U.S. Treasury',providerPriority:2,priceSession:'DAILY',sessionLabel:'공식 일일 fallback'};
  });
}

async function fetchInvestingTreasuryYields() {
  const url='https://kr.investing.com/rates-bonds/usa-government-bonds';
  const response=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en;q=0.7','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36'}});
  if(!response.ok) throw new Error('Investing.com bonds HTTP '+response.status);
  const html=await response.text();
  const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&minus;/g,'-').replace(/&plus;/g,'+').replace(/\s+/g,' ');
  const specs=[['UST2Y','미 2년물',/미국\s*2년(?:물)?\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)%\s+([0-9:]+)/],['UST10Y','미 10년물',/미국\s*10년물\s*국채\s*금리\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)%\s+([0-9:]+)/],['UST30Y','미 30년물',/미국\s*30년(?:물)?\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)%\s+([0-9:]+)/]];
  return specs.map(([key,label,re])=>{const m=plain.match(re);if(!m)throw new Error('Investing.com '+label+' parse failed');const value=Number(m[1]),previous=Number(m[2]),high=Number(m[3]),low=Number(m[4]),change=Number(m[5]),changePct=Number(m[6]),clock=m[7];return {key,label,name:label,value:round(value,3),previousClose:round(previous,3),dayHigh:round(high,3),dayLow:round(low,3),changeValue:round(change*100,1),changePct:round(changePct,2),changeUnit:'bp',unit:'percent',asOf:clock,source:'Investing.com 미국 국채',provider:'Investing.com',providerPriority:1,priceSession:'INTRADAY',sessionLabel:'장중'};});
}

async function fetchTreasuryYields() {
  try { return await fetchInvestingTreasuryYields(); }
  catch (investingError) {
    const rows=await fetchOfficialTreasuryYields();
    return rows.map(row=>({...row,fallbackReason:investingError instanceof Error?investingError.message:String(investingError)}));
  }
}
`;

const start=text.indexOf('async function fetchTreasuryYields()');
if(start>=0){const end=text.indexOf('\nexport async function fetchMarketSnapshot',start);if(end<0)throw new Error('Treasury block end not found');text=text.slice(0,start)+treasuryBlock+'\n'+text.slice(end+1);}else{const marker='export async function fetchMarketSnapshot';if(!text.includes(marker))throw new Error('fetchMarketSnapshot marker not found');text=text.replace(marker,treasuryBlock+'\n'+marker);}
const needle='  const market=macroResults.filter(([row])=>row).map(([row])=>row);';
const replacement=needle+"\n  try { market.push(...await fetchTreasuryYields()); } catch (error) { const message=error instanceof Error?error.message:String(error); for (const [key,label] of [['UST2Y','미 2년물'],['UST10Y','미 10년물'],['UST30Y','미 30년물']]) market.push({key,label,name:label,value:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'Investing.com 미국 국채 / U.S. Treasury fallback',provider:'unavailable',error:message}); }";
if(text.includes(needle)&&!text.includes('market.push(...await fetchTreasuryYields())'))text=text.replace(needle,replacement);
fs.writeFileSync(path,text);
console.log('Patched market.js: Investing.com US Treasury yields primary, U.S. Treasury official fallback.');
