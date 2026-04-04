# ArmorClaw Finance Orchestrator 🦞🛡️
### Multi-Agent AI Trading with Deterministic Safety Enforcement

> **"In financial systems, intent must be enforced, not inferred."**

ArmorClaw Finance Orchestrator is a hackathon project demonstrating how [OpenClaw](https://openclaw.ai) v2026.3.2 combined with [ArmorClaw](https://armoriq.ai) enforcement creates genuinely safe autonomous AI trading — not just approximately safe.

Every trade flows through **5 sequential enforcement checks and 14 declarative policy rules** before reaching Alpaca. The system supports both **live OpenClaw gateway** (for real LLM reasoning) and **graceful fallback** to Python demo orchestrator (when gateway unavailable). Both paths apply identical enforcement and real Alpaca execution.

Agents can reason freely. They cannot act freely.

---

## Demo

| Scenario | What Happens |
|----------|-------------|
| ✅ **Allowed trade** — SELL BTC/USD $10 | Analyst proposes → Risk issues HMAC-signed delegation token (60s TTL) → Trader submits → ArmorClaw validates token + checks all 14 rules → ALLOW → Alpaca paper order placed (real order ID) |
| 🚫 **Blocked trade** — BUY AAPL $1,000 at 05:45 EDT | Same pipeline → ArmorClaw Check 4 evaluates `market-hours-only` rule → Time outside 09:30-16:00 EST → BLOCK → No order ID, no Alpaca call, audit logged |

---

## Architecture — 4 Layers (with Dual Paths)

```
Layer 1:  intent.json          ← Immutable user constraints (tickers, limits, hours)

Layer 2:  Agent Orchestration   (Path A: live or Path B: fallback)
  Path A - OpenClaw Gateway:
    ├─ ws://127.0.0.1:18789 official daemon
    ├─ Real Analyst Agent (LLM-powered research)
    ├─ Real Risk Agent (exposure calculation, token issuance)
    └─ Real Trader Agent (order construction)
    
  Path B - Demo Orchestrator (fallback):
    ├─ Python-based simulation
    ├─ Demo Analyst Agent (research sim with delays)
    ├─ Demo Risk Agent (exposure sim, token issuance)
    └─ Demo Trader Agent (order sim)
    
    → Both paths apply IDENTICAL enforcement below

Layer 3:  ⚙️ ArmorClaw Engine   ← 5 checks + 14 policy rules
  ✓ Intent Binding (ticker universe, trade size)
  ✓ Delegation Token (HMAC-SHA256 signature, TTL, scope)
  ✓ Exposure & Concentration (portfolio limits, sector exposure)
  ✓ Regulatory & Temporal (market hours, earnings blackout, wash sale)
  ✓ Data & Tool Access (agent role binding, tool restrictions)
  
Layer 4:  Alpaca Paper Trading ← only receives ArmorClaw-approved orders
```

📄 See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for full technical specification.

---

## What Makes This Different

| Feature | Traditional Approach | ArmorClaw Finance Orchestrator |
|---------|---------------------|------|
| Agent platform | Roll-your-own Python | **Official OpenClaw v2026.3.2** (with demo fallback) |
| Policy enforcement | Hardcoded `if/else` scattered in agent code | **ArmorClaw Engine** — 5 checks + 14 declarative rules |
| LLM integration | Single provider | **Provider-agnostic** (OpenAI, Gemini, Claude configurable) |
| Delegation control | Simulated token passing | **Cryptographic** HMAC-SHA256 signed tokens with TTL |
| Trading execution | Mock orders | **Real Alpaca Paper Trading** (real order IDs, real market data) |
| Audit trail | Soft logging | **Deterministic audit** with block reasons + decision tracing |

---

## Quick Start

### Demo Mode (no OpenClaw gateway required)

```bash
git clone https://github.com/Danielraj5605/armorclaw-finance-orchestrator.git
cd armorclaw-finance-orchestrator

# Backend
cp .env.example .env
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Frontend (new terminal)
cd website
npm install
npm run dev
```

Open **http://localhost:5173** — click the two buttons on the dashboard.

In demo mode the agent pipeline is simulated with realistic delays and outputs. ArmorClaw enforcement runs on our Python implementation.

---

### Full OpenClaw Integration (Git Bash or WSL on Windows — not PowerShell)

**Step 1 — Get free API keys**

| Key | Link |
|-----|------|
| ArmorIQ API key | https://platform.armoriq.ai |
| Gemini 2.5 Flash | https://aistudio.google.com |
| Alpaca Paper Trading | https://app.alpaca.markets/paper/dashboard |

**Step 2 — Install OpenClaw + ArmorClaw**

```bash
# In Git Bash or WSL (WSL2 not strictly required)
# Flags MUST come after bash -s --, not directly after bash
curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \
  --gemini-key YOUR_GEMINI_KEY \
  --api-key YOUR_ARMORIQ_KEY \
  --no-prompt
```

This runs 7 stages: clones `openclaw/openclaw` into `~/openclaw-armoriq/`, applies 8 security patches, installs the `@armoriq/armorclaw` plugin, and configures everything automatically.

**Step 3 — Install Alpaca Trading Skill**

```bash
clawhub install lacymorrow/alpaca-trading-skill
```

**Step 4 — Configure keys in `.env`**

```bash
ALPACA_API_KEY=your_alpaca_paper_key
ALPACA_SECRET_KEY=your_alpaca_paper_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets
GEMINI_API_KEY=your_gemini_key
ARMORIQ_API_KEY=your_armoriq_key
OPENCLAW_MODE=live        # switches from simulation to real OpenClaw
```

**Step 5 — Copy our policy config**

```bash
cp config/armoriq.policy.json ~/.openclaw/armoriq.policy.json
```

**Step 6 — Start everything**

```bash
# Terminal 1: Start the OpenClaw gateway
# OpenClaw lives at ~/openclaw-armoriq/ — global CLI may not be in PATH
cd ~/openclaw-armoriq
pnpm dev gateway
# Confirmed working when you see all three:
#   "listening on ws://127.0.0.1:18789"
#   "IAP Verification Service initialized"
#   "CSRG proof headers are REQUIRED"
# → Also check platform.armoriq.ai — executions appear there in real time

# Terminal 2: FastAPI backend
cd /path/to/armorclaw-finance-orchestrator
OPENCLAW_MODE=live uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 3: React frontend
cd website && npm run dev
```

**Step 7 — Verify (if `openclaw` CLI is in PATH)**

```bash
openclaw doctor         # ✅ armorclaw plugin enabled
openclaw plugins list   # @armoriq/armorclaw (active)
```

---

## Project Structure

```
armorclaw-finance-orchestrator/
├── intent.json                   ← Layer 1: immutable constraints
├── ARCHITECTURE.md               ← Full technical specification
├── README.md                     ← This file
├── .env.example                  ← Environment variable template
├── requirements.txt              ← Python dependencies
│
├── config/
│   ├── armoriq.policy.json       ← ArmorClaw declarative policy (14 rules)
│   └── openclaw.json.example     ← OpenClaw daemon config example
│
├── backend/                      ← FastAPI bridge + Python audit layer
│   ├── main.py                   ← FastAPI app + SSE endpoints
│   ├── openclaw_bridge.py        ← WebSocket bridge to OpenClaw daemon
│   ├── config.py                 ← LLM factory (multi-LLM support)
│   ├── agents/                   ← Demo-mode simulation pipeline
│   ├── armorclaw/                ← Python enforcement (defense-in-depth)
│   ├── alpaca/                   ← Alpaca REST client
│   └── db/                       ← SQLAlchemy + SQLite audit log
│
└── website/                      ← React + Vite frontend
    └── src/
        ├── pages/Dashboard.jsx   ← 5-panel trading dashboard
        └── components/           ← Landing page sections
```

---

## Enforcement Flow

```
Order arrives at ArmorClaw:
  CHECK 1: intent binding (ticker universe, order size, intent hash)
  CHECK 2: delegation token (HMAC, expiry, agent identity, scope match)
  CHECK 3: exposure limits (concentration 40%, sector 60%, daily $20K)
  CHECK 4: regulatory (market hours, earnings blackout, wash-sale)
  CHECK 5: data/tool audit (origin agent, tool scope, file access)
  
  ALL PASS → ALLOW → Alpaca paper trade executed
  ANY FAIL → BLOCK → order never reaches Alpaca, reason logged
```

---

## Policy Rules

| # | Rule ID | Blocks When |
|---|---------|------------|
| 1 | `trade-size-limits` | Order > $5,000 or daily total > $20,000 |
| 2 | `portfolio-concentration-limit` | Single ticker would exceed 40% of portfolio |
| 3 | `sector-exposure-limit` | Tech sector would exceed 60% of portfolio |
| 4 | `ticker-universe-restriction` | Ticker not in `[NVDA, AAPL, GOOGL, MSFT]` |
| 5 | `market-hours-only` | Request outside 09:30–16:00 ET Mon–Fri |
| 6 | `earnings-blackout-window` | Within 2 days of earnings announcement |
| 7 | `wash-sale-prevention` | Selling within 30 days of a loss sale |
| 8 | `data-class-protection` | Restricted data class accessed |
| 9 | `directory-scoped-access` | File access outside `/data/agents/` |
| 10 | `tool-restrictions` | Agent called a tool outside its role |
| 11 | `delegation-scope-enforcement` | Order fields don't match delegation token |
| 12 | `agent-role-binding` | Order not submitted by TraderAgent |
| 13 | `intent-token-binding` | `intent_token_id` doesn't match loaded hash |
| 14 | `risk-agent-read-only` | Risk agent attempted a write operation |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Platform | [OpenClaw](https://github.com/openclaw/openclaw) (Node.js) |
| Enforcement Plugin | [ArmorClaw](https://armoriq.ai) (`@armoriq/armorclaw`) |
| Skill Registry | [ClawHub](https://clawhub.io) (Alpaca Trading Skill) |
| LLM | Gemini 2.5 Flash (free tier, 1500 req/day) |
| Backend | Python 3.11 + FastAPI + SQLAlchemy |
| Database | SQLite (tamper-evident proof-hash chaining) |
| Frontend | React 18 + Vite 5 |
| Paper Trading | [Alpaca Markets](https://alpaca.markets) |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/run-trade` | `POST` | Start agent pipeline, returns `run_id` |
| `/run-trade/stream/{run_id}` | `GET` | SSE stream of agent events + ArmorClaw decision |
| `/get-logs` | `GET` | Query audit log (`?decision=BLOCK&limit=20`) |
| `/get-positions` | `GET` | Alpaca portfolio positions |
| `/health` | `GET` | Server health check |

---

## Submission Checklist

- [x] Source code repository
- [x] Architecture diagram (ARCHITECTURE.md §3 — mermaid + ASCII)
- [x] Intent model documented (ARCHITECTURE.md §4 Layer 1)
- [x] Policy model documented (ARCHITECTURE.md §17)
- [x] Enforcement mechanism documented (ARCHITECTURE.md §6)
- [x] Allowed trade scenario (ARCHITECTURE.md §10)
- [x] Blocked trade scenario (ARCHITECTURE.md §11)
- [ ] 3-minute demo video (record from dashboard)

---

## Hackathon Context

> This project was built for the ArmorIQ / OpenClaw hackathon challenge:
> **"Build OpenClaw agents that enforce user-defined intent boundaries at runtime"**

**Judging criteria addressed:**
- **Enforcement Strength** — ArmorClaw deterministically blocks unauthorized orders at the tool call level, before any external API is reached
- **Architectural Clarity** — Clear separation: Analyst reasons, Risk validates, Trader executes, ArmorClaw enforces. No agent talks to Alpaca directly.
- **OpenClaw Integration** — Real `@armoriq/armorclaw` plugin, real ClawHub Alpaca skill, real `openclaw.json` config
- **Delegation Enforcement** — HMAC-SHA256 signed tokens, 60s TTL, one-time use, no sub-delegation
- **Use Case Depth** — Realistic financial scenario with 4 blocked scenarios: size, wrong ticker, after-hours, concentration breach

---

## License

MIT — Built for educational and hackathon purposes. Paper trading only — no real money.
