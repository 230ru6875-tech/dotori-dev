#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import queue
import threading
import time
from datetime import datetime
from urllib import request, error
from zoneinfo import ZoneInfo

from nhplug.realtime import subscribe

TARGET_URL = os.getenv("STRATEGYBAR_TARGET_URL", "https://strategybar.hnr2020.workers.dev").rstrip("/")
INGEST_SECRET = os.getenv("MARKET_INGEST_SECRET", "")
DEFAULT_SYMBOLS = "SNDK,IONQ,AVGO,ORCL,NVDA,AMD,TSM,ASML,MU,ARM,PLTR,VRT,IREN,RKLB,ASTS,QBTS,RGTI,OKLO,SMR,COIN"
SYMBOLS = list(dict.fromkeys(x.strip().upper() for x in os.getenv("STRATEGYBAR_NAMUH_SYMBOLS", DEFAULT_SYMBOLS).split(",") if x.strip()))[:20]
ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

if not INGEST_SECRET:
    raise SystemExit("Missing MARKET_INGEST_SECRET")

_pending = {}
_lock = threading.Lock()
_wakeup = threading.Event()
_stop = threading.Event()


def _num(value):
    try:
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except Exception:
        return None


def _session(dt_et):
    minute = dt_et.hour * 60 + dt_et.minute
    if 4 * 60 <= minute < 9 * 60 + 30:
        return "PREMARKET"
    if 9 * 60 + 30 <= minute < 16 * 60:
        return "REGULAR"
    if 16 * 60 <= minute <= 20 * 60:
        return "AFTER_HOURS"
    return "REGULAR"


def _timestamp(body):
    date_text = str(body.get("trade_datez8") or "").strip()
    time_text = str(body.get("trade_timez6") or "").strip().zfill(6)
    try:
        local = datetime.strptime(date_text + time_text, "%Y%m%d%H%M%S").replace(tzinfo=ET)
        return local.astimezone(UTC), local
    except Exception:
        now = datetime.now(UTC)
        return now, now.astimezone(ET)


def _symbol(message, body):
    raw = str(message.get("header", {}).get("tr_key") or body.get("gicz15") or "").strip().upper()
    if raw.startswith("USA") and len(raw) > 3:
        return raw[3:]
    return raw


def _normalize(message):
    if not isinstance(message, dict):
        return None
    header = message.get("header") or {}
    if header.get("rsp_cd") not in (None, "", "00000"):
        print(time.strftime("%Y-%m-%dT%H:%M:%S"), "NAMUH subscription error", header.get("rsp_cd"), header.get("rsp_msg"), flush=True)
        return None
    body = message.get("body") or {}
    price = _num(body.get("trdprc_1z17"))
    symbol = _symbol(message, body)
    if not symbol or price is None or price <= 0:
        return None

    asof_utc, asof_et = _timestamp(body)
    pct = _num(body.get("pctchng_1z17"))
    prev = None
    if pct is not None and pct > -99.999:
        prev = price / (1.0 + pct / 100.0)
    volume = _num(body.get("acvol_1z15"))
    turnover = _num(body.get("turnoverz17"))
    vwap = turnover / volume if turnover is not None and volume and volume > 0 else None
    sess = _session(asof_et)
    labels = {"PREMARKET": "프리마켓", "REGULAR": "정규장", "AFTER_HOURS": "시간외"}

    return {
        "symbol": symbol,
        "price": price,
        "previousClose": prev,
        "changePct": pct,
        "currency": "USD",
        "marketState": sess,
        "priceSession": sess,
        "sessionLabel": labels[sess],
        "asOf": asof_utc.isoformat().replace("+00:00", "Z"),
        "provider": "NAMUH",
        "source": "NAMUH PLUG RC WebSocket",
        "open": _num(body.get("open_prcz17")),
        "dayHigh": _num(body.get("high_1z17")),
        "dayLow": _num(body.get("low_1z17")),
        "volume": volume,
        "vwap": vwap,
        "bidPrice": _num(body.get("best_bid1z17")),
        "askPrice": _num(body.get("best_ask1z17")),
        "bidSize": _num(body.get("best_bsiz1z15")),
        "askSize": _num(body.get("best_asiz1z15")),
    }


def _sign_and_post(quotes):
    raw = json.dumps({"quotes": quotes}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ts = str(int(time.time()))
    sig = hmac.new(INGEST_SECRET.encode("utf-8"), ts.encode("utf-8") + b"." + raw, hashlib.sha256).hexdigest()
    req = request.Request(
        TARGET_URL + "/api/market-ingest",
        data=raw,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-strategybar-timestamp": ts,
            "x-strategybar-signature": sig,
            "User-Agent": "strategybar-namuh/1.0",
        },
    )
    with request.urlopen(req, timeout=10) as response:
        payload = response.read().decode("utf-8", "replace")
        if response.status >= 300:
            raise RuntimeError(f"ingest HTTP {response.status}: {payload[:300]}")
        return payload


def _flush_worker():
    while not _stop.is_set():
        _wakeup.wait(0.10)
        _wakeup.clear()
        time.sleep(0.05)
        with _lock:
            if not _pending:
                continue
            batch = list(_pending.values())
            _pending.clear()
        try:
            _sign_and_post(batch)
        except Exception as exc:
            print(time.strftime("%Y-%m-%dT%H:%M:%S"), "NAMUH ingest failed", repr(exc), flush=True)
            with _lock:
                for item in batch:
                    _pending[item["symbol"]] = item
            time.sleep(1)
            _wakeup.set()


def on_message(message):
    quote = _normalize(message)
    if quote is None:
        return
    with _lock:
        _pending[quote["symbol"]] = quote
    _wakeup.set()
    print(
        time.strftime("%Y-%m-%dT%H:%M:%S"),
        f"NAMUH {quote['symbol']} {quote['price']} {quote['sessionLabel']} bid={quote.get('bidPrice')} ask={quote.get('askPrice')}",
        flush=True,
    )


def main():
    print(time.strftime("%Y-%m-%dT%H:%M:%S"), f"NAMUH collector starting symbols={len(SYMBOLS)} {','.join(SYMBOLS)}", flush=True)
    worker = threading.Thread(target=_flush_worker, name="ingest-flush", daemon=True)
    worker.start()
    wait = 1
    while not _stop.is_set():
        try:
            subscribe(SYMBOLS, on_message, tr_cd="RC", overseas=True)
            wait = 1
        except KeyboardInterrupt:
            _stop.set()
            break
        except Exception as exc:
            print(time.strftime("%Y-%m-%dT%H:%M:%S"), "NAMUH websocket stopped", repr(exc), flush=True)
            time.sleep(wait)
            wait = min(wait * 2, 30)


if __name__ == "__main__":
    main()
