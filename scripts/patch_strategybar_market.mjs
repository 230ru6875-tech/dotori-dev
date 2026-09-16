import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const patchBlock = String.raw`
function numberFromFormatted(value){
  if(value===null||value===undefined)return null;
  const n=Number(String(value).replace(/,/g,'').replace(/%/g,'').trim());
  return Number.isFinite(n)?n:null;
}

function walkObjects(value,out=[]){
  if(Array.isArray(value)){
    for(const item of value)walkObjects(item,out);
    return out;
  }
  if(value&&typeof value==='object'){
    out.push(value);
    for(const child of Object.values(value))walkObjects(child,out);
  }
  return out;
}

function pickText(obj,keys){
  for(const key of keys){
    const v=obj?.[key];
    if(typeof v==='string'&&v.trim())return v.trim();
  }
  return '';
}

function pickNumber(obj,keys){
  for(const key of keys){
    const n=numberFromFormatted(obj?.[key]);
    if(Number.isFinite(n))return n;
  }
  return null;
}

function parseNpayBondObject(payload,years,key,label){
  const maturity=String(years);
  const objects=walkObjects(payload,[]);
  const candidates=objects.filter(obj=>{
    const text=[
      pickText(obj,['name','title','itemName','bondName','displayName','korName','nameKor']),
      pickText(obj,['reutersCode','symbolCode','code'])
    ].join(' ');
    return (text.includes('미국')||text.toUpperCase().includes('US')) && (text.includes(maturity+'년')||text.includes(maturity+'Y')||text.includes(maturity+'YT'));
  });
  const candidate=candidates.find(obj=>{
    const value=pickNumber(obj,['closePrice','value','price','yield','interestRate','currentPrice','lastPrice']);
    return Number.isFinite(value)&&value>0&&value<20&&Math.abs(value-years)>0.0001;
  });
  if(!candidate){
    const preview=candidates.slice(0,5).map(obj=>JSON.stringify(obj).slice(0,180)).join(' | ');
    throw new Error('Npay US '+years+'Y bond object not found; candidates='+preview);
  }

  const value=pickNumber(candidate,['closePrice','value','price','yield','interestRate','currentPrice','lastPrice']);
  const changeRaw=pickNumber(candidate,['fluctuations','changeValue','compareToPreviousClosePrice','change','difference']);
  const changePct=pickNumber(candidate,['fluctuationsRatio','changePct','changeRate','rate']);
  const previousClose=Number.isFinite(changeRaw)?round(value-changeRaw,4):pickNumber(candidate,['lastClosePrice','previousClose','prevClose']);
  const asOf=pickText(candidate,['localTradedAt','asOf','dateTime','timestamp','tradeTime'])||new Date().toISOString();

  return {
    key,label,name:label,
    value:round(value,4),
    previousClose:Number.isFinite(previousClose)?round(previousClose,4):null,
    changeValue:Number.isFinite(changeRaw)?round(changeRaw*100,1):null,
    changePct:Number.isFinite(changePct)?round(changePct,2):null,
    changeUnit:'bp',unit:'percent',asOf,
    source:'Npay 증권 미국 국채 JSON',provider:'Npay 증권',providerPriority:1,
    priceSession:'INTRADAY',sessionLabel:'실시간'
  };
}

async function fetchNpayTreasuryYields() {
  const url='https://m.stock.naver.com/front-api/marketIndex/bondList?countryCode=USA';
  const response=await fetch(url,{headers:{
    'accept':'application/json,text/plain,*/*',
    'accept-language':'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control':'no-cache',
    'pragma':'no-cache',
    'user-agent':'Mozilla/5.0 StrategyBar/1.0'
  }});
  const raw=await response.text();
  if(!response.ok) throw new Error('Npay bond API HTTP '+response.status+' body='+raw.slice(0,180));
  let payload;
  try{payload=JSON.parse(raw);}catch{throw new Error('Npay bond API invalid JSON: '+raw.slice(0,180));}
  return [
    parseNpayBondObject(payload,2,'DGS2','미 2년물'),
    parseNpayBondObject(payload,10,'DGS10','미 10년물'),
    parseNpayBondObject(payload,30,'DGS30','미 30년물')
  ];
}

async function fetchCboeVix() {
  const url='https://www.cboe.com/tradable-products/vix';
  const response=await fetch(url,{headers:{
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'en-US,en;q=0.9',
    'cache-control':'no-cache',
    'user-agent':'Mozilla/5.0 StrategyBar/1.0'
  }});
  const html=await response.text();
  if(!response.ok) throw new Error('Cboe VIX HTTP '+response.status);
  const plain=String(html).replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
  const spot=plain.match(/\\$\\s*([0-9]+(?:\\.[0-9]+)?)\\s*VIX\\s*Spot\\s*Price/i)
    || plain.match(/VIX\\s*Spot\\s*Price\\s*\\$?\\s*([0-9]+(?:\\.[0-9]+)?)/i)
    || plain.match(/Trade\\s*Data[\\s\\S]{0,180}?\\$\\s*([0-9]+(?:\\.[0-9]+)?)/i);
  if(!spot) throw new Error('Cboe VIX spot parse failed');
  const value=Number(spot[1]);
  if(!(value>5&&value<100)) throw new Error('Cboe VIX invalid value '+value);
  return {key:'^VIX',label:'VIX',name:'VIX',value:round(value,2),previousClose:null,changeValue:null,changePct:null,changeUnit:'index',unit:'index',asOf:new Date().toISOString(),source:'Cboe VIX Spot Price',provider:'Cboe',providerPriority:1,priceSession:'DELAYED',sessionLabel:'Cboe 지연'};
}
`;

const snapshotMarker='export async function fetchMarketSnapshot';
if(!text.includes(snapshotMarker)) throw new Error('fetchMarketSnapshot marker not found');

const patchStart=text.indexOf('function numberFromFormatted(')>=0?text.indexOf('function numberFromFormatted('):text.indexOf('function normalizeHtmlText(');
if(patchStart>=0){
  const patchEnd=text.indexOf(snapshotMarker,patchStart);
  if(patchEnd<0) throw new Error('existing StrategyBar market patch end not found');
  text=text.slice(0,patchStart)+patchBlock+'\n'+text.slice(patchEnd);
}else{
  text=text.replace(snapshotMarker,patchBlock+'\n'+snapshotMarker);
}

const snapshotStart=text.indexOf(snapshotMarker);
const marketStart=text.indexOf('const market=macroResults.filter(([row])=>row).map(([row])=>row);',snapshotStart);
const errorsStart=marketStart>=0?text.indexOf('const errors=',marketStart):-1;
if(marketStart<0 || errorsStart<0 || errorsStart<=marketStart){
  throw new Error('current market.js result anchors not found');
}

const replacement=String.raw`const market=macroResults.filter(([row])=>row).map(([row])=>row);
  try {
    const treasury=await fetchNpayTreasuryYields();
    for(const row of treasury){
      const i=market.findIndex(item=>item.key===row.key);
      if(i>=0) market[i]=row; else market.push(row);
    }
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    for(const [key,label] of [['DGS2','미 2년물'],['DGS10','미 10년물'],['DGS30','미 30년물']]){
      const row={key,label,name:label,value:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'Npay 증권 미국 국채 JSON',provider:'Npay 증권',error:message};
      const i=market.findIndex(item=>item.key===key);
      if(i>=0) market[i]=row; else market.push(row);
    }
  }
  let vixIndex=market.findIndex(item=>item.key==='^VIX');
  if(vixIndex<0 || !(Number(market[vixIndex]?.value)>0)){
    try {
      const cboe=await fetchCboeVix();
      if(vixIndex>=0) market[vixIndex]=cboe; else market.push(cboe);
    } catch(error) {
      const row={key:'^VIX',label:'VIX',name:'VIX',value:null,source:'Cboe VIX Spot Price',provider:'Cboe',error:error instanceof Error?error.message:String(error)};
      if(vixIndex>=0) market[vixIndex]=row; else market.push(row);
    }
  }
  `;

text=text.slice(0,marketStart)+replacement+text.slice(errorsStart);
fs.writeFileSync(path,text);
console.log('Patched market.js: Npay US Treasury JSON API + Cboe VIX fallback.');
