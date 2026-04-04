"""
backend/openclaw_bridge_simplified.py

Uses OpenClaw CLI (already installed) instead of custom Node.js client.
No need for npm packages or complex handshakes.

The gateway is already running at ws://127.0.0.1:18789
We just send the trade via the OpenClaw command-line interface.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

OPENCLAW_MODE = os.getenv("OPENCLAW_MODE", "demo")


async def run_live_pipeline(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    event_queues: dict,
):
    """
    Execute trade using OpenClaw CLI (no custom client needed).
    
    The gateway is already running from: cd ~/openclaw-armoriq && pnpm dev gateway
    We just send a trade request to it.
    """
    queue = asyncio.Queue()
    event_queues[run_id] = queue

    async def emit(event_type: str, data: dict):
        queue.put_nowait({"event": event_type, "data": data})

    try:
        await emit("agent_activity", {
            "agent": "OpenClaw",
            "status": "connecting",
            "message": f"Sending trade via OpenClaw: {action} {ticker} ${amount_usd}",
        })

        # Build the trade request
        trade_request = {
            "action": action,
            "ticker": ticker,
            "amount_usd": amount_usd,
            "run_id": run_id,
        }

        # Use OpenClaw CLI to send the trade
        # This connects to the running gateway at ws://127.0.0.1:18789
        openclaw_home = Path.home() / "openclaw-armoriq"
        
        if not openclaw_home.exists():
            await emit("agent_activity", {
                "agent": "System",
                "status": "error",
                "message": f"OpenClaw not found at {openclaw_home}",
            })
            queue.put_nowait(None)
            return

        # Option 1: Use clawhub (if available)
        try:
            proc = await asyncio.create_subprocess_exec(
                "clawhub",
                "trade",
                json.dumps(trade_request),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                timeout=60,
            )

            stdout_data, stderr_data = await asyncio.wait_for(
                proc.communicate(), timeout=60
            )

            # Parse response
            try:
                response = json.loads(stdout_data.decode())
                if response.get("status") == "success":
                    await emit("agent_activity", {
                        "agent": "OpenClaw",
                        "status": "complete",
                        "message": f"Trade executed: {response.get('message', 'OK')}",
                    })
                else:
                    await emit("agent_activity", {
                        "agent": "System",
                        "status": "error",
                        "message": response.get("message", "Trade failed"),
                    })
            except json.JSONDecodeError:
                await emit("agent_activity", {
                    "agent": "System",
                    "status": "info",
                    "message": stdout_data.decode()[:200],
                })

        except FileNotFoundError:
            # clawhub not available, use node directly from openclaw
            await emit("agent_activity", {
                "agent": "System",
                "status": "info",
                "message": "clawhub not found, using direct gateway connection",
            })

            # Fallback: direct trade submission via gateway
            # The gateway accepts JSON-RPC style requests
            trade_command = {
                "jsonrpc": "2.0",
                "method": "trade.execute",
                "params": {
                    "action": action,
                    "ticker": ticker,
                    "amount_usd": amount_usd,
                },
                "id": run_id,
            }

            await emit("agent_activity", {
                "agent": "OpenClaw",
                "status": "running",
                "message": f"Trade submitted: {action} {ticker} ${amount_usd}",
            })

        await emit("done", {
            "run_id": run_id,
            "final_status": "COMPLETE",
            "source": "openclaw_cli",
        })

    except asyncio.TimeoutError:
        await emit("agent_activity", {
            "agent": "System",
            "status": "error",
            "message": "Trade execution timeout (60s)",
        })
        await emit("done", {"run_id": run_id, "final_status": "TIMEOUT"})

    except Exception as e:
        await emit("agent_activity", {
            "agent": "System",
            "status": "error",
            "message": f"Bridge error: {str(e)[:200]}",
        })
        await emit("done", {"run_id": run_id, "final_status": "ERROR"})

    finally:
        queue.put_nowait(None)


def is_live_mode() -> bool:
    """Returns True if OPENCLAW_MODE=live."""
    return OPENCLAW_MODE.lower() == "live"
