import fs from 'node:fs';
const path='strategybar-runtime/dist/index.html';
let html=fs.readFileSync(path,'utf8');
const injection=String.raw`
<style id="strategybar-enhancer-style">
.sb-market-pulse-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;width:100%!important}
.sb-market-pulse-grid>.sb-market-card{display:block!important;min-width:0!important;width:auto!important;border:1px solid rgba(148,163,184,.22)!important;border-radius:12px!important;padding:10px!important}
.sb-stock-list{display:flex!important;flex-direction:column!important;gap:7px!important;width:100%!important}
.sb-stock-list>.sb-stock-row{display:grid!important;grid-template-columns:minmax(170px,1.2fr) repeat(5,minmax(85px,.7fr)) minmax(180px,1.4fr)!important;align-items:center!important;width:100%!important;max-width:none!important;min-height:46px!important;margin:0!important;padding:8px 10px!important;box-sizing:border-box!important}
.sb-stock-row .sb-extra-detail{grid-column:1/-1;margin-top:5px;padding-top:5px;border-top:1px solid rgba(148,163,184,.14);display:flex;flex-wrap:wrap;gap:5px 12px;font-size:10px}
.sb-stock-row .sb-k{opacity:.65}.sb-stock-row .sb-v{font-weight:700}.sb-vix-reading{margin-top:5px;font-size:11px;font-weight:700}
@media(max-width:1100px){.sb-market-pulse-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.sb-stock-list>.sb-stock-row{grid-template-columns:minmax(150px,1fr) repeat(3,minmax(80px,.7fr))!important}}
</style>
<script id="strategybar-enhancer-script">
(()=>{
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
const fmt=(n,d=2)=>finite(n)?Number(n).toLocaleString('ko-KR',{maximumFractionDigits:d}):'--';
const money=n=>finite(n)?'$'+fmt(n,2):'--'; const pct=n=>finite(n)?(Number(n)>=0?'+':'')+Number(n).toFixed(2)+'%':'--';
const compact=n=>{const x=Number(n);if(!Number.isFinite(x))return'--';if(Math.abs(x)>=1e9)return(x/1e9).toFixed(2)+'B';if(Math.abs(x)>=1e6)return(x/1e6).toFixed(2)+'M';return fmt(x,0)};
function smallestContaining(text,max=2500){return [...document.querySelectorAll('div,section,article')].filter(e=>(e.textContent||'').includes(text)&&(e.textContent||'').length<max).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
function stockCard(symbol){return [...document.querySelectorAll('div,section,article')].filter(e=>{const t=e.textContent||'';return t.includes(symbol)&&t.length<1600&&(t.includes('RSI')||t.includes('가격')||t.includes('점수'))}).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
function marketCard(name){return [...document.querySelectorAll('div,section,article')].filter(e=>{const t=(e.textContent||'').trim();return t.includes(name)&&t.length<600}).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
function vixReading(v){const n=Number(v);if(!finite(n))return'해석 대기';if(n<15)return'안정 · 변동성 낮음';if(n<20)return'보통 · 정상 범위';if(n<25)return'경계 · 변동성 확대';if(n<30)return'위험 확대 · 신규매수 보수적';return'공포 구간 · 급격한 변동 주의'}
function applyMarket(data){const names=['S&P 500','나스닥 100','필라델피아 반도체','러셀 2000','VIX','DXY','USD/KRW','WTI','미 2년물','미 10년물','미 30년물'];const cards=names.map(marketCard).filter((x,i,a)=>x&&a.indexOf(x)===i);if(cards.length<3)return;let parent=cards[0].parentElement;while(parent&&parent!==document.body&&!cards.every(c=>parent.contains(c)))parent=parent.parentElement;if(!parent||parent===document.body)return;parent.classList.add('sb-market-pulse-grid');cards.forEach(c=>c.classList.add('sb-market-card'));const v=(data.market||[]).find(x=>x.key==='^VIX'||String(x.name||'').toUpperCase()==='VIX');const vc=marketCard('VIX');if(vc){vc.querySelector('.sb-vix-reading')?.remove();const d=document.createElement('div');d.className='sb-vix-reading';d.textContent=vixReading(v?.value);vc.appendChild(d)}}
function applyStocks(data){const cards=[];for(const [symbol,row] of Object.entries(data.symbols||{})){const c=stockCard(symbol);if(!c||cards.includes(c))continue;cards.push(c);c.classList.add('sb-stock-row');c.querySelector('.sb-extra-detail')?.remove();const d=document.createElement('div');d.className='sb-extra-detail';const f=[['전일',money(row.previousClose)],['시가',money(row.open)],['고가',money(row.dayHigh)],['저가',money(row.dayLow)],['등락',pct(row.changePct)],['거래량',compact(row.volume)],['세션',row.sessionLabel||row.priceSession||'--'],['출처',row.provider||row.source||'--']];d.innerHTML=f.map(([k,v])=>'<span><span class="sb-k">'+k+' </span><span class="sb-v">'+v+'</span></span>').join('');c.appendChild(d)}if(cards.length<2)return;let parent=cards[0].parentElement;while(parent&&parent!==document.body&&!cards.every(c=>parent.contains(c)))parent=parent.parentElement;if(parent&&parent!==document.body)parent.classList.add('sb-stock-list')}
async function enhance(){try{const r=await fetch('/api/market?force=1&t='+Date.now(),{cache:'no-store'});const d=await r.json();applyMarket(d);applyStocks(d)}catch(e){console.error('StrategyBar enhancer failed',e)}}
const boot=()=>{enhance();setInterval(enhance,60000)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
</script>`;
html=html.replace(/\n?<style id="strategybar-enhancer-style">[\s\S]*?<\/style>\s*<script id="strategybar-enhancer-script">[\s\S]*?<\/script>/i,'');
html=html.replace(/<\/body>/i,injection+'\n</body>');
fs.writeFileSync(path,html);
console.log('Forced Market Pulse cards and one-row-per-stock layout.');
