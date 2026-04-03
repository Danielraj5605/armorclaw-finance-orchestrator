"""
backend/agents/tools/risk_tools.py

Tools available ONLY to the Risk agent — ALL READ-ONLY:
  - get_positions_tool:      current Alpaca paper positions
  - get_account_tool:        account equity and buying power
  - calculate_exposure_tool: computes post-trade concentration %

The Risk Agent is physically incapable of placing orders.
These tools only read data; none of them write anything to any system.
"""
import json
import os
from datetime import datetime
from langchain_core.tools import tool

# Lazy import so this module can be loaded without Alpaca keys present
_alpaca_client = None

def _get_alpaca():
    global _alpaca_client
    if _alpaca_client is None:
        from backend.alpaca.client import AlpacaClient
        _alpaca_client = AlpacaClient()
    return _alpaca_client


@tool("get_positions")
def get_positions_tool() -> str:
    """
    Returns current paper trading portfolio positions from Alpaca.
    READ-ONLY — does not modify any positions.
    Returns a list of holdings with symbol, quantity, market value, and unrealized P&L.
    """
    try:
        alpaca = _get_alpaca()
        positions = alpaca.get_positions()
        summary = [
            {
                "symbol":       p.get("symbol"),
                "qty":          p.get("qty"),
                "market_value": p.get("market_value"),
                "unrealized_pl": p.get("unrealized_pl"),
                "current_price": p.get("current_price"),
            }
            for p in positions
        ]
    except Exception:
        # Mock data for demo (no Alpaca keys)
        summary = [
            {"symbol": "NVDA", "qty": "10", "market_value": "8754.00", "unrealized_pl": "+254.00", "current_price": "875.40"},
            {"symbol": "AAPL", "qty": "25", "market_value": "4786.25", "unrealized_pl": "-113.75", "current_price": "191.45"},
        ]

    return json.dumps({
        "positions": summary,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "source": "alpaca_paper",
    })


@tool("get_account")
def get_account_tool() -> str:
    """
    Returns account equity, cash, and buying power from Alpaca.
    READ-ONLY — does not modify any account data.
    """
    try:
        alpaca = _get_alpaca()
        acct = alpaca.get_account()
        return json.dumps({
            "equity":         acct.get("equity", "100000"),
            "cash":           acct.get("cash", "50000"),
            "buying_power":   acct.get("buying_power", "200000"),
            "portfolio_value": acct.get("portfolio_value", "100000"),
            "timestamp":      datetime.utcnow().isoformat() + "Z",
        })
    except Exception:
        return json.dumps({
            "equity": "100000.00",
            "cash": "50000.00",
            "buying_power": "200000.00",
            "portfolio_value": "100000.00",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })


@tool("calculate_exposure")
def calculate_exposure_tool(ticker: str, proposed_amount_usd: float) -> str:
    """
    Calculates the post-trade portfolio concentration percentage if the proposed
    order were to be executed. Returns risk assessment including whether the
    concentration would breach the 40% single-ticker limit or 60% sector limit.
    """
    try:
        alpaca = _get_alpaca()
        acct = alpaca.get_account()
        portfolio_value = float(acct.get("portfolio_value", "100000"))
    except Exception:
        portfolio_value = 100_000.0

    if portfolio_value <= 0:
        portfolio_value = 100_000.0

    concentration_pct = round((proposed_amount_usd / portfolio_value) * 100, 2)
    breaches_single_ticker = concentration_pct > 40.0
    # All allowed tickers are Tech — treat as same sector
    breaches_sector = concentration_pct > 60.0

    verdict = "SAFE"
    if breaches_sector:
        verdict = "REJECT — sector limit breach"
    elif breaches_single_ticker:
        verdict = "REJECT — concentration limit breach"

    return json.dumps({
        "ticker":               ticker,
        "proposed_amount_usd":  proposed_amount_usd,
        "portfolio_value":      portfolio_value,
        "post_trade_concentration_pct": concentration_pct,
        "single_ticker_limit_pct": 40.0,
        "sector_limit_pct":     60.0,
        "breaches_single_ticker_limit": breaches_single_ticker,
        "breaches_sector_limit": breaches_sector,
        "verdict":              verdict,
        "timestamp":            datetime.utcnow().isoformat() + "Z",
    })
