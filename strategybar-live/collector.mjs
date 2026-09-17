import crypto from 'node:crypto';
import WebSocket from 'ws';

const API_KEY = process.env.ALPACA_API_KEY || '';
const API_SECRET = process.env.ALPACA_API_SECRET || '';
const TARGET_URL = (process.env.STRATEGYBAR_TARGET_URL || 'https://strategybar.hnr2020.workers.dev').replace(/\/$/,'');
const INGEST_SECRET = process.env.MARKET_INGEST_SECRET || '';
const FEED = process.env.ALPACA_FEED || 'iex';
const SYMBOLS = [...new Set((process.env.STRATEGYBAR_SYMBOLS || 'SNDK,IONQ,AVGO,ORCL,NVDA,AMD,TSLA,PLTR,QQQ,SPY').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))].slice(0,50);
const WS_URL = `wss://stream.data.alpaca.markets/v2/${FEED}`;
const SNAPSHOT_URL = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(SYMBOLS.join(','))}&feed=${encodeURIComponent(FEED)}`;

if (!API_KEY || !API_SECRET || !INGEST_SECRET) {
  console.error('Missing ALPACA_API_KEY, ALPACA_API_SECRET, or MARKET_INGEST_SECRET');
  process.exit(2);
}

const previousClose = new Map();
const daily = new Map();
const lastTrade = new Map();
const pending = new Map();
let flushTimer = null;
let reconnectMs = 1000;
let shuttingDown = false;

function etParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date).map(p=>[p.type,p.value]));
}

function sessionFor(date = new Date()) {
  const p = etParts(date);
  if (['Sat','Sun'].includes(p.weekday)) return 'REGULAR';
  const m = Number(p.hour) * 60 + Number(p.minute);
  if (m >= 240 && m < 570) return 'PREMARKET';
  if (m >= 570 && m < 960) return 'REGULAR';
  if (m >= 960 && m <= 1200) return 'AFTER_HOURS';
  return 'REGULAR';
}

function sessionLabel(s) {
  return s === 'PREMARKET' ? '프리마켓' : s === 'AFTER_HOURS' ? '시간외' : '정규장';
}

async function signedPost(quotes) {
  if (!quotes.length) return;
  const body = JSON.stringify({ quotes });
  const timestamp = String(Math.floor(Date.now()/1000));
  const signature = crypto.createHmac('sha256', INGEST_SECRET).update(`${timestamp}.${body}`).digest('hex');
  const res = await fetch(`${TARGET_URL}/api/market-ingest`, {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-strategybar-timestamp':timestamp,
      'x-strategybar-signature':signature,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`ingest HTTP ${res.status}: ${text.slice(0,300)}`);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async ()=>{
    flushTimer = null;
    const quotes = [...pending.values()];
    pending.clear();
    try { await signedPost(quotes); }
    catch (e) {
      console.error(new Date().toISOString(), 'ingest failed', e.message);
      for (const q of quotes) pending.set(q.symbol,q);
      setTimeout(scheduleFlush,1000);
    }
  },100);
}

function queueQuote(symbol, price, asOf, extras = {}) {
  if (!(Number(price) > 0)) return;
  const s = sessionFor(asOf ? new Date(asOf) : new Date());
  const d = daily.get(symbol) || {};
  const prev = previousClose.get(symbol);
  pending.set(symbol, {
    symbol,
    price:Number(price),
    previousClose:Number(prev) > 0 ? Number(prev) : null,
    changePct:Number(prev) > 0 ? (Number(price)/Number(prev)-1)*100 : null,
    currency:'USD',
    marketState:s,
    priceSession:s,
    sessionLabel:sessionLabel(s),
    asOf:asOf || new Date().toISOString(),
    provider:'ALPACA',
    source:`Alpaca ${FEED.toUpperCase()} WebSocket`,
    open:Number(d.open) > 0 ? Number(d.open) : null,
    dayHigh:Number(d.high) > 0 ? Number(d.high) : null,
    dayLow:Number(d.low) > 0 ? Number(d.low) : null,
    volume:Number(d.volume) >= 0 ? Number(d.volume) : null,
    vwap:Number(d.vwap) > 0 ? Number(d.vwap) : null,
    bidPrice:Number(extras.bidPrice) > 0 ? Number(extras.bidPrice) : null,
    askPrice:Number(extras.askPrice) > 0 ? Number(extras.askPrice) : null,
    bidSize:Number(extras.bidSize) >= 0 ? Number(extras.bidSize) : null,
    askSize:Number(extras.askSize) >= 0 ? Number(extras.askSize) : null,
  });
  scheduleFlush();
}

async function loadSnapshot() {
  const res = await fetch(SNAPSHOT_URL, {
    headers:{
      'APCA-API-KEY-ID':API_KEY,
      'APCA-API-SECRET-KEY':API_SECRET,
      'accept':'application/json',
    }
  });
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  const data = await res.json();
  for (const symbol of SYMBOLS) {
    const s = data?.[symbol];
    if (!s) continue;
    if (Number(s.previousDailyBar?.c) > 0) previousClose.set(symbol, Number(s.previousDailyBar.c));
    if (s.dailyBar) daily.set(symbol, {
      open:s.dailyBar.o, high:s.dailyBar.h, low:s.dailyBar.l, volume:s.dailyBar.v, vwap:s.dailyBar.vw,
    });
    const price = Number(s.latestTrade?.p) > 0 ? Number(s.latestTrade.p) : null;
    const asOf = s.latestTrade?.t || new Date().toISOString();
    if (price) {
      lastTrade.set(symbol,{price,asOf});
      queueQuote(symbol,price,asOf,{
        bidPrice:s.latestQuote?.bp, askPrice:s.latestQuote?.ap,
        bidSize:s.latestQuote?.bs, askSize:s.latestQuote?.as,
      });
    }
  }
  console.log(new Date().toISOString(), `snapshot seeded ${previousClose.size} symbols`);
}

function connect() {
  if (shuttingDown) return;
  console.log(new Date().toISOString(), 'connecting', WS_URL, SYMBOLS.join(','));
  const ws = new WebSocket(WS_URL, { handshakeTimeout:15000 });
  let authed = false;
  let heartbeat = null;

  ws.on('open',()=>{
    ws.send(JSON.stringify({action:'auth',key:API_KEY,secret:API_SECRET}));
    heartbeat = setInterval(()=>{ if (ws.readyState === WebSocket.OPEN) ws.ping(); },15000);
  });

  ws.on('message', raw=>{
    let messages;
    try { messages = JSON.parse(raw.toString()); } catch { return; }
    if (!Array.isArray(messages)) messages = [messages];
    for (const m of messages) {
      if (m.T === 'success' && m.msg === 'authenticated') {
        authed = true;
        reconnectMs = 1000;
        ws.send(JSON.stringify({action:'subscribe',trades:SYMBOLS,quotes:SYMBOLS,bars:SYMBOLS}));
        console.log(new Date().toISOString(), 'alpaca authenticated');
        continue;
      }
      if (m.T === 'error') {
        console.error(new Date().toISOString(), 'alpaca error', m.code, m.msg);
        continue;
      }
      if (m.T === 'T' && m.S && Number(m.p) > 0) {
        lastTrade.set(m.S,{price:Number(m.p),asOf:m.t});
        queueQuote(m.S,Number(m.p),m.t);
        continue;
      }
      if (m.T === 'Q' && m.S) {
        const t = lastTrade.get(m.S);
        if (t) queueQuote(m.S,t.price,t.asOf,{bidPrice:m.bp,askPrice:m.ap,bidSize:m.bs,askSize:m.as});
        continue;
      }
      if (m.T === 'b' && m.S) {
        daily.set(m.S,{open:m.o,high:m.h,low:m.l,volume:m.v,vwap:m.vw});
        const t = lastTrade.get(m.S);
        if (t) queueQuote(m.S,t.price,t.asOf);
      }
    }
  });

  ws.on('close',(code,reason)=>{
    clearInterval(heartbeat);
    console.error(new Date().toISOString(), `alpaca websocket closed code=${code} auth=${authed} reason=${reason}`);
    if (!shuttingDown) {
      const wait = reconnectMs;
      reconnectMs = Math.min(reconnectMs*2,30000);
      setTimeout(connect,wait);
    }
  });

  ws.on('error',err=>console.error(new Date().toISOString(),'alpaca websocket error',err.message));
}

async function main() {
  try { await loadSnapshot(); } catch (e) { console.error(new Date().toISOString(),'snapshot failed',e.message); }
  setInterval(()=>loadSnapshot().catch(e=>console.error(new Date().toISOString(),'snapshot refresh failed',e.message)),300000);
  connect();
}

process.on('SIGTERM',()=>{shuttingDown=true;process.exit(0);});
process.on('SIGINT',()=>{shuttingDown=true;process.exit(0);});
main().catch(e=>{console.error(e);process.exit(1);});
