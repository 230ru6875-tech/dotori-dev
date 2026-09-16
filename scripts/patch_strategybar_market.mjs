import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const treasuryBlock = String.raw`
function decodeInvestingText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&minus;|&#8722;/gi, '-')
    .replace(/&plus;/gi, '+')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInvestingTreasuryRow(plain, spec) {
  const escaped = spec.labelPattern;
  const re = new RegExp(
    escaped + '\\s+([0-9]+(?:\\.[0-9]+)?)' +
    '\\s+([0-9]+(?:\\.[0-9]+)?)' +
    '\\s+([0-9]+(?:\\.[0-9]+)?)' +
    '\\s+([0-9]+(?:\\.[0-9]+)?)' +
    '\\s+([+-]?[0-9]+(?:\\.[0-9]+)?)' +
    '\\s+([+-]?[0-9]+(?:\\.[0-9]+)?)%' +
    '\\s+([0-9]{1,2}:[0-9]{2}:[0-9]{2})',
    'i'
  );
  const match = plain.match(re);
  if (!match) throw new Error('Investing.com ' + spec.label + ' parse failed');
  const value = Number(match[1]);
  const previousClose = Number(match[2]);
  const dayHigh = Number(match[3]);
  const dayLow = Number(match[4]);
  const rawChange = Number(match[5]);
  const changePct = Number(match[6]);
  const asOf = match[7];
  if (![value, previousClose, dayHigh, dayLow, rawChange, changePct].every(Number.isFinite)) {
    throw new Error('Investing.com ' + spec.label + ' invalid numeric payload');
  }
  return {
    key: spec.key,
    label: spec.label,
    name: spec.label,
    value: round(value, 3),
    previousClose: round(previousClose, 3),
    dayHigh: round(dayHigh, 3),
    dayLow: round(dayLow, 3),
    changeValue: round(rawChange * 100, 1),
    changePct: round(changePct, 2),
    changeUnit: 'bp',
    unit: 'percent',
    asOf,
    source: 'Investing.com 미국 국채',
    provider: 'Investing.com',
    providerPriority: 1,
    priceSession: 'INTRADAY',
    sessionLabel: '장중'
  };
}

async function fetchTreasuryYields() {
  const url = 'https://kr.investing.com/rates-bonds/usa-government-bonds';
  const response = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'referer': 'https://kr.investing.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
    }
  });
  if (!response.ok) throw new Error('Investing.com bonds HTTP ' + response.status);
  const html = await response.text();
  const plain = decodeInvestingText(html);
  const specs = [
    { key: 'DGS2', label: '미 2년물', labelPattern: '미국\\s*2년(?:물)?' },
    { key: 'DGS10', label: '미 10년물', labelPattern: '미국\\s*10년물\\s*국채\\s*금리' },
    { key: 'DGS30', label: '미 30년물', labelPattern: '미국\\s*30년(?:물)?' }
  ];
  return specs.map((spec) => parseInvestingTreasuryRow(plain, spec));
}
`;

const start = text.indexOf('function decodeInvestingText(');
const legacyStart = text.indexOf('async function fetchOfficialTreasuryYields()');
const oldStart = text.indexOf('async function fetchTreasuryYields()');
const blockStart = start >= 0 ? start : legacyStart >= 0 ? legacyStart : oldStart;
if (blockStart >= 0) {
  const end = text.indexOf('\nexport async function fetchMarketSnapshot', blockStart);
  if (end < 0) throw new Error('Treasury block end not found');
  text = text.slice(0, blockStart) + treasuryBlock + '\n' + text.slice(end + 1);
} else {
  const marker = 'export async function fetchMarketSnapshot';
  if (!text.includes(marker)) throw new Error('fetchMarketSnapshot marker not found');
  text = text.replace(marker, treasuryBlock + '\n' + marker);
}

const needle = '  const market=macroResults.filter(([row])=>row).map(([row])=>row);';
const insert = "\n  try { market.push(...await fetchTreasuryYields()); } catch (error) { const message=error instanceof Error?error.message:String(error); for (const [key,label] of [['DGS2','미 2년물'],['DGS10','미 10년물'],['DGS30','미 30년물']]) market.push({key,label,name:label,value:null,previousClose:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'Investing.com 미국 국채',provider:'Investing.com',error:message}); }";
if (!text.includes('market.push(...await fetchTreasuryYields())')) {
  if (!text.includes(needle)) throw new Error('market insertion point not found');
  text = text.replace(needle, needle + insert);
}

fs.writeFileSync(path, text);
console.log('Patched market.js: Investing.com DGS2/DGS10/DGS30 intraday Treasury yields.');
