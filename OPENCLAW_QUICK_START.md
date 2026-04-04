# OpenClaw Live Mode Quick Start

## TL;DR (5 Minutes)

```bash
# 1. Install SDK in bridge directory
cd bridge/
npm install @openclaw/client

# 2. Create config
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "gateway": {
    "device": {
      "id": "auratrade-python-bridge"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-2.5-flash"
      }
    }
  }
}
EOF

# 3. Start OpenClaw gateway (if not already running)
# Option A: Docker
docker run -p 18789:18789 openclaw/gateway:latest

# Option B: Binary
openclaw daemon start

# 4. Test the bridge
node test_openclaw_sdk.mjs

# 5. You're ready! Use in Python:
# await run_live_pipeline(run_id, action, ticker, amount_usd, event_queues)
```

---

## What Got Fixed

| Before | After |
|--------|-------|
| Raw WebSocket → Gateway rejects (code 1008) | SDK client → CSRG handshake automatic → Success |
| Python/Node can't do Ed25519 signing | SDK handles signing internally |
| "invalid request frame" error | Proper CSRG-compliant protocol |
| Manual protocol implementation | Official SDK handles everything |

---

## Working Example

### Python Call

```python
# backend/main.py
from backend.openclaw_bridge import run_live_pipeline

@app.post("/api/trades")
async def execute_trade(request: TradeRequest):
    run_id = str(uuid.uuid4())
    
    await run_live_pipeline(
        run_id=run_id,
        action=request.action,            # "BUY" or "SELL"
        ticker=request.ticker,            # "NVDA", "BTC/USD", etc.
        amount_usd=request.amount_usd,    # 1000, 5000, etc.
        event_queues=event_queues,        # SSE streaming to frontend
    )
```

### What Happens Behind The Scenes

1. **Python subprocess** → spawns Node.js bridge
2. **Node.js bridge** → imports `@openclaw/client` SDK
3. **SDK client** → performs CSRG handshake (automatic):
   - Loads device identity from `~/.openclaw/openclaw.json`
   - Receives nonce challenge from gateway
   - Signs with Ed25519
   - Completes authentication
4. **After handshake** → sends trade to agents:
   - Analyst agent reasons about trade
   - Risk agent checks bounds
   - Trader agent submits to Alpaca
   - ArmorClaw enforces policies
5. **Event stream** → Python reads JSON lines from stdout:
   - Agent messages
   - Tool calls
   - ArmorClaw decisions
   - Execution results
6. **SSE** → Frontend subscribes to `/api/events/{run_id}`:
   - Real-time trade execution visualization
   - Policy enforcement feedback

---

## File Changes

### New Files

```
bridge/
  ├─ package.json                    NEW (Node.js dependencies)
  ├─ openclaw_client_sdk.mjs         NEW (SDK-based bridge, replaces openclaw_client.mjs)
  └─ test_openclaw_sdk.mjs           NEW (verification/testing)

OPENCLAW_SDK_SETUP.md                NEW (installation guide)
OPENCLAW_CSRG_EXPLAINED.md           NEW (technical details)
OPENCLAW_QUICK_START.md              NEW (this file)
```

### Updated Files

```
backend/openclaw_bridge.py           MODIFIED (uses openclaw_client_sdk.mjs)
```

---

## Installation Checklist

- [ ] Node.js >=18 installed (`node --version`)
- [ ] Docker or OpenClaw gateway running on port 18789
- [ ] `cd bridge/ && npm install @openclaw/client` succeeds
- [ ] `mkdir -p ~/.openclaw`
- [ ] `~/.openclaw/openclaw.json` created with device ID
- [ ] `node test_openclaw_sdk.mjs` shows ✓ all tests pass
- [ ] Manual test returns events with "CSRG handshake complete"

---

## Test Commands

### Quick Health Check
```bash
node bridge/test_openclaw_sdk.mjs
# Shows: ✓ Node.js version, Config, SDK, Gateway, Bridge
```

### Test Trade
```bash
node bridge/openclaw_client_sdk.mjs '{
  "action": "BUY",
  "ticker": "NVDA",
  "amount_usd": 1000,
  "run_id": "test-001"
}'
```

### Expected Output (JSON lines)
```json
{"type":"agent_activity","agent":"OpenClaw","status":"connecting","message":"Connecting to OpenClaw gateway..."}
{"type":"agent_activity","agent":"OpenClaw","status":"running","message":"CSRG handshake complete ✓ — connected to gateway"}
{"type":"agent_activity","agent":"OpenClaw","status":"running","message":"Sending trade to Analyst → Risk → Trader pipeline..."}
{"type":"agent_activity","agent":"Analyst","status":"running","message":"Analyzing trade: BUY 1000 NVDA..."}
{"type":"agent_activity","agent":"Risk","status":"running","message":"Risk assessment: within bounds..."}
{"type":"armorclaw_decision","decision":"APPROVE","rule_id":"position_limit","check_number":1}
{"type":"agent_activity","agent":"TraderAgent","status":"complete","message":"Alpaca: {...order details...}"}
{"type":"done","run_id":"test-001","final_status":"COMPLETE","source":"openclaw_sdk"}
```

---

## Environment Variables

```bash
# Override gateway URL (default: ws://127.0.0.1:18789)
export OPENCLAW_WS=ws://gateway.example.com:18789

# Override mode (live or demo)
export OPENCLAW_MODE=live

# Run trade
node bridge/openclaw_client_sdk.mjs '{"action":"BUY",...}'
```

---

## Troubleshooting Matrix

| Symptom | Cause | Fix |
|---------|-------|-----|
| `@openclaw/client not installed` | SDK not installed | `npm install @openclaw/client` |
| `code 1008 invalid request frame` | Gateway unreachable OR SDK not used | Check gateway running, use SDK client |
| `CSRG handshake failed` | Device ID invalid | Update `~/.openclaw/openclaw.json` |
| `timeout` | Agents took >60s | Increase timeout in openclaw_client_sdk.mjs |
| `module not found: fs/promises` | Old Node.js | Upgrade to Node >=18 |

---

## Integration Points

### 1. FastAPI Endpoint (Python)

```python
@app.post("/api/trades")
async def execute_trade(req: TradeRequest, background: BackgroundTasks):
    run_id = str(uuid.uuid4())
    event_queues[run_id] = asyncio.Queue()
    
    # Start live execution in background
    background.add_task(run_live_pipeline, 
        run_id, req.action, req.ticker, req.amount, event_queues)
    
    return {"run_id": run_id, "status": "executing"}
```

### 2. SSE Events (Python)

```python
@app.get("/api/events/{run_id}")
async def stream_events(run_id: str):
    queue = event_queues.get(run_id)
    if not queue:
        raise HTTPException(404)
    
    async def generator():
        while True:
            msg = await queue.get()
            if msg is None:  # Done
                break
            yield f"data: {json.dumps(msg)}\n\n"
    
    return StreamingResponse(generator(), media_type="text/event-stream")
```

### 3. Frontend (React)

```javascript
const eventSource = new EventSource(`/api/events/${runId}`);
eventSource.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'agent_activity') {
    // Update agent message feed
    addMessage(msg.agent, msg.message);
  }
  
  if (msg.type === 'armorclaw_decision') {
    // Show policy decision
    showDecision(msg.decision, msg.reason);
  }
  
  if (msg.type === 'done') {
    // Trade complete
    eventSource.close();
    showResult(msg.final_status);
  }
};
```

---

## Performance Notes

- **Handshake time**: 50-200ms (CSRG validation)
- **Agent execution**: 2-10s (depends on LLM)
- **Alpaca submission**: 100-500ms
- **Total**: 5-15s per trade
- **Timeout**: 60s (hardcoded, can adjust)

---

## Security Model

- ✓ Device identity (Ed25519 signed)
- ✓ Gateway authentication (CSRG validated)
- ✓ Policy enforcement (ArmorClaw plugin)
- ✓ Audit logging (all requests logged)
- ✓ Paper trading (no real money)

---

## Next: Using Live Mode in Agents

Update your agent orchestrator to use live mode:

```python
# backend/agents/orchestrator.py

from .openclaw_bridge import is_live_mode, run_live_pipeline

async def execute_trade(action, ticker, amount_usd, event_queues):
    run_id = str(uuid.uuid4())
    
    if is_live_mode():
        # Uses OpenClaw → ArmorClaw → Alpaca
        await run_live_pipeline(
            run_id=run_id,
            action=action,
            ticker=ticker,
            amount_usd=amount_usd,
            event_queues=event_queues,
        )
    else:
        # Demo mode (no real execution)
        await run_demo_pipeline(...)
```

Then set environment variable:

```bash
export OPENCLAW_MODE=live
python -m backend.main
```

---

## Still Having Issues?

1. **Read**: `OPENCLAW_CSRG_EXPLAINED.md` (technical deep dive)
2. **Check**: Run `node test_openclaw_sdk.mjs` (diagnostics)
3. **Test**: Run manual trade test command above
4. **Logs**: Look at gateway stderr for CSRG validation errors
5. **Restart**: Try gateway restart: `openclaw daemon restart`

---

See `OPENCLAW_SDK_SETUP.md` for detailed setup instructions.
