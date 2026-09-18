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
.sb-invest-entry{position:fixed;right:12px;top:12px;z-index:10000;border:1px solid rgba(34,197,94,.45);border-radius:999px;padding:8px 13px;background:rgba(6,78,59,.92);font-size:11px;font-weight:800;color:#ecfdf5;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28)}
.sb-invest-entry:hover{transform:translateY(-1px);border-color:rgba(134,239,172,.8)}
.sb-live-status{position:fixed;right:12px;bottom:12px;z-index:9999;border:1px solid rgba(148,163,184,.3);border-radius:999px;padding:5px 9px;background:rgba(8,12,18,.92);font-size:10px;color:#94a3b8;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.sb-live-status.online{color:#86efac;border-color:rgba(134,239,172,.35)}.sb-live-status.connecting{color:#fde68a}.sb-live-status.offline{color:#fca5a5}
.sb-live-quote{margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.16);display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
.sb-live-quote .sb-live-price{font-size:18px;font-weight:800;color:#f8fafc}.sb-live-quote .sb-live-change{font-size:12px;font-weight:700}.sb-live-quote .sb-live-change.up{color:#fb7185}.sb-live-quote .sb-live-change.down{color:#60a5fa}
.sb-live-quote .sb-live-meta{font-size:9px;color:#7f8da3}.sb-live-quote.flash{animation:sbQuoteFlash .55s ease-out}
.sb-survival{margin:10px 0 12px;padding:11px;border:1px solid rgba(34,197,94,.28);border-radius:10px;background:rgba(8,12,18,.48)}
.sb-survival-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.sb-survival-title{font-size:13px;font-weight:800;color:#f8fafc}.sb-survival-mode{font-size:9px;color:#86efac}
.sb-survival-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;margin-top:8px}
.sb-survival-card{border:1px solid rgba(148,163,184,.16);border-radius:8px;padding:7px;background:rgba(15,23,42,.45)}
.sb-survival-label{font-size:9px;color:#94a3b8}.sb-survival-value{font-size:14px;font-weight:800;color:#f8fafc;margin-top:3px}
.sb-survival-progress{height:8px;background:rgba(148,163,184,.14);border-radius:999px;overflow:hidden;margin-top:8px}
.sb-survival-progress>span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#60a5fa);width:0}
.sb-survival-positions{font-size:9px;color:#cbd5e1;margin-top:7px}
.sb-candidates{margin:10px 0 12px;padding:10px;border:1px solid rgba(59,130,246,.28);border-radius:10px;background:rgba(8,12,18,.42)}
.sb-candidates-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.sb-candidates-title{font-size:13px;font-weight:800;color:#f8fafc}.sb-candidates-note{font-size:9px;color:#94a3b8}
.sb-candidates-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px}
.sb-candidate{min-width:0;border:1px solid rgba(148,163,184,.16);border-radius:8px;padding:8px;background:rgba(15,23,42,.42)}
.sb-candidate-top{display:flex;align-items:center;justify-content:space-between;gap:6px}.sb-candidate-symbol{font-size:13px;font-weight:800;color:#fff}
.sb-candidate-score{font-size:10px;font-weight:700;color:#93c5fd}.sb-candidate-price{font-size:14px;font-weight:800;color:#f8fafc;margin-top:5px}
.sb-candidate-meta{font-size:9px;color:#94a3b8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-candidate-strategy{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
.sb-candidate-badge{font-size:9px;padding:2px 5px;border:1px solid rgba(148,163,184,.22);border-radius:999px;color:#cbd5e1}
.sb-candidate-badge.hot{color:#fde68a;border-color:rgba(253,230,138,.4)}
.sb-candidate-badge.good{color:#86efac;border-color:rgba(134,239,172,.35)}
.sb-candidate-badge.bad{color:#fca5a5;border-color:rgba(252,165,165,.35)}
.sb-candidate-heads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:6px}
.sb-candidate-head{font-size:8px;border:1px solid rgba(148,163,184,.15);border-radius:5px;padding:3px 4px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-candidate-history{font-size:9px;color:#a5b4fc;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-candidate-change.up{color:#fb7185}.sb-candidate-change.down{color:#60a5fa}
.sb-detail{margin:10px 0 12px;padding:12px;border:1px solid rgba(148,163,184,.22);border-radius:10px;background:rgba(8,12,18,.55)}
.sb-detail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.sb-detail-title{font-size:14px;font-weight:800;color:#f8fafc}.sb-detail-controls{display:flex;gap:5px;flex-wrap:wrap}
.sb-detail-btn{font-size:10px;padding:4px 7px;border:1px solid rgba(148,163,184,.25);border-radius:6px;background:#111827;color:#cbd5e1;cursor:pointer}
.sb-detail-btn.active{border-color:rgba(96,165,250,.8);color:#fff}
.sb-detail-chart-wrap{overflow-x:auto}.sb-detail-chart{width:100%;min-width:720px;height:300px;display:block}
.sb-detail-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:#cbd5e1;margin:6px 0}
.sb-detail-metrics{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.sb-detail-metric{font-size:10px;border:1px solid rgba(148,163,184,.18);border-radius:7px;padding:5px 7px;color:#cbd5e1}
.sb-detail-rs{margin-top:8px}.sb-detail-rs svg{width:100%;height:90px;display:block}
.sb-candidate{cursor:pointer}

/* Tablet portrait layout */
.sb-portrait-chips{scrollbar-width:none}
.sb-portrait-chips::-webkit-scrollbar{display:none}
@media (min-width:700px) and (max-width:1100px) and (orientation:portrait){
  html,body{max-width:100%;overflow-x:hidden}
  .sb-invest-entry{top:16px;right:16px;padding:9px 13px;font-size:13px;line-height:1;border-radius:999px}
  .sb-market-responsive.sb-market-repaired{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .sb-candidates-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sb-survival-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .sb-detail-chart{min-width:640px;height:270px}
  .sb-portrait-search-row{display:grid!important;grid-template-columns:minmax(0,1fr) 170px!important;gap:10px!important;align-items:center!important}
  .sb-portrait-search-main,.sb-portrait-search-filter{min-width:0!important;width:100%!important}
  .sb-portrait-search-main input,.sb-portrait-search-filter select{width:100%!important;min-width:0!important}
  .sb-portrait-chips{display:flex!important;gap:10px!important;overflow-x:auto!important;overflow-y:hidden!important;white-space:nowrap!important;-webkit-overflow-scrolling:touch;padding-bottom:5px!important}
  .sb-portrait-chips>*{flex:0 0 auto!important}
  .sb-portrait-holding-row{display:grid!important;grid-template-columns:minmax(0,1fr) 190px!important;gap:10px!important;align-items:stretch!important}
  .sb-portrait-holding-ticker{grid-column:1/-1!important;min-width:0!important;width:100%!important}
  .sb-portrait-holding-price,.sb-portrait-holding-add{min-width:0!important;width:100%!important}
  .sb-portrait-holding-add button,.sb-portrait-holding-add{min-height:54px!important}
  .sb-portrait-signal-section{overflow:visible!important}
  .sb-portrait-signal-section table{width:100%!important;table-layout:fixed!important}
  .sb-portrait-signal-section th,.sb-portrait-signal-section td{padding:12px 10px!important}
  .sb-portrait-signal-section th:first-child,.sb-portrait-signal-section td:first-child{width:48%!important}
  .sb-portrait-signal-section th:nth-child(2),.sb-portrait-signal-section td:nth-child(2){width:52%!important}
  .sb-ticker-only{font-weight:800!important;letter-spacing:.01em}
  .sb-hide-ticker-alias{display:none!important}
}
@media (max-width:699px){
  .sb-invest-entry{top:10px;right:10px;padding:8px 11px;font-size:12px}
  .sb-candidates-grid{grid-template-columns:1fr}
  .sb-survival-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@keyframes sbQuoteFlash{0%{background:rgba(59,130,246,.18)}100%{background:transparent}}
</style>`;

const injection=String.raw`
<script id="strategybar-enhancer-script" data-market-label-version="market-repair-ws-v15">
(function(){
  var labels={
    '^GSPC':'S&P 500','^NDX':'나스닥 100','^SOX':'필라델피아 반도체','^RUT':'러셀 2000','^VIX':'VIX',
    'DX-Y.NYB':'달러지수 DXY','KRW=X':'원/달러 환율','CL=F':'WTI 국제유가',
    'DGS2':'미 2년물','DGS10':'미 10년물','DGS30':'미 30년물','M04020000':'금 1G 국내시세'
  };
  var order=['^GSPC','^NDX','^SOX','^RUT','^VIX','DX-Y.NYB','KRW=X','CL=F','DGS2','DGS10','DGS30','M04020000'];
  var LIVE_FRESH_MS=15000;
  var liveState={socket:null,retry:1000,timer:null,ping:null,symbols:[],lastMessage:0,liveSeen:{}};
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
  async function fetchSurvival(){
    try{
      var r=await fetch('/api/survival?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)return null;
      var p=await r.json();
      return p&&p.ok?p.state:null;
    }catch(e){return null;}
  }
  function renderSurvival(state){
    var grid=document.querySelector('.sb-market-responsive');
    if(!grid||!grid.parentElement)return;
    var panel=document.querySelector('.sb-survival');
    if(!panel){
      panel=document.createElement('section');panel.className='sb-survival';panel.id='investment-window';
      panel.innerHTML='<div class="sb-survival-head"><div class="sb-survival-title">10만원 → 100만원 PAPER 생존 실험</div><div class="sb-survival-mode"></div></div><div class="sb-survival-grid"></div><div class="sb-survival-progress"><span></span></div><div class="sb-survival-positions"></div>';
      grid.parentElement.insertBefore(panel,grid);
    }
    if(!state){
      panel.querySelector('.sb-survival-mode').textContent='상태 수신 대기';
      return;
    }
    var money=function(v){return Number(v||0).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';};
    var mode=panel.querySelector('.sb-survival-mode');
    mode.textContent=(state.profile||'FAST_SURVIVAL')+' · 브로커 '+(state.broker||'AUTO')+' → '+(state.activeBroker||'선택중')+(state.killSwitch?' · KILL':'')+(state.goalReached?' · 목표달성':'');
    var cards=[
      ['평가자산',money(state.equityKrw)],
      ['현금',money(state.cashKrw)],
      ['목표',money(state.targetKrw)],
      ['진행률',(Number(state.progressPct||0)).toFixed(2)+'%'],
      ['배수',(Number(state.equityMultiple||0)).toFixed(3)+'x'],
      ['최대낙폭',(Number(state.drawdownPct||0)).toFixed(2)+'%'],
      ['거래',String(state.trades||0)+'회'],
      ['승/패',String(state.wins||0)+' / '+String(state.losses||0)]
    ];
    var box=panel.querySelector('.sb-survival-grid');box.replaceChildren();
    cards.forEach(function(c){var x=document.createElement('div');x.className='sb-survival-card';x.innerHTML='<div class="sb-survival-label"></div><div class="sb-survival-value"></div>';x.children[0].textContent=c[0];x.children[1].textContent=c[1];box.appendChild(x);});
    panel.querySelector('.sb-survival-progress>span').style.width=Math.max(0,Math.min(100,Number(state.progressPct||0)))+'%';
    var pos=Object.values(state.positions||{});
    panel.querySelector('.sb-survival-positions').textContent=pos.length
      ? '보유(PAPER): '+pos.map(function(p){return p.symbol+' '+Number(p.shares||0).toFixed(4)+'주 · '+(p.broker||state.activeBroker||'');}).join(' | ')
      : '보유(PAPER): 없음';
  }
  function buildCandidates(data){
    var rows=Object.values((data&&data.symbols)||{}).filter(function(r){return r&&finite(r.score)&&finite(r.price);});
    rows.sort(function(a,b){
      var pa=String(a.signal||'')==='주목'?2:String(a.signal||'')==='관찰'?1:0;
      var pb=String(b.signal||'')==='주목'?2:String(b.signal||'')==='관찰'?1:0;
      if(pb!==pa)return pb-pa;
      return Number(b.score)-Number(a.score);
    });
    var selected=rows.filter(function(r){return Number(r.score)>=58 && String(r.signal||'')!=='주의';}).slice(0,8);
    if(selected.length<8){
      rows.forEach(function(r){
        if(selected.length>=8)return;
        if(String(r.signal||'')==='주의')return;
        if(!selected.some(function(x){return x.symbol===r.symbol;}))selected.push(r);
      });
    }
    return selected.slice(0,8);
  }
  async function fetchLearnedCandidates(){
    try{
      var r=await fetch('/api/candidates?limit=8&t='+Date.now(),{cache:'no-store'});
      if(!r.ok)return null;
      var data=await r.json();
      return data&&Array.isArray(data.candidates)?data.candidates:null;
    }catch(e){return null;}
  }
  function renderCandidates(data, learned){
    var grid=document.querySelector('.sb-market-responsive');
    if(!grid||!grid.parentElement)return;
    var panel=document.querySelector('.sb-candidates');
    if(!panel){
      panel=document.createElement('section');panel.className='sb-candidates';
      panel.innerHTML='<div class="sb-candidates-head"><div class="sb-candidates-title">매수후보 TOP 8</div><div class="sb-candidates-note">6-헤드 동적가중 + MA/터틀 + QQQ 상대강도 + 유사패턴 성과 · 30초 재선정</div></div><div class="sb-candidates-grid"></div>';
      grid.parentElement.insertBefore(panel,grid);
    }
    var list=panel.querySelector('.sb-candidates-grid');
    var picks=Array.isArray(learned)&&learned.length?learned:buildCandidates(data);
    list.replaceChildren();
    picks.forEach(function(r){
      var el=document.createElement('div');el.className='sb-candidate';el.dataset.candidateSymbol=r.symbol;
      var pct=finite(r.changePct)?Number(r.changePct):null;
      var cls=Number.isFinite(pct)?(pct>0?'up':pct<0?'down':''):'';
      var pctText=Number.isFinite(pct)?((pct>0?'+':'')+pct.toFixed(2)+'%'):'--';
      el.innerHTML='<div class="sb-candidate-top"><span class="sb-candidate-symbol"></span><span class="sb-candidate-score"></span></div><div class="sb-candidate-price"></div><div class="sb-candidate-meta"><span class="sb-candidate-change '+cls+'"></span> · <span class="sb-candidate-signal"></span> · <span class="sb-candidate-provider"></span></div><div class="sb-candidate-strategy"></div><div class="sb-candidate-heads"></div><div class="sb-candidate-history"></div>';
      el.querySelector('.sb-candidate-symbol').textContent=r.symbol;
      var shownScore=finite(r.adjustedScore)?Number(r.adjustedScore):Number(r.score);
      el.querySelector('.sb-candidate-score').textContent='점수 '+shownScore.toFixed(0)+(finite(r.penaltyScore)&&Number(r.penaltyScore)>0?' (-'+Number(r.penaltyScore).toFixed(1)+')':'');
      el.querySelector('.sb-candidate-price').textContent=quotePriceText(r);
      el.querySelector('.sb-candidate-change').textContent=pctText;
      el.querySelector('.sb-candidate-signal').textContent=(r.compositeSignal||r.signal||'후보')+(r.marketRegime?' · '+(r.marketRegime==='risk_on'?'Risk-On':r.marketRegime==='risk_off'?'Risk-Off':'중립'):'')+(r.verdict?' · '+r.verdict:'');
      el.querySelector('.sb-candidate-provider').textContent=(r.provider||'')+(finite(r.avgReturnPct)?' · 누적 '+(Number(r.avgReturnPct)>0?'+':'')+Number(r.avgReturnPct).toFixed(2)+'%':'')+(finite(r.relative20)?' · QQQ20 '+(Number(r.relative20)>0?'+':'')+Number(r.relative20).toFixed(2)+'%':'');
      var strategy=el.querySelector('.sb-candidate-strategy');
      var badges=[];
      if(r.maStack)badges.push({text:'MA '+r.maStack,cls:r.maStack==='정배열'?'good':r.maStack==='역배열'?'bad':''});
      if(r.turtleSignal)badges.push({text:'터틀 '+r.turtleSignal,cls:r.turtleSignal==='20일 돌파'?'hot':r.turtleSignal==='10일 이탈'?'bad':''});
      badges.forEach(function(b){var x=document.createElement('span');x.className='sb-candidate-badge '+b.cls;x.textContent=b.text;strategy.appendChild(x);});
      var heads=el.querySelector('.sb-candidate-heads'),hs=r.headScores||{};
      [['추세','trend'],['모멘텀','momentum'],['거래량','volume'],['상대강도','relative'],['시장','market'],['위험','risk']].forEach(function(pair){
        var x=document.createElement('span');x.className='sb-candidate-head';x.textContent=pair[0]+' '+(finite(hs[pair[1]])?Number(hs[pair[1]]).toFixed(0):'--');heads.appendChild(x);
      });
      var history=el.querySelector('.sb-candidate-history');
      if(finite(r.patternSuccessRate)&&Number(r.patternSamples||0)>0){
        history.textContent='유사패턴 '+Number(r.patternSamples)+'회 · '+(r.patternHorizon||'')+' 성공률 '+(Number(r.patternSuccessRate)*100).toFixed(0)+'% · 평균 '+(Number(r.patternAvgReturn)>0?'+':'')+Number(r.patternAvgReturn||0).toFixed(2)+'%';
      }else{
        history.textContent='유사패턴 학습 데이터 축적 중';
      }
      el.addEventListener('click',function(){loadDetail(r.symbol,'QQQ');});
      list.appendChild(el);
    });
  }
  function updateCandidateQuote(q){
    var symbol=String(q&&q.symbol||'').toUpperCase();if(!symbol)return;
    var el=document.querySelector('.sb-candidate[data-candidate-symbol="'+symbol+'"]');if(!el)return;
    var price=el.querySelector('.sb-candidate-price');if(price)price.textContent=quotePriceText(q);
    var change=el.querySelector('.sb-candidate-change');
    if(change){
      var pct=finite(q&&q.changePct)?Number(q.changePct):(finite(q&&q.price)&&finite(q&&q.previousClose)?(Number(q.price)/Number(q.previousClose)-1)*100:null);
      change.textContent=Number.isFinite(pct)?((pct>0?'+':'')+pct.toFixed(2)+'%'):'--';
      change.className='sb-candidate-change '+(Number.isFinite(pct)?(pct>0?'up':pct<0?'down':''):'');
    }
    var provider=el.querySelector('.sb-candidate-provider');if(provider&&q.provider)provider.textContent=q.provider;
  }
  function ensureDetailPanel(){
    var candidates=document.querySelector('.sb-candidates');
    if(!candidates||!candidates.parentElement)return null;
    var panel=document.querySelector('.sb-detail');
    if(panel)return panel;
    panel=document.createElement('section');panel.className='sb-detail';
    panel.innerHTML='<div class="sb-detail-head"><div class="sb-detail-title">종목 상세</div><div class="sb-detail-controls"><button class="sb-detail-btn active" data-benchmark="QQQ">QQQ 대비</button><button class="sb-detail-btn" data-benchmark="SPY">SPY 대비</button><button class="sb-detail-btn" data-benchmark="SMH">SMH 대비</button></div></div><div class="sb-detail-legend">종가 · MA5 · MA20 · MA60 · MA120 · 터틀20일고점 · 터틀10일저점</div><div class="sb-detail-chart-wrap"><svg class="sb-detail-chart" viewBox="0 0 1000 300" preserveAspectRatio="none"></svg></div><div class="sb-detail-metrics"></div><div class="sb-detail-rs"><svg viewBox="0 0 1000 90" preserveAspectRatio="none"></svg></div>';
    candidates.parentElement.insertBefore(panel,candidates.nextSibling);
    panel.querySelectorAll('.sb-detail-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        panel.querySelectorAll('.sb-detail-btn').forEach(function(x){x.classList.remove('active');});
        btn.classList.add('active');
        var symbol=panel.dataset.symbol;if(symbol)loadDetail(symbol,btn.dataset.benchmark||'QQQ');
      });
    });
    return panel;
  }
  function polylinePoints(rows,key,w,h,pad,min,max){
    var pts=[];
    rows.forEach(function(r,i){
      var v=Number(r&&r[key]);if(!Number.isFinite(v))return;
      var x=pad+(w-pad*2)*(i/Math.max(1,rows.length-1));
      var y=h-pad-(h-pad*2)*((v-min)/Math.max(1e-9,max-min));
      pts.push(x.toFixed(1)+','+y.toFixed(1));
    });
    return pts.join(' ');
  }
  function renderDetail(payload){
    var panel=ensureDetailPanel();if(!panel)return;
    var rows=(payload&&payload.rows)||[],svg=panel.querySelector('.sb-detail-chart');
    if(!rows.length){svg.innerHTML='';return;}
    var keys=['close','ma5','ma20','ma60','ma120','turtle20High','turtle10Low'],vals=[];
    rows.forEach(function(r){keys.forEach(function(k){var v=Number(r[k]);if(Number.isFinite(v))vals.push(v);});});
    var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),padRange=(max-min)*0.05||1;min-=padRange;max+=padRange;
    var defs=[
      ['close','#f8fafc',2.4],['ma5','#fbbf24',1.5],['ma20','#60a5fa',1.5],['ma60','#34d399',1.5],['ma120','#c084fc',1.5],
      ['turtle20High','#fb7185',1.2],['turtle10Low','#94a3b8',1.2]
    ];
    var html='<rect x="0" y="0" width="1000" height="300" fill="transparent"/>';
    for(var g=0;g<5;g++){var y=20+(260/4)*g;html+='<line x1="40" y1="'+y+'" x2="990" y2="'+y+'" stroke="rgba(148,163,184,.12)" stroke-width="1"/>';}
    defs.forEach(function(d){var p=polylinePoints(rows,d[0],1000,300,40,min,max);if(p)html+='<polyline points="'+p+'" fill="none" stroke="'+d[1]+'" stroke-width="'+d[2]+'" vector-effect="non-scaling-stroke"/>';});
    svg.innerHTML=html;
    var m=payload.metrics||{},metrics=panel.querySelector('.sb-detail-metrics');
    function pct(v){return Number.isFinite(Number(v))?((Number(v)>0?'+':'')+Number(v).toFixed(2)+'%'):'--';}
    metrics.innerHTML='<span class="sb-detail-metric">MA '+(m.maStack||'확인 중')+'</span><span class="sb-detail-metric">터틀 '+(m.turtleSignal||'대기')+'</span><span class="sb-detail-metric">20일 '+pct(m.return20)+'</span><span class="sb-detail-metric">'+payload.benchmark+' 대비 20일 '+pct(m.relativeReturn20)+'</span><span class="sb-detail-metric">60일 '+pct(m.return60)+'</span><span class="sb-detail-metric">'+payload.benchmark+' 대비 60일 '+pct(m.relativeReturn60)+'</span><span class="sb-detail-metric">상대강도 '+(Number.isFinite(Number(m.relativeStrength))?Number(m.relativeStrength).toFixed(1):'--')+'</span>';
    var rsSvg=panel.querySelector('.sb-detail-rs svg'),rsVals=rows.map(function(r){return Number(r.relativeStrength);}).filter(Number.isFinite);
    if(rsVals.length){
      var rmin=Math.min.apply(null,rsVals.concat([100])),rmax=Math.max.apply(null,rsVals.concat([100])),rpad=(rmax-rmin)*.1||1;rmin-=rpad;rmax+=rpad;
      var points=polylinePoints(rows,'relativeStrength',1000,90,16,rmin,rmax);
      var baseY=90-16-(90-32)*((100-rmin)/Math.max(1e-9,rmax-rmin));
      rsSvg.innerHTML='<line x1="16" y1="'+baseY+'" x2="990" y2="'+baseY+'" stroke="rgba(148,163,184,.35)" stroke-dasharray="5 4"/><polyline points="'+points+'" fill="none" stroke="#60a5fa" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    }else rsSvg.innerHTML='';
  }
  async function loadDetail(symbol,benchmark){
    var panel=ensureDetailPanel();if(!panel)return;
    panel.dataset.symbol=symbol;panel.querySelector('.sb-detail-title').textContent=symbol+' 상세 추세';
    try{
      var r=await fetch('/api/history?symbol='+encodeURIComponent(symbol)+'&benchmark='+encodeURIComponent(benchmark||'QQQ')+'&range=6mo&t='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('history');
      var data=await r.json();if(data&&data.ok)renderDetail(data);
    }catch(e){panel.querySelector('.sb-detail-title').textContent=symbol+' 상세 추세 · 데이터 오류';}
  }
  function bindDetailOpen(host,symbol){
    if(!host||host.dataset.sbDetailBound)return;
    host.dataset.sbDetailBound='1';
    host.style.cursor='pointer';
    host.addEventListener('click',function(){loadDetail(symbol,'QQQ');});
  }
  function ensureInvestmentEntry(){
    var btn=document.querySelector('.sb-invest-entry');
    if(btn)return btn;
    btn=document.createElement('button');
    btn.type='button';
    btn.className='sb-invest-entry';
    btn.textContent='투자창 열기 ↗';
    btn.title='10만원 → 100만원 PAPER 투자창을 새 탭으로 엽니다';
    btn.addEventListener('click',function(){
      var target='/investment.html';
      var opened=window.open(target,'_blank');
      if(!opened) location.href=target;
    });
    document.body.appendChild(btn);
    return btn;
  }
  function statusEl(){
    var el=document.querySelector('.sb-live-status');
    if(!el){el=document.createElement('div');el.className='sb-live-status connecting';el.textContent='실시간 연결 중';document.body.appendChild(el);}
    return el;
  }
  function setStatus(kind,text){var el=statusEl();el.className='sb-live-status '+kind;el.textContent=text;}
  function findCardForSymbol(symbol){
    var exact=[].slice.call(document.querySelectorAll('div,section,article,span,strong,b')).filter(function(el){return (el.textContent||'').trim()===symbol;});
    for(var i=0;i<exact.length;i++){
      var cur=exact[i];
      for(var depth=0;cur&&depth<7;depth++,cur=cur.parentElement){
        var t=cur.textContent||'';
        if(t.indexOf(symbol)>=0 && /\$[0-9,.]+/.test(t) && t.length<1800)return cur;
      }
    }
    return null;
  }
  function quotePriceText(q){return finite(q&&q.price)?'$'+Number(q.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';}
  function quoteChangeText(q){
    if(finite(q&&q.changePct)){var p=Number(q.changePct);return (p>0?'+':'')+p.toFixed(2)+'%';}
    if(finite(q&&q.price)&&finite(q&&q.previousClose)){var c=(Number(q.price)/Number(q.previousClose)-1)*100;return (c>0?'+':'')+c.toFixed(2)+'%';}
    return '--';
  }
  function replaceProviderLabel(host,provider){
    if(!host||!provider)return;
    [].slice.call(host.querySelectorAll('*')).forEach(function(el){
      if(el.childElementCount)return;
      var text=(el.textContent||'').trim();
      if(/^(Yahoo|YAHOO|Yahoo Finance|NAMUH)$/i.test(text))el.textContent=provider;
    });
  }
  function applyQuote(q){
    var symbol=String(q&&q.symbol||'').toUpperCase();if(!symbol)return;
    var provider=String(q&&q.provider||'').toUpperCase();
    var isLive=provider && provider!=='YAHOO';
    var quoteTime=q&&q.asOf?Date.parse(q.asOf):NaN;
    var seenAt=Number.isFinite(quoteTime)?quoteTime:Date.now();
    if(isLive)liveState.liveSeen[symbol]=Math.max(Date.now(),seenAt);
    if(!isLive && liveState.liveSeen[symbol] && Date.now()-liveState.liveSeen[symbol]<LIVE_FRESH_MS)return;
    var host=findCardForSymbol(symbol);if(!host)return;
    bindDetailOpen(host,symbol);
    replaceProviderLabel(host,isLive?(q.provider||provider):'Yahoo');
    var box=host.querySelector('.sb-live-quote');
    if(!box){
      box=document.createElement('div');box.className='sb-live-quote';
      box.innerHTML='<span class="sb-live-price"></span><span class="sb-live-change"></span><span class="sb-live-meta"></span>';
      host.appendChild(box);
    }
    var price=box.querySelector('.sb-live-price'),change=box.querySelector('.sb-live-change'),meta=box.querySelector('.sb-live-meta');
    price.textContent=quotePriceText(q);
    var pct=finite(q.changePct)?Number(q.changePct):(finite(q.price)&&finite(q.previousClose)?(Number(q.price)/Number(q.previousClose)-1)*100:null);
    change.textContent=quoteChangeText(q);change.className='sb-live-change '+(Number.isFinite(pct)?(pct>0?'up':pct<0?'down':''):'');
    var tm=q.asOf?new Date(q.asOf).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
    meta.textContent=[q.sessionLabel||q.priceSession||'',isLive?(q.provider||provider):'Yahoo',tm].filter(Boolean).join(' · ');
    box.classList.remove('flash');void box.offsetWidth;box.classList.add('flash');
    updateCandidateQuote(q);
  }
  function handleLiveMessage(event){
    var msg;try{msg=JSON.parse(event.data);}catch(e){return;}
    liveState.lastMessage=Date.now();
    if(msg.type==='ready'||msg.type==='subscribed'){setStatus('online','실시간 WebSocket 연결');return;}
    if(msg.type==='pong'){setStatus('online','실시간 WebSocket 연결');return;}
    if((msg.type==='quotes'||msg.type==='snapshot')&&Array.isArray(msg.quotes)){
      msg.quotes.forEach(applyQuote);setStatus('online','실시간 · '+msg.quotes.length+'종목 수신');
    }
  }
  function connectLive(symbols){
    liveState.symbols=[].slice.call(new Set((symbols||[]).map(function(x){return String(x).toUpperCase();}).filter(Boolean))).slice(0,50);
    if(!liveState.symbols.length)return;
    if(liveState.socket){try{liveState.socket.close();}catch(e){}}
    clearTimeout(liveState.timer);clearInterval(liveState.ping);setStatus('connecting','실시간 연결 중');
    var scheme=location.protocol==='https:'?'wss:':'ws:';
    var url=scheme+'//'+location.host+'/api/live?symbols='+encodeURIComponent(liveState.symbols.join(','));
    var ws=new WebSocket(url);liveState.socket=ws;
    ws.onopen=function(){liveState.retry=1000;setStatus('online','실시간 WebSocket 연결');liveState.ping=setInterval(function(){if(ws.readyState===1)ws.send(JSON.stringify({type:'ping'}));},20000);};
    ws.onmessage=handleLiveMessage;
    ws.onerror=function(){setStatus('offline','실시간 연결 오류');};
    ws.onclose=function(){clearInterval(liveState.ping);setStatus('offline','실시간 재연결 대기');liveState.timer=setTimeout(function(){connectLive(liveState.symbols);},liveState.retry);liveState.retry=Math.min(liveState.retry*2,30000);};
  }
  async function repairMarket(){
    var grid=document.querySelector('.sb-market-responsive');
    try{
      var r=await fetch('/api/market?force=1&t='+Date.now(),{cache:'no-store'});
      if(!r.ok)return;
      var data=await r.json(),rows=Array.isArray(data.market)?data.market:[],byKey={};
      rows.forEach(function(x){if(x&&x.key)byKey[x.key]=x;});
      if(grid){
        grid.classList.add('sb-market-repaired');
        grid.replaceChildren();
        order.forEach(function(key){grid.appendChild(card(byKey[key]||{key:key,value:null},key));});
      }
      var learned=await fetchLearnedCandidates();
      var survival=await fetchSurvival();
      renderSurvival(survival);
      renderCandidates(data,learned);
      var symbols=Object.keys(data.symbols||{});symbols.forEach(function(s){applyQuote(data.symbols[s]);});
      enforceEnglishTickerOnly(symbols);
      applyTabletPortraitLayout();
      if(!liveState.socket||liveState.socket.readyState>1){connectLive(symbols);}
      else if(symbols.join(',')!==liveState.symbols.join(',')){liveState.symbols=symbols.slice(0,50);try{liveState.socket.send(JSON.stringify({type:'subscribe',symbols:liveState.symbols}));}catch(e){}}
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
  function commonParent(nodes,maxDepth){
    if(!nodes||!nodes.length)return null;
    var cur=nodes[0];
    for(var d=0;cur&&d<(maxDepth||7);d++,cur=cur.parentElement){
      if(nodes.every(function(n){return cur.contains(n);})){return cur;}
    }
    return null;
  }
  function directChildUnder(node,parent){
    var cur=node;
    while(cur&&cur.parentElement&&cur.parentElement!==parent)cur=cur.parentElement;
    return cur&&cur.parentElement===parent?cur:node;
  }
  function exactTextElement(text,selector){
    var list=[].slice.call(document.querySelectorAll(selector||'button,div,span,label,strong,b'));
    return list.find(function(el){return (el.textContent||'').trim()===text;})||null;
  }
  function applyTabletPortraitLayout(){
    var search=[].slice.call(document.querySelectorAll('input')).find(function(x){return /티커.*검색|검색.*티커/.test(x.placeholder||'');});
    var signalLabel=exactTextElement('신호');
    var signalSelect=null;
    if(signalLabel){
      var scope=signalLabel.parentElement;
      if(scope)signalSelect=scope.querySelector('select');
    }
    if(!signalSelect)signalSelect=[].slice.call(document.querySelectorAll('select')).find(function(x){return /전체/.test(x.textContent||'');});
    if(search&&signalSelect){
      var p=commonParent([search,signalSelect],7);
      if(p){
        p.classList.add('sb-portrait-search-row');
        directChildUnder(search,p).classList.add('sb-portrait-search-main');
        directChildUnder(signalSelect,p).classList.add('sb-portrait-search-filter');
      }
    }

    var chipTexts=['전체','보유종목','디지털자산','모빌리티','반도체'];
    var chips=chipTexts.map(function(t){return exactTextElement(t,'button,div,span');}).filter(Boolean);
    if(chips.length>=3){
      var cp=commonParent(chips,6);
      if(cp)cp.classList.add('sb-portrait-chips');
    }

    var tickerInput=[].slice.call(document.querySelectorAll('input')).find(function(x){return /보유.*티커/.test(x.placeholder||'');});
    var priceInput=[].slice.call(document.querySelectorAll('input')).find(function(x){return /평단가/.test(x.placeholder||'');});
    var addButton=[].slice.call(document.querySelectorAll('button')).find(function(x){return /보유종목/.test((x.textContent||'').trim())&&/\+/.test((x.textContent||'').trim());});
    if(tickerInput&&priceInput&&addButton){
      var hp=commonParent([tickerInput,priceInput,addButton],7);
      if(hp){
        hp.classList.add('sb-portrait-holding-row');
        directChildUnder(tickerInput,hp).classList.add('sb-portrait-holding-ticker');
        directChildUnder(priceInput,hp).classList.add('sb-portrait-holding-price');
        directChildUnder(addButton,hp).classList.add('sb-portrait-holding-add');
      }
    }

    var signalTitle=[].slice.call(document.querySelectorAll('h1,h2,h3,h4,div,span')).find(function(el){return /^전략신호\s*[·•]/.test((el.textContent||'').trim())||/^전략신호\s*\d+종목/.test((el.textContent||'').trim());});
    if(signalTitle){
      var sec=signalTitle.closest('section,article')||signalTitle.parentElement;
      for(var i=0;sec&&i<4&&!sec.querySelector('table');i++)sec=sec.parentElement;
      if(sec)sec.classList.add('sb-portrait-signal-section');
    }
  }
  function enforceEnglishTickerOnly(symbols){
    (symbols||[]).forEach(function(raw){
      var symbol=String(raw||'').trim().toUpperCase();
      if(!symbol)return;
      var exact=[].slice.call(document.querySelectorAll('td,div,span,strong,b,p')).filter(function(el){
        return (el.textContent||'').trim().toUpperCase()===symbol;
      });
      exact.forEach(function(el){
        el.classList.add('sb-ticker-only');
        var cell=el.closest('td');
        var boundary=cell||el.parentElement;
        if(!boundary)return;

        var cur=el;
        while(cur&&cur!==boundary&&cur.parentElement){
          var par=cur.parentElement;
          [].slice.call(par.children).forEach(function(sib){
            if(sib===cur||sib.contains(cur))return;
            var txt=(sib.textContent||'').trim();
            if(txt&&txt.length<=40&&!/[$₩%]/.test(txt))sib.classList.add('sb-hide-ticker-alias');
          });
          cur=par;
        }

        if(cell){
          [].slice.call(cell.children).forEach(function(child){
            if(child===el||child.contains(el))return;
            var txt=(child.textContent||'').trim();
            if(txt&&txt.length<=40&&!/[$₩%]/.test(txt))child.classList.add('sb-hide-ticker-alias');
          });
        }else{
          var next=el.nextElementSibling;
          if(next){
            var nt=(next.textContent||'').trim();
            if(nt&&nt.length<=40&&!/[$₩%]/.test(nt))next.classList.add('sb-hide-ticker-alias');
          }
        }
      });
    });
  }

  function start(){
    ensureInvestmentEntry();
    replaceMarketLabels();
    applyTabletPortraitLayout();
    repairMarket().then(function(){
      if(location.hash==='#investment-window'){
        var panel=document.getElementById('investment-window');
        if(panel)setTimeout(function(){panel.scrollIntoView({behavior:'smooth',block:'start'});},250);
      }
    });
    setInterval(repairMarket,30000);
    setInterval(function(){replaceMarketLabels();applyTabletPortraitLayout();},2000);
  }
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

const investmentHtml=String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>StrategyBar 투자실험</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#05070b;color:#e5e7eb;font-family:Arial,"Noto Sans KR",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
h1{font-size:22px;margin:0}.badge{display:inline-block;margin-top:10px;font-size:12px;padding:6px 9px;border:1px solid #14532d;border-radius:999px;color:#86efac;background:#052e16}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin-top:14px}
.card{border:1px solid #1f2937;border-radius:10px;padding:12px;background:#0b1220}.label{font-size:11px;color:#94a3b8}.value{font-size:20px;font-weight:800;margin-top:5px}
.progress{height:12px;background:#172033;border-radius:999px;overflow:hidden;margin-top:14px}.progress>span{display:block;height:100%;width:0;background:linear-gradient(90deg,#22c55e,#60a5fa)}
.section{margin-top:16px;border:1px solid #1f2937;border-radius:10px;padding:12px;background:#0a0f19}.section h2{font-size:15px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #1f2937;text-align:left}th{color:#94a3b8;font-weight:600}
.empty{color:#94a3b8;font-size:12px}.warn{color:#fca5a5}.muted{color:#94a3b8;font-size:11px;margin-top:10px}
.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:8px;padding:7px 10px;cursor:pointer}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>10만원 → 100만원 PAPER 생존 실험</h1><div class="muted">나무증권(NAMUH) 기준 · 실거래 아님</div></div>
    <div class="actions"><button class="btn" id="refresh">새로고침</button><button class="btn" id="back">전략바로 돌아가기</button></div>
  </div>
  <div id="mode" class="badge">상태 확인 중…</div>
  <div class="grid" id="cards"></div>
  <div class="progress"><span id="bar"></span></div>
  <div class="section"><h2>보유 종목 (PAPER)</h2><div id="positions"><div class="empty">불러오는 중…</div></div></div>
  <div class="section"><h2>상태</h2><div id="status" class="empty">불러오는 중…</div></div>
</div>
<script>
(function(){
  var money=function(v){return Number(v||0).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';};
  var num=function(v,d){return Number(v||0).toFixed(d===undefined?2:d);};

  function renderState(s,stale){
    var mode=document.getElementById('mode');
    mode.textContent=(stale?'최근 저장값 · ':'')+(s.profile||'FAST_SURVIVAL')+' · 브로커 '+(s.activeBroker||s.broker||'NAMUH')+(s.killSwitch?' · KILL SWITCH':'')+(s.goalReached?' · 목표달성':'');
    mode.className='badge'+(s.killSwitch?' warn':'');
    var cards=[
      ['평가자산',money(s.equityKrw)],['현금',money(s.cashKrw)],['시작자금',money(s.startKrw)],
      ['목표',money(s.targetKrw)],['진행률',num(s.progressPct)+'%'],['자산배수',num(s.equityMultiple,3)+'x'],
      ['최대낙폭',num(s.drawdownPct)+'%'],['당일손실',num(s.dayLossPct)+'%'],
      ['거래',String(s.trades||0)+'회'],['승/패',String(s.wins||0)+' / '+String(s.losses||0)]
    ];
    var host=document.getElementById('cards');host.innerHTML='';
    cards.forEach(function(c){
      var d=document.createElement('div');d.className='card';
      d.innerHTML='<div class="label"></div><div class="value"></div>';
      d.children[0].textContent=c[0];d.children[1].textContent=c[1];host.appendChild(d);
    });
    document.getElementById('bar').style.width=Math.max(0,Math.min(100,Number(s.progressPct||0)))+'%';
    var pos=Object.values(s.positions||{}),ph=document.getElementById('positions');
    if(!pos.length){
      ph.innerHTML='<div class="empty">보유 종목 없음</div>';
    }else{
      var html='<table><thead><tr><th>종목</th><th>수량</th><th>진입가</th><th>현재가</th><th>손절가</th><th>브로커</th></tr></thead><tbody>';
      pos.forEach(function(x){
        html+='<tr><td>'+String(x.symbol||'')+'</td><td>'+Number(x.shares||0).toFixed(4)+'</td><td>$'+Number(x.entryPrice||0).toFixed(2)+'</td><td>$'+Number(x.lastPrice||0).toFixed(2)+'</td><td>$'+Number(x.stopPrice||0).toFixed(2)+'</td><td>'+String(x.broker||s.activeBroker||'NAMUH')+'</td></tr>';
      });
      ph.innerHTML=html+'</tbody></table>';
    }
    document.getElementById('status').innerHTML='<div>마지막 갱신: '+String(s.lastCycle||s.updatedAt||'')+'</div><div>일시중지: '+(s.paused?'예':'아니오')+'</div><div>Kill Switch: '+(s.killSwitch?'작동':'정상')+'</div><div>목표달성: '+(s.goalReached?'예':'아니오')+'</div>';
  }

  async function load(){
    var mode=document.getElementById('mode');
    var cached=null;
    try{cached=JSON.parse(localStorage.getItem('strategybar_survival_state_v1')||'null');}catch(e){}
    if(cached)renderState(cached,true);else mode.textContent='상태 확인 중…';

    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},3500);
    try{
      var r=await fetch('/api/survival?t='+Date.now(),{cache:'no-store',signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status);
      var p=await r.json(),state=p&&p.state;
      if(!state)throw new Error('state empty');
      localStorage.setItem('strategybar_survival_state_v1',JSON.stringify(state));
      renderState(state,false);
    }catch(e){
      if(!cached){
        mode.textContent=e&&e.name==='AbortError'?'상태 응답 지연 · 자동 재시도':'투자 상태를 불러오지 못했습니다';
        mode.className='badge warn';
        document.getElementById('status').textContent=e&&e.name==='AbortError'?'3.5초 안에 응답하지 않아 자동 재시도합니다.':String(e);
      }
    }finally{
      clearTimeout(timer);
    }
  }

  document.getElementById('refresh').onclick=load;
  document.getElementById('back').onclick=function(){location.href='/?view=1&tab=dashboard';};
  load();
  setInterval(load,10000);
})();
</script>
</body></html>`;

const investmentScript=investmentHtml.match(/<script[^>]*>([\s\S]*)<\/script>/i);
if(!investmentScript)throw new Error('investment script extraction failed');
const investmentCheck='/tmp/strategybar-investment-check.js';
fs.writeFileSync(investmentCheck,investmentScript[1]);
execFileSync(process.execPath,['--check',investmentCheck],{stdio:'inherit'});
fs.writeFileSync('strategybar-runtime/dist/investment.html',investmentHtml);

console.log('Applied StrategyBar WebSocket live quote enhancer v15 with tablet portrait layout and English-only tickers.');
