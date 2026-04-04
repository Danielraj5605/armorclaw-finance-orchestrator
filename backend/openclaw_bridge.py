"""
backend/openclaw_bridge.py

Routes trades based on OPENCLAW_MODE:

- OPENCLAW_MODE=demo  → Local orchestrator (simulated agents + ArmorClaw)
- OPENCLAW_MODE=live  → OpenClaw CLI (real agents + real gateway)

The live path uses:
  node ~/openclaw-armoriq/openclaw.mjs agent --agent trader --message "..." --json

This connects to the real OpenClaw gateway at ws://127.0.0.1:18789
"""
import asyncio
import json
import os
import subprocess
from pathlib import Path
from datetime import datetime
from backend.agents.orchestrator import run_pipeline
from backend.alpaca.client import AlpacaClient
from backend.armorclaw.engine import ArmorClawEngine

OPENCLAW_HOME = Path.home() / "openclaw-armoriq"

# Cache for singletons
_alpaca_client = None
_armorclaw_engine = None
_daily_tracker = None
_intent = None


def _get_openclaw_mode():
    """Get OPENCLAW_MODE from environment (checked at runtime)."""
    return os.getenv("OPENCLAW_MODE", "demo").lower()



def _get_intent():
    """Load intent from file."""
    global _intent
    if _intent is None:
        intent_path = os.getenv("INTENT_FILE_PATH", "./intent.json")
        try:
            with open(intent_path) as f:
                _intent = json.load(f)
        except FileNotFoundError:
            # Fallback demo intent
            _intent = {
                "intent_token_id": "demo-intent-001",
                "user_id": "demo-user",
                "max_order_usd": 5000,
                "daily_limit_usd": 50000,
                "ticker_universe": ["AAPL", "GOOGL", "NVDA", "MSFT", "AMZN", "BTC/USD", "ETH/USD"],
            }
    return _intent


def _get_armorclaw():
    """Get or create ArmorClaw engine singleton."""
    global _armorclaw_engine, _daily_tracker
    if _armorclaw_engine is None:
        if _daily_tracker is None:
            _daily_tracker = {}
        _armorclaw_engine = ArmorClawEngine(
            intent=_get_intent(),
            secret_key=os.getenv("ARMORCLAW_SECRET_KEY", "demo-secret-key-32-chars-minimum!"),
            daily_tracker=_daily_tracker,
        )
    return _armorclaw_engine


def _get_alpaca():
    """Get or create Alpaca client singleton."""
    global _alpaca_client
    if _alpaca_client is None:
        _alpaca_client = AlpacaClient()
    return _alpaca_client


async def _run_live_openclaw(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    event_queues: dict,
):
    """
    Send trade to real OpenClaw gateway via CLI.
    
    Uses: node ~/openclaw-armoriq/openclaw.mjs agent --agent trader --message "..." --json
    
    The gateway handles the real Analyst → Risk → Trader pipeline with live agents.
    """
    queue = asyncio.Queue()
    event_queues[run_id] = queue

    async def emit(event_type: str, data: dict):
        queue.put_nowait({"event": event_type, "data": data})

    try:
        # Check OpenClaw is installed
        openclaw_mjs = OPENCLAW_HOME / "openclaw.mjs"
        if not openclaw_mjs.exists():
            await emit("agent_activity", {
                "agent": "System",
                "status": "error",
                "message": f"OpenClaw not found at {openclaw_mjs}. Install: cd ~/openclaw-armoriq && pnpm install",
            })
            queue.put_nowait(None)
            return

        await emit("agent_activity", {
            "agent": "OpenClaw",
            "status": "connecting",
            "message": f"Connecting to live OpenClaw gateway (ws://127.0.0.1:18789)...",
        })

        # Build trade prompt for the trader agent
        trade_prompt = (
            f"AuraTrade autonomous trading task:\n"
            f"{action} ${amount_usd:,.0f} worth of {ticker}.\n"
            f"Run the Analyst → Risk → Trader pipeline with ArmorClaw enforcement.\n"
            f"Run ID: {run_id}"
        )

        # Call OpenClaw CLI: node openclaw.mjs agent --agent main --message "..." --json
        # The "main" agent is the default configured agent that handles trades
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(openclaw_mjs),
            "agent",
            "--agent", "main",
            "--message", trade_prompt,
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(OPENCLAW_HOME),
        )

        # Capture stdout and stderr
        stdout_data, stderr_data = await asyncio.wait_for(
            proc.communicate(),
            timeout=120,  # 2 minute timeout for agent execution
        )

        stdout_text = stdout_data.decode("utf-8", errors="replace").strip()
        stderr_text = stderr_data.decode("utf-8", errors="replace").strip()

        # Parse OpenClaw response (should be JSON)
        if proc.returncode == 0 and stdout_text:
            # Try to parse ndjson (newline-delimited JSON)
            lines = stdout_text.split("\n")
            for line in lines:
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                    
                    # Map OpenClaw event types to our event format
                    if event.get("type") == "agent_activity":
                        await emit("agent_activity", {
                            "agent": event.get("agent", "Agent"),
                            "status": event.get("status", "running"),
                            "message": event.get("message", ""),
                        })
                    elif event.get("type") == "armorclaw_decision":
                        await emit("armorclaw_decision", {
                            "decision": event.get("decision"),
                            "rule_id": event.get("rule_id"),
                            "reason": event.get("reason"),
                            "ticker": ticker,
                            "action": action,
                            "amount_usd": amount_usd,
                        })
                    elif event.get("type") in ("done", "complete", "final"):
                        await emit("done", {
                            "run_id": run_id,
                            "final_status": event.get("status", "COMPLETE"),
                            "source": "openclaw_live",
                        })
                except json.JSONDecodeError:
                    # Not JSON, log as message
                    if line and not line.startswith("🦞"):
                        await emit("agent_activity", {
                            "agent": "OpenClaw",
                            "status": "running",
                            "message": line[:300],
                        })

            # If no done event received, emit one
            if not any("done" in line or "complete" in line or "final" in line 
                      for line in lines):
                await emit("done", {
                    "run_id": run_id,
                    "final_status": "COMPLETE",
                    "source": "openclaw_live",
                })
        else:
            # Error - fallback to demo mode
            await emit("agent_activity", {
                "agent": "System",
                "status": "warning",
                "message": f"OpenClaw gateway unavailable. Falling back to demo mode...",
            })
            queue.put_nowait(None)
            
            # Fallback: run demo orchestrator
            await _run_demo_orchestrator(
                run_id, action, ticker, amount_usd, event_queues,
            )
            return

    except asyncio.TimeoutError:
        await emit("agent_activity", {
            "agent": "System",
            "status": "warning",
            "message": "Trade execution timeout. Falling back to demo mode...",
        })
        queue.put_nowait(None)
        
        # Fallback: run demo orchestrator
        await _run_demo_orchestrator(
            run_id, action, ticker, amount_usd, event_queues,
        )

    except Exception as e:
        await emit("agent_activity", {
            "agent": "System",
            "status": "warning",
            "message": f"OpenClaw unavailable. Falling back to demo mode...",
        })
        queue.put_nowait(None)
        
        # Fallback: run demo orchestrator
        await _run_demo_orchestrator(
            run_id, action, ticker, amount_usd, event_queues,
        )

    finally:
        queue.put_nowait(None)


async def _run_demo_orchestrator(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    event_queues: dict,
    intent: dict = None,
    armorclaw: ArmorClawEngine = None,
    alpaca_client: AlpacaClient = None,
):
    """
    Run the local demo orchestrator (simulated agents + ArmorClaw).
    Used when OPENCLAW_MODE != live.
    """
    # Use provided or default instances
    if intent is None:
        intent = _get_intent()
    if armorclaw is None:
        armorclaw = _get_armorclaw()
    if alpaca_client is None:
        alpaca_client = _get_alpaca()
    
    # Call the orchestrator's pipeline
    await run_pipeline(
        run_id=run_id,
        action=action,
        ticker=ticker,
        amount_usd=amount_usd,
        intent=intent,
        armorclaw=armorclaw,
        alpaca_client=alpaca_client,
        event_queues=event_queues,
    )


async def run_live_pipeline(
    run_id: str,
    action: str,
    ticker: str,
    amount_usd: float,
    event_queues: dict,
    intent: dict = None,
    armorclaw: ArmorClawEngine = None,
    alpaca_client: AlpacaClient = None,
):
    """
    Execute a trade through OpenClaw (live or demo mode).
    
    Routes based on OPENCLAW_MODE environment variable:
    
    - "demo"  → Local orchestrator (simulated agents + ArmorClaw)
    - "live"  → OpenClaw CLI → Real gateway at ws://127.0.0.1:18789
    
    The pipeline:
    1. AnalystAgent: Market analysis
    2. RiskAgent: Portfolio checks + delegation token
    3. TraderAgent: Order routing
    4. ArmorClaw: Policy enforcement
    5. Alpaca: Trade execution
    
    Parameters:
    - run_id: Unique run identifier
    - action: 'BUY' or 'SELL'
    - ticker: Stock ticker (e.g., 'AAPL') or crypto (e.g., 'BTC/USD')
    - amount_usd: Trade amount in USD
    - event_queues: Dict to store asyncio.Queue for this run
    - intent: Optional intent dict
    - armorclaw: Optional ArmorClawEngine
    - alpaca_client: Optional AlpacaClient
    """
    if _get_openclaw_mode() == "live":
        # Real gateway
        await _run_live_openclaw(run_id, action, ticker, amount_usd, event_queues)
    else:
        # Demo orchestrator
        await _run_demo_orchestrator(
            run_id, action, ticker, amount_usd, event_queues,
            intent=intent,
            armorclaw=armorclaw,
            alpaca_client=alpaca_client,
        )


def is_live_mode() -> bool:
    """Returns True if OPENCLAW_MODE=live."""
    return _get_openclaw_mode() == "live"






