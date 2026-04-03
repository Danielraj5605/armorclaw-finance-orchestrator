"""
backend/openclaw_bridge.py

Connects our FastAPI server to the real OpenClaw daemon WebSocket.
When OPENCLAW_MODE=live, this module is used instead of the simulated orchestrator.
When OPENCLAW_MODE=demo (default), the orchestrator.py simulation is used.

OpenClaw daemon runs on ws://127.0.0.1:18789
ArmorClaw plugin intercepts tool calls inside the daemon before any execution.
"""

import asyncio
import json
import os
import uuid
from typing import AsyncGenerator

OPENCLAW_WS = os.getenv("OPENCLAW_WS", "ws://127.0.0.1:18789")
OPENCLAW_MODE = os.getenv("OPENCLAW_MODE", "demo")


async def run_live_pipeline(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    event_queues: dict,
):
    """
    Sends a trade command to the running OpenClaw daemon.
    OpenClaw routes it through: Analyst → Risk → Trader.
    ArmorClaw plugin intercepts the Trader's tool call and enforces policy.
    Events are streamed back to the SSE queue.

    Requires: `pip install websockets`
    Requires: OpenClaw daemon running at ws://127.0.0.1:18789
    Requires: ArmorClaw plugin installed and active
    Requires: Alpaca Trading Skill installed via clawhub
    """
    try:
        import websockets
    except ImportError:
        raise RuntimeError(
            "websockets package required for live OpenClaw bridge. "
            "Run: pip install websockets"
        )

    queue = asyncio.Queue()
    event_queues[run_id] = queue

    async def emit(event_type: str, data: dict):
        queue.put_nowait({"event": event_type, "data": data})

    try:
        # Craft a natural language trading command for OpenClaw
        prompt = (
            f"You are an autonomous trading agent system called AuraTrade. "
            f"Please execute the following trading task using the multi-agent pipeline:\n\n"
            f"Task: Analyze {ticker} market conditions and portfolio risk, then "
            f"if appropriate, {action.lower()} ${amount_usd:,.0f} worth of {ticker} "
            f"using the Alpaca paper trading account.\n\n"
            f"Requirements:\n"
            f"- The Analyst agent must call market-data and research tools first\n"
            f"- The Risk Agent must verify portfolio exposure and issue a delegation token\n"
            f"- The Trader Agent must attach the delegation token before calling alpaca:execute\n"
            f"- ArmorClaw will enforce all policy rules automatically\n\n"
            f"Run ID for audit correlation: {run_id}"
        )

        await emit("agent_activity", {
            "agent": "OpenClaw",
            "status": "connecting",
            "message": f"Connecting to OpenClaw daemon at {OPENCLAW_WS}..."
        })

        async with websockets.connect(OPENCLAW_WS) as ws:
            await emit("agent_activity", {
                "agent": "OpenClaw",
                "status": "running",
                "message": "Connected. Sending trade command to agent pipeline..."
            })

            # Send the command to OpenClaw
            await ws.send(json.dumps({
                "type": "agent.send",
                "session": "main",
                "message": prompt,
                "metadata": {
                    "run_id": run_id,
                    "action": action,
                    "ticker": ticker,
                    "amount_usd": amount_usd,
                }
            }))

            # Stream events back from OpenClaw daemon
            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                # Map OpenClaw message types to our SSE event format
                if msg_type == "session.message":
                    content = msg.get("content", "")
                    agent_name = msg.get("agentId", "OpenClaw")
                    await emit("agent_activity", {
                        "agent": agent_name,
                        "status": "running",
                        "message": content[:200] if isinstance(content, str) else str(content)[:200]
                    })

                elif msg_type == "tool.call":
                    tool_name = msg.get("tool", "unknown")
                    agent_name = msg.get("agentId", "Agent")
                    await emit("agent_activity", {
                        "agent": agent_name,
                        "status": "running",
                        "message": f"Calling tool: {tool_name}..."
                    })

                elif msg_type == "armorclaw.decision":
                    # ArmorClaw decision event — forward directly to decision SSE event
                    decision_data = msg.get("decision", {})
                    await emit("armorclaw_decision", {
                        "decision": decision_data.get("verdict", "BLOCK"),
                        "rule_id": decision_data.get("rule_id"),
                        "block_reason": decision_data.get("reason"),
                        "check_number": decision_data.get("check"),
                        "ticker": ticker,
                        "action": action,
                        "amount_usd": amount_usd,
                        "run_id": run_id,
                        "timestamp": decision_data.get("timestamp"),
                    })

                elif msg_type == "tool.result":
                    # Alpaca order confirmation on ALLOW
                    tool = msg.get("tool", "")
                    result = msg.get("result", {})
                    if "alpaca" in tool.lower():
                        await emit("agent_activity", {
                            "agent": "TraderAgent",
                            "status": "complete",
                            "message": f"Alpaca result: {str(result)[:150]}"
                        })

                elif msg_type in ("session.complete", "agent.complete"):
                    await emit("done", {
                        "run_id": run_id,
                        "final_status": "COMPLETE",
                        "source": "openclaw_live"
                    })
                    break

                elif msg_type == "session.error":
                    error_msg = msg.get("error", "Unknown error")
                    await emit("agent_activity", {
                        "agent": "System",
                        "status": "error",
                        "message": f"OpenClaw error: {error_msg}"
                    })
                    await emit("done", {"run_id": run_id, "final_status": "ERROR"})
                    break

    except ConnectionRefusedError:
        await emit("agent_activity", {
            "agent": "System",
            "status": "error",
            "message": (
                "Cannot connect to OpenClaw daemon. "
                "Is OpenClaw running? Try: openclaw onboard --install-daemon"
            )
        })
        await emit("done", {"run_id": run_id, "final_status": "ERROR"})
    except Exception as e:
        await emit("agent_activity", {
            "agent": "System",
            "status": "error",
            "message": f"OpenClaw bridge error: {str(e)}"
        })
        await emit("done", {"run_id": run_id, "final_status": "ERROR"})
    finally:
        queue.put_nowait(None)


def is_live_mode() -> bool:
    """Returns True if OPENCLAW_MODE=live and we should use the real daemon."""
    return OPENCLAW_MODE.lower() == "live"
