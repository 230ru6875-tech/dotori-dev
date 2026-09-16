import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const path='strategybar-runtime/cloudflare/index.js';
let text=fs.readFileSync(path,'utf8');

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

text=text.replaceAll('"market:base"','"market:base:v3"');
text=text.replaceAll('"market:base:v2"','"market:base:v3"');

const brokerGuard='if (!quotes[row.key]) return row;';
const brokerGuardReplacement="if (!quotes[row.key]) return row;\n    if (['DGS2','DGS10','DGS30'].includes(row.key) && String(row.provider||'')==='Npay 증권') return row;";
if (text.includes(brokerGuard) && !text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) {
  text=text.replace(brokerGuard,brokerGuardReplacement);
  changed=true;
}
if (!text.includes("['DGS2','DGS10','DGS30'].includes(row.key)")) {
  throw new Error('Treasury broker overlay guard not applied');
}

fs.writeFileSync(path,text);

for (const file of ['strategybar-runtime/cloudflare/market.js','strategybar-runtime/cloudflare/index.js']) {
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
console.log('Patched StrategyBar cache, protected Npay Treasury yields, and syntax-checked generated Worker code.');
