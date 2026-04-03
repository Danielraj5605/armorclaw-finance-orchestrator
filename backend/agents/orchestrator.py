"""
backend/agents/orchestrator.py
Simulates the LangGraph agent pipeline. Streams events for SSE.
In a real system, this wires up actual LangGraph nodes with LLM calls.
For the hackathon demo, agents produce realistic outputs with async delays.
"""
import asyncio
import uuid
import json
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator

from backend.armorclaw.engine import ArmorClawEngine


def _make_token(
    action: str,
    ticker: str,
    amount_usd: float,
    secret_key: str,
    intent: dict,
) -> dict:
    token_id = str(uuid.uuid4())
    issued_at = datetime.now(timezone.utc)
    expiry    = issued_at + timedelta(seconds=60)

    token = {
        "token_id":               token_id,
        "approved_by":            "RiskAgent",
        "action":                 action,
        "ticker":                 ticker,
        "max_amount_usd":         amount_usd,
        "issued_at":              issued_at.isoformat(),
        "expiry":                 expiry.isoformat(),
        "handoff_count":          1,
        "sub_delegation_allowed": False,
        "intent_token_id":        intent.get("intent_token_id", ""),
    }

    # Sign the token
    payload = json.dumps(token, sort_keys=True, default=str).encode()
    token["signature"] = hmac.new(secret_key.encode(), payload, hashlib.sha256).hexdigest()
    return token


async def run_pipeline(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    intent: dict,
    armorclaw: ArmorClawEngine,
    alpaca_client,
    event_queues: dict,
):
    """
    Async pipeline: Analyst → Risk → Trader → ArmorClaw → Alpaca
    Sends SSE events to the queue for this run_id.
    """
    queue = asyncio.Queue()
    event_queues[run_id] = queue

    async def emit(event_type: str, data: dict):
        queue.put_nowait({"event": event_type, "data": data})

    try:
        # ── Analyst Agent ──────────────────────────────────────────
        await emit("agent_activity", {
            "agent": "AnalystAgent", "status": "running",
            "message": f"Fetching {ticker} market data via market-data tool..."
        })
        await asyncio.sleep(0.8)

        await emit("agent_activity", {
            "agent": "AnalystAgent", "status": "running",
            "message": f"research tool: positive sentiment signal (+0.72) for {ticker}"
        })
        await asyncio.sleep(0.6)

        await emit("agent_activity", {
            "agent": "AnalystAgent", "status": "complete",
            "message": f"TradeProposal: {action} {ticker} ${amount_usd:,.0f} | confidence: 0.82"
        })
        await asyncio.sleep(0.4)

        # ── Risk Agent ─────────────────────────────────────────────
        await emit("agent_activity", {
            "agent": "RiskAgent", "status": "running",
            "message": f"get_positions → {ticker}: 12% of portfolio (read-only)"
        })
        await asyncio.sleep(0.6)

        await emit("agent_activity", {
            "agent": "RiskAgent", "status": "running",
            "message": "calculate_exposure → post-trade concentration: ~20% (< 40% limit)"
        })
        await asyncio.sleep(0.5)

        # Issue delegation token
        import os
        secret = os.getenv("ARMORCLAW_SECRET_KEY", "demo-secret-key-32-chars-minimum!")
        token  = _make_token(action, ticker, amount_usd, secret, intent)

        await emit("agent_activity", {
            "agent": "RiskAgent", "status": "complete",
            "message": f"DelegationToken issued | TTL: 60s | HMAC-SHA256 signed | id: {token['token_id'][:8]}..."
        })
        await asyncio.sleep(0.4)

        # ── Trader Agent ───────────────────────────────────────────
        await emit("agent_activity", {
            "agent": "TraderAgent", "status": "running",
            "message": "Attaching DelegationToken to OrderRequest..."
        })
        await asyncio.sleep(0.4)

        await emit("agent_activity", {
            "agent": "TraderAgent", "status": "running",
            "message": "Submitting to ArmorClaw via alpaca-trading:execute (gated)..."
        })
        await asyncio.sleep(0.3)

        # ── ArmorClaw ──────────────────────────────────────────────
        await emit("agent_activity", {
            "agent": "ArmorClaw", "status": "running",
            "message": "Running 5 enforcement checks + 14 policy rules..."
        })
        await asyncio.sleep(0.3)

        # Get portfolio value for concentration check
        try:
            portfolio_value = float(alpaca_client.get_account_equity())
        except Exception:
            portfolio_value = 100_000.0

        decision = armorclaw.run(
            run_id=run_id,
            action=action,
            ticker=ticker,
            amount_usd=amount_usd,
            delegation_token=token,
            portfolio_value=portfolio_value,
            submitting_agent="TraderAgent",
            tools_used=["alpaca-trading:execute"],
            intent_token_id_in_request=intent.get("intent_token_id"),
        )

        # If ALLOW, place order on Alpaca
        alpaca_order_id = None
        if decision["decision"] == "ALLOW":
            try:
                alpaca_order_id = alpaca_client.place_order(action, ticker, amount_usd)
                decision["alpaca_order_id"] = alpaca_order_id
            except Exception as e:
                decision["alpaca_order_id"] = f"sim-{run_id[:8]}"

        # Emit ArmorClaw decision
        await emit("armorclaw_decision", decision)

        # Emit done
        await emit("done", {
            "run_id": run_id,
            "final_status": decision["decision"],
        })

    except Exception as e:
        await emit("agent_activity", {
            "agent": "System", "status": "error",
            "message": f"Pipeline error: {str(e)}"
        })
        await emit("done", {"run_id": run_id, "final_status": "ERROR"})
    finally:
        # Signal stream is done
        queue.put_nowait(None)
