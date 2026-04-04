# OpenClaw SDK Bridge Setup Guide

## Overview

This guide walks through setting up the **official OpenClaw SDK** to properly handle CSRG handshake and connect to your local OpenClaw gateway.

## Problem Solved

**Before:** Raw WebSocket → Gateway rejects with `code=1008` (policy violation)
**After:** Official SDK → Automatic CSRG handshake → Gateway accepts

---

## Step 1: Install Node.js Dependencies

```bash
cd bridge/
npm install
```

This installs `@openclaw/client` which handles:
- CSRG handshake with Ed25519 device signing
- Nonce-challenge validation
- Protocol v3 negotiation

---

## Step 2: Verify OpenClaw Gateway is Running

```bash
# Check if gateway is listening on port 18789
netstat -ano | findstr :18789          # Windows
lsof -i :18789                         # macOS/Linux
```

Expected output: Gateway daemon listening on `127.0.0.1:18789`

---

## Step 3: Create ~/.openclaw/openclaw.json

Copy the template to your home directory:

**Windows:**
```powershell
$openclaw_config = @"
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-2.5-flash"
      }
    }
  },
  "plugins": {
    "enabled": true,
    "allow": ["armorclaw"],
    "entries": {
      "armorclaw": {
        "enabled": true,
        "config": {
          "policyStorePath": "$env:USERPROFILE\.openclaw\armoriq.policy.json"
        }
      }
    }
  },
  "gateway": {
    "mode": "local",
    "device": {
      "id": "auratrade-python-bridge"
    }
  }
}
"@

New-Item -Path "$env:USERPROFILE\.openclaw" -ItemType Directory -Force | Out-Null
$openclaw_config | Out-File -FilePath "$env:USERPROFILE\.openclaw\openclaw.json" -Encoding UTF8
```

**Linux/macOS:**
```bash
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-2.5-flash"
      }
    }
  },
  "plugins": {
    "enabled": true,
    "allow": ["armorclaw"],
    "entries": {
      "armorclaw": {
        "enabled": true,
        "config": {
          "policyStorePath": "~/.openclaw/armoriq.policy.json"
        }
      }
    }
  },
  "gateway": {
    "mode": "local",
    "device": {
      "id": "auratrade-python-bridge"
    }
  }
}
EOF
```

---

## Step 4: Test the Bridge

### Direct Node.js Test

```bash
cd bridge/
node openclaw_client_sdk.mjs '{"action":"BUY","ticker":"NVDA","amount_usd":1000,"run_id":"test-123"}'
```

**Expected output (JSON lines):**
```json
{"type":"agent_activity","agent":"OpenClaw","status":"connecting","message":"Connecting to OpenClaw gateway at ws://127.0.0.1:18789 using SDK..."}
{"type":"agent_activity","agent":"OpenClaw","status":"running","message":"CSRG handshake complete ✓ — connected to gateway"}
{"type":"agent_activity","agent":"OpenClaw","status":"running","message":"Sending trade to Analyst → Risk → Trader pipeline..."}
```

### Python Test

```python
import sys
sys.path.insert(0, '/path/to/armorclaw-finance-orchestrator')

from backend.openclaw_bridge import is_live_mode, run_live_pipeline
import asyncio

async def test():
    event_queue = {}
    await run_live_pipeline(
        run_id="test-123",
        action="BUY",
        ticker="NVDA",
        amount_usd=1000,
        event_queues=event_queue,
    )

if __name__ == "__main__":
    asyncio.run(test())
```

---

## Step 5: Integration with Your Agents

The bridge automatically:
1. ✓ Connects using CSRG handshake
2. ✓ Sends trade prompt to Analyst agent
3. ✓ Streams ArmorClaw decisions
4. ✓ Captures Alpaca trade results

**Example agent flow:**

```python
# agents/orchestrator.py
async def execute_trade(action, ticker, amount_usd):
    run_id = str(uuid.uuid4())
    
    if is_live_mode():
        # Sends to OpenClaw → ArmorClaw → Alpaca
        await run_live_pipeline(
            run_id=run_id,
            action=action,
            ticker=ticker,
            amount_usd=amount_usd,
            event_queues=event_queues,  # FastAPI SSE integration
        )
    else:
        # Demo mode (no real execution)
        await run_demo_pipeline(...)
```

---

## Troubleshooting

### Error: `@openclaw/client not installed`

**Fix:**
```bash
cd bridge/
npm install @openclaw/client
```

### Error: `code=1008 invalid request frame`

This means the SDK is installed but:
1. OpenClaw gateway is not running
2. Gateway port is wrong

**Check:**
```bash
# Windows
netstat -ano | findstr :18789

# macOS/Linux
lsof -i :18789
```

Start the gateway (if using Docker):
```bash
docker run -p 18789:18789 openclaw/gateway:latest
```

### Error: `CSRG handshake failed`

The device identity in `~/.openclaw/openclaw.json` is invalid.

**Fix:**
1. Ensure `gateway.device.id` is set
2. Check that file permissions allow read access
3. Restart the gateway

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Config error (missing @openclaw/client) |
| 2 | Connection error (gateway unreachable) |
| 3 | Gateway rejected (auth or CSRG failed) |
| 4 | Timeout (60s) |

---

## Environment Variables

```bash
# Override gateway URL (default: ws://127.0.0.1:18789)
export OPENCLAW_WS=ws://gateway.example.com:18789

# Run bridge
node openclaw_client_sdk.mjs '{"action":"BUY","ticker":"NVDA","amount_usd":1000,"run_id":"test"}'
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Python FastAPI (8000)                                       │
│  ├─ POST /trade                                             │
│  └─ run_live_pipeline(...) ←─ event_queues (SSE)           │
└────────────┬────────────────────────────────────────────────┘
             │ subprocess exec
             ↓
┌─────────────────────────────────────────────────────────────┐
│ Node.js Bridge (openclaw_client_sdk.mjs)                    │
│  ├─ import @openclaw/client                                 │
│  ├─ new Client(device, protocol)                            │
│  └─ client.connect() [CSRG handshake automatic]            │
└────────────┬────────────────────────────────────────────────┘
             │ WebSocket (CSRG)
             ↓
┌─────────────────────────────────────────────────────────────┐
│ OpenClaw Gateway (ws://127.0.0.1:18789)                     │
│  ├─ CSRG validator (Ed25519 device signing)                 │
│  ├─ Agent router (Analyst → Risk → Trader)                 │
│  └─ Plugin system (ArmorClaw enforcement)                   │
└────────────┬────────────────────────────────────────────────┘
             │ Event stream
             ↓
┌─────────────────────────────────────────────────────────────┐
│ ArmorClaw Plugin                                            │
│  ├─ Check 1: Insider trading rules                          │
│  ├─ Check 2: Position limits                                │
│  ├─ Check 3: Risk controls                                  │
│  ├─ Check 4: Regulatory compliance                          │
│  └─ Check 5: Audit trail                                    │
└────────────┬────────────────────────────────────────────────┘
             │ approved trades only
             ↓
┌─────────────────────────────────────────────────────────────┐
│ Alpaca Trading API (paper trading)                          │
│  └─ Execution (buy/sell orders)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. ✓ Install SDK: `npm install`
2. ✓ Create ~/.openclaw/openclaw.json
3. ✓ Start OpenClaw gateway
4. ✓ Test: `node bridge/openclaw_client_sdk.mjs ...`
5. ✓ Integrate: Update agents to call `run_live_pipeline()`
