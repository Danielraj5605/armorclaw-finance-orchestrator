"""
backend/main.py
FastAPI application entry point.

Modes:
  OPENCLAW_MODE=demo  (default) — simulated pipeline, no real OpenClaw daemon required
  OPENCLAW_MODE=live            — connects to real OpenClaw daemon at ws://127.0.0.1:18789
                                  Requires: openclaw onboard + @armoriq/armorclaw installed
"""
import json
import os
import uuid
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# ── Load environment ────────────────────────────────────────────
load_dotenv()

OPENCLAW_MODE = os.getenv("OPENCLAW_MODE", "demo").lower()

# ── Local imports ───────────────────────────────────────────────
from backend.db.database import init_db, get_db, AuditLog
from backend.armorclaw.engine import ArmorClawEngine
from backend.alpaca.client import AlpacaClient
from backend.agents.orchestrator import run_pipeline
from backend.agents.real_openclaw_orchestrator import run_real_openclaw_pipeline
from backend.openclaw_bridge import run_live_pipeline

# ── Load intent.json ────────────────────────────────────────────
INTENT_PATH = os.getenv("INTENT_FILE_PATH", "./intent.json")
with open(INTENT_PATH) as f:
    INTENT = json.load(f)
print(f"✅ intent.json loaded — intent_token_id: {INTENT.get('intent_token_id')}")

# ── Singletons ──────────────────────────────────────────────────
DAILY_TRACKER  = {}
ARMORCLAW      = ArmorClawEngine(
    intent=INTENT,
    secret_key=os.getenv("ARMORCLAW_SECRET_KEY", "demo-secret-key-32-chars-minimum!"),
    daily_tracker=DAILY_TRACKER,
)
ALPACA         = AlpacaClient()
EVENT_QUEUES: dict[str, asyncio.Queue] = {}   # run_id → asyncio.Queue


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("✅ SQLite audit log ready")
    print("✅ ArmorClaw engine initialized — 14 policy rules active")
    if OPENCLAW_MODE == "live":
        print(f"🦞 OpenClaw mode: LIVE — connecting to ws://127.0.0.1:18789")
        print("   Make sure: openclaw doctor shows armorclaw plugin enabled")
    else:
        print("🦞 OpenClaw mode: DEMO — using simulated pipeline (no daemon required)")
        print("   Set OPENCLAW_MODE=live to use the real OpenClaw daemon")
    yield


app = FastAPI(
    title="AuraTrade API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Root endpoint ─────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "message": "AuraTrade API - Multi-Agent AI Trading Safety System",
        "version": "2.0.0",
        "endpoints": {
            "health": "/health",
            "run_trade": "/run-trade",
            "stream": "/run-trade/stream/{run_id}",
            "logs": "/get-logs",
            "positions": "/get-positions"
        },
        "dashboard": "http://localhost:5173",
        "openclaw_mode": OPENCLAW_MODE,
    }

# ── Favicon ───────────────────────────────────────────────────
@app.get("/favicon.ico")
def favicon():
    return {"message": "No favicon"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ──────────────────────────────────
class TradeRequest(BaseModel):
    action:     str
    ticker:     str
    amount_usd: float


# ── POST /run-trade ─────────────────────────────────────────────
@app.post("/run-trade")
async def run_trade(req: TradeRequest):
    """
    Validates the request, spins up the agent pipeline in the background,
    and immediately returns run_id so the client can open SSE stream.
    """
    # Basic pre-validation before even starting the pipeline
    if req.action not in ("BUY", "SELL"):
        raise HTTPException(422, detail="action must be BUY or SELL")
    if req.amount_usd <= 0:
        raise HTTPException(422, detail="amount_usd must be positive")

    run_id = str(uuid.uuid4())

    if OPENCLAW_MODE == "live":
        # LIVE MODE: route command to real OpenClaw daemon
        # ArmorClaw plugin handles enforcement inside the daemon
        asyncio.create_task(
            run_real_openclaw_pipeline(
                run_id=run_id,
                action=req.action,
                ticker=req.ticker,
                amount_usd=req.amount_usd,
                intent=INTENT,
                armorclaw=ARMORCLAW,
                alpaca_client=ALPACA,
                event_queues=EVENT_QUEUES,
            )
        )
        pipeline_mode = "openclaw-live"
    else:
        # DEMO MODE: simulated pipeline with our own Python ArmorClaw enforcement
        asyncio.create_task(
            run_pipeline(
                run_id=run_id,
                action=req.action,
                ticker=req.ticker,
                amount_usd=req.amount_usd,
                intent=INTENT,
                armorclaw=ARMORCLAW,
                alpaca_client=ALPACA,
                event_queues=EVENT_QUEUES,
            )
        )
        pipeline_mode = "demo-simulation"

    return {
        "run_id":       run_id,
        "status":       "pipeline_started",
        "pipeline_mode": pipeline_mode,
        "message":      "Agent pipeline initiated. Connect to SSE stream for live updates.",
        "sse_url":      f"/run-trade/stream/{run_id}",
    }


# ── GET /run-trade/stream/{run_id} (SSE) ───────────────────────
@app.get("/run-trade/stream/{run_id}")
async def stream_run(run_id: str):
    """
    Server-Sent Events stream that emits agent_activity, armorclaw_decision,
    and done events for the given run.
    """
    # Wait up to 3 seconds for the queue to appear
    for _ in range(30):
        if run_id in EVENT_QUEUES:
            break
        await asyncio.sleep(0.1)

    if run_id not in EVENT_QUEUES:
        raise HTTPException(404, detail=f"No pipeline found for run_id={run_id}")

    queue = EVENT_QUEUES[run_id]

    async def event_generator():
        try:
            while True:
                item = await asyncio.wait_for(queue.get(), timeout=30.0)
                if item is None:
                    yield "event: done\ndata: {}\n\n"
                    break
                event_type = item.get("event", "message")
                data       = json.dumps(item.get("data", {}))
                yield f"event: {event_type}\ndata: {data}\n\n"
        except asyncio.TimeoutError:
            yield "event: done\ndata: {\"reason\": \"timeout\"}\n\n"
        finally:
            EVENT_QUEUES.pop(run_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── GET /get-logs ───────────────────────────────────────────────
@app.get("/get-logs")
def get_logs(
    limit:    int    = Query(default=50, ge=1, le=500),
    offset:   int    = Query(default=0,  ge=0),
    decision: str    = Query(default=None),
    db:       Session = Depends(get_db),
):
    query = db.query(AuditLog).order_by(AuditLog.id.desc())
    if decision and decision in ("ALLOW", "BLOCK"):
        query = query.filter(AuditLog.decision == decision)
    total   = query.count()
    entries = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "entries": [
            {
                "id":            e.id,
                "timestamp":     e.timestamp.isoformat() if e.timestamp else None,
                "run_id":        e.run_id,
                "agent":         e.agent,
                "tool":          e.tool,
                "action":        e.action,
                "ticker":        e.ticker,
                "amount_usd":    e.amount_usd,
                "decision":      e.decision,
                "rule_id":       e.rule_id,
                "block_reason":  e.block_reason,
                "check_number":  e.check_number,
                "alpaca_order_id": e.alpaca_order_id,
                "proof_hash":    e.proof_hash,
            }
            for e in entries
        ],
    }


# ── GET /get-positions ──────────────────────────────────────────
@app.get("/get-positions")
def get_positions():
    try:
        positions = ALPACA.get_positions()
        account   = ALPACA.get_account()
        equity    = account.get("equity", "100000")
    except Exception:
        positions = []
        equity    = "100000"

    return {
        "positions":     positions,
        "total_equity":  equity,
        "cached_at":     None,
    }


# ── Health check ─────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status":         "ok",
        "service":        "AuraTrade API",
        "version":        "2.0.0",
        "openclaw_mode":  OPENCLAW_MODE,
        "openclaw_ws":    os.getenv("OPENCLAW_WS", "ws://127.0.0.1:18789") if OPENCLAW_MODE == "live" else "n/a",
        "intent_loaded":  bool(INTENT),
        "armorclaw":      "active",
    }
