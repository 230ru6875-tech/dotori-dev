const MAX_BODY_BYTES=64*1024;
const MAX_CLOCK_SKEW_SECONDS=300;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

function hexToBytes(value){
  if(!/^[a-f0-9]{64}$/i.test(value||""))return null;
  return new Uint8Array(value.match(/.{2}/g).map((b)=>Number.parseInt(b,16)));
}
async function verifySignature(secret,timestamp,rawBody,signature){
  const supplied=hexToBytes(signature); if(!supplied)return false;
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,supplied,enc.encode(`${timestamp}.${rawBody}`));
}
function cleanState(input={}){
  const allowedBrokers=["AUTO","TOSS","KIS","NAMUH"];
  const broker=String(input.broker||"AUTO").toUpperCase();
  const positions=Object.fromEntries(Object.entries(input.positions||{}).slice(0,10).map(([symbol,p])=>[String(symbol).toUpperCase(),{
    symbol:String(p?.symbol||symbol).toUpperCase(),
    entryAt:p?.entryAt||null,entryPrice:Number(p?.entryPrice||0),lastPrice:Number(p?.lastPrice||0),shares:Number(p?.shares||0),
    costKrw:Number(p?.costKrw||0),stopPrice:Number(p?.stopPrice||0),highPrice:Number(p?.highPrice||0),
    entryScore:Number(p?.entryScore||0),broker:String(p?.broker||broker).toUpperCase(),marketRegime:p?.marketRegime||null
  }]));
  return {
    mode:"PAPER_ONLY",
    profile:String(input.profile||"FAST_SURVIVAL"),
    broker:allowedBrokers.includes(broker)?broker:"AUTO",
    activeBroker:String(input.activeBroker||"").toUpperCase()||null,
    startKrw:Number(input.startKrw||100000),
    targetKrw:Number(input.targetKrw||1000000),
    equityKrw:Number(input.equityKrw||0),
    cashKrw:Number(input.cashKrw||0),
    progressPct:Number(input.progressPct||0),
    equityMultiple:Number(input.equityMultiple||0),
    positions,trades:Number(input.trades||0),wins:Number(input.wins||0),losses:Number(input.losses||0),
    drawdownPct:Number(input.drawdownPct||0),dayLossPct:Number(input.dayLossPct||0),
    killSwitch:Boolean(input.killSwitch),goalReached:Boolean(input.goalReached),
    paused:Boolean(input.paused),lastCycle:input.lastCycle||new Date().toISOString(),
    usdKrw:Number(input.usdKrw||0),updatedAt:new Date().toISOString()
  };
}
export async function handleSurvivalIngest(request,env){
  if(!env.MARKET_INGEST_SECRET)return json({ok:false,error:"survival ingest secret missing"},503);
  const length=Number(request.headers.get("content-length")||0);
  if(length>MAX_BODY_BYTES)return json({ok:false,error:"body too large"},413);
  const timestamp=request.headers.get("x-strategybar-timestamp")||"",signature=request.headers.get("x-strategybar-signature")||"";
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>MAX_CLOCK_SKEW_SECONDS)return json({ok:false,error:"timestamp rejected"},401);
  const raw=await request.text();
  if(!await verifySignature(env.MARKET_INGEST_SECRET,timestamp,raw,signature))return json({ok:false,error:"signature rejected"},401);
  let body;try{body=JSON.parse(raw);}catch{return json({ok:false,error:"invalid json"},400);}
  const state=cleanState(body);
  if(!env.LIVE_QUOTES)return json({ok:false,error:"durable object unavailable"},503);
  const id=env.LIVE_QUOTES.idFromName("holdings-live");
  const response=await env.LIVE_QUOTES.get(id).fetch("https://live.internal/paper-publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(state)});
  return new Response(response.body,response);
}
export async function getSurvivalState(env){
  if(!env.LIVE_QUOTES)return json({ok:false,error:"survival state unavailable"},503);
  const id=env.LIVE_QUOTES.idFromName("holdings-live");
  const response=await env.LIVE_QUOTES.get(id).fetch("https://live.internal/paper-latest");
  return new Response(response.body,response);
}
