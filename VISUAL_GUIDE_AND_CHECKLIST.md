# OpenClaw Integration: Visual Guide & Checklist

## Architecture Diagram

### Before (Broken) ❌

```
┌─────────────────────────────────────────────────────────┐
│ Python Agents (FastAPI)                                 │
│   • Analyst, Risk, Trader                               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓ subprocess
┌─────────────────────────────────────────────────────────┐
│ Node.js (openclaw_client.mjs)                           │
│   ❌ Uses raw WebSocket                                  │
│   ❌ Sends standard HTTP upgrade                         │
│   ❌ No Ed25519 signing                                  │
│   ❌ No CSRG awareness                                   │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓ WebSocket
┌─────────────────────────────────────────────────────────┐
│ OpenClaw Gateway (18789)                                │
│   • Validates CSRG handshake                            │
│   • Expects Ed25519 signature                           │
│   • Gateway receives non-CSRG compliant upgrade         │
│                                                         │
│   ❌ VALIDATION FAILS                                    │
│   ❌ Closes with code=1008 (policy violation)           │
└─────────────────────────────────────────────────────────┘
        ERROR: invalid request frame
        Reason: CSRG handshake invalid
```

### After (Working) ✅

```
┌─────────────────────────────────────────────────────────┐
│ Python Agents (FastAPI)                                 │
│   • Analyst, Risk, Trader                               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓ subprocess
┌─────────────────────────────────────────────────────────┐
│ Node.js (openclaw_client_sdk.mjs)                       │
│   ✓ Imports @openclaw/client SDK                        │
│   ✓ Creates Client with device identity                 │
│   ✓ SDK handles Ed25519 signing internally              │
│   ✓ SDK understands CSRG protocol                       │
└────────────────┬────────────────────────────────────────┘
                 │
         ✓ SDK CSRG Handshake
         ├─ 1. Load device key
         ├─ 2. Request challenge (nonce)
         ├─ 3. Create Ed25519 signature
         ├─ 4. Send signed response
         └─ 5. Gateway validates → APPROVED
                 │
                 ↓ Authenticated WebSocket
┌─────────────────────────────────────────────────────────┐
│ OpenClaw Gateway (18789)                                │
│   ✓ Validates CSRG handshake                            │
│   ✓ Verifies Ed25519 signature                          │
│   ✓ Gateway receives CSRG-compliant connection          │
│                                                         │
│   ✓ VALIDATION SUCCEEDS                                 │
│   ✓ Session authenticated (code 101)                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓ Authenticated connection
         ✓ Agent execution
         ├─ Analyst: Reason about trade
         ├─ Risk: Evaluate bounds
         ├─ Trader: Submit to Alpaca
         └─ ArmorClaw: Enforce policies
                 │
                 ↓ Event stream back to Python
         ✓ JSON lines from stdout
         ├─ Agent messages
         ├─ Tool calls
         ├─ Policy decisions
         └─ Execution results
                 │
                 ↓ Python processes events
         ✓ FastAPI SSE stream
         └─ Frontend real-time updates
```

---

## Protocol Comparison

### Raw WebSocket (Before) ❌

```
Client → GET /ws HTTP/1.1
         Host: 127.0.0.1:18789
         Upgrade: websocket
         Connection: Upgrade
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
         
Gateway → HTTP/101 Switching Protocols
          ❌ CSRG validation fails (no signature)
          ❌ code=1008 (policy violation)
          ❌ reason="invalid request frame"
```

### SDK with CSRG (After) ✓

```
1. Client → TCP connect to gateway

2. Client → HTTP/1.1 upgrade + metadata
            Device-ID: auratrade-python-bridge
            Protocol-Version: 3

3. Gateway → HTTP 200
             Challenge: <nonce>
             Salt: <random>

4. Client → Load Ed25519 private key from device identity
            Sign(nonce) = Ed25519PrivateKey.sign(nonce)
            Send signed response + device_id

5. Gateway → Verify signature with device public key
             ✅ Signature valid
             ✅ Device identity authenticated
             ✅ Send HTTP/101 Upgrade

6. Both sides → Authenticated WebSocket connection
                Ready to exchange agent messages, tool calls, events
```

---

## File Structure & Changes

### Before (Broken Setup)

```
bridge/
  ├─ openclaw_client.mjs        ← Raw WebSocket (broken)
  ├─ test_bridge.mjs
  └─ diag.mjs

backend/
  └─ openclaw_bridge.py         ← Uses openclaw_client.mjs
```

### After (Fixed Setup)

```
bridge/
  ├─ package.json               ← NEW (dependencies)
  ├─ openclaw_client_sdk.mjs    ← NEW (SDK-based, working)
  ├─ test_openclaw_sdk.mjs      ← NEW (verification)
  ├─ openclaw_client.mjs        ← Old version (deprecated)
  ├─ test_bridge.mjs
  └─ diag.mjs

backend/
  └─ openclaw_bridge.py         ← UPDATED (uses SDK version)

docs/
  ├─ OPENCLAW_QUICK_START.md        ← NEW
  ├─ OPENCLAW_SDK_SETUP.md          ← NEW
  ├─ OPENCLAW_CSRG_EXPLAINED.md     ← NEW
  ├─ SOLUTION_SUMMARY.md            ← NEW
  └─ VISUAL_GUIDE.md                ← NEW (this file)
```

---

## Step-by-Step Setup Checklist

### Phase 1: Environment (5 min)

- [ ] Node.js >=18 installed
  ```bash
  node --version  # Should be v18+
  ```

- [ ] npm available
  ```bash
  npm --version   # Should print version
  ```

- [ ] Python 3.9+ installed
  ```bash
  python --version
  ```

### Phase 2: Dependencies (5 min)

- [ ] SDK installed
  ```bash
  cd bridge/
  npm install @openclaw/client
  ```

- [ ] Verify SDK installed
  ```bash
  npm list @openclaw/client
  # Should show: openclaw_client_sdk@... 
  ```

### Phase 3: Configuration (5 min)

- [ ] Create `.openclaw` directory
  ```bash
  mkdir -p ~/.openclaw
  ```

- [ ] Create `openclaw.json`
  ```bash
  # Copy from config/openclaw.json.example or paste sample
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
  ```

- [ ] Verify config file exists
  ```bash
  cat ~/.openclaw/openclaw.json
  # Should print JSON (no errors)
  ```

### Phase 4: Gateway (5 min)

- [ ] Start OpenClaw gateway (one of):
  ```bash
  # Option A: Docker (recommended)
  docker run -p 18789:18789 openclaw/gateway:latest
  
  # Option B: Binary
  openclaw daemon start
  ```

- [ ] Verify gateway is running
  ```bash
  # Windows
  netstat -ano | findstr :18789
  
  # Linux/macOS
  lsof -i :18789
  # Should show: LISTEN on port 18789
  ```

### Phase 5: Testing (10 min)

- [ ] Run integration tests
  ```bash
  cd bridge/
  node test_openclaw_sdk.mjs
  # Should show: ✓ All tests passed
  ```

- [ ] Run manual trade test
  ```bash
  node openclaw_client_sdk.mjs '{
    "action": "BUY",
    "ticker": "TEST",
    "amount_usd": 100,
    "run_id": "manual-test"
  }'
  # Should see: CSRG handshake complete ✓
  ```

- [ ] Verify no errors
  ```bash
  # Should NOT see:
  # - code 1008
  # - invalid request frame
  # - Connection refused
  # - Module not found
  ```

### Phase 6: Integration (15 min)

- [ ] Update Python bridge file
  - Verify it uses `openclaw_client_sdk.mjs` (not old version)
  
- [ ] Create FastAPI route (if not already)
  ```python
  @app.post("/api/trades")
  async def execute_trade(req: TradeRequest, bg: BackgroundTasks):
      # ... implementation
  ```

- [ ] Test Python integration
  ```python
  # In Python shell
  import asyncio
  from backend.openclaw_bridge import run_live_pipeline
  
  async def test():
      await run_live_pipeline(
          "test-001", "BUY", "AAPL", 1000, {}
      )
  
  asyncio.run(test())
  # Should complete without code 1008 error
  ```

### Phase 7: Verification (5 min)

- [ ] All tests pass: `node test_openclaw_sdk.mjs`
- [ ] Manual trade shows "CSRG handshake complete ✓"
- [ ] Python can import and use `run_live_pipeline`
- [ ] FastAPI endpoint `/api/trades` responds
- [ ] SSE stream `/api/events/{run_id}` works
- [ ] No more code 1008 errors

---

## Error Code Reference

### Exit Codes (from bridge)

| Code | Meaning | Fix |
|------|---------|-----|
| 0 | ✅ Success | None |
| 1 | ❌ SDK not installed | `npm install @openclaw/client` |
| 2 | ❌ Gateway unreachable | Start gateway, check port 18789 |
| 3 | ❌ CSRG handshake failed | Check `~/.openclaw/openclaw.json` |
| 4 | ❌ Timeout (60s) | Check gateway logs, increase timeout |

### WebSocket Codes

| Code | Status | Before | After |
|------|--------|--------|-------|
| 101 | Upgrade OK | ❌ Never reached | ✅ CSRG success |
| 1000 | Normal close | ❌ Rare | ✅ Normal completion |
| 1008 | Policy violation | ❌ Always | ✅ Never (fixed!) |

### HTTP Status (gateway)

| Status | Meaning | Cause |
|--------|---------|-------|
| 200 | Challenge sent | Normal (SDK processes) |
| 101 | Upgrade approved | ✅ CSRG validated |
| 403 | Forbidden | Device not authorized |
| 500 | Server error | Gateway crash? |

---

## Performance Checklist

### Handshake Time

- [ ] CSRG handshake: 50-200ms (Ed25519 signing)
- [ ] Total connection: <500ms
- [ ] Target: Fast, not immediate (normal)

### Agent Execution

- [ ] Analyst reasoning: 1-3s (LLM)
- [ ] Risk evaluation: 0.5-1s (checks)
- [ ] Trader submission: 0.5-1s (Alpaca API)
- [ ] Total trade execution: 5-15s

### Event Streaming

- [ ] First event: <100ms (handshake done)
- [ ] Agent messages: Real-time (<100ms each)
- [ ] Policy decisions: <200ms
- [ ] Final result: Within 15s

---

## Security Verification

### Device Identity

- [ ] Device ID in `~/.openclaw/openclaw.json` ✅
- [ ] Ed25519 key pair in SDK
  ```bash
  # SDK generates automatically on first use
  # Stored securely (not in code)
  ```

- [ ] Signature validation in gateway ✅
  - Nonce signed with device key
  - Gateway verifies with public key

### Session Security

- [ ] Encrypted WebSocket (TLS optional for local)
- [ ] Nonce prevents replay attacks
- [ ] Signature prevents tampering
- [ ] Audit logging (ArmorClaw)

---

## Common Issues & Solutions

### Issue: "code 1008 invalid request frame"

**Diagnosis:**
```bash
# Check 1: SDK installed?
npm list @openclaw/client

# Check 2: Gateway running?
netstat -ano | findstr :18789

# Check 3: Config valid?
cat ~/.openclaw/openclaw.json
```

**Solution:**
1. If SDK not found: `npm install @openclaw/client`
2. If gateway not running: Start it
3. If config error: Recreate with sample

### Issue: "Connection timeout"

**Diagnosis:**
```bash
# Is gateway listening?
lsof -i :18789

# Can you reach it?
nc -zv 127.0.0.1 18789
```

**Solution:**
1. Start gateway
2. Check firewall not blocking 18789
3. Increase timeout if legitimate slowness

### Issue: "Module not found: @openclaw/client"

**Diagnosis:**
```bash
cd bridge/
npm list @openclaw/client
```

**Solution:**
```bash
npm install @openclaw/client
npm list @openclaw/client  # Verify
```

### Issue: "CSRG handshake failed"

**Diagnosis:**
```bash
# Is config file readable?
cat ~/.openclaw/openclaw.json

# Does device ID exist?
# Should have: "gateway": { "device": { "id": "..." } }
```

**Solution:**
1. Ensure `gateway.device.id` is set
2. Check file permissions
3. Try restarting gateway

---

## Success Criteria

Your setup is complete when:

```
✅ node test_openclaw_sdk.mjs
   ✓ Node.js Version
   ✓ OpenClaw Config
   ✓ @openclaw/client SDK
   ✓ Gateway Connectivity
   ✓ SDK Bridge Script (CSRG handshake successful)

✅ Manual trade test
   {"type":"agent_activity",...,"message":"CSRG handshake complete ✓"}
   Events stream from agents
   No code 1008 errors

✅ Python integration
   from backend.openclaw_bridge import run_live_pipeline
   # No import errors

✅ FastAPI endpoint
   POST /api/trades → returns {"run_id": "..."}
   GET /api/events/{run_id} → streams JSON events
```

---

## What's Next?

1. **Done with setup?** → Start using `run_live_pipeline()` in your agents
2. **Want live trading?** → Set `OPENCLAW_MODE=live` and use real Alpaca account
3. **Need monitoring?** → Build dashboard for ArmorClaw decisions
4. **Scaling?** → Add load balancing, caching, metrics

---

## Need Help?

1. **Quick answers:** See OPENCLAW_QUICK_START.md
2. **Setup issues:** See OPENCLAW_SDK_SETUP.md  
3. **How it works:** See OPENCLAW_CSRG_EXPLAINED.md
4. **Full system:** See SOLUTION_SUMMARY.md
5. **This guide:** You're reading it! 📖

---

**Status**: Ready to execute trades! 🚀
