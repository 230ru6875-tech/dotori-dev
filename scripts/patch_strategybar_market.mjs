import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const treasuryBlock = `
function treasuryField(xml, tag) {
  const matches=[...xml.matchAll(new RegExp('<d:'+tag+'[^>]*>([^<]+)<\\/d:'+tag+'>','g'))];
  return matches.map((m)=>m[1]);
}

async function fetchTreasuryYields() {
  const year=new Date().getUTCFullYear();
  const url=\`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=\${year}\`;
  const response=await fetch(url,{headers:{accept:'application/xml,text/xml;q=0.9,*/*;q=0.8','user-agent':'StrategyBar/1.0'}});
  if(!response.ok) throw new Error(\`Treasury HTTP \${response.status}\`);
  const xml=await response.text();
  const entries=[...xml.matchAll(/<entry[\\s\\S]*?<content[^>]*>[\\s\\S]*?<m:properties>([\\s\\S]*?)<\\/m:properties>[\\s\\S]*?<\\/entry>/g)].map((m)=>m[1]);
  if(entries.length<2) throw new Error('Treasury yield data unavailable');
  const parse=(block,tag)=>{const m=block.match(new RegExp('<d:'+tag+'[^>]*>([^<]+)<\\/d:'+tag+'>'));return m?Number(m[1]):null};
  const dateOf=(block)=>{const m=block.match(/<d:NEW_DATE[^>]*>([^<]+)<\\/d:NEW_DATE>/);return m?m[1].slice(0,10):null};
  const current=entries.at(-1), previous=entries.at(-2);
  return [['BC_2YEAR','UST2Y','미 2년물'],['BC_10YEAR','UST10Y','미 10년물'],['BC_30YEAR','UST30Y','미 30년물']].map(([tag,key,label])=>{
    const value=parse(current,tag), prior=parse(previous,tag);
    if(!Number.isFinite(value)) throw new Error(\`Treasury \${label} unavailable\`);
    return {key,label,name:label,value:round(value,3),previousClose:Number.isFinite(prior)?round(prior,3):null,changeValue:Number.isFinite(prior)?round((value-prior)*100,1):null,changePct:Number.isFinite(prior)&&prior!==0?round((value/prior-1)*100,3):null,changeUnit:'bp',unit:'percent',observationDate:dateOf(current),asOf:dateOf(current),source:'U.S. Treasury Daily Treasury Par Yield Curve',provider:'U.S. Treasury',providerPriority:1,priceSession:'DAILY',sessionLabel:'공식 일일 기준'};
  });
}
`;

if (!text.includes('async function fetchTreasuryYields()')) {
  const marker='export async function fetchMarketSnapshot';
  if(!text.includes(marker)) throw new Error('fetchMarketSnapshot marker not found');
  text=text.replace(marker,treasuryBlock+'\n'+marker);
}

const needle='  const market=macroResults.filter(([row])=>row).map(([row])=>row);';
const replacement=`  const market=macroResults.filter(([row])=>row).map(([row])=>row);\n  try { market.push(...await fetchTreasuryYields()); }\n  catch (error) { for (const [key,label] of [['UST2Y','미 2년물'],['UST10Y','미 10년물'],['UST30Y','미 30년물']]) market.push({key,label,name:label,value:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'U.S. Treasury Daily Treasury Par Yield Curve',provider:'U.S. Treasury',error:error instanceof Error?error.message:'unavailable'}); }`;
if(text.includes(needle)) text=text.replace(needle,replacement);
else if(!text.includes('market.push(...await fetchTreasuryYields())')) throw new Error('market insertion point not found');

const oldSources='sources:[...new Set([...Object.values(symbols).map(r=>r.source),...market.map(r=>r.source)].filter(Boolean))]';
if(!text.includes(oldSources)) throw new Error('sources block not found');

fs.writeFileSync(path,text);
console.log('Patched market.js to use official U.S. Treasury Daily Treasury Par Yield Curve for 2Y/10Y/30Y yields.');
