export const STOCKS = {
  IONQ:["아이온큐","양자"],SNDK:["샌디스크","반도체"],AVGO:["브로드컴","반도체"],ORCL:["오라클","AI 인프라"],QLD:["나스닥 2배","ETF"],
  NVDA:["엔비디아","반도체"],AMD:["AMD","반도체"],TSM:["TSMC","반도체"],ASML:["ASML","반도체"],MU:["마이크론","반도체"],ARM:["Arm","반도체"],
  PLTR:["팔란티어","AI 소프트웨어"],CRWV:["코어위브","AI 인프라"],VRT:["버티브","AI 인프라"],IREN:["IREN","AI 인프라"],NBIS:["네비우스","AI 인프라"],
  RKLB:["로켓랩","우주"],ASTS:["AST 스페이스모바일","우주"],QBTS:["D-Wave","양자"],RGTI:["리게티","양자"],OKLO:["오클로","원전"],SMR:["NuScale","원전"],LEU:["센트러스","원전"],
  COIN:["코인베이스","디지털자산"],MSTR:["스트래티지","디지털자산"],HOOD:["로빈후드","핀테크"],TSLA:["테슬라","모빌리티"],
  SPY:["S&P 500","ETF"],QQQ:["나스닥 100","ETF"],SMH:["반도체 ETF","ETF"],SOXX:["반도체 ETF","ETF"],IWM:["러셀 2000","ETF"],GLD:["금 ETF","ETF"],TLT:["미 장기채","ETF"],XLE:["에너지 ETF","ETF"],XLF:["금융 ETF","ETF"],
};

export const MACROS = [
  ["^GSPC","S&P 500","index"],["^NDX","나스닥 100","index"],["^SOX","필라델피아 반도체","index"],["^RUT","러셀 2000","index"],["^VIX","VIX","index"],
  ["DX-Y.NYB","DXY","index"],["KRW=X","USD/KRW","index"],["CL=F","WTI","usd"],
];

const finite = (value) => value !== null && value !== undefined
  && (typeof value !== "string" || value.trim() !== "")
  && Number.isFinite(Number(value));
const round = (value, digits = 2) => finite(value) ? Number(Number(value).toFixed(digits)) : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const sma = (values, period) => values.length >= period ? average(values.slice(-period)) : average(values);
const SESSION_LABELS = { PREMARKET:"프리마켓", REGULAR:"정규장", AFTER_HOURS:"시간외" };

function attachSeries(row, series) {
  Object.defineProperty(row, "_series", { value:series, enumerable:false, configurable:true });
  return row;
}

function latestFinitePoint(result) {
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const timestamps = result?.timestamp || [];
  for (let index = Math.min(closes.length, timestamps.length) - 1; index >= 0; index -= 1) {
    if (finite(closes[index]) && finite(timestamps[index])) return { price:Number(closes[index]), timestamp:Number(timestamps[index]) };
  }
  return null;
}

function periodSession(meta, timestamp) {
  const periods = meta.currentTradingPeriod || {};
  for (const [key, session] of [["pre","PREMARKET"],["regular","REGULAR"],["post","AFTER_HOURS"]]) {
    const period = periods[key];
    if (finite(period?.start) && finite(period?.end) && timestamp >= Number(period.start) && timestamp <= Number(period.end)) return session;
  }
  return null;
}

export function selectYahooSessionQuote(result = {}) {
  const meta = result.meta || {};
  const marketState = String(meta.marketState || "CLOSED").toUpperCase();
  const explicit = {
    PREMARKET: finite(meta.preMarketPrice) ? { price:Number(meta.preMarketPrice), timestamp:Number(meta.preMarketTime || 0) } : null,
    REGULAR: finite(meta.regularMarketPrice) ? { price:Number(meta.regularMarketPrice), timestamp:Number(meta.regularMarketTime || 0) } : null,
    AFTER_HOURS: finite(meta.postMarketPrice) ? { price:Number(meta.postMarketPrice), timestamp:Number(meta.postMarketTime || 0) } : null,
  };
  const latest = latestFinitePoint(result);
  const stateSession = marketState.startsWith("PRE") ? "PREMARKET" : marketState.startsWith("POST") ? "AFTER_HOURS" : marketState === "REGULAR" ? "REGULAR" : null;
  const latestSession = latest ? (stateSession || periodSession(meta, latest.timestamp)
    || (finite(meta.regularMarketTime) && latest.timestamp > Number(meta.regularMarketTime) ? "AFTER_HOURS" : "REGULAR")) : null;

  let selected = null;
  if (stateSession) {
    const candidates = [explicit[stateSession], latest && latestSession === stateSession ? latest : null].filter(Boolean);
    selected = candidates.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))[0] || explicit.REGULAR || latest;
  }
  else {
    const candidates = Object.entries(explicit).filter(([,quote])=>quote).map(([session,quote])=>({...quote,session}));
    if (latest) candidates.push({...latest,session:latestSession || "REGULAR"});
    selected = candidates.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))[0] || null;
  }
  if (!selected || !finite(selected.price)) return null;
  const priceSession = selected.session || (selected === explicit.PREMARKET ? "PREMARKET" : selected === explicit.AFTER_HOURS ? "AFTER_HOURS" : stateSession || latestSession || "REGULAR");
  return { price:Number(selected.price), timestamp:Number(selected.timestamp || meta.regularMarketTime || 0), priceSession,
    sessionLabel:SESSION_LABELS[priceSession] || "정규장", marketState };
}

export function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  const changes = values.slice(1).map((value, index) => value - values[index]).slice(-period);
  const gains = changes.map((x) => Math.max(0, x));
  const losses = changes.map((x) => Math.max(0, -x));
  const avgGain = average(gains);
  const avgLoss = average(losses);
  if (!avgLoss) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function volatility(values, period = 20) {
  const sample = values.slice(-(period + 1));
  if (sample.length < 3) return null;
  const returns = sample.slice(1).map((value, index) => Math.log(value / sample[index])).filter(finite);
  const mean = average(returns);
  const variance = average(returns.map((x) => (x - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function calculateSignal({ price, previousClose, closes, highs, lows, volumes }) {
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60), momentum = rsi(closes);
  const vol = volatility(closes);
  const recentVolumes = volumes.filter(finite).slice(-21), currentVolume = recentVolumes.at(-1);
  const baseVolume = average(recentVolumes.slice(0, -1));
  const volumeRatio = finite(currentVolume) && finite(baseVolume) && baseVolume > 0 ? currentVolume / baseVolume : null;
  const ma20Gap = finite(ma20) ? (price / ma20 - 1) * 100 : null;
  const ma60Gap = finite(ma60) ? (price / ma60 - 1) * 100 : null;
  const changePct = finite(previousClose) && previousClose !== 0 ? (price / previousClose - 1) * 100 : null;
  const support = Math.min(...lows.filter(finite).slice(-20));
  const resistance = Math.max(...highs.filter(finite).slice(-20));
  let score = 50;
  if (finite(ma20Gap)) score += ma20Gap > 0 ? 12 : -12;
  if (finite(ma60Gap)) score += ma60Gap > 0 ? 10 : -10;
  if (finite(ma20) && finite(ma60)) score += ma20 > ma60 ? 8 : -8;
  if (finite(momentum)) score += momentum >= 50 && momentum <= 68 ? 8 : momentum > 78 ? -14 : momentum < 32 ? -6 : 0;
  if (finite(volumeRatio)) score += volumeRatio >= 1.5 ? 8 : volumeRatio >= 1.1 ? 4 : 0;
  if (finite(changePct)) score += changePct > 0 ? 4 : -4;
  if (finite(vol) && vol > 90) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const signal = momentum > 78 || score <= 34 ? "주의" : score >= 70 ? "주목" : score >= 58 ? "관찰" : "대기";
  const reasons = [];
  if (finite(ma20Gap)) reasons.push(`20일선 대비 ${ma20Gap >= 0 ? "상단" : "하단"} ${Math.abs(ma20Gap).toFixed(1)}%`);
  if (finite(momentum)) reasons.push(`RSI ${momentum.toFixed(0)} · ${momentum > 70 ? "과열 확인" : momentum < 35 ? "약세·과매도 확인" : "중립 범위"}`);
  if (finite(volumeRatio)) reasons.push(`20일 평균 대비 거래량 ${volumeRatio.toFixed(2)}배`);
  return { changePct:round(changePct), score, signal, rsi:round(momentum,1), ma20Gap:round(ma20Gap), ma60Gap:round(ma60Gap),
    volumeRatio:round(volumeRatio), volatility20:round(vol,1), support:finite(support)?round(support):null, resistance:finite(resistance)?round(resistance):null,
    trend:finite(ma20)&&finite(ma60)?(price>ma20&&ma20>ma60?"상승":price<ma20&&ma20<ma60?"하락":"혼조"):"확인 중", reasons };
}

async function yahooChart(symbol, range = "6mo", interval = "1d") {
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true&events=div%2Csplits`;
  const response=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 StrategyBar/1.0","accept":"application/json"}});
  if(!response.ok) throw new Error(`Yahoo ${symbol} HTTP ${response.status}`);
  const payload=await response.json();
  const result=payload?.chart?.result?.[0];
  if(!result) throw new Error(`Yahoo ${symbol} empty`);
  return result;
}

function quoteFromResult(symbol, result, name, category) {
  const q=result.indicators?.quote?.[0]||{}, meta=result.meta||{};
  const closes=(q.close||[]).filter(finite).map(Number), highs=(q.high||[]).filter(finite).map(Number), lows=(q.low||[]).filter(finite).map(Number), volumes=(q.volume||[]).filter(finite).map(Number);
  const selected=selectYahooSessionQuote(result);
  const price=selected?.price ?? (finite(meta.regularMarketPrice)?Number(meta.regularMarketPrice):closes.at(-1));
  const previousClose=finite(meta.chartPreviousClose)?Number(meta.chartPreviousClose):finite(meta.previousClose)?Number(meta.previousClose):closes.at(-2);
  if(!finite(price)) throw new Error(`${symbol} price missing`);
  const signal=calculateSignal({price,previousClose,closes,highs,lows,volumes});
  return attachSeries({symbol,name,category,price:round(price),previousClose:round(previousClose),...signal,open:finite(meta.regularMarketOpen)?round(meta.regularMarketOpen):null,dayHigh:finite(meta.regularMarketDayHigh)?round(meta.regularMarketDayHigh):null,dayLow:finite(meta.regularMarketDayLow)?round(meta.regularMarketDayLow):null,volume:finite(meta.regularMarketVolume)?Number(meta.regularMarketVolume):volumes.at(-1)||null,marketState:selected?.marketState||meta.marketState||null,priceSession:selected?.priceSession||"REGULAR",sessionLabel:selected?.sessionLabel||"정규장",asOf:selected?.timestamp?new Date(selected.timestamp*1000).toISOString():new Date().toISOString(),source:"Yahoo Finance",provider:"Yahoo",providerPriority:3},closes);
}

function macroFromResult(key, result, name, unit) {
  const q=result.indicators?.quote?.[0]||{}, meta=result.meta||{};
  const selected=selectYahooSessionQuote(result);
  const closes=(q.close||[]).filter(finite).map(Number);
  const value=selected?.price ?? (finite(meta.regularMarketPrice)?Number(meta.regularMarketPrice):closes.at(-1));
  const prev=finite(meta.chartPreviousClose)?Number(meta.chartPreviousClose):finite(meta.previousClose)?Number(meta.previousClose):closes.at(-2);
  return {key,name,unit,value:round(value),previousClose:round(prev),changePct:finite(value)&&finite(prev)&&prev!==0?round((value/prev-1)*100):null,changeValue:finite(value)&&finite(prev)?round(value-prev):null,asOf:selected?.timestamp?new Date(selected.timestamp*1000).toISOString():new Date().toISOString(),source:"Yahoo Finance",provider:"Yahoo",providerPriority:3,priceSession:selected?.priceSession||"REGULAR",sessionLabel:selected?.sessionLabel||"정규장"};
}

export function applyExternalSessionQuote(row = {}, quote = {}) {
  if(!finite(quote.price)) return row;
  const price=Number(quote.price), previousClose=finite(quote.previousClose)?Number(quote.previousClose):row.previousClose;
  const changePct=finite(previousClose)&&previousClose!==0?(price/previousClose-1)*100:row.changePct;
  return {...row,price:round(price),previousClose:round(previousClose),changePct:round(changePct),priceSession:quote.priceSession||row.priceSession,sessionLabel:quote.sessionLabel||SESSION_LABELS[quote.priceSession]||row.sessionLabel,asOf:quote.asOf||row.asOf,source:quote.source||row.source,provider:quote.provider||row.provider,providerPriority:quote.providerPriority??row.providerPriority};
}

export async function fetchMarketSnapshot(stockEntries = Object.entries(STOCKS), extraSymbol = null) {
  const stockPairs=[...stockEntries];
  if(extraSymbol&&!STOCKS[extraSymbol]) stockPairs.push([extraSymbol,[extraSymbol,"사용자 추가"]]);
  const stockResults=await Promise.all(stockPairs.map(async([symbol,[name,category]])=>{try{return [symbol,quoteFromResult(symbol,await yahooChart(symbol),name,category),null]}catch(error){return [symbol,null,error instanceof Error?error.message:String(error)]}}));
  const macroResults=await Promise.all(MACROS.map(async([key,name,unit])=>{try{return [macroFromResult(key,await yahooChart(key,"5d","5m"),name,unit),null]}catch(error){return [null,`${name}: ${error instanceof Error?error.message:String(error)}`]}}));
  const symbols=Object.fromEntries(stockResults.filter(([,row])=>row).map(([symbol,row])=>[symbol,row]));
  const market=macroResults.filter(([row])=>row).map(([row])=>row);
  const errors=[...stockResults.filter(([,row,error])=>!row&&error).map(([symbol,,error])=>({symbol,error})),...macroResults.filter(([,error])=>error).map(([,error])=>({symbol:"macro",error}))];
  return {ok:Object.keys(symbols).length>0,asOf:new Date().toISOString(),session:symbols.SPY?.priceSession||"REGULAR",symbols,market,errors,sources:[...new Set([...Object.values(symbols).map(r=>r.source),...market.map(r=>r.source)].filter(Boolean))]};
}
