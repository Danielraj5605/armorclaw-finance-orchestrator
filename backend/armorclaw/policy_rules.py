"""
backend/armorclaw/policy_rules.py
All 14 named policy rule implementations. Each returns (passed: bool, reason: str).
"""
import os
from datetime import datetime, timezone, time as dtime


def trade_size_limits(amount_usd: float, daily_spent: float, intent: dict):
    max_order = intent.get("max_order_usd", 5000)
    max_daily = intent.get("max_daily_usd", 20000)
    if amount_usd > max_order:
        return False, f"Order ${amount_usd} exceeds max_order_usd ${max_order}"
    if daily_spent + amount_usd > max_daily:
        return False, f"Daily spend ${daily_spent + amount_usd} would exceed max_daily_usd ${max_daily}"
    return True, "OK"


def portfolio_concentration_limit(ticker: str, amount_usd: float, portfolio_value: float):
    if portfolio_value <= 0:
        return True, "OK"
    pct = (amount_usd / portfolio_value) * 100
    if pct > 40:
        return False, f"Post-trade {ticker} concentration {pct:.1f}% exceeds 40% limit"
    return True, "OK"


def sector_exposure_limit(ticker: str, amount_usd: float, portfolio_value: float):
    tech_tickers = {"NVDA", "AAPL", "GOOGL", "MSFT"}
    if ticker not in tech_tickers:
        return True, "OK"
    if portfolio_value <= 0:
        return True, "OK"
    pct = (amount_usd / portfolio_value) * 100
    if pct > 60:
        return False, f"Tech sector exposure would reach {pct:.1f}%, exceeding 60% limit"
    return True, "OK"


def ticker_universe_restriction(ticker: str, intent: dict):
    allowed = intent.get("authorized_tickers", [])
    if ticker not in allowed:
        return False, f"Ticker {ticker} not in authorized_tickers {allowed}"
    return True, "OK"


def market_hours_only():
    """NYSE: 09:30–16:00 ET, Mon–Fri"""
    try:
        import zoneinfo
        et = zoneinfo.ZoneInfo("America/New_York")
    except Exception:
        # Fall back — always pass if timezone unavailable
        return True, "OK (timezone unavailable)"
    now_et = datetime.now(et)
    if now_et.weekday() >= 5:
        return False, f"Market closed — weekend (weekday={now_et.weekday()})"
    market_open  = dtime(9, 30)
    market_close = dtime(16, 0)
    current_time = now_et.time()
    if not (market_open <= current_time <= market_close):
        return False, f"Market closed — current ET time {current_time.strftime('%H:%M')} outside 09:30–16:00"
    return True, "OK"


def earnings_blackout_window(ticker: str):
    """Simplified — no live earnings calendar. Returns True for demo."""
    return True, "OK (earnings calendar not loaded in demo)"


def wash_sale_prevention(ticker: str, action: str):
    """Simplified — no trade history. Returns True for demo."""
    if action != "SELL":
        return True, "OK (rule only applies to SELL)"
    return True, "OK (no recent loss sales in demo)"


def data_class_protection():
    """Simplified — no data classification system in demo."""
    return True, "OK"


def directory_scoped_access():
    """Simplified — verified by design in demo."""
    return True, "OK"


def tool_restrictions(agent: str, tools_used: list):
    allowed_map = {
        "AnalystAgent": {"market-data", "research"},
        "RiskAgent":    {"get_positions", "get_account", "calculate_exposure"},
        "TraderAgent":  {"alpaca-trading:execute"},
    }
    allowed = allowed_map.get(agent, set())
    for tool in tools_used:
        if tool not in allowed:
            return False, f"{agent} called forbidden tool '{tool}'"
    return True, "OK"


def delegation_scope_enforcement(token: dict, order_action: str, order_ticker: str, order_amount: float):
    if token.get("action") != order_action:
        return False, f"Token action {token.get('action')} ≠ order action {order_action}"
    if token.get("ticker") != order_ticker:
        return False, f"Token ticker {token.get('ticker')} ≠ order ticker {order_ticker}"
    if order_amount > token.get("max_amount_usd", 0):
        return False, f"Order ${order_amount} > token max_amount_usd ${token.get('max_amount_usd')}"
    return True, "OK"


def agent_role_binding(submitting_agent: str):
    if submitting_agent != "TraderAgent":
        return False, f"Order must come from TraderAgent, got '{submitting_agent}'"
    return True, "OK"


def intent_token_binding(request_intent_id: str, loaded_intent_id: str):
    if request_intent_id != loaded_intent_id:
        return False, f"intent_token_id mismatch — possible tampering"
    return True, "OK"


def risk_agent_read_only(agent: str, tools_used: list):
    write_tools = {"alpaca-trading:execute", "place_order", "modify_order", "cancel_order"}
    if agent == "RiskAgent":
        for tool in tools_used:
            if tool in write_tools:
                return False, f"RiskAgent called write tool '{tool}' — violates read-only constraint"
    return True, "OK"
