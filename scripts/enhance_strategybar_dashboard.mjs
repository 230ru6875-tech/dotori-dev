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
.sb-live-status{position:fixed;right:12px;bottom:12px;z-index:9999;border:1px solid rgba(148,163,184,.3);border-radius:999px;padding:5px 9px;background:rgba(8,12,18,.92);font-size:10px;color:#94a3b8;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.sb-live-status.online{color:#86efac;border-color:rgba(134,239,172,.35)}.sb-live-status.connecting{color:#fde68a}.sb-live-status.offline{color:#fca5a5}
.sb-live-quote{margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.16);display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
.sb-live-quote .sb-live-price{font-size:18px;font-weight:800;color:#f8fafc}.sb-live-quote .sb-live-change{font-size:12px;font-weight:700}.sb-live-quote .sb-live-change.up{color:#fb7185}.sb-live-quote .sb-live-change.down{color:#60a5fa}
.sb-live-quote .sb-live-meta{font-size:9px;color:#7f8da3}.sb-live-quote.flash{animation:sbQuoteFlash .55s ease-out}
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
@keyframes sbQuoteFlash{0%{background:rgba(59,130,246,.18)}100%{background:transparent}}
</style>`;

const injection=String.raw`
<script id="strategybar-enhancer-script" data-market-label-version="market-repair-ws-v7">
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
      panel.innerHTML='<div class="sb-candidates-head"><div class="sb-candidates-title">매수후보 TOP 8</div><div class="sb-candidates-note">전략점수 + MA 5/20/60/120 + 터틀 돌파 + 과거성과 · 30초 재선정</div></div><div class="sb-candidates-grid"></div>';
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
      el.innerHTML='<div class="sb-candidate-top"><span class="sb-candidate-symbol"></span><span class="sb-candidate-score"></span></div><div class="sb-candidate-price"></div><div class="sb-candidate-meta"><span class="sb-candidate-change '+cls+'"></span> · <span class="sb-candidate-signal"></span> · <span class="sb-candidate-provider"></span></div><div class="sb-candidate-strategy"></div>';
      el.querySelector('.sb-candidate-symbol').textContent=r.symbol;
      var shownScore=finite(r.adjustedScore)?Number(r.adjustedScore):Number(r.score);
      el.querySelector('.sb-candidate-score').textContent='점수 '+shownScore.toFixed(0)+(finite(r.penaltyScore)&&Number(r.penaltyScore)>0?' (-'+Number(r.penaltyScore).toFixed(1)+')':'');
      el.querySelector('.sb-candidate-price').textContent=quotePriceText(r);
      el.querySelector('.sb-candidate-change').textContent=pctText;
      el.querySelector('.sb-candidate-signal').textContent=(r.signal||'후보')+(r.verdict?' · '+r.verdict:'');
      el.querySelector('.sb-candidate-provider').textContent=(r.provider||'')+(finite(r.avgReturnPct)?' · 누적 '+(Number(r.avgReturnPct)>0?'+':'')+Number(r.avgReturnPct).toFixed(2)+'%':'');
      var strategy=el.querySelector('.sb-candidate-strategy');
      var badges=[];
      if(r.maStack)badges.push({text:'MA '+r.maStack,cls:r.maStack==='정배열'?'good':r.maStack==='역배열'?'bad':''});
      if(r.turtleSignal)badges.push({text:'터틀 '+r.turtleSignal,cls:r.turtleSignal==='20일 돌파'?'hot':r.turtleSignal==='10일 이탈'?'bad':''});
      badges.forEach(function(b){var x=document.createElement('span');x.className='sb-candidate-badge '+b.cls;x.textContent=b.text;strategy.appendChild(x);});
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
      renderCandidates(data,learned);
      var symbols=Object.keys(data.symbols||{});symbols.forEach(function(s){applyQuote(data.symbols[s]);});
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
  function start(){replaceMarketLabels();repairMarket();setInterval(repairMarket,30000);setInterval(replaceMarketLabels,2000);}
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
console.log('Applied StrategyBar WebSocket live quote enhancer v7 with detail chart and relative strength.');
