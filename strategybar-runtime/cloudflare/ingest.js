const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const PROVIDER_PROTECT_MS = { NAMUH: 15000, KIS: 12000, ALPACA: 10000, TOSS: 0, YAHOO: 0 };
const PROVIDER_PRIORITY = { NAMUH: 1, KIS: 2, ALPACA: 3, YAHOO: 4, TOSS: 5 };
const MAX_HIGHER_PRIORITY_LAG_MS = 5000;
const SESSION_LABELS = { PREMARKET: "프리마켓", REGULAR: "정규장", AFTER_HOURS: "시간외" };

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
});

function toTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function hexToBytes(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || "")) return null;
  return new Uint8Array(value.match(/.{2}/g).map((byte)=>Number.parseInt(byte,16)));
}

async function verifySignature(secret, timestamp, rawBody, signature) {
  const supplied = hexToBytes(signature);
  if (!supplied) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,supplied,encoder.encode(`${timestamp}.${rawBody}`));
}

function optionalNumber(value, positive = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (positive && n <= 0) return null;
  return Number(n.toFixed(6));
}

function normalizeQuote(input) {
  const symbol = String(input?.symbol || "").trim().toUpperCase();
  const provider = String(input?.provider || "").trim().toUpperCase();
  const priceSession = String(input?.priceSession || input?.session || "").trim().toUpperCase();
  const price = Number(input?.price);
  const quoteTime = toTimestamp(input?.asOf ?? input?.timestamp);
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol) || !PROVIDER_PRIORITY[provider] || !SESSION_LABELS[priceSession]
    || !Number.isFinite(price) || price <= 0 || !quoteTime) return null;
  return {
    symbol,
    price:Number(price.toFixed(6)),
    currency:String(input?.currency || "USD").slice(0,8),
    marketState:String(input?.marketState || priceSession).slice(0,32),
    priceSession,
    sessionLabel:SESSION_LABELS[priceSession],
    asOf:new Date(quoteTime).toISOString(),
    provider,
    providerPriority:PROVIDER_PRIORITY[provider],
    source:String(input?.source || provider).slice(0,120),
    previousClose:optionalNumber(input?.previousClose,true),
    changePct:optionalNumber(input?.changePct,false),
    open:optionalNumber(input?.open,true),
    dayHigh:optionalNumber(input?.dayHigh,true),
    dayLow:optionalNumber(input?.dayLow,true),
    volume:optionalNumber(input?.volume,false),
    vwap:optionalNumber(input?.vwap,true),
    bidPrice:optionalNumber(input?.bidPrice,true),
    askPrice:optionalNumber(input?.askPrice,true),
    bidSize:optionalNumber(input?.bidSize,false),
    askSize:optionalNumber(input?.askSize,false),
  };
}

async function publishLive(env, accepted, receivedAt) {
  if (!accepted.length || !env.LIVE_QUOTES) return 0;
  try {
    const id=env.LIVE_QUOTES.idFromName("holdings-live");
    const stub=env.LIVE_QUOTES.get(id);
    const response=await stub.fetch("https://live.internal/publish", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({quotes:accepted,receivedAt:new Date(receivedAt).toISOString()}),
    });
    const payload=await response.json().catch(()=>({}));
    return Number(payload?.delivered||0);
  } catch {
    return 0;
  }
}

function isD1WriteLimitError(error) {
  const text=String(error?.message||error||"");
  return /free tier daily row write limit|exceeded D1.*row write limit/i.test(text);
}

export async function handleMarketIngest(request, env) {
  if (!env.MARKET_INGEST_SECRET) return json({ok:false,error:"시세 수신 Secret이 설정되지 않았습니다."},503);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json({ok:false,error:"요청 본문이 너무 큽니다."},413);
  const timestamp = request.headers.get("x-strategybar-timestamp") || "";
  const signature = request.headers.get("x-strategybar-signature") || "";
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now()/1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return json({ok:false,error:"요청 시각이 허용 범위를 벗어났습니다."},401);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ok:false,error:"요청 본문이 너무 큽니다."},413);
  if (!await verifySignature(env.MARKET_INGEST_SECRET,timestamp,rawBody,signature)) return json({ok:false,error:"서명이 올바르지 않습니다."},401);
  let body;
  try { body=JSON.parse(rawBody); } catch { return json({ok:false,error:"요청 JSON이 올바르지 않습니다."},400); }
  if (!Array.isArray(body.quotes) || !body.quotes.length || body.quotes.length > 200) return json({ok:false,error:"quotes는 1~200개여야 합니다."},400);
  const normalized = body.quotes.map(normalizeQuote).filter(Boolean);
  if (normalized.length !== body.quotes.length) return json({ok:false,error:"시세 항목 형식이 올바르지 않습니다."},400);

  const unique = new Map();
  for (const quote of normalized) {
    const current=unique.get(quote.symbol);
    if (!current || quote.providerPriority < current.providerPriority || (quote.providerPriority === current.providerPriority && quote.asOf > current.asOf)) unique.set(quote.symbol,quote);
  }
  const receivedAt=Date.now();
  const incoming=[...unique.values()];
  const existing=new Map();

  if (env.DB && incoming.length) {
    try {
      const symbols=incoming.map((quote)=>quote.symbol);
      const placeholders=symbols.map(()=>"?").join(",");
      const rows=await env.DB.prepare(`SELECT symbol,payload,provider,provider_priority,quote_time,received_at FROM broker_quotes WHERE symbol IN (${placeholders})`).bind(...symbols).all();
      for (const row of rows.results||[]) {
        try { existing.set(row.symbol,{...row,quote:JSON.parse(row.payload)}); } catch { }
      }
    } catch { }
  }

  const accepted=[];
  const suppressed=[];
  for (const quote of incoming) {
    const current=existing.get(quote.symbol);
    if (!current) { accepted.push(quote); continue; }
    const currentPriority=Number(current.provider_priority||99);
    const incomingPriority=quote.providerPriority;
    const currentQuoteTime=Number(current.quote_time||0);
    const incomingQuoteTime=Date.parse(quote.asOf);
    const currentProvider=String(current.provider||"").toUpperCase();
    const protectMs=PROVIDER_PROTECT_MS[currentProvider]||0;
    const currentFresh=receivedAt-Number(current.received_at||0) <= protectMs;
    const lowerPriority=incomingPriority>currentPriority;
    const higherPriority=incomingPriority<currentPriority;
    const olderSameProvider=incomingPriority===currentPriority && incomingQuoteTime<currentQuoteTime;
    const higherPriorityButTooOld=higherPriority && currentQuoteTime>0 && incomingQuoteTime+MAX_HIGHER_PRIORITY_LAG_MS<currentQuoteTime;
    const lowerPriorityMuchNewer=lowerPriority && currentQuoteTime>0 && incomingQuoteTime>currentQuoteTime+MAX_HIGHER_PRIORITY_LAG_MS;
    if (olderSameProvider || higherPriorityButTooOld || (lowerPriority&&currentFresh&&!lowerPriorityMuchNewer)) {
      suppressed.push({symbol:quote.symbol,incoming:quote.provider,kept:currentProvider,reason:olderSameProvider?"older-quote":higherPriorityButTooOld?"higher-priority-stale":"higher-priority-live-fresh"});
      continue;
    }
    accepted.push(quote);
  }

  // Realtime delivery is the primary path. D1 persistence is best-effort only.
  const delivered=await publishLive(env,accepted,receivedAt);

  let persisted=0;
  let persistence="disabled";
  if (env.DB && accepted.length) {
    const statements=accepted.map((quote)=>env.DB.prepare(
      "INSERT INTO broker_quotes(symbol,payload,provider,provider_priority,quote_time,received_at) VALUES(?,?,?,?,?,?) "
      + "ON CONFLICT(symbol) DO UPDATE SET payload=excluded.payload,provider=excluded.provider,provider_priority=excluded.provider_priority,quote_time=excluded.quote_time,received_at=excluded.received_at"
    ).bind(quote.symbol,JSON.stringify(quote),quote.provider,quote.providerPriority,Date.parse(quote.asOf),receivedAt));
    try {
      await env.DB.batch(statements);
      persisted=accepted.length;
      persistence="d1";
    } catch (error) {
      if (isD1WriteLimitError(error)) {
        persistence="live-only-d1-quota";
      } else {
        throw error;
      }
    }
  }

  return json({ok:true,accepted:accepted.length,suppressed,delivered,persisted,persistence,receivedAt:new Date(receivedAt).toISOString()});
}
