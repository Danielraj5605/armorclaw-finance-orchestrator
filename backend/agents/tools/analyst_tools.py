"""
backend/agents/tools/analyst_tools.py

Tools available ONLY to the Analyst agent:
  - market_data_tool: fetches price/OHLC/volume data
  - research_tool:    fetches news headlines + sentiment score

In a real system these would hit a market data API (e.g. yfinance, Alpaca data API,
Polygon.io). For the hackathon demo they return realistic mock data so the demo
works without a paid data subscription.
"""
import os
import json
import random
from datetime import datetime
from langchain_core.tools import tool

# ── Optional: real market data via yfinance if installed ──────────────────────
try:
    import yfinance as yf
    _YFINANCE = True
except ImportError:
    _YFINANCE = False


def _mock_price(ticker: str) -> dict:
    prices = {"NVDA": 875.40, "AAPL": 191.45, "GOOGL": 175.20, "MSFT": 415.80}
    base = prices.get(ticker, 150.00)
    change_pct = random.uniform(-2.5, 3.5)
    return {
        "ticker": ticker,
        "price":  round(base * (1 + change_pct / 100), 2),
        "open":   round(base * (1 - 0.005), 2),
        "high":   round(base * (1 + 0.012), 2),
        "low":    round(base * (1 - 0.018), 2),
        "volume": random.randint(5_000_000, 50_000_000),
        "change_pct": round(change_pct, 2),
        "source": "yfinance" if _YFINANCE else "mock",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@tool("market-data")
def market_data_tool(ticker: str) -> str:
    """
    Fetches real-time market data for a ticker symbol.
    Returns current price, OHLC (open/high/low/close), volume, and percentage change.
    Only supports tickers: NVDA, AAPL, GOOGL, MSFT.
    """
    ticker = ticker.upper().strip()
    allowed = {"NVDA", "AAPL", "GOOGL", "MSFT"}
    if ticker not in allowed:
        return json.dumps({"error": f"Ticker {ticker} is outside the authorized universe {list(allowed)}"})

    if _YFINANCE:
        try:
            t = yf.Ticker(ticker)
            info = t.fast_info
            data = {
                "ticker":     ticker,
                "price":      round(float(info.last_price), 2),
                "open":       round(float(info.open), 2),
                "high":       round(float(info.day_high), 2),
                "low":        round(float(info.day_low), 2),
                "volume":     int(info.last_volume),
                "change_pct": round((info.last_price - info.previous_close) / info.previous_close * 100, 2),
                "source":     "yfinance_live",
                "timestamp":  datetime.utcnow().isoformat() + "Z",
            }
            return json.dumps(data)
        except Exception:
            pass  # fall through to mock

    return json.dumps(_mock_price(ticker))


_SENTIMENTS = {
    "NVDA": ("AI chip demand surges; Jensen Huang raises guidance. Analysts bullish.", +0.81),
    "AAPL": ("Apple Vision Pro sales disappointing; iPhone cycle maturing.", -0.12),
    "GOOGL": ("Google Cloud beats estimates; Gemini adoption accelerating.", +0.65),
    "MSFT": ("Microsoft Azure growth steady; Copilot adds $5B ARR.", +0.58),
}

@tool("research")
def research_tool(ticker: str) -> str:
    """
    Fetches recent news headlines and a quantified sentiment score (-1.0 to +1.0)
    for the given ticker. Positive scores indicate bullish sentiment.
    Sentiment: +1.0 = extremely bullish, 0.0 = neutral, -1.0 = extremely bearish.
    """
    ticker = ticker.upper().strip()
    headline, sentiment = _SENTIMENTS.get(ticker, ("No recent news found.", 0.0))
    return json.dumps({
        "ticker":    ticker,
        "headline":  headline,
        "sentiment": sentiment,
        "rating":    "BUY" if sentiment > 0.3 else ("SELL" if sentiment < -0.2 else "HOLD"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
