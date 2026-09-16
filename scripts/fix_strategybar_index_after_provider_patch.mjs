import fs from 'node:fs';
const path='strategybar-runtime/cloudflare/index.js';
let text=fs.readFileSync(path,'utf8');
text=text.replace('.bind(key,JSON.stringify(payload),now()).run();','.bind(key,JSON.stringify(analysis),now()).run();');
text=text.replace('INSERT OR IGNORE INTO ai_quota(day,used) VALUES(?,0)").bind(day,limit).run();','INSERT OR IGNORE INTO ai_quota(day,used) VALUES(?,0)").bind(day).run();');
if(text.includes('JSON.stringify(payload)')) throw new Error('saveAnalysis payload bug still present');
if(text.includes('VALUES(?,0)").bind(day,limit)')) throw new Error('claimQuota bind bug still present');
fs.writeFileSync(path,text);
console.log('Fixed StrategyBar index post-provider patch without changing provider logic.');
