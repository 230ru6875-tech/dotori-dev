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

const saveStart=text.indexOf('async function saveAnalysis(');
const quotaStart=text.indexOf('async function claimQuota(');
if(saveStart<0 || quotaStart<0) throw new Error('analysis function anchors missing');
const saveBlock=text.slice(saveStart,quotaStart);
if(!saveBlock.includes('JSON.stringify(analysis)')) throw new Error('saveAnalysis fix not applied');
if(saveBlock.includes('JSON.stringify(payload)')) throw new Error('saveAnalysis still references payload');
const quotaEnd=text.indexOf('function compactMarket',quotaStart);
const quotaBlock=text.slice(quotaStart,quotaEnd);
if(quotaBlock.includes('VALUES(?,0)").bind(day,limit)')) throw new Error('claimQuota bind bug still present');

fs.writeFileSync(path,text);
console.log('Fixed StrategyBar index post-provider patch with function-scoped validation.');
