import fs from 'node:fs';

const path='strategybar-runtime/cloudflare/market.js';
let text=fs.readFileSync(path,'utf8');

const pattern=/export function applyExternalSessionQuote\(row=\{\},quote=\{\}\)\{[\s\S]*?\}\nasync function resilientVix/;
const replacement=String.raw`export function applyExternalSessionQuote(row={},quote={}){
  if(!finite(quote.price))return row;
  const price=Number(quote.price),previousClose=finite(quote.previousClose)?Number(quote.previousClose):row.previousClose;
  const changePct=finite(previousClose)&&previousClose!==0?(price/previousClose-1)*100:row.changePct;
  return {
    ...row,
    price:round(price),previousClose:round(previousClose),changePct:round(changePct),
    open:finite(quote.open)?round(quote.open):row.open,
    dayHigh:finite(quote.dayHigh)?round(quote.dayHigh):row.dayHigh,
    dayLow:finite(quote.dayLow)?round(quote.dayLow):row.dayLow,
    volume:finite(quote.volume)?Number(quote.volume):row.volume,
    vwap:finite(quote.vwap)?round(quote.vwap):row.vwap,
    bidPrice:finite(quote.bidPrice)?round(quote.bidPrice):row.bidPrice,
    askPrice:finite(quote.askPrice)?round(quote.askPrice):row.askPrice,
    bidSize:finite(quote.bidSize)?Number(quote.bidSize):row.bidSize,
    askSize:finite(quote.askSize)?Number(quote.askSize):row.askSize,
    priceSession:quote.priceSession||row.priceSession,
    sessionLabel:quote.sessionLabel||SESSION_LABELS[quote.priceSession]||row.sessionLabel,
    asOf:quote.asOf||row.asOf,
    source:quote.source||row.source,
    provider:quote.provider||row.provider,
    providerPriority:quote.providerPriority??row.providerPriority,
  };
}
async function resilientVix`;

if(!pattern.test(text)) throw new Error('applyExternalSessionQuote anchor not found');
text=text.replace(pattern,replacement);
fs.writeFileSync(path,text);
console.log('Patched StrategyBar external quote overlay for Alpaca OHLC/VWAP/bid-ask fields.');
