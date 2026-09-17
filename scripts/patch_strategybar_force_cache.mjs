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
  if (text.includes(from)) {
    text=text.replace(from,to);
    changed=true;
  }
}
if (!changed && !text.includes('if (cached && !force && age<60000)')) {
  throw new Error('StrategyBar cache condition not found');
}

text=text.replaceAll('"market:base"','"market:base:v4"');
text=text.replaceAll('"market:base:v2"','"market:base:v4"');
text=text.replaceAll('"market:base:v3"','"market:base:v4"');

const brokerGuard='if (!quotes[row.key]) return row;';
const brokerGuardReplacement="if (!quotes[row.key]) return row;\n    if (['DGS2','DGS10','DGS30'].includes(row.key) && String(row.provider||'')==='Npay 증권') return row;";
if (text.includes(brokerGuard) && !text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) {
  text=text.replace(brokerGuard,brokerGuardReplacement);
  changed=true;
}
if (!text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) {
  throw new Error('Treasury broker overlay guard not applied');
}
fs.writeFileSync(indexPath,text);

const marketPath='strategybar-runtime/cloudflare/market.js';
let market=fs.readFileSync(marketPath,'utf8');
const start=market.indexOf('async function resilientVix(){');
const end=market.indexOf('export async function fetchMarketSnapshot',start);
if(start<0||end<0) throw new Error('resilientVix function anchors not found');
const resilient=`async function resilientVix(){
  const attempts=[
    ['query1.finance.yahoo.com','5d','5m'],
    ['query2.finance.yahoo.com','5d','5m'],
    ['query1.finance.yahoo.com','1mo','1d'],
    ['query2.finance.yahoo.com','1mo','1d']
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
  throw new Error('VIX Yahoo intraday/daily providers unavailable');
}
`;
market=market.slice(0,start)+resilient+market.slice(end);
fs.writeFileSync(marketPath,market);

for (const file of [marketPath,indexPath]) {
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
console.log('Patched StrategyBar cache, protected Npay Treasury yields, hardened VIX fallback, and syntax-checked Worker code.');
