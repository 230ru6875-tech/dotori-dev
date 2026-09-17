import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const indexPath='strategybar-runtime/cloudflare/index.js';
let text=fs.readFileSync(indexPath,'utf8');

const replacements=[
  ['if (cached && (age<60000 || (force&&age<15000))) {','if (cached && !force && age<60000) {'],
  ['if (cached && ((!force && age<60000) || (force && age<15000))) {','if (cached && !force && age<60000) {'],
  ['if (cached && (age<60000 || (force&&age<15000))) return await overlayBrokerQuotes(env,cached.payload);','if (cached && !force && age<60000) return await overlayBrokerQuotes(env,cached.payload);'],
  ['if (cached && ((!force && age<60000) || (force && age<15000))) return await overlayBrokerQuotes(env,cached.payload);','if (cached && !force && age<60000) return await overlayBrokerQuotes(env,cached.payload);']
];

let changed=false;
for (const [from,to] of replacements) {
  if (text.includes(from)) { text=text.replace(from,to); changed=true; }
}
if (!changed && !text.includes('if (cached && !force && age<60000)')) throw new Error('StrategyBar cache condition not found');

for (const oldKey of ['"market:base"','"market:base:v2"','"market:base:v3"','"market:base:v4"','"market:base:v5"']) text=text.replaceAll(oldKey,'"market:base:v6"');

const brokerGuard='if (!quotes[row.key]) return row;';
const brokerGuardReplacement="if (!quotes[row.key]) return row;\n    if (['DGS2','DGS10','DGS30'].includes(row.key) && String(row.provider||'')==='Npay 증권') return row;";
if (text.includes(brokerGuard) && !text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) text=text.replace(brokerGuard,brokerGuardReplacement);
if (!text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) throw new Error('Treasury broker overlay guard not applied');
fs.writeFileSync(indexPath,text);

const marketPath='strategybar-runtime/cloudflare/market.js';
let market=fs.readFileSync(marketPath,'utf8');

// Macro indices must survive an intraday Yahoo failure. Fall back to daily data
// instead of dropping the entire row from the market array.
const macroRe=/const macroResults=await Promise\.all\(MACROS\.map\(async\(\[key,name,unit\]\)=>\{try\{return\[macroFromResult\(key,await yahooChart\(key,["']5d["'],["']5m["']\),name,unit\),null\]\}catch\(error\)\{return\[null,`\$\{name\}: \$\{error instanceof Error\?error\.message:String\(error\)\}`\]\}\}\)\);/;
const macroReplacement=String.raw`const macroResults=await Promise.all(MACROS.map(async([key,name,unit])=>{
  let firstError=null;
  for(const [range,interval] of [['5d','5m'],['1mo','1d']]){
    try{
      const row=macroFromResult(key,await yahooChart(key,range,interval),name,unit);
      if(finite(row.value))return[row,null];
    }catch(error){if(!firstError)firstError=error;}
  }
  const message=firstError instanceof Error?firstError.message:String(firstError||'macro unavailable');
  return[null,name+': '+message];
}));`;
if(macroRe.test(market)) market=market.replace(macroRe,macroReplacement);
else if(!market.includes("for(const [range,interval] of [['5d','5m'],['1mo','1d']])")) throw new Error('macroResults fallback anchor not found');

const start=market.indexOf('async function resilientVix(){');
const end=market.indexOf('export async function fetchMarketSnapshot',start);
if(start<0||end<0) throw new Error('resilientVix function anchors not found');
const resilient=`async function resilientVix(){
  const attempts=[
    ['query1.finance.yahoo.com','5d','5m'],['query2.finance.yahoo.com','5d','5m'],
    ['query1.finance.yahoo.com','1mo','1d'],['query2.finance.yahoo.com','1mo','1d']
  ];
  for(const [host,range,interval] of attempts){
    try{
      const url=\`https://\${host}/v8/finance/chart/%5EVIX?range=\${range}&interval=\${interval}&includePrePost=true\`;
      const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 StrategyBar/1.0','accept':'application/json'}});
      if(!r.ok)continue;
      const p=await r.json(),result=p?.chart?.result?.[0];
      if(!result)continue;
      const row=macroFromResult('^VIX',result,'VIX','index');
      if(finite(row.value)&&row.value>5&&row.value<100)return{...row,source:'Yahoo Finance VIX',provider:'Yahoo',providerPriority:2};
    }catch{}
  }
  try{
    const r=await fetch('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',{headers:{'user-agent':'Mozilla/5.0 StrategyBar/1.0','accept':'text/csv,text/plain,*/*','cache-control':'no-cache'}});
    if(r.ok){
      const csv=await r.text(),lines=csv.trim().split(/\\r?\\n/).slice(1),points=[];
      for(const line of lines){
        const cols=line.split(',');
        if(cols.length<5)continue;
        const date=String(cols[0]||'').trim(),value=Number(String(cols[4]||'').replace(/\"/g,'').trim());
        if(date&&Number.isFinite(value)&&value>5&&value<100)points.push({date,value});
      }
      if(points.length){
        const latest=points.at(-1),prev=points.length>1?points.at(-2):null;
        return {key:'^VIX',label:'VIX',name:'VIX',unit:'index',value:round(latest.value,2),previousClose:prev?round(prev.value,2):null,changeValue:prev?round(latest.value-prev.value,2):null,changePct:prev&&prev.value?round((latest.value/prev.value-1)*100,2):null,asOf:latest.date,source:'Cboe VIX daily history CSV',provider:'Cboe',providerPriority:1,priceSession:'DAILY_CLOSE',sessionLabel:'Cboe 종가'};
      }
    }
  }catch{}
  throw new Error('VIX Yahoo and Cboe CSV providers unavailable');
}
`;
market=market.slice(0,start)+resilient+market.slice(end);
fs.writeFileSync(marketPath,market);

for (const file of [marketPath,indexPath]) execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('Patched StrategyBar cache v6, macro daily fallback, Npay Treasury protection, Cboe VIX CSV fallback, and syntax checks.');
