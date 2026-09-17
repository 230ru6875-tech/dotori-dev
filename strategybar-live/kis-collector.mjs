import crypto from 'node:crypto';
import WebSocket from 'ws';

const APP_KEY = process.env.KIS_APP_KEY || '';
const APP_SECRET = process.env.KIS_APP_SECRET || '';
const INGEST_SECRET = process.env.MARKET_INGEST_SECRET || '';
const TARGET_URL = (process.env.STRATEGYBAR_TARGET_URL || 'https://strategybar.hnr2020.workers.dev').replace(/\/$/,'');
const WS_URL = process.env.KIS_WS_URL || 'ws://ops.koreainvestment.com:21000';
const APPROVAL_URL = process.env.KIS_APPROVAL_URL || 'https://openapi.koreainvestment.com:9443/oauth2/Approval';
const TRADES_TR_ID = 'HDFSCNT0';
const QUOTES_TR_ID = 'HDFSASP0';
const DEFAULT_SYMBOLS = 'IONQ,SNDK,AVGO,ORCL,QLD,NVDA,AMD,TSM,ASML,MU,ARM,PLTR,CRWV,VRT,IREN,NBIS,RKLB,ASTS,QBTS,RGTI,OKLO,SMR,LEU,COIN,MSTR,HOOD,TSLA,SPY,QQQ,SMH,SOXX,IWM,GLD,TLT,XLE,XLF';
const CORE_QUOTES = new Set((process.env.KIS_CORE_QUOTE_SYMBOLS || 'SNDK,IONQ,AVGO,ORCL').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
const SYMBOLS = [...new Set((process.env.STRATEGYBAR_SYMBOLS || DEFAULT_SYMBOLS).split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))];

// KIS overseas websocket keys are D + exchange(3) + ticker, e.g. DNASAAPL.
// NAS=NASDAQ, NYS=NYSE/NYSE Arca family, AMS=NYSE American/AMEX.
const EXCHANGE = {
  IONQ:'NYS', SNDK:'NAS', AVGO:'NAS', ORCL:'NYS', QLD:'NYS',
  NVDA:'NAS', AMD:'NAS', TSM:'NYS', ASML:'NAS', MU:'NAS', ARM:'NAS',
  PLTR:'NAS', CRWV:'NAS', VRT:'NYS', IREN:'NAS', NBIS:'NAS',
  RKLB:'NAS', ASTS:'NAS', QBTS:'NYS', RGTI:'NAS', OKLO:'NYS', SMR:'NYS', LEU:'AMS',
  COIN:'NAS', MSTR:'NAS', HOOD:'NAS', TSLA:'NAS',
  SPY:'NYS', QQQ:'NAS', SMH:'NAS', SOXX:'NAS', IWM:'NYS', GLD:'NYS', TLT:'NAS', XLE:'NYS', XLF:'NYS',
};

if (!APP_KEY || !APP_SECRET || !INGEST_SECRET) {
  console.error('Missing KIS_APP_KEY, KIS_APP_SECRET, or MARKET_INGEST_SECRET');
  process.exit(2);
}
if (SYMBOLS.length + [...CORE_QUOTES].filter(s=>SYMBOLS.includes(s)).length > 41) {
  console.error(`KIS websocket subscription limit exceeded: trades=${SYMBOLS.length}, coreQuotes=${[...CORE_QUOTES].filter(s=>SYMBOLS.includes(s)).length}, max=41`);
  process.exit(3);
}
for (const symbol of SYMBOLS) {
  if (!EXCHANGE[symbol]) {
    console.error(`Missing KIS exchange mapping for ${symbol}`);
    process.exit(4);
  }
}

let reconnectMs = 1000;
let shuttingDown = false;
let flushTimer = null;
const pending = new Map();
const lastTrade = new Map();
const bidAsk = new Map();

function etParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date).map(p=>[p.type,p.value]));
}
function sessionFor(date = new Date()) {
  const p=etParts(date);
  if (['Sat','Sun'].includes(p.weekday)) return 'REGULAR';
  const m=Number(p.hour)*60+Number(p.minute);
  if (m>=240&&m<570) return 'PREMARKET';
  if (m>=570&&m<960) return 'REGULAR';
  if (m>=960&&m<=1200) return 'AFTER_HOURS';
  return 'REGULAR';
}
function sessionLabel(s){return s==='PREMARKET'?'프리마켓':s==='AFTER_HOURS'?'시간외':'정규장';}
function kisKey(symbol){return `D${EXCHANGE[symbol]}${symbol}`;}
function toIso(koreaDate,koreaTime,localDate,localTime){
  const d=String(koreaDate||'').replace(/\D/g,'');
  const t=String(koreaTime||'').replace(/\D/g,'').padStart(6,'0');
  if (d.length===8 && t.length>=6) {
    // KIS supplies Korea date/time. Convert +09:00 to UTC ISO without depending on host timezone.
    const y=d.slice(0,4),m=d.slice(4,6),day=d.slice(6,8),hh=t.slice(0,2),mm=t.slice(2,4),ss=t.slice(4,6);
    const parsed=Date.parse(`${y}-${m}-${day}T${hh}:${mm}:${ss}+09:00`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const ld=String(localDate||'').replace(/\D/g,'');
  const lt=String(localTime||'').replace(/\D/g,'').padStart(6,'0');
  if (ld.length===8 && lt.length>=6) {
    const y=ld.slice(0,4),m=ld.slice(4,6),day=ld.slice(6,8),hh=lt.slice(0,2),mm=lt.slice(2,4),ss=lt.slice(4,6);
    const parsed=Date.parse(`${y}-${m}-${day}T${hh}:${mm}:${ss}-04:00`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}

async function approvalKey(){
  const res=await fetch(APPROVAL_URL,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({grant_type:'client_credentials',appkey:APP_KEY,secretkey:APP_SECRET})
  });
  if(!res.ok) throw new Error(`KIS approval HTTP ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data=await res.json();
  if(!data?.approval_key) throw new Error(`KIS approval key missing: ${JSON.stringify(data).slice(0,300)}`);
  return data.approval_key;
}

async function signedPost(quotes){
  if(!quotes.length)return;
  const body=JSON.stringify({quotes});
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=crypto.createHmac('sha256',INGEST_SECRET).update(`${timestamp}.${body}`).digest('hex');
  const res=await fetch(`${TARGET_URL}/api/market-ingest`,{
    method:'POST',headers:{'content-type':'application/json','x-strategybar-timestamp':timestamp,'x-strategybar-signature':signature},body
  });
  if(!res.ok) throw new Error(`ingest HTTP ${res.status}: ${(await res.text()).slice(0,300)}`);
}
function scheduleFlush(){
  if(flushTimer)return;
  flushTimer=setTimeout(async()=>{
    flushTimer=null;
    const quotes=[...pending.values()];pending.clear();
    try{await signedPost(quotes);}catch(e){
      console.error(new Date().toISOString(),'KIS ingest failed',e.message);
      for(const q of quotes)pending.set(q.symbol,q);
      setTimeout(scheduleFlush,1000);
    }
  },100);
}
function queue(symbol, price, asOf, extras={}){
  if(!(Number(price)>0))return;
  const session=sessionFor(asOf?new Date(asOf):new Date());
  pending.set(symbol,{
    symbol,price:Number(price),previousClose:Number(extras.previousClose)>0?Number(extras.previousClose):null,
    changePct:Number.isFinite(Number(extras.changePct))?Number(extras.changePct):null,
    currency:'USD',marketState:session,priceSession:session,sessionLabel:sessionLabel(session),asOf:asOf||new Date().toISOString(),
    provider:'KIS',source:extras.source||'KIS HDFSCNT0 WebSocket',
    open:Number(extras.open)>0?Number(extras.open):null,dayHigh:Number(extras.high)>0?Number(extras.high):null,dayLow:Number(extras.low)>0?Number(extras.low):null,
    volume:Number(extras.volume)>=0?Number(extras.volume):null,vwap:null,
    bidPrice:Number(extras.bid)>0?Number(extras.bid):null,askPrice:Number(extras.ask)>0?Number(extras.ask):null,
    bidSize:Number(extras.bidSize)>=0?Number(extras.bidSize):null,askSize:Number(extras.askSize)>=0?Number(extras.askSize):null,
  });
  scheduleFlush();
}

function parseTrades(payload,count){
  const vals=payload.split('^');
  const width=26;
  for(let offset=0;offset+width<=vals.length && offset/width<count;offset+=width){
    const v=vals.slice(offset,offset+width);
    const symbol=String(v[1]||'').trim().toUpperCase();
    if(!SYMBOLS.includes(symbol))continue;
    const price=n(v[11]); if(!(price>0))continue;
    const changePct=n(v[14]);
    const prev=(Number.isFinite(changePct) && 1+changePct/100>0)?price/(1+changePct/100):null;
    const asOf=toIso(v[6],v[7],v[4],v[5]);
    const ba=bidAsk.get(symbol)||{};
    lastTrade.set(symbol,{price,asOf});
    queue(symbol,price,asOf,{previousClose:prev,changePct,open:n(v[8]),high:n(v[9]),low:n(v[10]),bid:n(v[15])||ba.bid,ask:n(v[16])||ba.ask,bidSize:n(v[17])||ba.bidSize,askSize:n(v[18])||ba.askSize,volume:n(v[20]),source:'KIS HDFSCNT0 WebSocket'});
  }
}
function parseQuote(payload){
  const v=payload.split('^'); if(v.length<16)return;
  const symbol=String(v[0]||'').replace(/^D(?:NAS|NYS|AMS)/,'').trim().toUpperCase();
  if(!CORE_QUOTES.has(symbol))return;
  const bid=n(v[10]),ask=n(v[11]),bidSize=n(v[12]),askSize=n(v[13]);
  bidAsk.set(symbol,{bid,ask,bidSize,askSize});
  const trade=lastTrade.get(symbol);
  // US HDFSASP0 is a free real-time 1-level quote. When both sides are valid, use midpoint
  // as the live display price; keep explicit bid/ask so the UI can show the underlying quote.
  if(bid>0&&ask>0){
    const price=(bid+ask)/2;
    const asOf=toIso(v[4],v[5],v[2],v[3]);
    queue(symbol,price,asOf,{bid,ask,bidSize,askSize,source:'KIS HDFSASP0 realtime 1-level quote midpoint'});
  } else if(trade){
    queue(symbol,trade.price,trade.asOf,{bid,ask,bidSize,askSize,source:'KIS HDFSCNT0 + HDFSASP0 WebSocket'});
  }
}

function subscribeMessage(key,trId,trKey){
  return JSON.stringify({header:{approval_key:key,custtype:'P',tr_type:'1','content-type':'utf-8'},body:{input:{tr_id:trId,tr_key:trKey}}});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function connect(){
  if(shuttingDown)return;
  let key;
  try{key=await approvalKey();}catch(e){
    console.error(new Date().toISOString(),'KIS approval failed',e.message);
    const wait=reconnectMs;reconnectMs=Math.min(reconnectMs*2,30000);setTimeout(connect,wait);return;
  }
  console.log(new Date().toISOString(),'connecting KIS',WS_URL,`trades=${SYMBOLS.length}`,`coreQuotes=${[...CORE_QUOTES].filter(s=>SYMBOLS.includes(s)).length}`);
  const ws=new WebSocket(WS_URL,{handshakeTimeout:15000});
  let heartbeat=null;
  ws.on('open',async()=>{
    reconnectMs=1000;
    try{
      for(const symbol of SYMBOLS){ws.send(subscribeMessage(key,TRADES_TR_ID,kisKey(symbol)));await sleep(180);}
      for(const symbol of CORE_QUOTES){if(!SYMBOLS.includes(symbol))continue;ws.send(subscribeMessage(key,QUOTES_TR_ID,kisKey(symbol)));await sleep(180);}
      console.log(new Date().toISOString(),'KIS subscriptions sent');
      heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.ping();},15000);
    }catch(e){console.error(new Date().toISOString(),'KIS subscribe failed',e.message);ws.close();}
  });
  ws.on('message',(raw)=>{
    const text=raw.toString(); if(!text)return;
    if(text[0]==='0'){
      const parts=text.split('|'); const tr=parts[1]; const count=Number(parts[2]||1); const payload=parts.slice(3).join('|');
      if(tr===TRADES_TR_ID)parseTrades(payload,count);
      else if(tr===QUOTES_TR_ID)parseQuote(payload);
      return;
    }
    let msg;try{msg=JSON.parse(text);}catch{return;}
    const tr=msg?.header?.tr_id;
    if(tr==='PINGPONG'){
      try{if(ws.readyState===WebSocket.OPEN)ws.pong(raw);}catch{}
      return;
    }
    const code=String(msg?.body?.rt_cd??''); const detail=msg?.body?.msg1||'';
    if(code==='0') console.log(new Date().toISOString(),'KIS subscribed',msg?.header?.tr_key||'',tr||'',detail);
    else if(detail && detail!=='ALREADY IN SUBSCRIBE') console.error(new Date().toISOString(),'KIS subscription error',msg?.header?.tr_key||'',tr||'',code,detail);
  });
  ws.on('close',(code,reason)=>{
    clearInterval(heartbeat);
    console.error(new Date().toISOString(),`KIS websocket closed code=${code} reason=${reason}`);
    if(!shuttingDown){const wait=reconnectMs;reconnectMs=Math.min(reconnectMs*2,30000);setTimeout(connect,wait);}
  });
  ws.on('error',err=>console.error(new Date().toISOString(),'KIS websocket error',err.message));
}

process.on('SIGTERM',()=>{shuttingDown=true;process.exit(0);});
process.on('SIGINT',()=>{shuttingDown=true;process.exit(0);});
connect().catch(e=>{console.error(e);process.exit(1);});
