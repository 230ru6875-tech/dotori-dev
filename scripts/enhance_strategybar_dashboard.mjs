import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const path='strategybar-runtime/dist/index.html';
let html=fs.readFileSync(path,'utf8');

html=html.replace(/\n?<style id="strategybar-enhancer-style">[\s\S]*?<\/style>\s*/gi,'\n');
html=html.replace(/\n?<script id="strategybar-enhancer-script"[^>]*>[\s\S]*?<\/script>\s*/gi,'\n');

const style=String.raw`
<style id="strategybar-enhancer-style">
.sb-market-responsive.sb-market-repaired{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:8px!important;width:100%!important}
.sb-market-repaired .sb-market-repair-card{border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:9px 10px;min-width:0;background:rgba(8,12,18,.35)}
.sb-market-repaired .sb-market-repair-label{font-size:12px;color:#cbd5e1;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-market-repaired .sb-market-repair-value{font-size:16px;font-weight:700;color:#f8fafc;line-height:1.15}
.sb-market-repaired .sb-market-repair-change{font-size:11px;margin-top:5px;color:#94a3b8}
.sb-market-repaired .sb-market-repair-change.up{color:#fb7185}.sb-market-repaired .sb-market-repair-change.down{color:#60a5fa}
</style>`;

const injection=String.raw`
<script id="strategybar-enhancer-script" data-market-label-version="market-repair-v4">
(function(){
  var labels={
    '^GSPC':'S&P 500','^NDX':'나스닥 100','^SOX':'필라델피아 반도체','^RUT':'러셀 2000','^VIX':'VIX',
    'DX-Y.NYB':'달러지수 DXY','KRW=X':'원/달러 환율','CL=F':'WTI 국제유가',
    'DGS2':'미 2년물','DGS10':'미 10년물','DGS30':'미 30년물','M04020000':'금 1G 국내시세'
  };
  var order=['^GSPC','^NDX','^SOX','^RUT','^VIX','DX-Y.NYB','KRW=X','CL=F','DGS2','DGS10','DGS30','M04020000'];
  function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));}
  function valueText(row){
    if(!row||!finite(row.value))return '확인불가';
    var v=Number(row.value);
    if(/^DGS/.test(row.key))return v.toFixed(3)+'%';
    if(row.key==='M04020000')return Math.round(v).toLocaleString('ko-KR')+'원/g';
    if(row.key==='CL=F')return '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    if(row.key==='KRW=X')return v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
    return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function changeText(row){
    if(!row)return '—';
    if(/^DGS/.test(row.key)){
      if(!finite(row.changeValue))return '—';
      var bp=Number(row.changeValue);return (bp>0?'+':'')+bp.toFixed(1)+'bp';
    }
    if(finite(row.changePct)){
      var p=Number(row.changePct);return (p>0?'+':'')+p.toFixed(2)+'%';
    }
    if(finite(row.changeValue)){
      var c=Number(row.changeValue);return (c>0?'+':'')+c.toFixed(2);
    }
    return '—';
  }
  function changeClass(row){
    var key=row&&row.key?row.key:'';
    var n=/^DGS/.test(key)?Number(row&&row.changeValue):Number(row&&row.changePct);
    return Number.isFinite(n)?(n>0?'up':n<0?'down':''):'';
  }
  function card(row,key){
    var el=document.createElement('div');el.className='sb-market-repair-card';el.dataset.marketKey=key;
    var label=document.createElement('div');label.className='sb-market-repair-label';label.textContent=labels[key]||(row&&(row.label||row.name))||key;
    var value=document.createElement('div');value.className='sb-market-repair-value';value.textContent=valueText(row);
    var change=document.createElement('div');change.className='sb-market-repair-change '+changeClass(row);change.textContent=changeText(row);
    if(key==='^VIX')change.classList.add('sb-vix-reading');
    el.append(label,value,change);return el;
  }
  async function repairMarket(){
    var grid=document.querySelector('.sb-market-responsive');
    if(!grid)return;
    try{
      var r=await fetch('/api/market?force=1&t='+Date.now(),{cache:'no-store'});
      if(!r.ok)return;
      var data=await r.json(),rows=Array.isArray(data.market)?data.market:[],byKey={};
      rows.forEach(function(x){if(x&&x.key)byKey[x.key]=x;});
      grid.classList.add('sb-market-repaired');grid.replaceChildren();
      order.forEach(function(key){grid.appendChild(card(byKey[key]||{key:key,value:null},key));});
    }catch(e){}
  }
  function replaceMarketLabels(){
    if(!document.body)return;
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),node;
    while((node=walker.nextNode())){
      var raw=node.nodeValue||'',key=raw.trim();
      if(Object.prototype.hasOwnProperty.call(labels,key))node.nodeValue=raw.replace(key,labels[key]);
    }
  }
  function start(){replaceMarketLabels();repairMarket();setInterval(repairMarket,15000);setInterval(replaceMarketLabels,2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
</script>`;

function insertBeforeLastTag(source,tag,payload){
  const needle='</'+tag+'>';
  const pos=source.toLowerCase().lastIndexOf(needle);
  if(pos<0)throw new Error('closing '+tag+' tag not found');
  return source.slice(0,pos)+payload+'\n'+source.slice(pos);
}

const scriptMatch=injection.match(/<script[^>]*>([\s\S]*)<\/script>/i);
if(!scriptMatch)throw new Error('enhancer script extraction failed');
const checkPath='/tmp/strategybar-enhancer-check.js';
fs.writeFileSync(checkPath,scriptMatch[1]);
execFileSync(process.execPath,['--check',checkPath],{stdio:'inherit'});

html=insertBeforeLastTag(html,'head',style);
html=insertBeforeLastTag(html,'body',injection);
if((html.match(/id="strategybar-enhancer-script"/g)||[]).length!==1)throw new Error('enhancer marker count invalid');
fs.writeFileSync(path,html);
console.log('Applied StrategyBar market pulse repair v4 at final head/body tags.');
