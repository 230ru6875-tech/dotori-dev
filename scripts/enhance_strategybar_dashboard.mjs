import fs from 'node:fs';

const path='strategybar-runtime/dist/index.html';
let html=fs.readFileSync(path,'utf8');

const injection=String.raw`
<style id="strategybar-enhancer-style">
  .sb-extra-detail{margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.18);display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;line-height:1.25;color:#cbd5e1}
  .sb-extra-detail>div{display:flex;gap:5px;align-items:baseline;white-space:nowrap}
  .sb-extra-detail .sb-k{color:#7f8da3;font-size:10px}
  .sb-extra-detail .sb-v{font-weight:700;color:#eef4ff;font-size:11px}
  .sb-market-responsive{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:8px!important}
  .sb-stock-row{width:100%!important;max-width:none!important;display:block!important;grid-column:1/-1!important}
  .sb-vix-card .sb-vix-reading{margin-top:5px;font-size:11px;font-weight:700;color:#dbeafe}
  @media(min-width:1100px){.sb-market-responsive{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
</style>
<script id="strategybar-enhancer-script">
(()=>{
  const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('ko-KR',{maximumFractionDigits:d}):'--';
  const pct=(n)=>Number.isFinite(Number(n))?(Number(n)>=0?'+':'')+Number(n).toFixed(2)+'%':'--';
  const money=(n)=>Number.isFinite(Number(n))?'$'+fmt(n,2):'--';
  const compact=(n)=>{const x=Number(n);if(!Number.isFinite(x))return'--';if(Math.abs(x)>=1e9)return(x/1e9).toFixed(2)+'B';if(Math.abs(x)>=1e6)return(x/1e6).toFixed(2)+'M';if(Math.abs(x)>=1e3)return(x/1e3).toFixed(1)+'K';return fmt(x,0)};
  function findCardForSymbol(symbol){
    const nodes=[...document.querySelectorAll('div,section,article')].filter(el=>el.children.length&&el.textContent&&el.textContent.includes(symbol));
    return nodes.find(el=>{const t=el.textContent||'';return t.includes('가격')&&t.includes('RSI')&&t.length<1400})||null;
  }
  function addDetails(card,row){
    if(!card)return; card.classList.add('sb-stock-row');
    card.querySelector('.sb-extra-detail')?.remove();
    const details=document.createElement('div');details.className='sb-extra-detail';
    const fields=[['전일종가',money(row.previousClose)],['시가',money(row.open)],['고가',money(row.dayHigh)],['저가',money(row.dayLow)],['등락률',pct(row.changePct)],['거래량',compact(row.volume??row.dailyVolume)],['VWAP',money(row.vwap)],['세션',row.sessionLabel||row.priceSession||'--'],['데이터',row.provider||row.source||'--'],['시각',row.asOf?new Date(row.asOf).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'--']];
    details.innerHTML=fields.map(([k,v])=>'<div><span class="sb-k">'+k+'</span><span class="sb-v">'+v+'</span></div>').join('');card.appendChild(details);
  }
  function makeMarketCards(){
    const candidates=[...document.querySelectorAll('section,div')].filter(el=>{const t=el.textContent||'';return t.includes('S&P 500')&&t.includes('나스닥 100')&&t.includes('WTI')&&t.length<3500});
    const box=candidates.sort((a,b)=>a.textContent.length-b.textContent.length)[0];if(!box)return;
    const grids=[...box.querySelectorAll('div')].filter(el=>el.children.length>=3&&el.children.length<=20);
    const grid=grids.find(el=>{const t=el.textContent||'';return t.includes('S&P 500')&&t.includes('WTI')});if(grid)grid.classList.add('sb-market-responsive');
  }
  function vixReading(v){const n=Number(v);if(!Number.isFinite(n))return'해석 대기';if(n<15)return'안정 · 변동성 낮음';if(n<20)return'보통 · 변동성 정상 범위';if(n<25)return'경계 · 변동성 확대';if(n<30)return'위험 확대 · 신규매수 보수적 접근';return'공포 구간 · 급격한 변동 주의'}
  function annotateVix(data){
    const row=(data.market||[]).find(x=>x.key==='^VIX'||String(x.name||'').toUpperCase().includes('VIX'));
    const nodes=[...document.querySelectorAll('div,section,article')].filter(el=>/\bVIX\b/i.test(el.textContent||'')&&(el.textContent||'').length<800);
    const card=nodes.sort((a,b)=>a.textContent.length-b.textContent.length)[0];if(!card)return;
    card.classList.add('sb-vix-card');card.querySelector('.sb-vix-reading')?.remove();const d=document.createElement('div');d.className='sb-vix-reading';d.textContent=vixReading(row?.value);card.appendChild(d);
  }
  async function enhance(){try{const res=await fetch('/api/market?force=1&t='+Date.now(),{cache:'no-store'});const data=await res.json();for(const [symbol,row] of Object.entries(data.symbols||{})){const card=findCardForSymbol(symbol);if(card)addDetails(card,row)}makeMarketCards();annotateVix(data)}catch(e){console.warn('StrategyBar enhancer',e)}}
  const run=()=>{enhance();setInterval(enhance,60000)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
</script>`;

html=html.replace(/\n?<style id="strategybar-enhancer-style">[\s\S]*?<\/style>\s*<script id="strategybar-enhancer-script">[\s\S]*?<\/script>/i,'');
html=html.replace(/<\/body>/i,injection+'\n</body>');
fs.writeFileSync(path,html);
console.log('Applied Market Pulse card layout, stock rows, and VIX interpretation.');
