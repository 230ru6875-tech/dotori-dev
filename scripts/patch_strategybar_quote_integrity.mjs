import fs from 'node:fs';

const path='strategybar-runtime/cloudflare/market.js';
let text=fs.readFileSync(path,'utf8');

const quotePattern=/function quoteFromResult\(symbol,result,name,category\)\{[\s\S]*?\}\nfunction macroFromResult/;
const quoteReplacement=String.raw`function quoteFromResult(symbol,result,name,category){
  const q=result.indicators?.quote?.[0]||{},m=result.meta||{};
  const closes=(q.close||[]).filter(finite).map(Number),highs=(q.high||[]).filter(finite).map(Number),lows=(q.low||[]).filter(finite).map(Number),volumes=(q.volume||[]).filter(finite).map(Number);
  const selected=selectYahooSessionQuote(result);
  const price=selected?.price??(finite(m.regularMarketPrice)?Number(m.regularMarketPrice):closes.at(-1));
  const histPrev=selected?.priceSession==='REGULAR'?closes.at(-2):closes.at(-1);
  const metaPrev=finite(m.chartPreviousClose)?Number(m.chartPreviousClose):finite(m.previousClose)?Number(m.previousClose):null;
  const previousClose=finite(histPrev)?Number(histPrev):(finite(metaPrev)?Number(metaPrev):null);
  if(!finite(price))throw new Error(symbol+' price missing');
  if(!finite(previousClose)||previousClose<=0)throw new Error(symbol+' previousClose missing');
  const signal=calculateSignal({price,previousClose,closes,highs,lows,volumes});
  return attachSeries({symbol,name,category,price:round(price),previousClose:round(previousClose),...signal,open:finite(m.regularMarketOpen)?round(m.regularMarketOpen):null,dayHigh:finite(m.regularMarketDayHigh)?round(m.regularMarketDayHigh):null,dayLow:finite(m.regularMarketDayLow)?round(m.regularMarketDayLow):null,volume:finite(m.regularMarketVolume)?Number(m.regularMarketVolume):volumes.at(-1)||null,marketState:selected?.marketState||m.marketState||null,priceSession:selected?.priceSession||'REGULAR',sessionLabel:selected?.sessionLabel||'정규장',asOf:selected?.timestamp?new Date(selected.timestamp*1000).toISOString():new Date().toISOString(),source:'Yahoo Finance',provider:'Yahoo',providerPriority:3},closes)}
function macroFromResult`;
if(!quotePattern.test(text)) throw new Error('quoteFromResult anchor not found');
text=text.replace(quotePattern,quoteReplacement);

const snapshotMarker='export async function fetchMarketSnapshot';
const goldHelper=String.raw`
async function fetchDomesticGold(){
  const url='https://m.stock.naver.com/marketindex/metals/M04020000';
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 StrategyBar/1.0','accept':'text/html'}});
  const html=await r.text();
  if(!r.ok)throw new Error('Naver gold HTTP '+r.status);
  const plain=html.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/,/g,'').replace(/\\s+/g,' ').trim();
  const m=plain.match(/국내 금\\s+([0-9]+(?:\\.[0-9]+)?)\\s*원\\/g\\s*([+-]?[0-9]+(?:\\.[0-9]+)?)\\s*\\(([+-]?[0-9]+(?:\\.[0-9]+)?)%\\)/i);
  if(!m)throw new Error('Naver gold parse failed');
  const value=Number(m[1]),changeValue=Number(m[2]),changePct=Number(m[3]);
  if(!(value>1000))throw new Error('Naver gold invalid value '+value);
  return {key:'M04020000',name:'금 1G 국내시세',label:'금 1G 국내시세',value,previousClose:round(value-changeValue),changeValue,changePct,unit:'krw_per_g',asOf:new Date().toISOString(),source:'Naver KRX 금시장',provider:'Naver',providerPriority:1,priceSession:'REGULAR',sessionLabel:'KRX'};
}
`;
if(!text.includes('async function fetchDomesticGold(')) text=text.replace(snapshotMarker,goldHelper+'\n'+snapshotMarker);

const marketAnchor='const market=macroResults.filter(([row])=>row).map(([row])=>row);';
if(!text.includes(marketAnchor)) throw new Error('market anchor not found');
text=text.replace(marketAnchor,marketAnchor+String.raw`
  try {
    const gold=await fetchDomesticGold();
    const gi=market.findIndex(x=>x.key==='M04020000');
    if(gi>=0)market[gi]=gold;else market.push(gold);
  } catch(error) {
    const row={key:'M04020000',name:'금 1G 국내시세',label:'금 1G 국내시세',value:null,source:'Naver KRX 금시장',provider:'Naver',error:error instanceof Error?error.message:String(error)};
    const gi=market.findIndex(x=>x.key==='M04020000');
    if(gi>=0)market[gi]=row;else market.push(row);
  }
  `);

fs.writeFileSync(path,text);
console.log('Patched stock previous-close integrity and Naver domestic gold feed.');
