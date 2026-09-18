const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const now=()=>Date.now();
const round=(v,d=2)=>finite(v)?Number(Number(v).toFixed(d)):null;
const SIGNAL_PRIORITY={주목:3,관찰:2,대기:1,주의:0};

function rawCandidates(snapshot, limit=8){
  const rows=Object.values(snapshot?.symbols||{}).filter(r=>r&&finite(r.price)&&finite(r.score)&&String(r.signal||'')!=='주의');
  rows.sort((a,b)=>{
    const tb=(String(b.turtleSignal||'')==='20일 돌파'?2:String(b.maStack||'')==='정배열'?1:0);
    const ta=(String(a.turtleSignal||'')==='20일 돌파'?2:String(a.maStack||'')==='정배열'?1:0);
    if(tb!==ta)return tb-ta;
    const p=(SIGNAL_PRIORITY[String(b.signal||'')]||0)-(SIGNAL_PRIORITY[String(a.signal||'')]||0);
    return p||Number(b.score)-Number(a.score);
  });
  const preferred=rows.filter(r=>Number(r.score)>=58);
  const selected=[...preferred];
  for(const row of rows){
    if(selected.length>=limit)break;
    if(!selected.some(x=>x.symbol===row.symbol))selected.push(row);
  }
  return selected.slice(0,limit);
}

async function ensureSchema(env){
  if(!env.DB)return false;
  try{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_history(
        symbol TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        candidate_price REAL,
        first_seen_at INTEGER NOT NULL,
        first_score REAL,
        last_price REAL,
        last_score REAL,
        last_seen_at INTEGER NOT NULL,
        appearances INTEGER NOT NULL DEFAULT 1
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_snapshots(
        symbol TEXT NOT NULL,
        bucket_at INTEGER NOT NULL,
        price REAL,
        score REAL,
        change_pct REAL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(symbol,bucket_at)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS candidate_feedback(
        symbol TEXT PRIMARY KEY,
        evaluations INTEGER NOT NULL DEFAULT 0,
        avg_return_pct REAL,
        best_return_pct REAL,
        worst_return_pct REAL,
        hit_rate REAL,
        penalty_score REAL NOT NULL DEFAULT 0,
        verdict TEXT NOT NULL DEFAULT '관찰중',
        updated_at INTEGER NOT NULL
      )`)
    ]);
    return true;
  }catch{return false;}
}

async function feedbackMap(env,symbols){
  if(!env.DB||!symbols.length)return {};
  try{
    const marks=symbols.map(()=>'?').join(',');
    const r=await env.DB.prepare(`SELECT symbol,evaluations,avg_return_pct,best_return_pct,worst_return_pct,hit_rate,penalty_score,verdict,updated_at FROM candidate_feedback WHERE symbol IN (${marks})`).bind(...symbols).all();
    return Object.fromEntries((r.results||[]).map(row=>[String(row.symbol).toUpperCase(),row]));
  }catch{return {};}
}

function applyFeedback(rows, feedback={}){
  return rows.map(row=>{
    const fb=feedback[row.symbol]||{};
    const penalty=finite(fb.penalty_score)?Number(fb.penalty_score):0;
    return {
      ...row,
      adjustedScore:Math.max(0,Math.round(Number(row.score)-penalty)),
      penaltyScore:round(penalty,1),
      evaluations:Number(fb.evaluations||0),
      avgReturnPct:round(fb.avg_return_pct),
      bestReturnPct:round(fb.best_return_pct),
      worstReturnPct:round(fb.worst_return_pct),
      hitRate:round(fb.hit_rate,3),
      verdict:String(fb.verdict||'관찰중')
    };
  }).sort((a,b)=>{
    const va=a.verdict==='부적합'?1:0,vb=b.verdict==='부적합'?1:0;
    return va-vb||Number(b.adjustedScore)-Number(a.adjustedScore);
  });
}

export async function getCandidates(env,snapshot,limit=8){
  const base=rawCandidates(snapshot,Math.max(limit,12));
  const benchmark=snapshot?.symbols?.QQQ||null;
  const enriched=base.map(row=>({
    ...row,
    benchmark:"QQQ",
    relative20:finite(row.return20)&&finite(benchmark?.return20)?round(Number(row.return20)-Number(benchmark.return20)):null,
    relative60:finite(row.return60)&&finite(benchmark?.return60)?round(Number(row.return60)-Number(benchmark.return60)):null
  })).sort((a,b)=>{
    const ar=(finite(a.relative20)?Number(a.relative20):0)+(finite(a.relative60)?Number(a.relative60):0);
    const br=(finite(b.relative20)?Number(b.relative20):0)+(finite(b.relative60)?Number(b.relative60):0);
    return br-ar;
  });
  const feedback=await feedbackMap(env,enriched.map(x=>x.symbol));
  return applyFeedback(enriched,feedback).slice(0,limit);
}

export async function recordCandidateCycle(env,snapshot){
  const base=rawCandidates(snapshot,8);
  if(!base.length||!await ensureSchema(env))return {ok:false,recorded:0,reason:'storage unavailable'};
  const ts=now(),bucket=Math.floor(ts/600000)*600000;
  let recorded=0;
  for(const row of base){
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO candidate_history(symbol,name,category,candidate_price,first_seen_at,first_score,last_price,last_score,last_seen_at,appearances)
          VALUES(?,?,?,?,?,?,?,?,?,1)
          ON CONFLICT(symbol) DO UPDATE SET
            name=excluded.name,
            category=excluded.category,
            last_price=excluded.last_price,
            last_score=excluded.last_score,
            last_seen_at=excluded.last_seen_at,
            appearances=candidate_history.appearances+1`)
          .bind(row.symbol,row.name||row.symbol,row.category||'',Number(row.price),ts,Number(row.score),Number(row.price),Number(row.score),ts),
        env.DB.prepare(`INSERT OR IGNORE INTO candidate_snapshots(symbol,bucket_at,price,score,change_pct,created_at) VALUES(?,?,?,?,?,?)`)
          .bind(row.symbol,bucket,Number(row.price),Number(row.score),finite(row.changePct)?Number(row.changePct):null,ts)
      ]);
      const h=await env.DB.prepare('SELECT candidate_price,appearances FROM candidate_history WHERE symbol=?').bind(row.symbol).first();
      const samples=await env.DB.prepare('SELECT price FROM candidate_snapshots WHERE symbol=? ORDER BY bucket_at DESC LIMIT 24').bind(row.symbol).all();
      const entry=Number(h?.candidate_price||row.price);
      const returns=(samples.results||[]).map(x=>finite(x.price)&&entry>0?(Number(x.price)/entry-1)*100:null).filter(finite);
      if(returns.length){
        const avg=returns.reduce((a,b)=>a+b,0)/returns.length;
        const best=Math.max(...returns),worst=Math.min(...returns),hit=returns.filter(x=>x>0).length/returns.length;
        const penalty=Math.max(0,Math.min(20,(-avg)*1.8+(0.5-hit)*12));
        const verdict=returns.length>=3&&avg<0&&hit<0.4?'부적합':returns.length>=3&&avg>1&&hit>=0.6?'적합':'관찰중';
        await env.DB.prepare(`INSERT INTO candidate_feedback(symbol,evaluations,avg_return_pct,best_return_pct,worst_return_pct,hit_rate,penalty_score,verdict,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(symbol) DO UPDATE SET evaluations=excluded.evaluations,avg_return_pct=excluded.avg_return_pct,best_return_pct=excluded.best_return_pct,worst_return_pct=excluded.worst_return_pct,hit_rate=excluded.hit_rate,penalty_score=excluded.penalty_score,verdict=excluded.verdict,updated_at=excluded.updated_at`)
          .bind(row.symbol,returns.length,avg,best,worst,hit,penalty,verdict,ts).run();
      }
      recorded++;
    }catch{}
  }
  return {ok:true,recorded,bucketAt:new Date(bucket).toISOString()};
}
