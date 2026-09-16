import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const patchBlock = String.raw`
function normalizeHtmlText(html='') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&minus;|&#8722;/gi,'-')
    .replace(/&plus;/gi,'+')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function parseNpayBondRow(plain, instrumentLabel, key, label) {
  const rowPattern=new RegExp(instrumentLabel+'\\s+([0-9]{1,2}\\.\\d{4})\\s+([+-]\\d+(?:\\.\\d+)?)\\s*\\(([+-]?\\d+(?:\\.\\d+)?)%\\)([\\s\\S]{0,80})');
  const match=plain.match(rowPattern);
  if(!match) throw new Error('Npay '+instrumentLabel+' row parse failed');

  const value=Number(match[1]);
  const changeRaw=Number(match[2]);
  const changePct=Number(match[3]);
  if(!(value>0 && value<20)) throw new Error('Npay '+instrumentLabel+' invalid yield: '+value);

  const previousClose=Number.isFinite(changeRaw)?round(value-changeRaw,4):null;
  const tail=match[4]||'';
  const timeMatch=tail.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}:\d{2})/);
  const asOf=timeMatch?timeMatch[1]+'. '+timeMatch[2]+'. '+timeMatch[3]+' 실시간':new Date().toISOString();

  return {
    key,label,name:label,
    value:round(value,4),
    previousClose,
    changeValue:Number.isFinite(changeRaw)?round(changeRaw*100,1):null,
    changePct:Number.isFinite(changePct)?round(changePct,2):null,
    changeUnit:'bp',unit:'percent',asOf,
    source:'Npay 증권 미국 국채',provider:'Npay 증권',providerPriority:1,
    priceSession:'INTRADAY',sessionLabel:'실시간'
  };
}

async function fetchNpayTreasuryYields() {
  const url='https://m.stock.naver.com/marketindex/home/bondAndInterest/bond/USA';
  const response=await fetch(url,{headers:{
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control':'no-cache',
    'pragma':'no-cache',
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36'
  }});
  const html=await response.text();
  if(!response.ok) throw new Error('Npay bonds HTTP '+response.status+' body='+normalizeHtmlText(html).slice(0,180));
  const plain=normalizeHtmlText(html);
  return [
    parseNpayBondRow(plain,'미국 국채 2년','DGS2','미 2년물'),
    parseNpayBondRow(plain,'미국 국채 10년','DGS10','미 10년물'),
    parseNpayBondRow(plain,'미국 국채 30년','DGS30','미 30년물')
  ];
}

async function fetchCboeVix() {
  const url='https://www.cboe.com/tradable-products/vix';
  const response=await fetch(url,{headers:{
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'en-US,en;q=0.9',
    'cache-control':'no-cache',
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36'
  }});
  const html=await response.text();
  if(!response.ok) throw new Error('Cboe VIX HTTP '+response.status+' body='+normalizeHtmlText(html).slice(0,160));
  const plain=normalizeHtmlText(html);
  const spot=plain.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*VIX\s*Spot\s*Price/i)
    || plain.match(/VIX\s*Spot\s*Price\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i)
    || plain.match(/Trade\s*Data[\s\S]{0,180}?\$\s*([0-9]+(?:\.[0-9]+)?)/i);
  if(!spot) throw new Error('Cboe VIX spot parse failed: '+plain.slice(0,260));
  const value=Number(spot[1]);
  if(!(value>5&&value<100)) throw new Error('Cboe VIX invalid value '+value);
  const changeMatch=plain.match(/Change\s*([+-]?\d+(?:\.\d+)?)%\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*\)/i);
  const changePct=changeMatch?Number(changeMatch[1]):null;
  const changeValue=changeMatch?Number(changeMatch[2]):null;
  const previousClose=Number.isFinite(changeValue)?round(value-changeValue,2):null;
  return {key:'^VIX',label:'VIX',name:'VIX',value:round(value,2),previousClose,changeValue:Number.isFinite(changeValue)?round(changeValue,2):null,changePct:Number.isFinite(changePct)?round(changePct,2):null,changeUnit:'index',unit:'index',asOf:new Date().toISOString(),source:'Cboe VIX Spot Price',provider:'Cboe',providerPriority:1,priceSession:'DELAYED',sessionLabel:'Cboe 지연'};
}
`;

const snapshotMarker='export async function fetchMarketSnapshot';
if(!text.includes(snapshotMarker)) throw new Error('fetchMarketSnapshot marker not found');

const patchStart=text.indexOf('function normalizeHtmlText(');
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
      const row={key,label,name:label,value:null,changeValue:null,changePct:null,changeUnit:'bp',unit:'percent',source:'Npay 증권 미국 국채',provider:'Npay 증권',error:message};
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
console.log('Patched market.js: exact Npay Treasury row parser + Cboe VIX fallback.');
