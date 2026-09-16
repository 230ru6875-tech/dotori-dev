import fs from 'node:fs';

const path = 'strategybar-runtime/cloudflare/market.js';
let text = fs.readFileSync(path, 'utf8');

const oldYield = `async function fetchTwoYearYield() {
  const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2", { headers:{accept:"text/csv"} });
  if (!response.ok) throw new Error(\`FRED \${response.status}\`);
  const rows=(await response.text()).trim().split(/\\r?\\n/).slice(1).map((line)=>line.split(",")).filter((row)=>finite(row[1]));
  const current=rows.at(-1), previous=rows.at(-2), value=Number(current[1]), prior=Number(previous[1]);
  return {key:"DGS2",label:"미 2년물",value:round(value,3),changeValue:round((value-prior)*100,1),changePct:round((value/prior-1)*100,3),changeUnit:"bp",unit:"percent",observationDate:current[0],source:"FRED DGS2"};
}`;

const newYield = `async function fetchFredYield(seriesId, label) {
  const response = await fetch(\`https://fred.stlouisfed.org/graph/fredgraph.csv?id=\${seriesId}\`, { headers:{accept:"text/csv"} });
  if (!response.ok) throw new Error(\`FRED \${seriesId} \${response.status}\`);
  const rows=(await response.text()).trim().split(/\\r?\\n/).slice(1).map((line)=>line.split(",")).filter((row)=>finite(row[1]));
  if (rows.length < 2) throw new Error(\`No FRED data for \${seriesId}\`);
  const current=rows.at(-1), previous=rows.at(-2), value=Number(current[1]), prior=Number(previous[1]);
  return {key:seriesId,label,value:round(value,3),changeValue:round((value-prior)*100,1),changePct:round((value/prior-1)*100,3),changeUnit:"bp",unit:"percent",observationDate:current[0],source:\`FRED \${seriesId}\`};
}

function numberFromText(value) {
  if (value === null || value === undefined) return null;
  const normalized=String(value).replaceAll(",","").replace(/[^0-9+\\-.]/g,"");
  return finite(normalized) ? Number(normalized) : null;
}

function findDomesticGold(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found=findDomesticGold(item); if (found) return found; }
    return null;
  }
  const code=String(node.symbolCode || node.reutersCode || node.code || "");
  const name=String(node.name || node.indexName || node.koreanName || "");
  if (code === "M04020000" || /국내.*금|금.*국내/.test(name)) return node;
  for (const value of Object.values(node)) { const found=findDomesticGold(value); if (found) return found; }
  return null;
}

async function fetchDomesticGold() {
  const response=await fetch("https://m.stock.naver.com/front-api/marketIndex/metals", {headers:{accept:"application/json","user-agent":"Mozilla/5.0 StrategyBar/1.0"}});
  if (!response.ok) throw new Error(\`Naver metals \${response.status}\`);
  const body=await response.json();
  const row=findDomesticGold(body);
  if (!row) throw new Error("Domestic gold not found");
  const value=numberFromText(row.closePrice ?? row.price ?? row.tradePrice);
  const changePct=numberFromText(row.fluctuationsRatio ?? row.changeRate ?? row.changePct);
  const changeValue=numberFromText(row.fluctuations ?? row.compareToPreviousClosePrice ?? row.changeValue);
  if (!finite(value)) throw new Error("Domestic gold price unavailable");
  return {key:"M04020000",label:"금 1g 국내시세",value:round(value,0),changeValue:finite(changeValue)?round(changeValue,0):null,changePct:finite(changePct)?round(changePct,2):null,changeUnit:"krw",unit:"krw_per_g",source:"Naver Finance 국내 금",provider:"NAVER",asOf:new Date().toISOString()};
}`;

if (!text.includes(oldYield)) throw new Error('Expected two-year yield block not found');
text = text.replace(oldYield, newYield);

const oldPush = `  try { market.push(await fetchTwoYearYield()); } catch (error) { market.push({key:"DGS2",label:"미 2년물",value:null,changeValue:null,changePct:null,changeUnit:"bp",unit:"percent",source:"FRED DGS2",error:error instanceof Error?error.message:"unavailable"}); }
  return {ok:Object.keys(symbols).length>0,asOf:new Date().toISOString(),session:all.SPY?.priceSession||"REGULAR",refreshAfterSeconds:60,symbols,market,
    sources:["Yahoo Finance chart","FRED DGS2","Stooq EOD fallback"],errors:results.filter((x)=>x?.error)};`;

const newPush = `  for (const [seriesId,label] of [["DGS30","미 30년물"],["DGS10","미 10년물"],["DGS2","미 2년물"]]) {
    try { market.push(await fetchFredYield(seriesId,label)); }
    catch (error) { market.push({key:seriesId,label,value:null,changeValue:null,changePct:null,changeUnit:"bp",unit:"percent",source:\`FRED \${seriesId}\`,error:error instanceof Error?error.message:"unavailable"}); }
  }
  try { market.push(await fetchDomesticGold()); }
  catch (error) { market.push({key:"M04020000",label:"금 1g 국내시세",value:null,changeValue:null,changePct:null,changeUnit:"krw",unit:"krw_per_g",source:"Naver Finance 국내 금",error:error instanceof Error?error.message:"unavailable"}); }
  return {ok:Object.keys(symbols).length>0,asOf:new Date().toISOString(),session:all.SPY?.priceSession||"REGULAR",refreshAfterSeconds:60,symbols,market,
    sources:["Yahoo Finance chart","FRED DGS30","FRED DGS10","FRED DGS2","Naver Finance 국내 금","Stooq EOD fallback"],errors:results.filter((x)=>x?.error)};`;

if (!text.includes(oldPush)) throw new Error('Expected market push block not found');
text = text.replace(oldPush, newPush);
fs.writeFileSync(path, text);
console.log('Patched market.js with US 30Y/10Y/2Y yields and domestic gold.');
