const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const now=()=>Date.now();
const round=(v,d=2)=>finite(v)?Number(Number(v).toFixed(d)):null;
const clamp=v=>Math.max(0,Math.min(100,Math.round(Number(v)||0)));
const DAY=86400000;

function getMarketRegime(snapshot){
  const vix=(snapshot?.market||[]).find(x=>x?.key==='^VIX');
  const qqq=snapshot?.symbols?.QQQ||{};
  const spy=snapshot?.symbols?.SPY||{};
  const v=finite(vix?.value)?Number(vix.value):null;
  if((finite(v)&&v>=25)||qqq.maStack==='역배열'||(finite(qqq.return20)&&Number(qqq.return20)<=-5))return 'risk_off';
  if((!finite(v)||v<20)&&qqq.maStack==='정배열'&&(finite(qqq.return20)&&Number(qqq.return20)>0)&&( !finite(spy.return20)||Number(spy.return20)>=0))return 'risk_on';
  return 'neutral';
}

function dynamicWeights(regime){
  if(regime==='risk_on')return {trend:.22,momentum:.18,volume:.14,relative:.22,market:.14,risk:.10};
  if(regime==='risk_off')return {trend:.16,momentum:.10,volume:.10,relative:.16,market:.18,risk:.30};
  return {trend:.20,momentum:.15,volume:.12,relative:.20,market:.15,risk:.18};
}

function relativeScore(relative20,relative60){
  let score=50;
  if(finite(relative20))score+=Math.max(-28,Math.min(28,Number(relative20)*4));
  if(finite(relative60))score+=Math.max(-18,Math.min(18,Number(relative60)*1.5));
  return clamp(score);
}

function marketHead(regime){return regime==='risk_on'?78:regime==='risk_off'?28:55;}

function patternSignature(row,regime){
  const trend=row.turtleSignal==='20일 돌파'?'breakout':row.maStack==='정배열'?'aligned':row.maStack==='역배열'||row.turtleSignal==='10일 이탈'?'weak':'mixed';
  const rel=finite(row.relative20)?(Number(row.relative20)>=3?'rs_strong':Number(row.relative20)<=-3?'rs_weak':'rs_neutral'):'rs_unknown';
  const vol=finite(row.volumeRatio)&&Number(row.volumeRatio)>=1.3?'vol_high':'vol_normal';
  const risk=finite(row.headScores?.risk)?(Number(row.headScores.risk)>=65?'risk_good':Number(row.headScores.risk)<40?'risk_high':'risk_mid'):'risk_unknown';
  return [regime,trend,rel,vol,risk].join('|');
}

function enrichRows(snapshot){
  const benchmark=snapshot?.symbols?.QQQ||{};
  const regime=getMarketRegime(snapshot),weights=dynamicWeights(regime),mHead=marketHead(regime);
  return Object.values(snapshot?.symbols||{}).filter(r=>r&&finite(r.price)&&finite(r.score)&&String(r.signal||'')!=='주의').map(row=>{
    const relative20=finite(row.return20)&&finite(benchmark.return20)?round(Number(row.return20)-Number(benchmark.return20)):null;
    const relative60=finite(row.return60)&&finite(benchmark.return60)?round(Number(row.return60)-Number(benchmark.return60)):null;
    const heads={
      trend:clamp(row.headScores?.trend??row.score),
      momentum:clamp(row.headScores?.momentum??50),
      volume:clamp(row.headScores?.volume??50),
      relative:relativeScore(relative20,relative60),
      market:mHead,
      risk:clamp(row.headScores?.risk??50)
    };
    const compositeScore=clamp(Object.entries(weights).reduce((sum,[k,w])=>sum+heads[k]*w,0));
    const enriched={...row,benchmark:'QQQ',relative20,relative60,marketRegime:regime,headScores:heads,headWeights:weights,compositeScore};
    return {...enriched,patternSignature:patternSignature(enriched,regime)};
  });
}

async function ensureSchema(env){
  if(!env.DB)return false;
  try{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_history(
        symbol TEXT PRIMARY KEY,name TEXT,category TEXT,candidate_price REAL,first_seen_at INTEGER NOT NULL,first_score REAL,
        last_price REAL,last_score REAL,last_seen_at INTEGER NOT NULL,appearances INTEGER NOT NULL DEFAULT 1)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_snapshots(
        symbol TEXT NOT NULL,bucket_at INTEGER NOT NULL,price REAL,score REAL,change_pct REAL,created_at INTEGER NOT NULL,
        PRIMARY KEY(symbol,bucket_at))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_feedback(
        symbol TEXT PRIMARY KEY,evaluations INTEGER NOT NULL DEFAULT 0,avg_return_pct REAL,best_return_pct REAL,worst_return_pct REAL,
        hit_rate REAL,penalty_score REAL NOT NULL DEFAULT 0,verdict TEXT NOT NULL DEFAULT '관찰중',updated_at INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_pattern_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,observed_at INTEGER NOT NULL,observed_day TEXT NOT NULL,entry_price REAL NOT NULL,
        signature TEXT NOT NULL,regime TEXT NOT NULL,composite_score REAL,
        trend_head REAL,momentum_head REAL,volume_head REAL,relative_head REAL,market_head REAL,risk_head REAL,
        return_1d REAL,return_5d REAL,return_20d REAL,updated_at INTEGER NOT NULL,
        UNIQUE(symbol,observed_day,signature))`)
    ]);
    return true;
  }catch{return false;}
}

async function feedbackMap(env,symbols){
  if(!env.DB||!symbols.length)return {};
  try{
    const marks=symbols.map(()=>'?').join(',');
    const r=await env.DB.prepare(`SELECT symbol,evaluations,avg_return_pct,best_return_pct,worst_return_pct,hit_rate,penalty_score,verdict,updated_at
      FROM candidate_feedback WHERE symbol IN (${marks})`).bind(...symbols).all();
    return Object.fromEntries((r.results||[]).map(row=>[String(row.symbol).toUpperCase(),row]));
  }catch{return {};}
}

async function patternStatsMap(env,signatures){
  const unique=[...new Set(signatures.filter(Boolean))];
  if(!env.DB||!unique.length)return {};
  try{
    const marks=unique.map(()=>'?').join(',');
    const r=await env.DB.prepare(`SELECT signature,
      COUNT(*) observations,
      SUM(CASE WHEN return_1d IS NOT NULL THEN 1 ELSE 0 END) eval1d,
      SUM(CASE WHEN return_1d > 0 THEN 1 ELSE 0 END) wins1d,
      AVG(return_1d) avg1d,
      SUM(CASE WHEN return_5d IS NOT NULL THEN 1 ELSE 0 END) eval5d,
      SUM(CASE WHEN return_5d > 0 THEN 1 ELSE 0 END) wins5d,
      AVG(return_5d) avg5d,
      SUM(CASE WHEN return_20d IS NOT NULL THEN 1 ELSE 0 END) eval20d,
      SUM(CASE WHEN return_20d > 0 THEN 1 ELSE 0 END) wins20d,
      AVG(return_20d) avg20d
      FROM candidate_pattern_events WHERE signature IN (${marks}) GROUP BY signature`).bind(...unique).all();
    return Object.fromEntries((r.results||[]).map(row=>[row.signature,row]));
  }catch{return {};}
}

function historyAssessment(stat){
  if(!stat)return {patternSamples:0,patternHorizon:null,patternSuccessRate:null,patternAvgReturn:null,patternBonus:0};
  const options=[
    {h:'20일',n:Number(stat.eval20d||0),w:Number(stat.wins20d||0),a:stat.avg20d},
    {h:'5일',n:Number(stat.eval5d||0),w:Number(stat.wins5d||0),a:stat.avg5d},
    {h:'1일',n:Number(stat.eval1d||0),w:Number(stat.wins1d||0),a:stat.avg1d}
  ];
  const best=options.find(x=>x.n>=3)||options.find(x=>x.n>0);
  if(!best)return {patternSamples:Number(stat.observations||0),patternHorizon:null,patternSuccessRate:null,patternAvgReturn:null,patternBonus:0};
  const rate=best.n?best.w/best.n:null,avg=finite(best.a)?Number(best.a):null;
  const bonus=best.n>=3?Math.max(-10,Math.min(10,((rate??.5)-.5)*20+(avg??0)*1.5)):0;
  return {patternSamples:best.n,patternHorizon:best.h,patternSuccessRate:round(rate,3),patternAvgReturn:round(avg),patternBonus:round(bonus,1)};
}

export async function getCandidates(env,snapshot,limit=8){
  const rows=enrichRows(snapshot);
  const feedback=await feedbackMap(env,rows.map(x=>x.symbol));
  const stats=await patternStatsMap(env,rows.map(x=>x.patternSignature));
  const final=rows.map(row=>{
    const fb=feedback[row.symbol]||{},hist=historyAssessment(stats[row.patternSignature]);
    const penalty=finite(fb.penalty_score)?Number(fb.penalty_score):0;
    const adjustedScore=clamp(Number(row.compositeScore)+(Number(hist.patternBonus)||0)-penalty);
    const compositeSignal=adjustedScore>=72?'주목':adjustedScore>=60?'관찰':adjustedScore<=36?'주의':'대기';
    return {...row,...hist,adjustedScore,compositeSignal,penaltyScore:round(penalty,1),
      evaluations:Number(fb.evaluations||0),avgReturnPct:round(fb.avg_return_pct),bestReturnPct:round(fb.best_return_pct),
      worstReturnPct:round(fb.worst_return_pct),hitRate:round(fb.hit_rate,3),verdict:String(fb.verdict||'관찰중')};
  });
  final.sort((a,b)=>{
    const bad=(a.verdict==='부적합'?1:0)-(b.verdict==='부적합'?1:0);
    if(bad)return bad;
    return Number(b.adjustedScore)-Number(a.adjustedScore);
  });
  return final.slice(0,Math.max(1,limit));
}

async function evaluateMaturePatterns(env,snapshot,ts){
  if(!env.DB)return 0;
  let rows=[];
  try{
    const r=await env.DB.prepare(`SELECT id,symbol,observed_at,entry_price,return_1d,return_5d,return_20d
      FROM candidate_pattern_events
      WHERE (return_1d IS NULL AND observed_at<=?)
         OR (return_5d IS NULL AND observed_at<=?)
         OR (return_20d IS NULL AND observed_at<=?)
      ORDER BY observed_at ASC LIMIT 60`).bind(ts-DAY,ts-5*DAY,ts-20*DAY).all();
    rows=r.results||[];
  }catch{return 0;}
  let updates=0;
  for(const event of rows){
    const quote=snapshot?.symbols?.[String(event.symbol).toUpperCase()];
    if(!quote||!finite(quote.price)||!finite(event.entry_price)||Number(event.entry_price)<=0)continue;
    const age=ts-Number(event.observed_at),ret=(Number(quote.price)/Number(event.entry_price)-1)*100;
    const fields=[],values=[];
    if(event.return_1d===null&&age>=DAY){fields.push('return_1d=?');values.push(ret);}
    if(event.return_5d===null&&age>=5*DAY){fields.push('return_5d=?');values.push(ret);}
    if(event.return_20d===null&&age>=20*DAY){fields.push('return_20d=?');values.push(ret);}
    if(!fields.length)continue;
    try{
      await env.DB.prepare(`UPDATE candidate_pattern_events SET ${fields.join(',')},updated_at=? WHERE id=?`)
        .bind(...values,ts,event.id).run();
      updates++;
    }catch{}
  }
  return updates;
}

export async function recordCandidateCycle(env,snapshot){
  if(!await ensureSchema(env))return {ok:false,recorded:0,reason:'storage unavailable'};
  const ts=now(),bucket=Math.floor(ts/600000)*600000,day=new Date(ts).toISOString().slice(0,10);
  const candidates=await getCandidates(env,snapshot,8);
  const evaluated=await evaluateMaturePatterns(env,snapshot,ts);
  let recorded=0;
  for(const row of candidates){
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO candidate_history(symbol,name,category,candidate_price,first_seen_at,first_score,last_price,last_score,last_seen_at,appearances)
          VALUES(?,?,?,?,?,?,?,?,?,1)
          ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,category=excluded.category,last_price=excluded.last_price,last_score=excluded.last_score,
          last_seen_at=excluded.last_seen_at,appearances=candidate_history.appearances+1`)
          .bind(row.symbol,row.name||row.symbol,row.category||'',Number(row.price),ts,Number(row.adjustedScore),Number(row.price),Number(row.adjustedScore),ts),
        env.DB.prepare(`INSERT OR IGNORE INTO candidate_snapshots(symbol,bucket_at,price,score,change_pct,created_at) VALUES(?,?,?,?,?,?)`)
          .bind(row.symbol,bucket,Number(row.price),Number(row.adjustedScore),finite(row.changePct)?Number(row.changePct):null,ts),
        env.DB.prepare(`INSERT OR IGNORE INTO candidate_pattern_events(
          symbol,observed_at,observed_day,entry_price,signature,regime,composite_score,trend_head,momentum_head,volume_head,relative_head,market_head,risk_head,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(row.symbol,ts,day,Number(row.price),row.patternSignature,row.marketRegime,Number(row.compositeScore),
            Number(row.headScores.trend),Number(row.headScores.momentum),Number(row.headScores.volume),Number(row.headScores.relative),
            Number(row.headScores.market),Number(row.headScores.risk),ts)
      ]);
      recorded++;
    }catch{}
  }
  return {ok:true,recorded,evaluated,bucketAt:new Date(bucket).toISOString(),marketRegime:getMarketRegime(snapshot)};
}

export function summarizeCandidateContext(candidates=[]){
  return candidates.slice(0,8).map(row=>({
    symbol:row.symbol,price:row.price,adjustedScore:row.adjustedScore,compositeSignal:row.compositeSignal,
    marketRegime:row.marketRegime,headScores:row.headScores,headWeights:row.headWeights,
    maStack:row.maStack,turtleSignal:row.turtleSignal,relative20:row.relative20,relative60:row.relative60,
    patternSignature:row.patternSignature,patternSamples:row.patternSamples,patternHorizon:row.patternHorizon,
    patternSuccessRate:row.patternSuccessRate,patternAvgReturn:row.patternAvgReturn,patternBonus:row.patternBonus,
    provider:row.provider,asOf:row.asOf
  }));
}
