export const STOCKS = {
  IONQ:["아이온큐","양자"],SNDK:["샌디스크","반도체"],AVGO:["브로드컴","반도체"],ORCL:["오라클","AI 인프라"],QLD:["나스닥 2배","ETF"],
  NVDA:["엔비디아","반도체"],AMD:["AMD","반도체"],TSM:["TSMC","반도체"],ASML:["ASML","반도체"],MU:["마이크론","반도체"],ARM:["Arm","반도체"],
  PLTR:["팔란티어","AI 소프트웨어"],CRWV:["코어위브","AI 인프라"],VRT:["버티브","AI 인프라"],IREN:["IREN","AI 인프라"],NBIS:["네비우스","AI 인프라"],
  RKLB:["로켓랩","우주"],ASTS:["AST 스페이스모바일","우주"],QBTS:["D-Wave","양자"],RGTI:["리게티","양자"],OKLO:["오클로","원전"],SMR:["NuScale","원전"],LEU:["센트러스","원전"],
  COIN:["코인베이스","디지털자산"],MSTR:["스트래티지","디지털자산"],HOOD:["로빈후드","핀테크"],TSLA:["테슬라","모빌리티"],
  SPY:["S&P 500","ETF"],QQQ:["나스닥 100","ETF"],SMH:["반도체 ETF","ETF"],SOXX:["반도체 ETF","ETF"],IWM:["러셀 2000","ETF"],GLD:["금 ETF","ETF"],TLT:["미 장기채","ETF"],XLE:["에너지 ETF","ETF"],XLF:["금융 ETF","ETF"],
};

export const MACROS = [
  ["^GSPC","S&P 500","index"],["^NDX","나스닥 100","index"],["^SOX","필라델피아 반도체","index"],["^RUT","러셀 2000","index"],
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
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60), momentum = rsi(closes), vol = volatility(closes);
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

export function parseYahoo(result, symbol) {
  const meta = result.meta || {}, quote = result.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter(finite).map(Number);
  const highs = (quote.high || []).filter(finite).map(Number), lows = (quote.low || []).filter(finite).map(Number), volumes = (quote.volume || []).filter(finite).map(Number);
  const selected = selectYahooSessionQuote(result);
  const price = Number(selected?.price ?? meta.regularMarketPrice ?? closes.at(-1));
  const previousClose = Number(meta.regularMarketPreviousClose ?? meta.previousClose ?? closes.at(-2));
  if (!finite(price) || !closes.length) throw new Error(`No quote for ${symbol}`);
  const calculated = calculateSignal({ price, previousClose, closes, highs, lows, volumes });
  const known = STOCKS[symbol];
  return attachSeries({ symbol, name:known?.[0] || meta.shortName || meta.longName || symbol, shortName:meta.shortName || symbol, category:known?.[1] || "사용자추가",
    price:round(price), previousClose:round(previousClose), open:round(meta.regularMarketOpen ?? quote.open?.at(-1)), dayHigh:round(meta.regularMarketDayHigh ?? highs.at(-1)),
    dayLow:round(meta.regularMarketDayLow ?? lows.at(-1)), currency:meta.currency || "USD", exchange:meta.exchangeName || null, marketState:meta.marketState || "CLOSED",
    priceSession:selected?.priceSession || "REGULAR", sessionLabel:selected?.sessionLabel || "정규장",
    asOf:new Date((selected?.timestamp || meta.regularMarketTime || result.timestamp?.at(-1) || Date.now()/1000)*1000).toISOString(), asOfLabel:selected?.sessionLabel || "정규장",
    source:"Yahoo Finance chart", provider:"YAHOO", providerPriority:3, ...calculated }, {closes,highs,lows,volumes});
}

export function applyYahooSessionQuote(row, result) {
  const selected = selectYahooSessionQuote(result);
  if (!selected || !finite(selected.price)) return row;
  const currentTimestamp = Date.parse(row.asOf || "") / 1000;
  if (finite(currentTimestamp) && selected.timestamp && selected.timestamp < currentTimestamp) return row;
  const price = Number(selected.price);
  const series = row._series;
  const calculated = series ? calculateSignal({price,previousClose:row.previousClose,...series}) : {
    changePct:finite(row.previousClose)&&Number(row.previousClose)!==0?round((price/Number(row.previousClose)-1)*100):row.changePct,
  };
  return attachSeries({...row,price:round(price),marketState:selected.marketState,priceSession:selected.priceSession,sessionLabel:selected.sessionLabel,
    asOf:new Date((selected.timestamp || Date.now()/1000)*1000).toISOString(),asOfLabel:selected.sessionLabel,
    source:selected.priceSession === "REGULAR" ? row.source : "Yahoo Finance chart · extended hours",provider:"YAHOO",providerPriority:3,...calculated}, series);
}

export function applyExternalSessionQuote(row, quote) {
  if (!row || !quote || !finite(quote.price)) return row;
  const quoteTimestamp = Number.isFinite(Number(quote.timestamp)) ? Number(quote.timestamp) * (Number(quote.timestamp) > 1e12 ? 0.001 : 1) : Date.parse(quote.asOf || "") / 1000;
  if (!finite(quoteTimestamp)) return row;
  const currentTimestamp = Date.parse(row.asOf || "") / 1000;
  if (finite(currentTimestamp) && quoteTimestamp < currentTimestamp - 120) return row;
  const price = Number(quote.price);
  const previousClose = finite(quote.previousClose) && Number(quote.previousClose) > 0 ? Number(quote.previousClose) : row.previousClose;
  const series = row._series;
  const calculated = series ? calculateSignal({price,previousClose,...series}) : {
    changePct:finite(previousClose)&&Number(previousClose)!==0?round((price/Number(previousClose)-1)*100):row.changePct,
  };
  const priceSession = SESSION_LABELS[quote.priceSession] ? quote.priceSession : "REGULAR";
  const provider = String(quote.provider || "YAHOO").toUpperCase();
  return attachSeries({...row,price:round(price),previousClose:finite(previousClose)?round(previousClose):row.previousClose,currency:quote.currency || row.currency,marketState:quote.marketState || priceSession,
    priceSession,sessionLabel:SESSION_LABELS[priceSession],asOf:new Date(quoteTimestamp*1000).toISOString(),asOfLabel:SESSION_LABELS[priceSession],
    source:quote.source || provider,provider,providerPriority:Number(quote.providerPriority || 3),...calculated},series);
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=true&events=div%2Csplits`;
  const response = await fetch(url, { headers:{ accept:"application/json", "user-agent":"StrategyBar/1.0" } });
  if (!response.ok) throw new Error(`Yahoo ${response.status}`);
  const body = await response.json();
  const result = body.chart?.result?.[0];
  if (!result || body.chart?.error) throw new Error(body.chart?.error?.description || `No data for ${symbol}`);
  return parseYahoo(result, symbol);
}

const YAHOO_SPARK_BATCH_SIZE = 20;

async function fetchYahooSessionQuoteBatch(symbols, fetchImpl) {
  const params = new URLSearchParams({symbols:symbols.join(","),range:"1d",interval:"1m",indicators:"close",includeTimestamps:"true",includePrePost:"true"});
  const response = await fetchImpl(`https://query1.finance.yahoo.com/v7/finance/spark?${params}`, { headers:{accept:"application/json", "user-agent":"StrategyBar/1.0"} });
  if (!response.ok) throw new Error(`Yahoo Spark ${response.status}`);
  const body = await response.json();
  const items = Array.isArray(body.spark?.result) ? body.spark.result : [];
  return Object.fromEntries(items.map((item)=>{
    const result = item.response?.[0] || item;
    const itemSymbol = item.symbol || result.meta?.symbol;
    return itemSymbol && result ? [itemSymbol,result] : null;
  }).filter(Boolean));
}

export async function fetchYahooSessionQuotes(symbols, fetchImpl = fetch) {
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return {};
  const batches = [];
  for (let index = 0; index < unique.length; index += YAHOO_SPARK_BATCH_SIZE) batches.push(unique.slice(index,index + YAHOO_SPARK_BATCH_SIZE));
  const settled = await Promise.allSettled(batches.map((batch)=>fetchYahooSessionQuoteBatch(batch,fetchImpl)));
  const available = settled.filter((item)=>item.status === "fulfilled").map((item)=>item.value);
  if (!available.length) throw settled.find((item)=>item.status === "rejected")?.reason || new Error("Yahoo Spark unavailable");
  return Object.assign({},...available);
}

function stooqSymbol(symbol) {
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return null;
  return `${symbol.toLowerCase()}.us`;
}

async function fetchStooq(symbol) {
  const mapped = stooqSymbol(symbol);
  if (!mapped) throw new Error("Stooq mapping unavailable");
  const end = new Date(), start = new Date(end.getTime() - 120*86400000);
  const stamp = (date) => date.toISOString().slice(0,10).replaceAll("-","");
  const response = await fetch(`https://stooq.com/q/d/l/?s=${mapped}&d1=${stamp(start)}&d2=${stamp(end)}&i=d`);
  if (!response.ok) throw new Error(`Stooq ${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/).slice(1).map((line)=>line.split(",")).filter((row)=>row.length>=6&&finite(row[4]));
  if (lines.length < 2) throw new Error(`No fallback for ${symbol}`);
  const closes=lines.map((x)=>Number(x[4])), highs=lines.map((x)=>Number(x[2])), lows=lines.map((x)=>Number(x[3])), volumes=lines.map((x)=>Number(x[5]));
  const price=closes.at(-1), previousClose=closes.at(-2), calculated=calculateSignal({price,previousClose,closes,highs,lows,volumes});
  const known=STOCKS[symbol];
  return attachSeries({symbol,name:known?.[0]||symbol,shortName:symbol,category:known?.[1]||"사용자추가",price:round(price),previousClose:round(previousClose),open:round(Number(lines.at(-1)[1])),
    dayHigh:round(highs.at(-1)),dayLow:round(lows.at(-1)),currency:"USD",exchange:null,marketState:"CLOSED",priceSession:"REGULAR",sessionLabel:"정규장",
    asOf:`${lines.at(-1)[0]}T21:00:00.000Z`,asOfLabel:"정규장",source:"Stooq EOD fallback",provider:"STOOQ",providerPriority:4,...calculated},{closes,highs,lows,volumes});
}

export async function fetchSecurity(symbol) {
  try { return await fetchYahoo(symbol); }
  catch (primaryError) {
    try { return await fetchStooq(symbol); }
    catch { throw primaryError; }
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor++; try { results[index] = await fn(items[index]); } catch (error) { results[index] = { symbol:items[index], error:error instanceof Error?error.message:"fetch failed" }; } } }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return results;
}

async function fetchTwoYearYield() {
  const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2", { headers:{accept:"text/csv"} });
  if (!response.ok) throw new Error(`FRED ${response.status}`);
  const rows=(await response.text()).trim().split(/\r?\n/).slice(1).map((line)=>line.split(",")).filter((row)=>finite(row[1]));
  const current=rows.at(-1), previous=rows.at(-2), value=Number(current[1]), prior=Number(previous[1]);
  return {key:"DGS2",label:"미 2년물",value:round(value,3),changeValue:round((value-prior)*100,1),changePct:round((value/prior-1)*100,3),changeUnit:"bp",unit:"percent",observationDate:current[0],source:"FRED DGS2"};
}

export async function fetchMarketSnapshot(extraSymbols = [], only = null) {
  const requested = only ? [only] : [...new Set([...Object.keys(STOCKS),...MACROS.map(([symbol])=>symbol),...extraSymbols])];
  let results = await mapLimit(requested, 8, fetchSecurity);
  try {
    const sessionQuotes = await fetchYahooSessionQuotes(requested);
    results = results.map((row)=>row && !row.error && sessionQuotes[row.symbol] ? applyYahooSessionQuote(row,sessionQuotes[row.symbol]) : row);
  }
  catch { }
  const all = Object.fromEntries(results.filter((row)=>row && !row.error).map((row)=>[row.symbol,row]));
  if (only) return {ok:Boolean(all[only]),asOf:new Date().toISOString(),session:all[only]?.priceSession||"REGULAR",symbols:all,market:[],errors:results.filter((x)=>x?.error)};
  const symbols=Object.fromEntries(Object.keys(STOCKS).concat(extraSymbols).filter((symbol)=>all[symbol]).map((symbol)=>[symbol,all[symbol]]));
  const market=MACROS.map(([symbol,label,unit])=>all[symbol]&&({key:symbol,label,value:all[symbol].price,changePct:all[symbol].changePct,changeValue:all[symbol].changePct,changeUnit:"percent",unit,
    priceSession:all[symbol].priceSession,sessionLabel:all[symbol].sessionLabel,asOf:all[symbol].asOf,source:all[symbol].source,provider:all[symbol].provider,providerPriority:all[symbol].providerPriority})).filter(Boolean);
  try { market.push(await fetchTwoYearYield()); } catch (error) { market.push({key:"DGS2",label:"미 2년물",value:null,changeValue:null,changePct:null,changeUnit:"bp",unit:"percent",source:"FRED DGS2",error:error instanceof Error?error.message:"unavailable"}); }
  return {ok:Object.keys(symbols).length>0,asOf:new Date().toISOString(),session:all.SPY?.priceSession||"REGULAR",refreshAfterSeconds:60,symbols,market,
    sources:["Yahoo Finance chart","FRED DGS2","Stooq EOD fallback"],errors:results.filter((x)=>x?.error)};
}
