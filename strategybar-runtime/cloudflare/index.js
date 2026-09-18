export { LiveQuotes } from "./live-quotes.js";
import { applyExternalSessionQuote, fetchHistorySeries, fetchMarketSnapshot, STOCKS } from "./market.js";
import { handleMarketIngest } from "./ingest.js";
import { createAnalysis, createRuleBasedAnalysis } from "./openai.js";
import { getCandidates, recordCandidateCycle } from "./candidates.js";

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const validSymbol = (value) => typeof value === "string" && /^[A-Z0-9.^=-]{1,15}$/.test(value);
const now = () => Date.now();
const CORE_SYMBOLS = ["SNDK", "IONQ"];
const finite = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

async function getCache(env, key) {
  if (!env.DB) return null;
  const row=await env.DB.prepare("SELECT payload, updated_at FROM market_cache WHERE cache_key = ?").bind(key).first();
  if (!row) return null;
  try { return {payload:JSON.parse(row.payload),updatedAt:Number(row.updated_at)}; } catch { return null; }
}
async function putCache(env, key, payload) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO market_cache(cache_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
    .bind(key,JSON.stringify(payload),now()).run();
}

function dig(obj, paths=[]) {
  for (const path of paths) {
    let cur=obj;
    for (const part of path.split('.')) cur=cur?.[part];
    if (finite(cur)) return Number(cur);
  }
  return null;
}
function digString(obj, paths=[]) {
  for (const path of paths) {
    let cur=obj;
    for (const part of path.split('.')) cur=cur?.[part];
    if (typeof cur === 'string' && cur.trim()) return cur.trim();
  }
  return null;
}
function normalizeProviderQuote(payload, provider, source) {
  const price=dig(payload,['price','currentPrice','last','lastPrice','close','data.price','data.currentPrice','data.last','data.lastPrice','data.close','output.last','output.stck_prpr']);
  const previousClose=dig(payload,['previousClose','prevClose','base','data.previousClose','data.prevClose','data.base','output.base','output.stck_sdpr']);
  if (!finite(price) || Number(price)<=0) return null;
  const changePct=finite(previousClose)&&Number(previousClose)>0?(Number(price)/Number(previousClose)-1)*100:null;
  const rawSession=(digString(payload,['priceSession','session','marketSession','data.priceSession','data.session'])||'').toUpperCase();
  const priceSession=rawSession.includes('PRE')?'PREMARKET':rawSession.includes('POST')||rawSession.includes('AFTER')?'AFTER_HOURS':'REGULAR';
  const sessionLabel=priceSession==='PREMARKET'?'프리마켓':priceSession==='AFTER_HOURS'?'시간외':'정규장';
  const asOf=digString(payload,['asOf','timestamp','time','data.asOf','data.timestamp','output.time'])||new Date().toISOString();
  return {price:Number(price),previousClose:finite(previousClose)?Number(previousClose):null,changePct,priceSession,sessionLabel,asOf,source,provider,providerPriority:provider==='Toss'?1:2};
}

async function fetchTossQuote(env, symbol) {
  if (!env.TOSS_QUOTE_URL || !env.TOSS_AUTH_TOKEN) return null;
  const url=String(env.TOSS_QUOTE_URL).includes('{symbol}')
    ? String(env.TOSS_QUOTE_URL).replaceAll('{symbol}',encodeURIComponent(symbol))
    : `${String(env.TOSS_QUOTE_URL).replace(/\/$/,'')}/${encodeURIComponent(symbol)}`;
  const r=await fetch(url,{headers:{'authorization':`Bearer ${env.TOSS_AUTH_TOKEN}`,'accept':'application/json','user-agent':'StrategyBar/1.0'}});
  if (!r.ok) throw new Error(`Toss ${symbol} HTTP ${r.status}`);
  const payload=await r.json();
  return normalizeProviderQuote(payload,'Toss','Toss Securities');
}

let kisTokenCache={token:null,expiresAt:0};
async function getKisToken(env) {
  if (!env.KIS_APP_KEY || !env.KIS_APP_SECRET) return null;
  if (kisTokenCache.token && kisTokenCache.expiresAt>Date.now()+60000) return kisTokenCache.token;
  const base=String(env.KIS_BASE_URL||'https://openapi.koreainvestment.com:9443').replace(/\/$/,'');
  const r=await fetch(`${base}/oauth2/tokenP`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:env.KIS_APP_KEY,appsecret:env.KIS_APP_SECRET})});
  if (!r.ok) throw new Error(`KIS token HTTP ${r.status}`);
  const p=await r.json();
  if (!p.access_token) throw new Error('KIS access_token missing');
  const expiresIn=Math.max(300,Number(p.expires_in||3600));
  kisTokenCache={token:p.access_token,expiresAt:Date.now()+expiresIn*1000};
  return p.access_token;
}
async function fetchKisQuote(env, symbol) {
  const token=await getKisToken(env);
  if (!token) return null;
  const base=String(env.KIS_BASE_URL||'https://openapi.koreainvestment.com:9443').replace(/\/$/,'');
  const u=new URL(`${base}/uapi/overseas-price/v1/quotations/price`);
  u.searchParams.set('AUTH','');u.searchParams.set('EXCD','NAS');u.searchParams.set('SYMB',symbol);
  const r=await fetch(u.toString(),{headers:{'authorization':`Bearer ${token}`,'appkey':env.KIS_APP_KEY,'appsecret':env.KIS_APP_SECRET,'tr_id':'HHDFS00000300','custtype':'P','accept':'application/json'}});
  if (!r.ok) throw new Error(`KIS ${symbol} HTTP ${r.status}`);
  const p=await r.json();
  const q=normalizeProviderQuote(p,'KIS','Korea Investment Open API');
  if (!q) return null;
  return {...q,priceSession:'REGULAR',sessionLabel:'정규장'};
}

async function readBrokerQuotes(env, symbols) {
  if (!env.DB || !symbols.length) return {};
  const unique=[...new Set(symbols.filter(validSymbol))].slice(0,200);
  if (!unique.length) return {};
  const maxAge=Math.max(60000,Number(env.BROKER_QUOTE_MAX_AGE_MS||420000));
  try {
    const placeholders=unique.map(()=>"?").join(",");
    const result=await env.DB.prepare(`SELECT symbol,payload,received_at FROM broker_quotes WHERE symbol IN (${placeholders}) AND received_at >= ?`)
      .bind(...unique,now()-maxAge).all();
    return Object.fromEntries((result.results||[]).map((row)=>{
      try { return [row.symbol,{...JSON.parse(row.payload),receivedAt:new Date(Number(row.received_at)).toISOString()}]; }
      catch { return null; }
    }).filter(Boolean));
  }
  catch { return {}; }
}

async function overlayAuthenticatedQuotes(env,snapshot){
  const symbols=Object.keys(snapshot.symbols||{});
  if(!symbols.length)return snapshot;
  const next={...snapshot,symbols:{...snapshot.symbols}};
  const providerErrors=[];
  await Promise.all(symbols.map(async(symbol)=>{
    let quote=null;
    try{quote=await fetchTossQuote(env,symbol);}catch(error){providerErrors.push({symbol,provider:'Toss',error:error instanceof Error?error.message:String(error)});}
    if(!quote){try{quote=await fetchKisQuote(env,symbol);}catch(error){providerErrors.push({symbol,provider:'KIS',error:error instanceof Error?error.message:String(error)});}}
    if(quote)next.symbols[symbol]=applyExternalSessionQuote(next.symbols[symbol],quote);
  }));
  const providers=[...new Set(Object.values(next.symbols).map(x=>x.provider).filter(x=>x==='Toss'||x==='KIS'))];
  return {...next,providerErrors,quoteFeed:{...(next.quoteFeed||{}),authenticatedProviders:providers}};
}

async function overlayBrokerQuotes(env, snapshot) {
  const keys=[...Object.keys(snapshot.symbols||{}),...(snapshot.market||[]).map((row)=>row.key)];
  const quotes=await readBrokerQuotes(env,keys);
  const applied=[];
  const symbols=Object.fromEntries(Object.entries(snapshot.symbols||{}).map(([symbol,row])=>{
    if (!quotes[symbol] || row.provider==='Toss' || row.provider==='KIS') return [symbol,row];
    const next=applyExternalSessionQuote(row,quotes[symbol]);
    if (next!==row) applied.push(next);
    return [symbol,next];
  }));
  const market=(snapshot.market||[]).map((row)=>{
    if (!quotes[row.key]) return row;
    const next=applyExternalSessionQuote({...row,price:row.value},quotes[row.key]);
    if (next.price===row.value && next.provider===row.provider) return row;
    applied.push(next);
    return {...row,value:next.price,changePct:next.changePct,changeValue:next.changePct,priceSession:next.priceSession,sessionLabel:next.sessionLabel,
      asOf:next.asOf,source:next.source,provider:next.provider,providerPriority:next.providerPriority};
  });
  const providers=[...new Set(applied.map((row)=>row.provider).filter(Boolean))];
  const latestAt=applied.map((row)=>row.asOf).filter(Boolean).sort().at(-1)||null;
  return {...snapshot,symbols,market,session:symbols.SPY?.priceSession||snapshot.session,
    quoteFeed:{...(snapshot.quoteFeed||{}),active:applied.length>0||(snapshot.quoteFeed?.authenticatedProviders||[]).length>0,providers:[...new Set([...(snapshot.quoteFeed?.authenticatedProviders||[]),...providers])],latestAt,staleAfterSeconds:Math.round(Math.max(60000,Number(env.BROKER_QUOTE_MAX_AGE_MS||420000))/1000)},
    sources:[...new Set([...(snapshot.sources||[]),...applied.map((row)=>row.source).filter(Boolean),...Object.values(symbols).map(r=>r.source).filter(Boolean)])]};
}
async function applyQuoteLayers(env,snapshot){return overlayBrokerQuotes(env,await overlayAuthenticatedQuotes(env,snapshot));}

async function ensureCoreSymbols(env, snapshot, force = false) {
  const missing=CORE_SYMBOLS.filter((symbol)=>!snapshot.symbols?.[symbol]);
  if (!missing.length) return snapshot;
  const recovered=await Promise.all(missing.map((symbol)=>getExtra(env,symbol,force).catch(()=>null)));
  const symbols={...snapshot.symbols};
  const recoveryErrors=[];
  missing.forEach((symbol,index)=>{
    const row=recovered[index]?.symbols?.[symbol];
    if (row) symbols[symbol]=row;
    else recoveryErrors.push({symbol,error:"core symbol recovery failed"});
  });
  return {...snapshot,symbols,errors:[...(snapshot.errors||[]),...recoveryErrors]};
}

async function getBaseMarket(env, force = false) {
  const cached=await getCache(env,"market:base"), age=cached?now()-cached.updatedAt:Infinity;
  if (cached && (age<60000 || (force&&age<15000))) {
    const overlaid=await applyQuoteLayers(env,cached.payload);
    return {...await ensureCoreSymbols(env,overlaid,force),cacheStatus:force&&age<15000?"throttled":"hit"};
  }
  try {
    const fresh=await fetchMarketSnapshot();
    await putCache(env,"market:base",fresh);
    const overlaid=await applyQuoteLayers(env,fresh);
    return {...await ensureCoreSymbols(env,overlaid,force),cacheStatus:"refreshed"};
  }
  catch (error) {
    if (cached) {
      const overlaid=await applyQuoteLayers(env,cached.payload);
      return {...await ensureCoreSymbols(env,overlaid,force),cacheStatus:"stale",warning:error instanceof Error?error.message:"refresh failed"};
    }
    throw error;
  }
}
async function getExtra(env, symbol, force = false) {
  const key=`quote:${symbol}`,cached=await getCache(env,key),age=cached?now()-cached.updatedAt:Infinity;
  if (cached && (age<60000 || (force&&age<15000))) return await applyQuoteLayers(env,cached.payload);
  try { const fresh=await fetchMarketSnapshot([],symbol); if (!fresh.ok) throw new Error("종목을 찾지 못했습니다."); await putCache(env,key,fresh); return await applyQuoteLayers(env,fresh); }
  catch (error) { if (cached) return {...await applyQuoteLayers(env,cached.payload),cacheStatus:"stale"}; throw error; }
}

async function marketRoute(request, env) {
  const url=new URL(request.url), force=url.searchParams.get("force")==="1", only=(url.searchParams.get("only")||"").toUpperCase();
  if (only) {
    if (!validSymbol(only)) return json({ok:false,error:"티커 형식이 올바르지 않습니다."},400);
    if (STOCKS[only]) {
      const base=await getBaseMarket(env,force);
      const row=base.symbols?.[only] || null;
      return json({...base,ok:Boolean(row),symbols:row?{[only]:row}:{},market:[],requestedSymbol:only});
    }
    return json(await getExtra(env,only,force));
  }
  const extras=(url.searchParams.get("symbols")||"").split(",").map((x)=>x.trim().toUpperCase()).filter(validSymbol).filter((x)=>!STOCKS[x]).slice(0,12);
  const base=await getBaseMarket(env,force);
  if (!extras.length) return json(base);
  const results=await Promise.all(extras.map((symbol)=>getExtra(env,symbol,force).catch(()=>null)));
  const symbols={...base.symbols};
  results.filter(Boolean).forEach((payload)=>Object.assign(symbols,payload.symbols));
  return json({...base,symbols,customRequested:extras});
}

async function readAnalysis(env, key) {
  if (!env.DB) return null;
  const row=await env.DB.prepare("SELECT payload, generated_at FROM ai_analysis WHERE analysis_key = ?").bind(key).first();
  if (!row) return null;
  try { return {...JSON.parse(row.payload),generatedAt:new Date(Number(row.generated_at)).toISOString()}; } catch { return null; }
}
async function saveAnalysis(env,key,analysis) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO ai_analysis(analysis_key,payload,generated_at) VALUES(?,?,?) ON CONFLICT(analysis_key) DO UPDATE SET payload=excluded.payload,generated_at=excluded.generated_at")
    .bind(key,JSON.stringify(payload),now()).run();
}
async function claimQuota(env) {
  if (!env.DB) return true;
  const day=new Date().toISOString().slice(0,10),limit=Math.max(1,Number(env.AI_DAILY_LIMIT||24));
  await env.DB.prepare("INSERT OR IGNORE INTO ai_quota(day,used) VALUES(?,0)").bind(day,limit).run();
  const result=await env.DB.prepare("UPDATE ai_quota SET used=used+1 WHERE day=? AND used<?").bind(day,limit).run();
  return Number(result.meta?.changes||0)>0;
}

function compactMarket(snapshot) {
  const candidates=Object.values(snapshot.symbols||{}).sort((a,b)=>b.score-a.score).slice(0,8).map(({symbol,price,changePct,score,signal,rsi,ma20Gap,ma60Gap,volumeRatio,volatility20,support,resistance,source,provider,asOf,priceSession,sessionLabel})=>({symbol,price,changePct,score,signal,rsi,ma20Gap,ma60Gap,volumeRatio,volatility20,support,resistance,source,provider,asOf,priceSession,sessionLabel}));
  return {asOf:snapshot.asOf,session:snapshot.session,market:snapshot.market,candidates,failedSymbols:(snapshot.errors||[]).length};
}
function compactSymbol(row) {
  const {symbol,name,category,price,previousClose,changePct,score,signal,rsi,ma20Gap,ma60Gap,volumeRatio,volatility20,support,resistance,trend,reasons,source,provider,asOf,marketState,priceSession,sessionLabel}=row;
  return {symbol,name,category,price,previousClose,changePct,score,signal,rsi,ma20Gap,ma60Gap,volumeRatio,volatility20,support,resistance,trend,reasons,source,provider,asOf,marketState,priceSession,sessionLabel};
}

async function historyGet(request,env){
  const url=new URL(request.url);
  const symbol=String(url.searchParams.get("symbol")||"").toUpperCase();
  const benchmark=String(url.searchParams.get("benchmark")||"QQQ").toUpperCase();
  const range=String(url.searchParams.get("range")||"6mo");
  if(!validSymbol(symbol)||!validSymbol(benchmark))return json({ok:false,error:"티커 형식이 올바르지 않습니다."},400);
  try{
    const data=await fetchHistorySeries(symbol,benchmark,range);
    return json({ok:true,...data});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"history unavailable"},502);
  }
}

async function candidatesGet(request,env) {
  const url=new URL(request.url);
  const limit=Math.max(1,Math.min(12,Number(url.searchParams.get("limit")||8)));
  const snapshot=await getBaseMarket(env,false);
  const candidates=await getCandidates(env,snapshot,limit);
  return json({ok:true,asOf:new Date().toISOString(),candidates});
}

async function analysisGet(request,env) {
  const symbol=(new URL(request.url).searchParams.get("symbol")||"").toUpperCase();
  return json({ok:true,market:await readAnalysis(env,"market"),symbol:validSymbol(symbol)?await readAnalysis(env,`symbol:${symbol}`):null});
}
async function analysisPost(request,env) {
  let body; try { body=await request.json(); } catch { return json({ok:false,error:"요청 JSON이 올바르지 않습니다."},400); }
  const symbol=String(body.symbol||"").toUpperCase();
  if (body.scope!=="symbol"||!validSymbol(symbol)) return json({ok:false,error:"분석할 티커를 확인해 주세요."},400);
  const key=`symbol:${symbol}`,cached=await readAnalysis(env,key);
  const cacheAge=cached?now()-Date.parse(cached.generatedAt):Infinity;
  if (cached&&cacheAge<(cached.providerStatus==="fallback"?300000:3600000)) return json({ok:true,analysis:cached,cacheStatus:"hit"});
  const quote=(await (STOCKS[symbol]?getBaseMarket(env,false):getExtra(env,symbol,false))).symbols[symbol];
  if (!quote) return json({ok:false,error:"시세를 확인할 수 없습니다."},404);
  const input={kind:"single_security",security:compactSymbol(quote)};
  let analysis,cacheStatus="refreshed";
  if (!env.OPENAI_API_KEY) { analysis=createRuleBasedAnalysis(input,"symbol","OpenAI API 키가 연결되지 않았습니다."); cacheStatus="fallback"; }
  else if (!await claimQuota(env)) { analysis=createRuleBasedAnalysis(input,"symbol","오늘의 OpenAI 분석 한도에 도달했습니다."); cacheStatus="fallback"; }
  else {
    try { analysis=await createAnalysis(env,input,"symbol"); }
    catch (error) { analysis=createRuleBasedAnalysis(input,"symbol",error instanceof Error?error.message:"OpenAI 연결 오류"); cacheStatus="fallback"; }
  }
  await saveAnalysis(env,key,analysis); return json({ok:true,analysis,cacheStatus});
}

function isUsMarketWindow(date=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map((p)=>[p.type,p.value]));
  if (["Sat","Sun"].includes(parts.weekday)) return false;
  const minutes=Number(parts.hour)*60+Number(parts.minute); return minutes>=570&&minutes<=970;
}
async function scheduledRefresh(env) {
  if (!isUsMarketWindow()) return;
  const baseline=await fetchMarketSnapshot(); await putCache(env,"market:base",baseline);
  const snapshot=await applyQuoteLayers(env,baseline);
  try { await recordCandidateCycle(env,snapshot); } catch {}
  if (!env.OPENAI_API_KEY||!await claimQuota(env)) return;
  const input={kind:"market_brief",...compactMarket(snapshot)};
  let analysis;
  try { analysis=await createAnalysis(env,input,"market"); }
  catch (error) { analysis=createRuleBasedAnalysis(input,"market",error instanceof Error?error.message:"OpenAI 연결 오류"); }
  await saveAnalysis(env,"market",analysis);
}

function secureAsset(response) {
  const next=new Response(response.body,response); next.headers.set("x-content-type-options","nosniff"); next.headers.set("referrer-policy","strict-origin-when-cross-origin");
  next.headers.set("permissions-policy","camera=(), microphone=(), geolocation=()");
  next.headers.set("x-frame-options","DENY"); next.headers.set("x-robots-tag","noindex, nofollow, noarchive"); return next;
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
      if (request.method==="GET"&&url.pathname==="/api/status") return json({ok:true,openAIConfigured:Boolean(env.OPENAI_API_KEY),d1Configured:Boolean(env.DB),marketIngestConfigured:Boolean(env.MARKET_INGEST_SECRET),tossConfigured:Boolean(env.TOSS_QUOTE_URL&&env.TOSS_AUTH_TOKEN),kisConfigured:Boolean(env.KIS_APP_KEY&&env.KIS_APP_SECRET)});
      if (request.method==="GET"&&url.pathname==="/api/live") {
        if (!env.LIVE_QUOTES) return json({ok:false,error:"실시간 시세 채널이 설정되지 않았습니다."},503);
        const id=env.LIVE_QUOTES.idFromName("holdings-live");
        return env.LIVE_QUOTES.get(id).fetch(new Request(`https://live.internal/connect${url.search}`,request));
      }
      if (request.method==="POST"&&url.pathname==="/api/market-ingest") return await handleMarketIngest(request,env);
      if (request.method==="GET"&&url.pathname==="/api/market") return await marketRoute(request,env);
      if (request.method==="GET"&&url.pathname==="/api/history") return await historyGet(request,env);
      if (request.method==="GET"&&url.pathname==="/api/candidates") return await candidatesGet(request,env);
      if (request.method==="GET"&&url.pathname==="/api/analysis") return await analysisGet(request,env);
      if (request.method==="POST"&&url.pathname==="/api/analysis") return await analysisPost(request,env);
      if (request.method==="GET"&&url.pathname==="/robots.txt") return new Response("User-agent: *\nDisallow: /\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=86400"}});
      if (url.pathname.startsWith("/api/")) return json({ok:false,error:"Not found"},404);
      return secureAsset(await env.ASSETS.fetch(request));
    } catch (error) { return json({ok:false,error:error instanceof Error?error.message:"Unexpected error"},500); }
  },
  async scheduled(_event,env,ctx) { ctx.waitUntil(scheduledRefresh(env)); },
};
