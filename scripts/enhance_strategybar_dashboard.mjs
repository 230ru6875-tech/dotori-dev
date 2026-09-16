import fs from 'node:fs';
const path='strategybar-runtime/dist/index.html';
let html=fs.readFileSync(path,'utf8');
const injection=String.raw`
<style id="strategybar-enhancer-style">
.sb-market-pulse-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;width:100%!important}
.sb-market-pulse-grid>.sb-market-card{display:block!important;min-width:0!important;width:auto!important;border:1px solid rgba(148,163,184,.22)!important;border-radius:12px!important;padding:10px!important}
.sb-stock-table-wrap{width:100%;overflow:auto;border:1px solid rgba(148,163,184,.18);border-radius:10px;margin-top:8px}
.sb-stock-table{width:100%;min-width:1080px;border-collapse:collapse;font-size:12px;background:#0b1119;color:#d8e0eb}
.sb-stock-table th{position:sticky;top:0;background:#0d1621;color:#8190a4;font-size:11px;font-weight:700;text-align:right;padding:7px 8px;border-bottom:1px solid #243141;white-space:nowrap}
.sb-stock-table th:nth-child(1),.sb-stock-table th:nth-child(2){text-align:left}.sb-stock-table td{padding:5px 8px;border-bottom:1px solid rgba(148,163,184,.10);text-align:right;white-space:nowrap;height:28px}.sb-stock-table td:nth-child(1),.sb-stock-table td:nth-child(2){text-align:left}.sb-stock-table tr:hover{background:rgba(59,130,246,.06)}
.sb-symbol{font-weight:800;font-size:13px}.sb-pos{color:#ff5876}.sb-neg{color:#4b8fff}.sb-neutral{color:#cbd5e1}.sb-warn{color:#ffbf36}.sb-score{display:inline-block;min-width:24px;padding:2px 5px;border-radius:8px;background:#14283a;color:#dcecff;font-weight:800;text-align:center}.sb-risk{display:inline-block;min-width:24px;padding:2px 5px;border-radius:4px;background:#493b0b;color:#ffd45a;font-weight:800;text-align:center}.sb-signal{display:inline-block;min-width:62px;padding:3px 8px;border-radius:5px;border:1px solid #6c5915;background:#302b0e;color:#ffd54a;font-weight:800;text-align:center}.sb-spark{font-family:monospace;letter-spacing:-2px;font-size:13px}.sb-vix-reading{margin-top:5px;font-size:11px;font-weight:700}
.sb-original-stock-hidden{display:none!important}
@media(max-width:1100px){.sb-market-pulse-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
</style>
<script id="strategybar-enhancer-script">
(()=>{
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
const fmt=(n,d=2)=>finite(n)?Number(n).toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d}):'--';
const pct=n=>finite(n)?(Number(n)>=0?'+':'')+Number(n).toFixed(2)+'%':'--';
const ratio=n=>finite(n)?Number(n).toFixed(2)+'×':'--';
const cls=n=>!finite(n)?'sb-neutral':Number(n)>0?'sb-pos':Number(n)<0?'sb-neg':'sb-neutral';
function marketCard(name){return [...document.querySelectorAll('div,section,article')].filter(e=>{const t=(e.textContent||'').trim();return t.includes(name)&&t.length<600}).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
function vixReading(v){const n=Number(v);if(!finite(n))return'해석 대기';if(n<15)return'안정 · 변동성 낮음';if(n<20)return'보통 · 정상 범위';if(n<25)return'경계 · 변동성 확대';if(n<30)return'위험 확대 · 신규매수 보수적';return'공포 구간 · 급격한 변동 주의'}
function applyMarket(data){const names=['S&P 500','나스닥 100','필라델피아 반도체','러셀 2000','VIX','DXY','USD/KRW','WTI','미 2년물','미 10년물','미 30년물'];const cards=names.map(marketCard).filter((x,i,a)=>x&&a.indexOf(x)===i);if(cards.length<3)return;let parent=cards[0].parentElement;while(parent&&parent!==document.body&&!cards.every(c=>parent.contains(c)))parent=parent.parentElement;if(!parent||parent===document.body)return;parent.classList.add('sb-market-pulse-grid');cards.forEach(c=>c.classList.add('sb-market-card'));const v=(data.market||[]).find(x=>x.key==='^VIX'||String(x.name||'').toUpperCase()==='VIX');const vc=marketCard('VIX');if(vc){vc.querySelector('.sb-vix-reading')?.remove();const d=document.createElement('div');d.className='sb-vix-reading';d.textContent=vixReading(v?.value);vc.appendChild(d)}}
function spark(row){const up=finite(row.changePct)&&Number(row.changePct)>=0;return '<span class="sb-spark '+(up?'sb-pos':'sb-neg')+'">⌁⌃⌄⌁⌃⌄⌃⌁</span>'}
function risk(row){let r=50;if(finite(row.rsi)&&row.rsi>70)r+=15;if(finite(row.volatility20)&&row.volatility20>80)r+=15;if(finite(row.ma20Gap)&&row.ma20Gap<-8)r+=10;return Math.max(0,Math.min(99,Math.round(r)))}
function stockHost(){const labels=['전략 신호','전략신호','RSI','MA20','VWAP'];const nodes=[...document.querySelectorAll('section,div')].filter(e=>{const t=e.textContent||'';return labels.filter(x=>t.includes(x)).length>=3&&t.length>500});return nodes.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
function renderStocks(data){const rows=Object.values(data.symbols||{});if(!rows.length)return;let host=stockHost();if(!host)return;let wrap=document.getElementById('sb-detailed-stock-table');if(!wrap){wrap=document.createElement('div');wrap.id='sb-detailed-stock-table';wrap.className='sb-stock-table-wrap';host.parentElement.insertBefore(wrap,host);host.classList.add('sb-original-stock-hidden')}
wrap.innerHTML='<table class="sb-stock-table"><thead><tr><th>비교</th><th>종목</th><th>현재가</th><th>등락</th><th>흐름</th><th>거래량</th><th>RSI</th><th>MA20</th><th>VWAP</th><th>지지선</th><th>위험</th><th>점수 ↓</th><th>전략 신호</th></tr></thead><tbody>'+rows.map(row=>{const score=finite(row.score)?Math.round(row.score):50;const sig=row.signal||'대기';return '<tr data-symbol="'+row.symbol+'"><td>＋</td><td class="sb-symbol">'+row.symbol+'</td><td><b>'+fmt(row.price,2)+'</b></td><td class="'+cls(row.changePct)+'">'+pct(row.changePct)+'</td><td>'+spark(row)+'</td><td class="'+(finite(row.volumeRatio)&&row.volumeRatio>=1.5?'sb-warn':'')+'">'+ratio(row.volumeRatio)+'</td><td>'+ (finite(row.rsi)?Math.round(row.rsi):'--') +'</td><td class="'+cls(row.ma20Gap)+'">'+pct(row.ma20Gap)+'</td><td class="'+cls(row.vwapGapPct??0)+'">'+pct(row.vwapGapPct??0)+'</td><td class="'+cls(row.support&&row.price?((row.price/row.support-1)*100):null)+'">'+(finite(row.support)&&finite(row.price)?pct((row.price/row.support-1)*100):'--')+'</td><td><span class="sb-risk">'+risk(row)+'</span></td><td><span class="sb-score">'+score+'</span></td><td><span class="sb-signal">'+sig+'</span></td></tr>'}).join('')+'</tbody></table>'}
async function enhance(){try{const r=await fetch('/api/market?force=1&t='+Date.now(),{cache:'no-store'});const d=await r.json();applyMarket(d);renderStocks(d)}catch(e){console.error('StrategyBar enhancer failed',e)}}
const boot=()=>{enhance();setInterval(enhance,60000)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
</script>`;
html=html.replace(/\n?<style id="strategybar-enhancer-style">[\s\S]*?<\/style>\s*<script id="strategybar-enhancer-script">[\s\S]*?<\/script>/i,'');
html=html.replace(/<\/body>/i,injection+'\n</body>');
fs.writeFileSync(path,html);
console.log('Applied Market Pulse cards and detailed one-row stock table.');
