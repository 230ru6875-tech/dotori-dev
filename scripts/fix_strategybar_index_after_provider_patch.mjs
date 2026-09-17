import fs from 'node:fs';
const path='strategybar-runtime/cloudflare/index.js';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  /async function saveAnalysis\(env,key,analysis\)\s*\{[\s\S]*?\n\}/,
  `async function saveAnalysis(env,key,analysis) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO ai_analysis(analysis_key,payload,generated_at) VALUES(?,?,?) ON CONFLICT(analysis_key) DO UPDATE SET payload=excluded.payload,generated_at=excluded.generated_at")
    .bind(key,JSON.stringify(analysis),now()).run();
}`
);

text=text.replace(
  'await env.DB.prepare("INSERT OR IGNORE INTO ai_quota(day,used) VALUES(?,0)").bind(day,limit).run();',
  'await env.DB.prepare("INSERT OR IGNORE INTO ai_quota(day,used) VALUES(?,0)").bind(day).run();'
);

if (!text.includes('async function readDurableLiveQuotes(')) {
  const anchor='async function readBrokerQuotes(env, symbols) {';
  if(!text.includes(anchor)) throw new Error('readBrokerQuotes anchor missing');
  const liveReader=`async function readDurableLiveQuotes(env, symbols) {
  if (!env.LIVE_QUOTES || !symbols.length) return {};
  const unique=[...new Set(symbols.filter(validSymbol))].slice(0,200);
  if (!unique.length) return {};
  try {
    const id=env.LIVE_QUOTES.idFromName("holdings-live");
    const stub=env.LIVE_QUOTES.get(id);
    const response=await stub.fetch("https://live.internal/latest?symbols="+encodeURIComponent(unique.join(",")));
    if (!response.ok) return {};
    const payload=await response.json();
    const maxAge=Math.max(5000,Number(env.LIVE_QUOTE_MAX_AGE_MS||20000));
    const cutoff=Date.now()-maxAge;
    return Object.fromEntries((payload.quotes||[]).filter((quote)=>{
      const t=Date.parse(quote?.receivedAt||quote?.asOf||0);
      return quote?.symbol && Number.isFinite(t) && t>=cutoff;
    }).map((quote)=>[String(quote.symbol).toUpperCase(),quote]));
  } catch { return {}; }
}

`;
  text=text.replace(anchor,liveReader+anchor);
}

text=text.replace(
  'const quotes=await readBrokerQuotes(env,keys);',
  'const [persistedQuotes,liveQuotes]=await Promise.all([readBrokerQuotes(env,keys),readDurableLiveQuotes(env,keys)]);\n  const quotes={...persistedQuotes,...liveQuotes};'
);

const saveStart=text.indexOf('async function saveAnalysis(');
const quotaStart=text.indexOf('async function claimQuota(');
if(saveStart<0 || quotaStart<0) throw new Error('analysis function anchors missing');
const saveBlock=text.slice(saveStart,quotaStart);
if(!saveBlock.includes('JSON.stringify(analysis)')) throw new Error('saveAnalysis fix not applied');
if(saveBlock.includes('JSON.stringify(payload)')) throw new Error('saveAnalysis still references payload');
const quotaEnd=text.indexOf('function compactMarket',quotaStart);
const quotaBlock=text.slice(quotaStart,quotaEnd);
if(quotaBlock.includes('VALUES(?,0)").bind(day,limit)')) throw new Error('claimQuota bind bug still present');
if(!text.includes('async function readDurableLiveQuotes(')) throw new Error('Durable Object live reader not installed');
if(!text.includes('const quotes={...persistedQuotes,...liveQuotes};')) throw new Error('live quote overlay not installed');

fs.writeFileSync(path,text);
console.log('Fixed StrategyBar index and overlaid fresh Durable Object live quotes into /api/market.');
