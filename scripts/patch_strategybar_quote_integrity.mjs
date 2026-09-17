import fs from 'node:fs';

const path='strategybar-runtime/cloudflare/market.js';
let text=fs.readFileSync(path,'utf8');

const quotePattern=/function quoteFromResult\(symbol,result,name,category\)\{[\s\S]*?\}\nfunction macroFromResult/;
const quoteReplacement=String.raw`function quoteFromResults(symbol,dailyResult,intradayResult,name,category){
  const q=dailyResult.indicators?.quote?.[0]||{},m=dailyResult.meta||{};
  const closes=(q.close||[]).filter(finite).map(Number),highs=(q.high||[]).filter(finite).map(Number),lows=(q.low||[]).filter(finite).map(Number),volumes=(q.volume||[]).filter(finite).map(Number);
  const usedIntraday=Boolean(intradayResult&&intradayResult!==dailyResult);
  const selected=selectYahooSessionQuote(intradayResult)||selectYahooSessionQuote(dailyResult);
  const price=selected?.price??(finite(m.regularMarketPrice)?Number(m.regularMarketPrice):closes.at(-1));
  const dailyTimes=dailyResult.timestamp||[];
  let lastDailyIndex=-1;
  for(let i=Math.min((q.close||[]).length,dailyTimes.length)-1;i>=0;i--){if(finite(q.close?.[i])&&finite(dailyTimes[i])){lastDailyIndex=i;break;}}
  const lastDailyClose=lastDailyIndex>=0?Number(q.close[lastDailyIndex]):closes.at(-1);
  let previousClose=lastDailyIndex>0?Number(q.close[lastDailyIndex-1]):closes.at(-2);
  if(selected?.timestamp&&lastDailyIndex>=0){
    const selectedDay=new Date(Number(selected.timestamp)*1000).toISOString().slice(0,10);
    const dailyDay=new Date(Number(dailyTimes[lastDailyIndex])*1000).toISOString().slice(0,10);
    if(selectedDay!==dailyDay&&finite(lastDailyClose))previousClose=lastDailyClose;
  }
  if(!finite(previousClose)){previousClose=finite(m.chartPreviousClose)?Number(m.chartPreviousClose):finite(m.previousClose)?Number(m.previousClose):closes.at(-2);}
  if(!finite(price))throw new Error(symbol+' price missing');
  if(!finite(previousClose)||previousClose<=0)throw new Error(symbol+' previousClose missing');
  const signal=calculateSignal({price,previousClose,closes,highs,lows,volumes});
  const im=intradayResult?.meta||{};
  return attachSeries({symbol,name,category,price:round(price),previousClose:round(previousClose),...signal,open:finite(im.regularMarketOpen)?round(im.regularMarketOpen):finite(m.regularMarketOpen)?round(m.regularMarketOpen):null,dayHigh:finite(im.regularMarketDayHigh)?round(im.regularMarketDayHigh):finite(m.regularMarketDayHigh)?round(m.regularMarketDayHigh):null,dayLow:finite(im.regularMarketDayLow)?round(im.regularMarketDayLow):finite(m.regularMarketDayLow)?round(m.regularMarketDayLow):null,volume:finite(im.regularMarketVolume)?Number(im.regularMarketVolume):finite(m.regularMarketVolume)?Number(m.regularMarketVolume):volumes.at(-1)||null,marketState:selected?.marketState||im.marketState||m.marketState||null,priceSession:selected?.priceSession||'REGULAR',sessionLabel:selected?.sessionLabel||'정규장',asOf:selected?.timestamp?new Date(selected.timestamp*1000).toISOString():new Date().toISOString(),source:usedIntraday?'Yahoo Finance intraday':'Yahoo Finance daily/meta',provider:'Yahoo',providerPriority:3},closes)}
function macroFromResult`;
if(quotePattern.test(text)) text=text.replace(quotePattern,quoteReplacement);
else if(!text.includes('function quoteFromResults(')) throw new Error('quote function anchor not found');

const stockOld='const stockResults=await Promise.all(stockPairs.map(async([symbol,[name,category]])=>{try{return[symbol,quoteFromResult(symbol,await yahooChart(symbol),name,category),null]}catch(error){return[symbol,null,error instanceof Error?error.message:String(error)]}}));';
const stockNew=String.raw`const intradaySymbols=new Set(['SNDK','IONQ']);
  const stockResults=await Promise.all(stockPairs.map(async([symbol,[name,category]])=>{try{
    const daily=await yahooChart(symbol,'6mo','1d');
    const needIntraday=intradaySymbols.has(symbol)||symbol===extraSymbol;
    const intraday=needIntraday?await yahooChart(symbol,'5d','5m'):daily;
    return[symbol,quoteFromResults(symbol,daily,intraday,name,category),null];
  }catch(error){return[symbol,null,error instanceof Error?error.message:String(error)]}}));`;
if(text.includes(stockOld)) text=text.replace(stockOld,stockNew);
else if(!text.includes("const intradaySymbols=new Set(['SNDK','IONQ'])")) throw new Error('stockResults anchor not found');

const snapshotMarker='export async function fetchMarketSnapshot';
const goldHelper=String.raw`
async function fetchDomesticGold(){
  const url='https://m.stock.naver.com/marketindex/metals/M04020000';
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 StrategyBar/1.0','accept':'text/html'}});
  const html=await r.text();
  if(!r.ok)throw new Error('Naver gold HTTP '+r.status);
  const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/,/g,'').replace(/\s+/g,' ').trim();
  const candidates=[...plain.matchAll(/([0-9]{5,7}(?:\.[0-9]+)?)/g)].map(x=>Number(x[1])).filter(x=>x>50000&&x<1000000);
  const value=candidates[0];
  if(!finite(value))throw new Error('Naver gold parse failed');
  return {key:'M04020000',name:'금 1G 국내시세',label:'금 1G 국내시세',value:round(value,0),previousClose:null,changeValue:null,changePct:null,unit:'krw_per_g',asOf:new Date().toISOString(),source:'Naver KRX 금시장',provider:'Naver',providerPriority:1,priceSession:'REGULAR',sessionLabel:'KRX'};
}
`;
if(!text.includes('async function fetchDomesticGold(')) text=text.replace(snapshotMarker,goldHelper+'\n'+snapshotMarker);

const marketAnchor='const market=macroResults.filter(([row])=>row).map(([row])=>row);';
if(!text.includes('const gold=await fetchDomesticGold();')){
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
}

fs.writeFileSync(path,text);
console.log('Patched StrategyBar: daily signals for all stocks, 5m intraday only for SNDK/IONQ, previous-close integrity, domestic gold.');
