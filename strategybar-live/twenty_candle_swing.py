#!/usr/bin/env python3
"""20-candle swing strategy.

Source-derived entry rule:
1) 120-bar highest high.
2) 20-bar highest high shifted 30 bars into the past.
3) "Blue zone" when both highs are the same price.
4) Bullish candle crosses above SMA60 inside the blue zone.
5) Current volume is at least 250% of the immediately previous bar.

Backtest-only execution/risk rules are explicit assumptions, because the source
does not provide numerical stop-loss or take-profit formulas.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from math import isfinite
from typing import Any, Dict, Iterable, List, Optional


def _num(v: Any) -> Optional[float]:
    try:
        x = float(v)
        return x if isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _sma(values: List[Optional[float]], i: int, period: int) -> Optional[float]:
    if i + 1 < period:
        return None
    window = values[i - period + 1 : i + 1]
    if any(v is None for v in window):
        return None
    return sum(window) / period  # type: ignore[arg-type]


def _highest(values: List[Optional[float]], start: int, end_inclusive: int) -> Optional[float]:
    if start < 0 or end_inclusive >= len(values) or start > end_inclusive:
        return None
    window = values[start : end_inclusive + 1]
    if any(v is None for v in window):
        return None
    return max(window)  # type: ignore[arg-type]


def _lowest(values: List[Optional[float]], start: int, end_inclusive: int) -> Optional[float]:
    if start < 0 or end_inclusive >= len(values) or start > end_inclusive:
        return None
    window = values[start : end_inclusive + 1]
    if any(v is None for v in window):
        return None
    return min(window)  # type: ignore[arg-type]


def _same_price(a: Optional[float], b: Optional[float]) -> bool:
    if a is None or b is None:
        return False
    tol = max(1e-9, abs(a) * 1e-10)
    return abs(a - b) <= tol


@dataclass
class Swing20Bar:
    index: int
    date: str
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[float]
    high120: Optional[float]
    high20_shift30: Optional[float]
    ma60: Optional[float]
    volume_ratio_prev: Optional[float]
    blue_zone: bool
    bullish: bool
    cross_up_ma60: bool
    signal: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def compute_bars(rows: Iterable[Dict[str, Any]]) -> List[Swing20Bar]:
    src = list(rows)
    opens = [_num(r.get("open")) for r in src]
    highs = [_num(r.get("high")) for r in src]
    lows = [_num(r.get("low")) for r in src]
    closes = [_num(r.get("close")) for r in src]
    volumes = [_num(r.get("volume")) for r in src]

    out: List[Swing20Bar] = []
    for i, row in enumerate(src):
        # Highest(H,120) at the current bar: i-119 ... i.
        high120 = _highest(highs, i - 119, i) if i >= 119 else None

        # Highest(H,20) shifted 30 bars:
        # exact Python window = i-49 ... i-30 inclusive (20 candles).
        high20_shift30 = _highest(highs, i - 49, i - 30) if i >= 49 else None

        ma60 = _sma(closes, i, 60)
        prev_ma60 = _sma(closes, i - 1, 60) if i >= 1 else None
        prev_close = closes[i - 1] if i >= 1 else None
        open_ = opens[i]
        close = closes[i]
        vol = volumes[i]
        prev_vol = volumes[i - 1] if i >= 1 else None

        blue_zone = _same_price(high120, high20_shift30)
        bullish = open_ is not None and close is not None and close > open_
        cross_up_ma60 = (
            prev_close is not None
            and prev_ma60 is not None
            and close is not None
            and ma60 is not None
            and prev_close <= prev_ma60
            and close > ma60
        )
        volume_ratio_prev = (
            vol / prev_vol
            if vol is not None and prev_vol is not None and prev_vol > 0
            else None
        )
        signal = bool(
            blue_zone
            and bullish
            and cross_up_ma60
            and volume_ratio_prev is not None
            and volume_ratio_prev >= 2.5
        )

        out.append(
            Swing20Bar(
                index=i,
                date=str(row.get("date") or ""),
                open=open_,
                high=highs[i],
                low=lows[i],
                close=close,
                volume=vol,
                high120=high120,
                high20_shift30=high20_shift30,
                ma60=ma60,
                volume_ratio_prev=volume_ratio_prev,
                blue_zone=blue_zone,
                bullish=bullish,
                cross_up_ma60=cross_up_ma60,
                signal=signal,
            )
        )
    return out


def latest_signal(rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    bars = compute_bars(rows)
    if not bars:
        return {"ready": False, "signal": False, "reason": "history_empty"}
    last = bars[-1]
    signal_bars = [b for b in bars if b.signal]
    return {
        "ready": last.high120 is not None and last.ma60 is not None,
        "signal": last.signal,
        "date": last.date,
        "blueZone": last.blue_zone,
        "high120": last.high120,
        "high20Shift30": last.high20_shift30,
        "ma60": last.ma60,
        "bullish": last.bullish,
        "crossUpMa60": last.cross_up_ma60,
        "volumeRatioPrev": last.volume_ratio_prev,
        "signalLow": last.low,
        "signalClose": last.close,
        "lastSignalDate": signal_bars[-1].date if signal_bars else None,
        "barsSinceLastSignal": (last.index - signal_bars[-1].index) if signal_bars else None,
        "rule": "blue_zone & bullish & cross_up_ma60 & volume_ratio_prev>=2.5",
    }


@dataclass
class BacktestTrade:
    signal_date: str
    entry_date: str
    exit_date: str
    entry: float
    exit: float
    stop_initial: float
    take_profit: float
    shares: float
    pnl_pct: float
    pnl_cash: float
    bars_held: int
    exit_reason: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def backtest(
    rows: Iterable[Dict[str, Any]],
    *,
    initial_capital: float = 100_000.0,
    risk_per_trade: float = 0.01,
    max_position_pct: float = 1.0,
    max_stop_pct: float = 0.07,
    reward_r: float = 2.0,
    trail_lookback: int = 10,
    trail_after_r: float = 1.0,
    max_hold_bars: int = 120,
    fee_bps_each_side: float = 10.0,
) -> Dict[str, Any]:
    """Backtest with no same-bar lookahead.

    Signal is known only after bar close. Entry occurs at the next bar open.
    Intraday ambiguity is handled conservatively: if stop and target are both
    touched on the same bar, the stop is assumed to fill first.

    Exit rules are test assumptions, not claims from the source:
      - initial stop = max(signal-bar low, entry * (1-max_stop_pct))
      - target = entry + reward_r * initial risk
      - after +trail_after_r R, trailing stop can rise to prior completed
        trail_lookback-bar low
      - close below SMA60 schedules exit at next bar open
      - max_hold_bars is a safety cap for finite backtests
    """
    src = list(rows)
    bars = compute_bars(src)
    if len(bars) < 121:
        return {
            "ready": False,
            "reason": "need_at_least_121_bars",
            "trades": 0,
            "initialCapital": initial_capital,
            "endingCapital": initial_capital,
        }

    capital = float(initial_capital)
    peak = capital
    max_dd = 0.0
    trades: List[BacktestTrade] = []
    i = 0
    fee_rate = max(0.0, fee_bps_each_side) / 10_000.0

    while i < len(bars) - 1:
        signal_bar = bars[i]
        if not signal_bar.signal:
            i += 1
            continue

        entry_bar = bars[i + 1]
        entry = entry_bar.open
        signal_low = signal_bar.low
        if entry is None or entry <= 0 or signal_low is None:
            i += 1
            continue

        stop_initial = max(signal_low, entry * (1.0 - max_stop_pct))
        if stop_initial >= entry:
            stop_initial = entry * (1.0 - min(max_stop_pct, 0.02))

        risk_per_share = entry - stop_initial
        if risk_per_share <= 0:
            i += 1
            continue

        risk_budget = capital * max(0.0, risk_per_trade)
        shares_by_risk = risk_budget / risk_per_share
        shares_by_cash = (capital * max(0.0, min(1.0, max_position_pct))) / entry
        shares = min(shares_by_risk, shares_by_cash)
        if shares <= 0:
            i += 1
            continue

        target = entry + reward_r * risk_per_share
        stop = stop_initial
        entry_cost = entry * shares * (1.0 + fee_rate)
        exit_price = entry
        exit_reason = "max_hold"
        exit_idx = i + 1

        for j in range(i + 1, min(len(bars), i + 1 + max_hold_bars)):
            b = bars[j]
            if b.high is None or b.low is None or b.close is None:
                continue

            # Conservative same-day order: stop before target.
            if b.low <= stop:
                exit_price = stop
                exit_reason = "stop"
                exit_idx = j
                break

            if b.high >= target:
                exit_price = target
                exit_reason = "take_profit_2R"
                exit_idx = j
                break

            # Raise trailing stop using only already-completed bars.
            if b.high >= entry + trail_after_r * risk_per_share and j >= trail_lookback:
                prior_low = _lowest(
                    [x.low for x in bars],
                    j - trail_lookback,
                    j - 1,
                )
                if prior_low is not None:
                    stop = max(stop, prior_low)

            # A close below SMA60 schedules execution at next bar open.
            if b.ma60 is not None and b.close < b.ma60 and j + 1 < len(bars):
                next_open = bars[j + 1].open
                if next_open is not None and next_open > 0:
                    exit_price = next_open
                    exit_reason = "ma60_exit_next_open"
                    exit_idx = j + 1
                    break

            exit_price = b.close
            exit_idx = j

        exit_proceeds = exit_price * shares * (1.0 - fee_rate)
        pnl_cash = exit_proceeds - entry_cost
        capital += pnl_cash
        peak = max(peak, capital)
        if peak > 0:
            max_dd = max(max_dd, (peak - capital) / peak)

        pnl_pct = (exit_price / entry - 1.0) * 100.0
        trades.append(
            BacktestTrade(
                signal_date=signal_bar.date,
                entry_date=entry_bar.date,
                exit_date=bars[exit_idx].date,
                entry=round(entry, 6),
                exit=round(exit_price, 6),
                stop_initial=round(stop_initial, 6),
                take_profit=round(target, 6),
                shares=round(shares, 8),
                pnl_pct=round(pnl_pct, 3),
                pnl_cash=round(pnl_cash, 2),
                bars_held=max(1, exit_idx - (i + 1) + 1),
                exit_reason=exit_reason,
            )
        )
        i = max(i + 1, exit_idx + 1)

    wins = [t for t in trades if t.pnl_cash > 0]
    losses = [t for t in trades if t.pnl_cash < 0]
    gross_win = sum(t.pnl_cash for t in wins)
    gross_loss = abs(sum(t.pnl_cash for t in losses))
    total_return = (capital / initial_capital - 1.0) * 100.0 if initial_capital > 0 else 0.0
    avg_trade = sum(t.pnl_pct for t in trades) / len(trades) if trades else 0.0
    expectancy = sum(t.pnl_cash for t in trades) / len(trades) if trades else 0.0

    return {
        "ready": True,
        "strategy": "20캔들 스윙",
        "trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "winRate": round(len(wins) / len(trades), 4) if trades else None,
        "profitFactor": round(gross_win / gross_loss, 3) if gross_loss > 0 else None,
        "initialCapital": round(initial_capital, 2),
        "endingCapital": round(capital, 2),
        "totalReturnPct": round(total_return, 3),
        "maxDrawdownPct": round(max_dd * 100.0, 3),
        "avgTradePct": round(avg_trade, 3),
        "expectancyCash": round(expectancy, 2),
        "rules": {
            "entry": "signal close confirmed -> next bar open",
            "stop": f"max(signal_low, entry*(1-{max_stop_pct:.4f}))",
            "takeProfit": f"entry + {reward_r:.2f}R",
            "trail": f"after +{trail_after_r:.2f}R, prior {trail_lookback}-bar low",
            "trendExit": "close < SMA60 -> next bar open",
            "maxHoldBars": max_hold_bars,
            "feeBpsEachSide": fee_bps_each_side,
        },
        "recentTrades": [t.to_dict() for t in trades[-10:]],
    }


def strategy_spec() -> Dict[str, Any]:
    return {
        "name": "20캔들 스윙",
        "sourceEntryRules": {
            "high120": "max(high[i-119:i+1])",
            "high20Shift30": "max(high[i-49:i-29])  # bars i-49..i-30",
            "blueZone": "high120 == high20Shift30",
            "ma60": "mean(close[i-59:i+1])",
            "bullish": "close[i] > open[i]",
            "crossUpMa60": "close[i-1] <= ma60[i-1] and close[i] > ma60[i]",
            "volume250": "volume[i] >= 2.5 * volume[i-1]",
            "signal": "blueZone and bullish and crossUpMa60 and volume250",
        },
        "paperBacktestRules": {
            "entry": "next bar open",
            "initialStop": "max(signal low, entry*0.93)",
            "takeProfit": "2R",
            "trail": "after +1R, prior 10-bar low",
            "trendExit": "close below SMA60 -> next bar open",
            "maxHold": "120 bars",
            "note": "Stop/target/exit numbers are validation assumptions; the source does not specify exact numerical exits.",
        },
    }
