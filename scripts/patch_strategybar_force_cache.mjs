import fs from 'node:fs';

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

fs.writeFileSync(path,text);
console.log('Patched StrategyBar cache: force=1 always refreshes; base cache key is market:base:v3.');
