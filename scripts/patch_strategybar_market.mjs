import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const patchBlock = String.raw`
function normalizeHtmlText(html='') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&minus;|&#8722;/gi,'-')
    .replace(/&plus;/gi,'+')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function parseInvestingBondRow(plain, labels, key, label) {
  const lower=plain.toLowerCase();
  let pos=-1;
  for (const candidate of labels) {
    pos=lower.indexOf(String(candidate).toLowerCase());
    if (pos>=0) break;
  }
  if (pos<0) throw new Error('Investing.com '+label+' label not found');
  const window=plain.slice(pos,pos+320);
  const numbers=[...window.matchAll(/[+-]?\d+(?:,\d{3})*(?:\.\d+)?%?/g)].map(m=>m[0]);
  const values=numbers.filter(x=>!x.includes(':')).map(x=>x.replaceAll(',',''));
  if (values.length<6) throw new Error('Investing.com '+label+' columns not found: '+window.slice(0,180));
  const value=Number(values[0]), previous=Number(values[1]), high=Number(values[2]), low=Number(values[3]);
  const change=Number(values[4].replace('%','')), changePct=Number(values[5].replace('%',''));
  if (![value,previous,high,low,change,changePct].every(Number.isFinite)) throw new Error('Investing.com '+label+' numeric parse failed');
  const timeMatch=window.match(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/);
  return {key,label,name:label,value:round(value,3),previousClose:round(previous,3),dayHigh:round(high,3),dayLow:round(low,3),changeValue:round(change*100,1),changePct:round(changePct,2),changeUnit:'bp',unit:'percent',asOf:timeMatch?timeMatch[0]:new Date().toISOString(),source:'Investing.com 미국 국채',provider:'Investing.com',providerPriority:1,priceSession:'INTRADAY',sessionLabel:'장중'};
}

async function fetchInvestingTreasuryYields() {
  const url='https://kr.investing.com/rates-bonds/usa-government-bonds';
  const response=await fetch(url,{headers:{
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control':'no-cache',
    'pragma':'no-cache',
    'referer':'https://kr.investing.com/',
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
  }});
  const html=await response.text();
  if(!response.ok) throw new Error('Investing.com bonds HTTP '+response.status+' body='+html.slice(0,140).replace(/\s+/g,' '));
  const plain=normalizeHtmlText(html);
  return [
    parseInvestingBondRow(plain,['미국 2년','미국 2년물','U.S. 2Y','US 2Y'],'DGS2','미 2년물'),
    parseInvestingBondRow(plain,['미국 10년물 국채 금리','미국 10년','U.S. 10Y','US 10Y'],'DGS10','미 10년물'),
    parseInvestingBondRow(plain,['미국 30년','미국 30년물','U.S. 30Y','US 30Y'],'DGS30','미 30년물')
  ];
}

async function fetchCboeVix() {
  const url='https://www.cboe.com/tradable-products/vix';
  const response=await fetch(url,{headers:{'accept':'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 StrategyBar/1.0'}});
  const html=await response.text();
  if(!response.ok) throw new Error('Cboe VIX HTTP '+response.status);
  const plain=normalizeHtmlText(html);
  const spot=plain.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*VIX\s*Spot\s*Price/i) || plain.match(/VIX\s*Spot\s*Price\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if(!spot) throw new Error('Cboe VIX spot parse failed');
  const value=Number(spot[1]);
  if(!(value>0)) throw new Error('Cboe VIX invalid');
  const changeMatch=plain.match(/Change\s*([+-]?\d+(?:\.\d+)?)%\s*\(?([+-]?\d+(?:\.\d+)?)?\)?/i);
  const changePct=changeMatch?Number(changeMatch[1]):null;
  const changeValue=changeMatch&&changeMatch[2]?Number(changeMatch[2]):null;
  const previousClose=Number.isFinite(changeValue)?round(value-changeValue,2):null;
  return {key:'^VIX',label:'VIX',name:'VIX',value:round(value,2),previousClose,changeValue:Number.isFinite(changeValue)?round(changeValue,2):null,changePct:Number.isFinite(changePct)?round(changePct,2):null,changeUnit:'index',unit:'index',asOf:new Date().toISOString(),source:'Cboe VIX',provider:'Cboe',providerPriority:1,priceSession:'DELAYED',sessionLabel:'Cboe 지연'};
}
`;

const marker='export async function fetchMarketSnapshot';
if (!text.includes('async function fetchInvestingTreasuryYields()')) {
  if(!text.includes(marker)) throw new Error('fetchMarketSnapshot marker not found');
  text=text.replace(marker,patchBlock+'\n'+marker);
} else {
  const start=text.indexOf('function normalizeHtmlText(');
  const end=text.indexOf('\nexport async function fetchMarketSnapshot',start);
  if(start>=0 && end>start) text=text.slice(0,start)+patchBlock+'\n'+text.slice(end+1);
}

const needle='  const market=macroResults.filter(([row])=>row).map(([row])=>row);';
if(!text.includes(needle)) throw new Error('market insertion point not found');
const injection = needle + `
  try {
    const treasury=await fetchInvestingTreasuryYields();
    for (const row of treasury) {
      const index=market.findIndex(item=>item.key===row.key);
      if(index>=0) market[index]=row; else market.push(row);
    }
  } catch (error) {
    const message=error instanceof Error?error.message:String(error);
    for (const [key,label] of [['DGS2','미 2년물'],['DGS10','미 10년물'],['DGS30','미 30년물']]) {
      const row={key,label,name:label,value:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'Investing.com 미국 국채',provider:'Investing.com',error:message};
      const index=market.findIndex(item=>item.key===key);
      if(index>=0) market[index]=row; else market.push(row);
    }
  }
  if (!market.some(item=>item.key==='^VIX' && Number(item.value)>0)) {
    try { market.push(await fetchCboeVix()); }
    catch (error) { market.push({key:'^VIX',label:'VIX',name:'VIX',value:null,source:'Cboe VIX',provider:'Cboe',error:error instanceof Error?error.message:String(error)}); }
  }`;

const oldPatterns=[
  /  const market=macroResults\.filter\(\(\[row\]\)=>row\)\.map\(\(\[row\]\)=>row\);\n  try \{ market\.push\(\.\.\.await fetchTreasuryYields\(\)\); \} catch \(error\) \{[^\n]*\}/,
  /  const market=macroResults\.filter\(\(\[row\]\)=>row\)\.map\(\(\[row\]\)=>row\);\n  try \{\n    const treasury=await fetchInvestingTreasuryYields\(\);[\s\S]*?\n  \}/
];
let replaced=false;
for (const re of oldPatterns) {
  if(re.test(text)) { text=text.replace(re,injection); replaced=true; break; }
}
if(!replaced && !text.includes('const treasury=await fetchInvestingTreasuryYields()')) text=text.replace(needle,injection);

fs.writeFileSync(path,text);
console.log('Patched market.js: robust Investing.com DGS2/DGS10/DGS30 parser + Cboe VIX fallback.');
