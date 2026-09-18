#!/usr/bin/env python3
import hashlib, hmac, json, os, time, urllib.request
from datetime import datetime, timezone

TARGET=os.getenv("STRATEGYBAR_TARGET_URL","https://strategybar.hnr2020.workers.dev").rstrip("/")
STATE_PATH=os.getenv("SURVIVAL_STATE_PATH","/var/lib/strategybar-survival/state.json")
TRADES_PATH=os.getenv("SURVIVAL_TRADES_PATH","/var/lib/strategybar-survival/trades.jsonl")
INGEST_SECRET=os.getenv("MARKET_INGEST_SECRET","").strip()

MODE="PAPER_ONLY"
PROFILE=os.getenv("SURVIVAL_PROFILE","FAST_SURVIVAL").strip().upper()
BROKER_MODE=os.getenv("SURVIVAL_BROKER","NAMUH").strip().upper()
START_KRW=float(os.getenv("SURVIVAL_START_KRW","100000"))
TARGET_KRW=float(os.getenv("SURVIVAL_TARGET_KRW","1000000"))
POLL=max(15,int(os.getenv("SURVIVAL_POLL_SECONDS","30")))

MAX_POSITIONS=max(1,int(os.getenv("SURVIVAL_MAX_POSITIONS","3")))
MAX_POSITION_PCT=float(os.getenv("SURVIVAL_MAX_POSITION_PCT","0.40"))
RISK_PER_TRADE=float(os.getenv("SURVIVAL_RISK_PER_TRADE","0.015"))
MAX_RISK_PER_TRADE=float(os.getenv("SURVIVAL_MAX_RISK_PER_TRADE","0.020"))
DAILY_LOSS_LIMIT=float(os.getenv("SURVIVAL_DAILY_LOSS_LIMIT","0.03"))
MAX_DRAWDOWN=float(os.getenv("SURVIVAL_MAX_DRAWDOWN","0.10"))
HARD_KILL_DRAWDOWN=float(os.getenv("SURVIVAL_HARD_KILL_DRAWDOWN","0.15"))
BASE_STOP_PCT=float(os.getenv("SURVIVAL_BASE_STOP_PCT","0.035"))
TAKE_PROFIT_PCT=float(os.getenv("SURVIVAL_TAKE_PROFIT_PCT","0.10"))
TRAIL_START_PCT=float(os.getenv("SURVIVAL_TRAIL_START_PCT","0.05"))
TRAIL_GAP_PCT=float(os.getenv("SURVIVAL_TRAIL_GAP_PCT","0.04"))
ENTRY_SCORE=float(os.getenv("SURVIVAL_ENTRY_SCORE","68"))
ENTRY_RISK_HEAD=float(os.getenv("SURVIVAL_ENTRY_RISK_HEAD","52"))
ENTRY_REL_HEAD=float(os.getenv("SURVIVAL_ENTRY_REL_HEAD","52"))
MIN_PATTERN_SUCCESS=float(os.getenv("SURVIVAL_MIN_PATTERN_SUCCESS","0.50"))

BROKERS=("NAMUH","KIS","TOSS")

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def today_utc():
    return datetime.now(timezone.utc).date().isoformat()

def atomic_save(path,obj):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    tmp=path+".tmp"
    with open(tmp,"w",encoding="utf-8") as f:
        json.dump(obj,f,ensure_ascii=False,indent=2)
    os.replace(tmp,path)

def load_state():
    try:
        with open(STATE_PATH,encoding="utf-8") as f:
            s=json.load(f)
    except Exception:
        s={}
    s.setdefault("mode",MODE)
    s.setdefault("profile",PROFILE)
    s.setdefault("broker",BROKER_MODE if BROKER_MODE in ("AUTO",)+BROKERS else "NAMUH")
    s.setdefault("activeBroker",None)
    s.setdefault("startKrw",START_KRW)
    s.setdefault("targetKrw",TARGET_KRW)
    s.setdefault("cashKrw",START_KRW)
    s.setdefault("positions",{})
    s.setdefault("equityPeakKrw",START_KRW)
    s.setdefault("dayStartEquityKrw",START_KRW)
    s.setdefault("day",today_utc())
    s.setdefault("pausedUntil",0)
    s.setdefault("killSwitch",False)
    s.setdefault("goalReached",False)
    s.setdefault("trades",0)
    s.setdefault("wins",0)
    s.setdefault("losses",0)
    s.setdefault("lastCycle",None)
    return s

def http_json(path):
    req=urllib.request.Request(TARGET+path,headers={"User-Agent":"StrategyBar-Survival-Paper/2.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))

def post_state(state):
    if not INGEST_SECRET:
        return False
    payload={
        "mode":MODE,"profile":PROFILE,"broker":state.get("broker","AUTO"),"activeBroker":state.get("activeBroker"),
        "startKrw":START_KRW,"targetKrw":TARGET_KRW,"equityKrw":state.get("equityKrw",0),"cashKrw":state.get("cashKrw",0),
        "progressPct":state.get("progressPct",0),"equityMultiple":state.get("equityMultiple",0),"positions":state.get("positions",{}),
        "trades":state.get("trades",0),"wins":state.get("wins",0),"losses":state.get("losses",0),
        "drawdownPct":state.get("drawdownPct",0),"dayLossPct":state.get("dayLossPct",0),
        "killSwitch":state.get("killSwitch",False),"goalReached":state.get("goalReached",False),
        "paused":time.time()<float(state.get("pausedUntil",0)),"lastCycle":state.get("lastCycle"),"usdKrw":state.get("usdKrw",0),
    }
    raw=json.dumps(payload,ensure_ascii=False,separators=(",",":"))
    ts=str(int(time.time()))
    sig=hmac.new(INGEST_SECRET.encode(),f"{ts}.{raw}".encode(),hashlib.sha256).hexdigest()
    req=urllib.request.Request(TARGET+"/api/survival-ingest",data=raw.encode("utf-8"),method="POST",
        headers={"content-type":"application/json","x-strategybar-timestamp":ts,"x-strategybar-signature":sig,"user-agent":"StrategyBar-Survival-Paper/2.0"})
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            return 200<=r.status<300
    except Exception as e:
        print(now_iso(),"state_publish_error",repr(e),flush=True)
        return False

def get_usdkrw(market):
    for row in market or []:
        if row.get("key")=="KRW=X":
            try:
                v=float(row.get("value"))
                if v>100:return v
            except Exception:pass
    return None

def quote_map(market_payload):
    return market_payload.get("symbols") or {}

def choose_broker(state,market,status):
    requested=str(state.get("broker") or BROKER_MODE or "AUTO").upper()
    if requested in BROKERS:
        return requested
    counts={b:0 for b in BROKERS}
    for row in (market.get("symbols") or {}).values():
        p=str((row or {}).get("provider") or "").upper()
        if p in counts: counts[p]+=1
    best=max(BROKERS,key=lambda b:(counts[b],{"NAMUH":3,"KIS":2,"TOSS":1}[b]))
    if counts[best]>0:return best
    if status.get("kisConfigured"):return "KIS"
    if status.get("tossConfigured"):return "TOSS"
    return "NAMUH"

def equity_krw(state,quotes,fx):
    eq=float(state["cashKrw"])
    for sym,p in state["positions"].items():
        q=quotes.get(sym) or {}
        try: price=float(q.get("price"))
        except Exception: price=float(p.get("lastPrice",p["entryPrice"]))
        p["lastPrice"]=price
        eq += float(p["shares"])*price*fx
    return eq

def append_trade(row):
    os.makedirs(os.path.dirname(TRADES_PATH),exist_ok=True)
    with open(TRADES_PATH,"a",encoding="utf-8") as f:
        f.write(json.dumps(row,ensure_ascii=False)+"\n")

def reset_day(state,equity):
    d=today_utc()
    if state.get("day")!=d:
        state["day"]=d
        state["dayStartEquityKrw"]=equity

def risk_guard(state,equity):
    state["equityPeakKrw"]=max(float(state.get("equityPeakKrw",equity)),equity)
    peak=float(state["equityPeakKrw"])
    dd=(peak-equity)/peak if peak>0 else 0
    day0=float(state.get("dayStartEquityKrw",equity))
    day_loss=(day0-equity)/day0 if day0>0 else 0
    if dd>=HARD_KILL_DRAWDOWN:
        state["killSwitch"]=True
    elif dd>=MAX_DRAWDOWN or day_loss>=DAILY_LOSS_LIMIT:
        state["pausedUntil"]=max(float(state.get("pausedUntil",0)),time.time()+86400)
    return dd,day_loss

def close_position(state,sym,price,fx,reason):
    p=state["positions"].pop(sym)
    proceeds=float(p["shares"])*price*fx
    state["cashKrw"]+=proceeds
    pnl=proceeds-float(p["costKrw"])
    state["trades"]+=1
    if pnl>0: state["wins"]+=1
    elif pnl<0: state["losses"]+=1
    append_trade({"ts":now_iso(),"side":"SELL","symbol":sym,"priceUsd":price,"shares":p["shares"],"fx":fx,
        "proceedsKrw":round(proceeds,2),"pnlKrw":round(pnl,2),"reason":reason,"broker":p.get("broker"),"mode":MODE,"profile":PROFILE})
    print(now_iso(),"SELL",sym,round(price,4),reason,"pnl_krw",round(pnl,2),"broker",p.get("broker"),flush=True)

def manage_positions(state,quotes,fx):
    for sym in list(state["positions"]):
        p=state["positions"][sym]
        q=quotes.get(sym) or {}
        try: price=float(q.get("price"))
        except Exception: continue
        entry=float(p["entryPrice"])
        high=max(float(p.get("highPrice",entry)),price); p["highPrice"]=high
        ret=price/entry-1
        stop=float(p.get("stopPrice",entry*(1-BASE_STOP_PCT)))
        if ret>=TRAIL_START_PCT:
            stop=max(stop,high*(1-TRAIL_GAP_PCT)); p["stopPrice"]=stop
        if price<=stop:
            close_position(state,sym,price,fx,"stop_or_trailing")
        elif ret>=TAKE_PROFIT_PCT:
            close_position(state,sym,price,fx,"take_profit")

def candidate_ok(c):
    if str(c.get("marketRegime"))=="risk_off": return False
    if str(c.get("compositeSignal") or c.get("signal")) not in ("주목","관찰"): return False
    if float(c.get("adjustedScore") or 0)<ENTRY_SCORE:return False
    heads=c.get("headScores") or {}
    if float(heads.get("risk") or 0)<ENTRY_RISK_HEAD:return False
    if float(heads.get("relative") or 0)<ENTRY_REL_HEAD:return False
    n=int(c.get("patternSamples") or 0)
    rate=c.get("patternSuccessRate")
    if n>=3 and rate is not None and float(rate)<MIN_PATTERN_SUCCESS:return False
    return True

def adaptive_risk_fraction(state,c,equity):
    base=RISK_PER_TRADE
    heads=c.get("headScores") or {}
    exceptional=float(c.get("adjustedScore") or 0)>=80 and float(heads.get("risk") or 0)>=70 and float(heads.get("relative") or 0)>=70
    if c.get("marketRegime")=="risk_on" and exceptional: base=min(MAX_RISK_PER_TRADE,base*1.25)
    if equity>=500000: base*=0.80
    elif equity>=250000: base*=0.90
    peak=float(state.get("equityPeakKrw") or equity)
    dd=(peak-equity)/peak if peak>0 else 0
    if dd>=0.05: base*=0.50
    return max(0.005,min(MAX_RISK_PER_TRADE,base))

def maybe_enter(state,candidates,quotes,fx,equity,broker):
    if state.get("goalReached") or state.get("killSwitch") or time.time()<float(state.get("pausedUntil",0)):return
    slots=MAX_POSITIONS-len(state["positions"])
    if slots<=0:return
    ordered=sorted(candidates,key=lambda c:float(c.get("adjustedScore") or 0),reverse=True)
    for c in ordered:
        if slots<=0:break
        sym=str(c.get("symbol") or "").upper()
        if not sym or sym in state["positions"] or not candidate_ok(c):continue
        q=quotes.get(sym) or {}
        try: price=float(q.get("price"))
        except Exception: continue
        if price<=0:continue
        risk_fraction=adaptive_risk_fraction(state,c,equity)
        risk_budget_krw=equity*risk_fraction
        max_position_krw=equity*MAX_POSITION_PCT
        sized_by_risk=risk_budget_krw/max(BASE_STOP_PCT,0.005)
        notional_krw=min(max_position_krw,sized_by_risk,float(state["cashKrw"])*0.97)
        if notional_krw<5000:continue
        shares=notional_krw/(price*fx)
        cost=shares*price*fx
        state["cashKrw"]-=cost
        state["positions"][sym]={
            "symbol":sym,"entryAt":now_iso(),"entryPrice":price,"shares":shares,"costKrw":cost,
            "stopPrice":price*(1-BASE_STOP_PCT),"highPrice":price,"lastPrice":price,
            "entryScore":c.get("adjustedScore"),"marketRegime":c.get("marketRegime"),
            "patternSignature":c.get("patternSignature"),"patternSamples":c.get("patternSamples"),
            "patternSuccessRate":c.get("patternSuccessRate"),"broker":broker,"riskFraction":risk_fraction
        }
        append_trade({"ts":now_iso(),"side":"BUY","symbol":sym,"priceUsd":price,"shares":shares,"fx":fx,
            "costKrw":round(cost,2),"score":c.get("adjustedScore"),"regime":c.get("marketRegime"),"riskFraction":risk_fraction,
            "broker":broker,"mode":MODE,"profile":PROFILE})
        print(now_iso(),"BUY",sym,round(price,4),"cost_krw",round(cost,2),"score",c.get("adjustedScore"),"risk",round(risk_fraction*100,2),"broker",broker,flush=True)
        slots-=1

def lock_target(state,quotes,fx,equity):
    if equity<TARGET_KRW or state.get("goalReached"):return equity
    for sym in list(state["positions"]):
        q=quotes.get(sym) or {}
        try: price=float(q.get("price"))
        except Exception: continue
        close_position(state,sym,price,fx,"target_reached")
    equity=equity_krw(state,quotes,fx)
    state["goalReached"]=True
    state["killSwitch"]=True
    print(now_iso(),"TARGET_REACHED",round(equity,2),flush=True)
    return equity

def update_metrics(state,equity,fx,dd,day_loss):
    progress=(equity-START_KRW)/max(1.0,TARGET_KRW-START_KRW)*100
    state.update({
        "mode":MODE,"profile":PROFILE,"startKrw":START_KRW,"targetKrw":TARGET_KRW,
        "equityKrw":round(equity,2),"cashKrw":round(float(state["cashKrw"]),2),"usdKrw":fx,
        "progressPct":round(progress,3),"equityMultiple":round(equity/max(1.0,START_KRW),4),
        "drawdownPct":round(dd*100,3),"dayLossPct":round(day_loss*100,3),"lastCycle":now_iso()
    })

def main():
    state=load_state()
    print(now_iso(),"StrategyBar survival bot starting",MODE,PROFILE,"capital_krw",START_KRW,"target_krw",TARGET_KRW,"broker",state.get("broker"),flush=True)
    while True:
        try:
            market=http_json("/api/market?force=1&t="+str(int(time.time())))
            candidates=http_json("/api/candidates?limit=8&t="+str(int(time.time())))
            try: status=http_json("/api/status")
            except Exception: status={}
            fx=get_usdkrw(market.get("market"))
            if not fx: raise RuntimeError("USD/KRW unavailable")
            quotes=quote_map(market)
            broker=choose_broker(state,market,status); state["activeBroker"]=broker
            eq=equity_krw(state,quotes,fx)
            reset_day(state,eq)
            manage_positions(state,quotes,fx)
            eq=equity_krw(state,quotes,fx)
            dd,day_loss=risk_guard(state,eq)
            maybe_enter(state,candidates.get("candidates") or [],quotes,fx,eq,broker)
            eq=equity_krw(state,quotes,fx)
            eq=lock_target(state,quotes,fx,eq)
            dd,day_loss=risk_guard(state,eq)
            update_metrics(state,eq,fx,dd,day_loss)
            atomic_save(STATE_PATH,state)
            post_state(state)
            print(now_iso(),"equity",round(eq,2),"cash",round(state["cashKrw"],2),"positions",len(state["positions"]),
                "progress%",round(state["progressPct"],2),"dd%",round(dd*100,2),"broker",broker,
                "paused",time.time()<float(state.get("pausedUntil",0)),"kill",state.get("killSwitch"),flush=True)
        except Exception as e:
            print(now_iso(),"cycle_error",repr(e),flush=True)
        time.sleep(POLL)

if __name__=="__main__":
    main()
