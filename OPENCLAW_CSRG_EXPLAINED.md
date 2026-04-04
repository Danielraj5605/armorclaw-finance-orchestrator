# OpenClaw SDK Integration: Problem & Solution

## The Problem (Why You Got code=1008)

### Error Pattern

```
WebSocket connection succeeds
↓
Gateway immediately closes with:
  code = 1008 (policy violation)
  reason = "invalid request frame"

[ws] invalid handshake
ua=Python/3.13 websockets/15.0.1
code=1008 reason=invalid request frame
```

### Root Cause

The OpenClaw gateway implements **CSRG (Client-Side Request Guard)**, a proprietary handshake protocol that:

1. **Validates device identity** using Ed25519 cryptographic signing
2. **Challenges the client** with a nonce that must be signed
3. **Verifies protocol compliance** before accepting any frames
4. **Rejects raw WebSocket clients** immediately (code 1008)

**Both Python's `websockets` library and Node.js's built-in `WebSocket` API cannot handle CSRG because:**
- They don't implement Ed25519 signing
- They don't know the CSRG protocol structure
- They send standard HTTP upgrade headers that fail validation

### Why Raw WebSocket Didn't Work

```javascript
// ❌ What you tried (raw WebSocket):
const ws = new WebSocket('ws://127.0.0.1:18789');
ws.onopen = () => {
  // Gateway receives standard WebSocket upgrade
  // But expects: CSRG handshake with Ed25519 signature
  // Result: code 1008 - policy violation (handshake invalid)
  ws.send(...);
};
```

---

## The Solution (How We Fixed It)

### Use Official OpenClaw SDK

The **@openclaw/client** SDK handles CSRG handshake automatically:

```javascript
// ✓ What we now do (SDK):
import { Client } from '@openclaw/client';

const client = new Client({
  url: 'ws://127.0.0.1:18789',
  device: {
    id: 'auratrade-python-bridge',
    platform: process.platform,
  },
  // SDK automatically:
  // 1. Generates Ed25519 device keypair
  // 2. Receives nonce challenge from gateway
  // 3. Signs nonce with device key
  // 4. Completes CSRG handshake
  // 5. Establishes authenticated connection
});

await client.connect();  // CSRG happens here internally
await client.sendToAgent({ message: tradePrompt });
```

### What Changed in Your Codebase

| Component | Before (❌) | After (✓) |
|-----------|-----------|----------|
| **Bridge Script** | `openclaw_client.mjs` (raw WebSocket) | `openclaw_client_sdk.mjs` (SDK) |
| **WebSocket Library** | Built-in `WebSocket` | `@openclaw/client` SDK |
| **Handshake** | Manual (incorrect) | Automatic (CSRG-compliant) |
| **Error Handling** | Raw 1008 errors | Proper CSRG validation errors |
| **Event Stream** | Attempted message parsing | Proper SDK event emitters |
| **Exit Codes** | Generic errors | Semantic exit codes (0-4) |

---

## How OpenClaw SDK Works Internally

### CSRG Handshake Flow

```
1. Client connects to gateway
   └─ TCP SYN → Gateway

2. Client sends HTTP upgrade + device metadata
   └─ GET /ws HTTP/1.1
      Device-ID: auratrade-python-bridge
      Protocol-Version: 3

3. Gateway responds with challenge (nonce)
   └─ HTTP 101 Switching Protocols
      Challenge: <random-nonce>

4. Client signs challenge with device Ed25519 key
   └─ signature = Ed25519.sign(deviceKey, nonce)

5. Client sends signed response
   └─ { type: 'connect', signature, device_id, protocol: 3 }

6. Gateway validates signature
   └─ IF valid → connection approved ✓
      IF invalid → code 1008 × (closes connection)

7. Session established
   └─ Both sides now trusted
      Can exchange agent messages, tool calls, events
```

### SDK Methods Used

```javascript
// Create client with device identity
const client = new Client({
  url: 'ws://...',
  device: { id, name, platform, arch },
  protocol: { version: 3, features: [...] },
  handshakeTimeout: 5000,
});

// Auto-CSRG on connect()
await client.connect();

// Send to agent pipeline
await client.sendToAgent({ message, metadata, idempotencyKey });

// Listen for events
client.on('event', (ev) => {...});
client.on('message', (msg) => {...});
client.on('error', (err) => {...});
client.on('close', (code, reason) => {...});
```

---

## Architecture: SDK vs Raw WebSocket

### Before (Raw WebSocket) ❌

```
Python Agent
     ↓
subprocess spawns Node.js
     ↓
Node.js creates WebSocket
     └─ no CSRG awareness
     └─ sends standard HTTP upgrade headers
     └─ gateway receives and validates as CSRG
     └─ validation fails (invalid handshake)
     ↓
Gateway: "code=1008 invalid request frame"
     ↓
Connection closes
     ↓
No trade execution
```

### After (SDK) ✓

```
Python Agent
     ↓
subprocess spawns Node.js
     ↓
Node.js imports @openclaw/client
     ↓
new Client() initializes device identity (Ed25519)
     ↓
client.connect() triggers:
  1. TCP connect to gateway
  2. HTTP upgrade request with metadata
  3. Receive nonce challenge
  4. Sign challenge with Ed25519
  5. Send signed response
  6. Gateway validates → approved ✓
     ↓
WebSocket authenticated (CSRG-compliant)
     ↓
client.sendToAgent() executes trade:
  - Analyst agent reasons about trade
  - Risk agent evaluates bounds
  - Trader agent submits orders
  - ArmorClaw enforces policies
  - Alpaca executes on approval
     ↓
Events streamed back to Python as JSON lines
```

---

## Exit Codes Explained

```javascript
// openclaw_client_sdk.mjs exit codes:

process.exit(0)  // Success: trade executed
process.exit(1)  // Config error: @openclaw/client not installed
process.exit(2)  // Connection error: gateway unreachable
process.exit(3)  // Auth error: CSRG handshake failed
process.exit(4)  // Timeout: 60s elapsed without completion
```

Map these to Python to understand failures:

```python
# backend/openclaw_bridge.py
proc_result = await proc.wait()
if proc_result == 0:
    print("Trade executed successfully")
elif proc_result == 1:
    print("Need to: npm install @openclaw/client")
elif proc_result == 2:
    print("Gateway not running on 127.0.0.1:18789")
elif proc_result == 3:
    print("Device identity rejected (check ~/.openclaw/openclaw.json)")
elif proc_result == 4:
    print("Trade execution timeout (60s)")
```

---

## Verification Checklist

### ✓ SDK Installed

```bash
npm list @openclaw/client
# or
npm install @openclaw/client
```

### ✓ Config File Exists

```bash
# Windows
if exist %USERPROFILE%\.openclaw\openclaw.json echo "Config exists"

# macOS/Linux
test -f ~/.openclaw/openclaw.json && echo "Config exists"
```

### ✓ Gateway Running

```bash
# Should see gateway listening on 18789
netstat -ano | findstr :18789              # Windows
lsof -i :18789                             # macOS/Linux

# Or try to reach it
nc -zv 127.0.0.1 18789                     # Test connectivity
```

### ✓ CSRG Handshake Works

```bash
# Run test script
node bridge/test_openclaw_sdk.mjs

# Expected output includes:
# ✓ CSRG handshake successful
# ✓ Gateway Connectivity
# ✓ @openclaw/client SDK
```

### ✓ Bridge Executable

```bash
# Manual test
node bridge/openclaw_client_sdk.mjs '{"action":"BUY","ticker":"TEST","amount_usd":100,"run_id":"test"}'

# Expected first line:
# {"type":"agent_activity","agent":"OpenClaw","status":"connecting",...}
# 
# Expected second line (within 2 seconds):
# {"type":"agent_activity","agent":"OpenClaw","status":"running","message":"CSRG handshake complete ✓..."}
```

---

## Troubleshooting by Exit Code

### Exit 1: Config Error

```
Error: @openclaw/client not installed
```

**Fix:**
```bash
cd bridge/
npm install @openclaw/client
```

### Exit 2: Connection Error

```
Connection or execution failed: Gateway unreachable
```

**Fix (is gateway running?):**
```bash
# Windows
tasklist | findstr openclaw
# or start gateway
openclaw daemon start

# Docker
docker run -p 18789:18789 openclaw/gateway:latest

# Check port
netstat -ano | findstr :18789
```

### Exit 3: Auth Error (CSRG Failed)

```
Client error: CSRG handshake failed
or
Gateway rejected (CSRG validation error)
```

**Fix (update config):**
```bash
# Update ~/.openclaw/openclaw.json with:
{
  "gateway": {
    "device": {
      "id": "auratrade-python-bridge"
    }
  }
}
```

### Exit 4: Timeout

```
60s timeout elapsed without completion
```

**Fix (trade took too long):**
1. Check agent logs from OpenClaw gateway
2. Verify Alpaca API connectivity
3. Check ArmorClaw policies isn't blocking indefinitely

---

## Testing the Full Pipeline

### Quick Test (30 seconds)

```bash
cd bridge/
npm install @openclaw/client
node test_openclaw_sdk.mjs
```

### Manual Test (agent execution)

```bash
# Create trade
node openclaw_client_sdk.mjs '{"action":"BUY","ticker":"AAPL","amount_usd":1000,"run_id":"manual-1"}'

# Should see:
# - "CSRG handshake complete ✓"
# - Agent messages (Analyst, Risk, Trader)
# - ArmorClaw decisions
# - Alpaca trade result
```

### Python Integration Test

```python
import asyncio
from backend.openclaw_bridge import run_live_pipeline

async def test_trade():
    event_queue = {}
    await run_live_pipeline(
        run_id="py-test-1",
        action="BUY",
        ticker="TSLA",
        amount_usd=5000,
        event_queues=event_queue,
    )
    # Check event_queue for success

asyncio.run(test_trade())
```

---

## Why This Matters

### Security Model

OpenClaw implements **zero-trust architecture**:
- **Every connection** must prove device identity via Ed25519
- **Every request** is signed and audit-logged
- **No anonymous clients** allowed

CSRG prevents:
- Man-in-the-middle attacks (signature validation)
- Unauthorized gateway access (device identity)
- Policy bypass (all requests routed through ArmorClaw)

### What You Can Now Do

✅ **Live mode execution**: Trade commands validated through ArmorClaw policies
✅ **Full audit trail**: Every request signed and logged
✅ **Multi-agent orchestration**: Analyst → Risk → Trader → Alpaca
✅ **Python integration**: FastAPI calls Node.js SDK bridge
✅ **Paper trading**: Safe testing before real money

---

## Next Steps

1. **Install SDK**
   ```bash
   cd bridge/ && npm install @openclaw/client
   ```

2. **Create config**
   ```bash
   mkdir -p ~/.openclaw
   # Copy config/openclaw.json.example to ~/.openclaw/openclaw.json
   ```

3. **Start gateway**
   ```bash
   openclaw daemon start
   # or
   docker run -p 18789:18789 openclaw/gateway:latest
   ```

4. **Test**
   ```bash
   node bridge/test_openclaw_sdk.mjs
   ```

5. **Integrate**
   - Update agents to call `run_live_pipeline()`
   - Watch event stream for ArmorClaw decisions
   - Monitor Alpaca execution

---

## References

- [OpenClaw Protocol v3 Spec](https://docs.openclaw.dev/protocol)
- [CSRG Handshake Details](https://docs.openclaw.dev/security/csrg)
- [Ed25519 Device Identity](https://docs.openclaw.dev/security/device-identity)
- [ArmorClaw Policy Enforcement](https://docs.armoriq.ai)
- [Alpaca Trading API](https://alpaca.markets)
