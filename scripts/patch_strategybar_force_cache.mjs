import fs from 'node:fs';

const path='strategybar-runtime/cloudflare/index.js';
let text=fs.readFileSync(path,'utf8');
const old1='if (cached && (age<60000 || (force&&age<15000))) {';
const new1='if (cached && ((!force && age<60000) || (force && age<15000))) {';
const old2='if (cached && (age<60000 || (force&&age<15000))) return await overlayBrokerQuotes(env,cached.payload);';
const new2='if (cached && ((!force && age<60000) || (force && age<15000))) return await overlayBrokerQuotes(env,cached.payload);';
if (!text.includes(old1)) throw new Error('Base-market cache condition not found');
if (!text.includes(old2)) throw new Error('Extra-quote cache condition not found');
text=text.replace(old1,new1).replace(old2,new2);
fs.writeFileSync(path,text);
console.log('Patched force=1 cache semantics so refresh bypasses normal 60s cache.');
