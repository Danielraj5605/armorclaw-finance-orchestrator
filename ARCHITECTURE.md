# AuraTrade — Multi-Agent AI Trading Safety System
## Architecture Document v1.0

> **System Name:** AuraTrade  
> **Safety Layer:** ArmorClaw  
> **Agent Framework:** OpenClaw / LangGraph  
> **Status:** Reference Architecture — Paper Trading Only

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Layer Diagram](#2-layer-diagram)
3. [Component Breakdown](#3-component-breakdown)
4. [Agent Specifications](#4-agent-specifications)
5. [ArmorClaw Enforcement Flow](#5-armorclaw-enforcement-flow)
6. [Policy Rules Reference](#6-policy-rules-reference)
7. [Delegation Token Lifecycle](#7-delegation-token-lifecycle)
8. [Happy Path Trace — BUY NVDA $4000](#8-happy-path-trace--buy-nvda-4000)

<!-- PART 1 END — CONTINUE IN PART 2 -->

9. [Blocked Path Trace — BUY NVDA $8000](#9-blocked-path-trace--buy-nvda-8000)
10. [Audit Log Schema](#10-audit-log-schema)
11. [Directory Structure](#11-directory-structure)
12. [API Endpoint Reference](#12-api-endpoint-reference)
13. [Frontend Component Tree](#13-frontend-component-tree)
14. [Setup & Run Instructions](#14-setup--run-instructions)
15. [Security Assumptions & Limitations](#15-security-assumptions--limitations)

---

## 1. System Overview

AuraTrade is a multi-agent AI trading system engineered around a _safety-first, enforcement-first_ design philosophy: no order ever reaches the brokerage unless it has been independently proposed by a market Analyst agent, reviewed and token-approved by a read-only Risk agent, and then cleared by ArmorClaw — a deterministic, auditable five-check enforcement engine that applies fourteen explicit policy rules against an immutable `intent.json` declaration. The system deliberately separates _intelligence_ (LangGraph agents making informed decisions) from _execution authority_ (ArmorClaw holding the only real key to the Alpaca Paper Trading API), so that even a fully compromised or hallucinating agent cannot place an unauthorized order, exceed defined exposure limits, or trade outside permitted market hours. Every decision — allow or block — is written to a tamper-evident, hashed audit log before any downstream action is taken.

---

## 2. Layer Diagram

```mermaid
flowchart TD
    subgraph L1["Layer 1 — Intent Declaration (Immutable)"]
        IJ["📄 intent.json\n• goal: paper-trading-demo\n• tickers: [NVDA, AAPL, GOOGL, MSFT]\n• risk_tolerance: moderate\n• max_order_usd: $5,000\n• max_daily_usd: $20,000"]
    end

    subgraph L2["Layer 2 — OpenClaw / LangGraph Agents"]
        AN["🔍 Analyst Agent\ntools: market-data, research\nOutputs: TradeProposal"]
        RA["🛡️ Risk Agent\ntools: get_positions, get_account,\ncalculate_exposure\nOutputs: DelegationToken"]
        TR["⚡ Trader Agent\ntools: alpaca-trading:execute ONLY\nSubmits to ArmorClaw — never direct"]
    end

    subgraph L3["Layer 3 — ArmorClaw Enforcement Engine"]
        AC["⚙️ ArmorClaw\n5 Enforcement Checks\n14 Policy Rules\nAudit Log Writer"]
    end

    subgraph L4["Layer 4 — Alpaca Paper Trading API"]
        AP["📈 Alpaca\nPaper Trading\n(no real money)"]
    end

    User["👤 User / Frontend"] -->|POST /run-trade| AN
    IJ -.->|read-only constraint binding| AN
    IJ -.->|read-only constraint binding| RA
    IJ -.->|read-only constraint binding| AC

    AN -->|TradeProposal| RA
    RA -->|DelegationToken + Approval| TR
    TR -->|Signed OrderRequest + Token| AC

    AC -->|ALLOW → forwarded| AP
    AC -->|BLOCK → rejected + logged| TR

    AP -->|Order Confirmation| AC
    AC -->|Audit Entry| DB["🗄️ SQLite Audit Log"]
```

---

## 3. Component Breakdown

### Layer 1 — Intent Declaration

| Component | Responsibility | Interface |
|-----------|---------------|-----------|
| `intent.json` | Single source of truth for ALL policy constraints. Loaded once at startup, cryptographically hashed, never mutated at runtime | Read-only file mount; hash verified by ArmorClaw on every request |
| Intent Loader | Deserializes and validates `intent.json` against a Pydantic schema at boot | Internal Python module; raises `IntentValidationError` on mismatch |

**Key fields:**
```json
{
  "goal": "paper-trading-demo",
  "authorized_tickers": ["NVDA", "AAPL", "GOOGL", "MSFT"],
  "risk_tolerance": "moderate",
  "max_order_usd": 5000,
  "max_daily_usd": 20000,
  "intent_version": "1.0.0",
  "intent_token_id": "<UUID>"
}
```

---

### Layer 2 — OpenClaw / LangGraph Agents

| Component | Responsibility | Interfaces In | Interfaces Out |
|-----------|---------------|---------------|----------------|
| **Analyst Agent** | Fetches market data, runs research, proposes trade with rationale | `/run-trade` POST body | `TradeProposal` JSON sent to Risk Agent |
| **Risk Agent** | Validates proposal against portfolio exposure, account equity; issues delegation token | `TradeProposal` | `DelegationToken` or `RejectionReason` |
| **Trader Agent** | Constructs final order payload, attaches delegation token, submits to ArmorClaw | `DelegationToken` + `TradeProposal` | `OrderRequest` to `POST /armorclaw/validate` |
| **LangGraph Orchestrator** | Manages agent state machine, message routing, streaming output to frontend | FastAPI background task | SSE stream for frontend activity feed |

---

### Layer 3 — ArmorClaw

| Component | Responsibility | Interface |
|-----------|---------------|-----------|
| **Check Engine** | Runs 5 sequential enforcement checks against the order | Internal method chain; returns `CheckResult` |
| **Policy Rule Evaluator** | Applies 14 named rules per relevant check | Called by Check Engine per check |
| **Audit Log Writer** | Writes immutable, hashed entries for every decision | SQLite via SQLAlchemy ORM |
| **Token Validator** | Verifies delegation token signature, expiry, handoff count | Called in Check 2 |
| **Intent Binder** | Compares order fields against loaded `intent.json` constraints | Called in Checks 1, 3, 4 |

---

### Layer 4 — Alpaca Paper Trading API

| Component | Responsibility | Interface |
|-----------|---------------|-----------|
| Alpaca REST Client | Submits ArmorClaw-approved orders, fetches positions/account | HTTPS REST; API key + secret from `.env` |
| Position Cache | Short-lived cache of current positions for Risk Agent reads | In-memory dict, 5-second TTL |

---

## 4. Agent Specifications

| Agent Name | Role | Allowed Tools | Cannot Do | Outputs |
|------------|------|--------------|-----------|---------|
| **Analyst** | Market Intelligence | `market-data` (price/volume/OHLC fetch), `research` (news/sentiment fetch) | Access account balances, place orders, read positions, issue tokens, call ArmorClaw directly | `TradeProposal { ticker, action, suggested_amount_usd, rationale, confidence_score }` |
| **Risk Agent** | Exposure Gatekeeper | `get_positions` (read-only Alpaca), `get_account` (read-only Alpaca), `calculate_exposure` (internal math) | Place or modify orders, write to any data store, generate market signals, delegate to sub-agents | `DelegationToken { approved_by, action, ticker, max_amount_usd, expiry, handoff_count, sub_delegation_allowed }` or `RejectionReason` |
| **Trader** | Order Executor | `alpaca-trading:execute` ONLY (routed through ArmorClaw — never direct) | Read account data, propose trades, issue delegation tokens, call research APIs, trade unlisted tickers | `OrderRequest` (to ArmorClaw) → on ALLOW: `OrderConfirmation`; on BLOCK: `BlockedOrderRecord` |

> **Enforcement note:** Tool bindings are enforced by the LangGraph tool registry. If a Trader agent attempts to call `market-data`, the framework raises `ToolAccessDeniedError` before the call reaches any external API.

---

## 5. ArmorClaw Enforcement Flow

ArmorClaw receives every `OrderRequest` and runs five checks **in strict sequence**. A failure at any check immediately blocks the order; subsequent checks are skipped.

```
OrderRequest received
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  CHECK 1 — Intent Binding Verification                  │
│  • Verify order ticker ∈ authorized_tickers             │
│  • Verify order amount ≤ max_order_usd                  │
│  • Verify intent_token_id matches loaded intent.json    │
│  PASS → Check 2   FAIL → BLOCK (rules: ticker-universe  │
│                              trade-size-limits,         │
│                              intent-token-binding)      │
└─────────────────────────────────────────────────────────┘
       │ PASS
       ▼
┌─────────────────────────────────────────────────────────┐
│  CHECK 2 — Delegation Token Validation                  │
│  • Verify token signature (HMAC-SHA256)                 │
│  • Verify token not expired (expiry > now, 60s TTL)     │
│  • Verify approved_by == "RiskAgent"                    │
│  • Verify handoff_count == 1                            │
│  • Verify sub_delegation_allowed == false               │
│  • Verify token action/ticker match order fields        │
│  PASS → Check 3   FAIL → BLOCK (rule: delegation-scope- │
│                              enforcement,               │
│                              agent-role-binding)        │
└─────────────────────────────────────────────────────────┘
       │ PASS
       ▼
┌─────────────────────────────────────────────────────────┐
│  CHECK 3 — Exposure & Concentration                     │
│  • Fetch current portfolio value                        │
│  • Calculate post-trade single-ticker concentration     │
│  • Calculate sector exposure                            │
│  • Verify daily spend so far + order ≤ max_daily_usd    │
│  PASS → Check 4   FAIL → BLOCK (rules: portfolio-       │
│                    concentration-limit, sector-         │
│                    exposure-limit, trade-size-limits)   │
└─────────────────────────────────────────────────────────┘
       │ PASS
       ▼
┌─────────────────────────────────────────────────────────┐
│  CHECK 4 — Regulatory & Temporal Rules                  │
│  • Verify current time within market hours              │
│    (NYSE: 09:30–16:00 ET, Mon–Fri)                      │
│  • Check earnings blackout calendar for ticker          │
│  • Check wash-sale 30-day window for ticker             │
│  PASS → Check 5   FAIL → BLOCK (rules: market-hours-    │
│                    only, earnings-blackout-window,      │
│                    wash-sale-prevention)                │
└─────────────────────────────────────────────────────────┘
       │ PASS
       ▼
┌─────────────────────────────────────────────────────────┐
│  CHECK 5 — Data & Tool Access Audit                     │
│  • Confirm request originated from Trader agent         │
│  • Verify no restricted data classes were accessed      │
│  • Confirm Trader used only alpaca-trading:execute tool │
│  • Verify file access was within scoped directory       │
│  PASS → ALLOW → Forward to Alpaca                       │
│  FAIL → BLOCK (rules: data-class-protection,            │
│                tool-restrictions, directory-scoped-     │
│                access, agent-role-binding)              │
└─────────────────────────────────────────────────────────┘
       │ ALLOW
       ▼
  Forward to Alpaca Paper Trading API
  Write ALLOW audit entry (with proof_hash)
```

---

## 6. Policy Rules Reference

| Rule ID | Group | What It Checks | Block Condition |
|---------|-------|---------------|-----------------|
| `trade-size-limits` | Trade & Exposure | Individual order amount vs `max_order_usd` and accumulated daily spend vs `max_daily_usd` | `order_usd > 5000` OR `(daily_spent + order_usd) > 20000` |
| `portfolio-concentration-limit` | Trade & Exposure | Post-trade % of single ticker in portfolio | Single ticker would exceed 40% of total portfolio value |
| `sector-exposure-limit` | Trade & Exposure | Post-trade sector weight relative to total portfolio | Any single GICS sector would exceed 60% of portfolio value |
| `ticker-universe-restriction` | Ticker & Asset | Requested ticker vs `authorized_tickers` in `intent.json` | Ticker not in `["NVDA","AAPL","GOOGL","MSFT"]` |
| `market-hours-only` | Time & Regulatory | Timestamp of request vs NYSE market hours (09:30–16:00 ET, Mon–Fri) | Request arrives outside market hours or on a market holiday |
| `earnings-blackout-window` | Time & Regulatory | Request date vs earnings dates ± 2 days for the target ticker | Trade attempted within 2 calendar days of an earnings announcement |
| `wash-sale-prevention` | Time & Regulatory | Last sell date for same ticker vs current date | A sell is attempted within 30 days of a prior sale of the same ticker at a loss |
| `data-class-protection` | Data & File | Data classification labels on any data accessed during agent execution | Any RESTRICTED or CONFIDENTIAL data class was read/written by an agent not authorized for it |
| `directory-scoped-access` | Data & File | File system paths accessed by any agent or tool | Access attempted outside the designated `/data/agents/` scoped directory |
| `tool-restrictions` | Tool Restrictions | Tool calls made by each agent vs their declared allowed-tool list | An agent called a tool not in its declared allowed list |
| `delegation-scope-enforcement` | Delegation & Role | Delegation token fields vs actual order fields | `token.action ≠ order.action` OR `token.ticker ≠ order.ticker` OR `token.max_amount_usd < order.amount_usd` |
| `agent-role-binding` | Delegation & Role | Agent identity claiming to originate the order | Order not submitted by the registered Trader agent identity |
| `intent-token-binding` | Delegation & Role | `intent_token_id` in request vs hash of currently loaded `intent.json` | IDs do not match — indicates intent.json was tampered or swapped |
| `risk-agent-read-only` | Delegation & Role | Any write/execute tool call originating from the Risk Agent | Risk agent attempted to call any non-read-only tool |

---

## 7. Delegation Token Lifecycle

### 7.1 Schema

```json
{
  "token_id": "uuid-v4",
  "approved_by": "RiskAgent",
  "action": "BUY",
  "ticker": "NVDA",
  "max_amount_usd": 4000,
  "expiry": "2024-01-15T14:31:00Z",
  "issued_at": "2024-01-15T14:30:00Z",
  "handoff_count": 1,
  "sub_delegation_allowed": false,
  "intent_token_id": "<hash of intent.json>",
  "signature": "<HMAC-SHA256 of payload fields>"
}
```

### 7.2 Issuance

```
1. Risk Agent completes exposure checks (read-only tools only)
2. Risk Agent calls internal token factory:
   - Populates all fields from validated TradeProposal
   - Sets expiry = now() + 60 seconds
   - Sets handoff_count = 1 (Analyst → Risk → Trader is one hop)
   - Sets sub_delegation_allowed = false (hard-coded, non-overridable)
3. Token is HMAC-SHA256 signed with the system secret key
4. Token passed directly to Trader Agent in-process (not written to disk)
```

### 7.3 Validation (by ArmorClaw — Check 2)

```
1. Deserialize token from OrderRequest
2. Recompute HMAC-SHA256 — compare with token.signature → FAIL if mismatch
3. Check expiry > datetime.utcnow() → FAIL if expired (60s TTL)
4. Assert approved_by == "RiskAgent" → FAIL if any other value
5. Assert handoff_count == 1 → FAIL if > 1 (prevents relay attacks)
6. Assert sub_delegation_allowed == false → FAIL if true
7. Assert token.action == order.action AND token.ticker == order.ticker
8. Assert order.amount_usd ≤ token.max_amount_usd
```

### 7.4 Expiry & Invalidation

- **TTL:** 60 seconds from `issued_at`. No renewal mechanism — a new token must be issued.
- **One-time use:** Token ID is written to a short-lived `used_tokens` set in memory on first validation. Replayed token ID → immediate BLOCK.
- **On system restart:** All in-flight tokens are invalidated (no persistence of tokens across restarts).

### 7.5 Why No Sub-Delegation

`sub_delegation_allowed: false` is a hard-coded invariant. It prevents any agent from "re-wrapping" a token and passing execution authority to an unregistered or ephemeral agent — a known multi-agent privilege escalation vector.

---

## 8. Happy Path Trace — BUY NVDA $4000

> **Scenario:** User clicks "Run allowed trade" in the UI. System executes a BUY order for NVDA at $4,000.

```
Step 1  USER → Frontend
        User clicks "Run allowed trade" button.
        Frontend sends: POST /run-trade
        Body: { "action": "BUY", "ticker": "NVDA", "amount_usd": 4000 }

Step 2  FastAPI → LangGraph Orchestrator
        Orchestrator spins up agent pipeline.
        Streams activity events to frontend via SSE.
        Activity feed shows: "▶ Analyst Agent starting..."

Step 3  Analyst Agent (Layer 2)
        Calls tool: market-data → fetches NVDA price, volume, OHLC
        Calls tool: research → fetches NVDA news sentiment
        Produces TradeProposal:
        {
          "action": "BUY", "ticker": "NVDA",
          "suggested_amount_usd": 4000,
          "rationale": "Strong momentum, positive sentiment",
          "confidence_score": 0.82
        }
        Activity feed shows: "✅ Analyst: NVDA BUY proposal generated"

Step 4  Risk Agent (Layer 2)
        Receives TradeProposal.
        Calls tool: get_positions → NVDA currently 12% of portfolio
        Calls tool: get_account → equity $48,000, daily spent $0
        Calls tool: calculate_exposure → post-trade NVDA would be ~20%
        All checks pass: concentration < 40%, daily spend $4000 < $20000
        Issues DelegationToken (60s TTL, HMAC-signed):
        {
          "approved_by": "RiskAgent", "action": "BUY",
          "ticker": "NVDA", "max_amount_usd": 4000,
          "expiry": "<now + 60s>", "handoff_count": 1,
          "sub_delegation_allowed": false
        }
        Activity feed shows: "✅ Risk Agent: Token issued"

Step 5  Trader Agent (Layer 2)
        Receives DelegationToken + TradeProposal.
        Constructs OrderRequest with both attached.
        Calls tool: alpaca-trading:execute → routes to ArmorClaw,
        NOT directly to Alpaca.
        Activity feed shows: "⏳ Trader: Submitting to ArmorClaw..."

Step 6  ArmorClaw — Check 1 (Intent Binding)
        NVDA ∈ ["NVDA","AAPL","GOOGL","MSFT"] ✅
        $4000 ≤ $5000 max_order_usd ✅
        intent_token_id matches loaded intent.json ✅
        → PASS

Step 7  ArmorClaw — Check 2 (Token Validation)
        HMAC signature valid ✅
        expiry > now (token is 3 seconds old) ✅
        approved_by == "RiskAgent" ✅
        handoff_count == 1 ✅
        token.action == order.action (BUY == BUY) ✅
        token.ticker == order.ticker (NVDA == NVDA) ✅
        $4000 ≤ token.max_amount_usd ($4000) ✅
        → PASS

Step 8  ArmorClaw — Check 3 (Exposure)
        Portfolio concentration post-trade ~20% < 40% ✅
        Sector exposure (tech) post-trade ~50% < 60% ✅
        Daily spent $0 + $4000 = $4000 < $20000 ✅
        → PASS

Step 9  ArmorClaw — Check 4 (Regulatory/Temporal)
        Current time: 14:32 ET, Wednesday ✅ (within 09:30–16:00)
        No earnings announcement within ±2 days for NVDA ✅
        No recent wash-sale event ✅
        → PASS

Step 10 ArmorClaw — Check 5 (Data & Tool Access Audit)
        Request origin confirmed: Trader agent ✅
        No restricted data classes accessed ✅
        No unauthorized tool calls detected ✅
        File access within /data/agents/ scope ✅
        → PASS → decision: ALLOW

Step 11 ArmorClaw → Audit Log
        Writes ALLOW entry with SHA-256 proof_hash to SQLite.
        { decision: "ALLOW", rule_id: null, block_reason: null,
          proof_hash: "<sha256>", delegation_token_id: "<token_id>" }

Step 12 ArmorClaw → Alpaca Paper Trading API
        Forwards approved order: BUY NVDA $4000 (market order)
        Alpaca returns OrderConfirmation { order_id: "alp-xxx", status: "accepted" }

Step 13 Frontend Update
        ArmorClaw decision card renders: 🟢 ALLOW
        Audit log table shows new ALLOW entry
        Portfolio positions panel refreshes (NVDA position updated)
        Activity feed shows: "✅ Order accepted by Alpaca"
```

<!-- PART 1 END — CONTINUE IN PART 2 -->

---

## 9. Blocked Path Trace — BUY NVDA $8000

> **Scenario:** User clicks "Trigger blocked trade". The system attempts a BUY NVDA $8,000 order — deliberately designed to violate two ArmorClaw rules simultaneously.

```
Step 1  USER → Frontend
        User clicks "Trigger blocked trade" button.
        Frontend sends: POST /run-trade
        Body: { "action": "BUY", "ticker": "NVDA", "amount_usd": 8000 }

Step 2  FastAPI → LangGraph Orchestrator
        Orchestrator starts agent pipeline as normal.
        Activity feed shows: "▶ Analyst Agent starting..."

Step 3  Analyst Agent
        Calls market-data and research tools (permitted).
        Produces TradeProposal:
        {
          "action": "BUY", "ticker": "NVDA",
          "suggested_amount_usd": 8000,
          "rationale": "Strong breakout signal",
          "confidence_score": 0.78
        }

Step 4  Risk Agent
        Calls get_account → equity $48,000, daily spent $0
        Calls calculate_exposure → post-trade NVDA would be ~30%
        NOTE: Risk Agent approves from its own (limited) perspective
              because concentration looks acceptable at ~30%.
        Issues DelegationToken:
        {
          "approved_by": "RiskAgent", "action": "BUY",
          "ticker": "NVDA", "max_amount_usd": 8000,
          "expiry": "<now + 60s>", "handoff_count": 1,
          "sub_delegation_allowed": false
        }
        [Risk Agent is NOT the final authority — ArmorClaw holds the hard caps]

Step 5  Trader Agent
        Constructs OrderRequest for $8000, attaches token.
        Routes to ArmorClaw via alpaca-trading:execute tool.

Step 6  ArmorClaw — Check 1 (Intent Binding) ← 🔴 FIRST BLOCK
        Verify: order.amount_usd ($8000) ≤ max_order_usd ($5000)?
        → ❌ FAIL: $8000 > $5000

        Rule fired: [trade-size-limits]
        "Order amount $8,000 exceeds max_order_usd limit of $5,000
         declared in intent.json"

        Secondary violation also detected within Check 1:
        Rule fired: [intent-token-binding]
        "DelegationToken.max_amount_usd ($8,000) conflicts with
         intent.json max_order_usd ($5,000) — intent binding violated"

        → BLOCK immediately. Checks 2–5 are SKIPPED.

Step 7  ArmorClaw → Audit Log
        Writes BLOCK entry to SQLite:
        {
          "decision": "BLOCK",
          "rule_id": "trade-size-limits, intent-token-binding",
          "block_reason": "Order $8000 exceeds intent max_order_usd $5000;
                           token max_amount_usd also violates intent ceiling",
          "proof_hash": "<sha256 of entry>"
        }

Step 8  ArmorClaw → Trader Agent
        Returns BlockResult { allowed: false, rule_ids: [...], reason: "..." }
        Order is NOT forwarded to Alpaca. Nothing touches the brokerage.

Step 9  Frontend Update
        ArmorClaw decision card renders: 🔴 BLOCK
        Rule IDs shown: trade-size-limits | intent-token-binding
        Block reason displayed inline on the card.
        Audit log table shows BLOCK entry in red.
        Portfolio positions panel: UNCHANGED (no trade executed).
        Activity feed shows: "🚫 ArmorClaw blocked order — rule violations"
```

### Why These Two Rules Fire

| Rule | Why It Fires |
|------|-------------|
| `trade-size-limits` | The requested order of **$8,000 directly exceeds the $5,000 hard cap** in `intent.json`. This is an absolute limit, not a soft warning. |
| `intent-token-binding` | The delegation token itself has `max_amount_usd: 8000`, which **contradicts the intent ceiling**. ArmorClaw treats a token that exceeds intent limits as a potentially forged or misconfigured token — it's evidence that the agent pipeline produced an intent-violating token, which is itself a policy breach. |

---

## 10. Audit Log Schema

Every decision (ALLOW or BLOCK) produces one immutable audit log entry. Entries are append-only and each contains a `proof_hash` that chains to the previous entry (like a mini-blockchain).

| Field | Type | Description | Example Value |
|-------|------|-------------|---------------|
| `id` | `INTEGER` (auto PK) | Auto-incrementing row identifier | `42` |
| `timestamp` | `DATETIME` (ISO 8601 UTC) | Exact UTC time ArmorClaw made its decision | `"2024-01-15T14:30:05.123Z"` |
| `run_id` | `UUID v4` | Unique ID for the full agent pipeline run that produced this decision | `"a1b2c3d4-e5f6-..."` |
| `agent` | `VARCHAR(50)` | Name of the agent that submitted the order to ArmorClaw | `"TraderAgent"` |
| `tool` | `VARCHAR(100)` | Tool call that triggered the order submission | `"alpaca-trading:execute"` |
| `action` | `VARCHAR(10)` | Trade action requested | `"BUY"` or `"SELL"` |
| `ticker` | `VARCHAR(10)` | Ticker symbol of the requested trade | `"NVDA"` |
| `amount_usd` | `FLOAT` | Dollar amount of the requested order | `4000.00` |
| `decision` | `VARCHAR(10)` | ArmorClaw final decision | `"ALLOW"` or `"BLOCK"` |
| `rule_id` | `VARCHAR(255)` (nullable) | Comma-separated list of policy rule IDs that fired. NULL if ALLOW | `"trade-size-limits,intent-token-binding"` |
| `block_reason` | `TEXT` (nullable) | Human-readable explanation of why the order was blocked. NULL if ALLOW | `"Order $8000 exceeds max_order_usd $5000"` |
| `check_number` | `INTEGER` (nullable) | Which ArmorClaw check (1–5) failed first. NULL if ALLOW | `1` |
| `delegation_token_id` | `UUID v4` (nullable) | ID of the delegation token attached to the order | `"tok-uuid-..."` |
| `intent_token_id` | `VARCHAR(64)` | SHA-256 hash of the `intent.json` file at time of request | `"a3f9b2..."` |
| `proof_hash` | `VARCHAR(64)` | SHA-256 hash of (previous_proof_hash + all fields of this entry). Enables tamper detection | `"7c4d1e..."` |
| `alpaca_order_id` | `VARCHAR(100)` (nullable) | Alpaca order ID returned on ALLOW. NULL if BLOCK | `"alp-order-xyz"` |

---

## 11. Directory Structure

```
armorclaw-finance-orchestrator/
│
├── intent.json                        ← Immutable intent declaration (Layer 1)
├── ARCHITECTURE.md                    ← This document
├── .env                               ← Secret keys (never committed)
├── .env.example                       ← Template for .env
├── requirements.txt                   ← Python dependencies
├── README.md
│
├── backend/
│   ├── main.py                        ← FastAPI app entry point
│   ├── config.py                      ← Loads .env, validates intent.json
│   │
│   ├── agents/                        ← Layer 2: LangGraph / OpenClaw agents
│   │   ├── __init__.py
│   │   ├── orchestrator.py            ← LangGraph state machine + SSE streaming
│   │   ├── analyst_agent.py           ← Analyst: market-data + research tools
│   │   ├── risk_agent.py              ← Risk Agent: read-only tools + token issuance
│   │   ├── trader_agent.py            ← Trader: submits to ArmorClaw only
│   │   └── tools/
│   │       ├── market_data.py         ← market-data tool (price/OHLC)
│   │       ├── research.py            ← research tool (news/sentiment)
│   │       ├── account_tools.py       ← get_positions, get_account, calculate_exposure
│   │       └── trading_tool.py        ← alpaca-trading:execute (ArmorClaw-gated)
│   │
│   ├── armorclaw/                     ← Layer 3: Enforcement engine
│   │   ├── __init__.py
│   │   ├── engine.py                  ← Main 5-check enforcement loop
│   │   ├── checks/
│   │   │   ├── check1_intent.py       ← Intent binding verification
│   │   │   ├── check2_token.py        ← Delegation token validation
│   │   │   ├── check3_exposure.py     ← Exposure & concentration
│   │   │   ├── check4_regulatory.py   ← Market hours, blackouts, wash-sale
│   │   │   └── check5_audit.py        ← Data/tool access audit
│   │   ├── policy_rules.py            ← 14 named policy rule implementations
│   │   ├── token_factory.py           ← Delegation token issuance + signing
│   │   ├── token_validator.py         ← Token signature + field validation
│   │   └── audit_logger.py            ← Append-only SQLite audit log writer
│   │
│   ├── models/                        ← Pydantic schemas
│   │   ├── intent.py                  ← IntentConfig schema
│   │   ├── trade_proposal.py          ← TradeProposal schema
│   │   ├── delegation_token.py        ← DelegationToken schema
│   │   ├── order_request.py           ← OrderRequest schema (to ArmorClaw)
│   │   └── audit_entry.py             ← AuditLogEntry schema
│   │
│   ├── routes/                        ← FastAPI route handlers
│   │   ├── trade.py                   ← POST /run-trade
│   │   ├── logs.py                    ← GET /get-logs
│   │   └── positions.py               ← GET /get-positions
│   │
│   ├── alpaca/
│   │   ├── client.py                  ← Alpaca REST client wrapper
│   │   └── position_cache.py          ← 5s TTL in-memory position cache
│   │
│   └── db/
│       ├── database.py                ← SQLAlchemy engine + session factory
│       └── audit_log.sql              ← Schema DDL (auto-applied on startup)
│
├── frontend/                          ← React + Vite frontend
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── TradeTrigger.jsx       ← Allow/Block trade buttons
│       │   ├── AgentActivityFeed.jsx  ← Live SSE streaming panel
│       │   ├── ArmorClawDecision.jsx  ← Green/Red decision cards
│       │   ├── AuditLogTable.jsx      ← Real-time audit table
│       │   └── PositionsPanel.jsx     ← Portfolio positions display
│       ├── hooks/
│       │   ├── useTradeStream.js      ← SSE hook for agent activity
│       │   └── useAuditLog.js         ← Polling hook for audit log updates
│       └── api/
│           └── client.js              ← Axios/fetch wrapper for backend API
│
└── data/
    └── agents/                        ← Scoped data directory for agent file access
        ├── market_cache/
        └── research_cache/
```

---

## 12. API Endpoint Reference

### `POST /run-trade`

Triggers the full agent pipeline for a given trade instruction.

| Field | Detail |
|-------|--------|
| **Method** | `POST` |
| **Path** | `/run-trade` |
| **Content-Type** | `application/json` |

**Request Body:**
```json
{
  "action": "BUY",
  "ticker": "NVDA",
  "amount_usd": 4000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `string` | ✅ | `"BUY"` or `"SELL"` |
| `ticker` | `string` | ✅ | Must be in authorized_tickers |
| `amount_usd` | `float` | ✅ | Order size in USD |

**Response (200 OK — pipeline started):**
```json
{
  "run_id": "a1b2c3d4-...",
  "status": "pipeline_started",
  "message": "Agent pipeline initiated. Connect to SSE stream for live updates.",
  "sse_url": "/run-trade/stream/a1b2c3d4-..."
}
```

---

### `GET /run-trade/stream/{run_id}`

Server-Sent Events stream for live agent activity of a specific run.

| Field | Detail |
|-------|--------|
| **Method** | `GET` |
| **Path** | `/run-trade/stream/{run_id}` |
| **Response Content-Type** | `text/event-stream` |

**SSE Event Format:**
```
event: agent_activity
data: {"agent": "AnalystAgent", "status": "running", "message": "Fetching NVDA market data..."}

event: armorclaw_decision
data: {"decision": "ALLOW", "rule_id": null, "amount_usd": 4000, "ticker": "NVDA"}

event: done
data: {"run_id": "a1b2c3d4-...", "final_status": "ALLOW"}
```

---

### `GET /get-logs`

Returns paginated audit log entries, newest first.

| Field | Detail |
|-------|--------|
| **Method** | `GET` |
| **Path** | `/get-logs` |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `int` | `50` | Max entries to return |
| `offset` | `int` | `0` | Pagination offset |
| `decision` | `string` | `null` | Filter by `"ALLOW"` or `"BLOCK"` |

**Response (200 OK):**
```json
{
  "total": 142,
  "entries": [
    {
      "id": 42,
      "timestamp": "2024-01-15T14:30:05.123Z",
      "run_id": "a1b2c3d4-...",
      "agent": "TraderAgent",
      "action": "BUY",
      "ticker": "NVDA",
      "amount_usd": 4000.00,
      "decision": "ALLOW",
      "rule_id": null,
      "block_reason": null,
      "proof_hash": "7c4d1e..."
    }
  ]
}
```

---

### `GET /get-positions`

Returns current Alpaca paper trading positions.

| Field | Detail |
|-------|--------|
| **Method** | `GET` |
| **Path** | `/get-positions` |

**Response (200 OK):**
```json
{
  "positions": [
    {
      "symbol": "NVDA",
      "qty": "10",
      "market_value": "8450.00",
      "unrealized_pl": "200.00",
      "current_price": "845.00",
      "cost_basis": "8250.00"
    }
  ],
  "total_equity": "48000.00",
  "cached_at": "2024-01-15T14:30:00Z"
}
```

---

## 13. Frontend Component Tree

```
App.jsx                          ← Root component; manages global state and layout
│
├── Header.jsx                   ← App title, system status indicator (online/offline)
│
├── TradeTrigger.jsx             ← Two-button panel to start allowed or blocked trade runs
│   ├── AllowButton.jsx          ← Sends POST /run-trade with valid $4000 NVDA BUY payload
│   └── BlockButton.jsx          ← Sends POST /run-trade with violating $8000 NVDA BUY payload
│
├── AgentActivityFeed.jsx        ← Connects to SSE stream; renders agent step timeline
│   ├── ActivityItem.jsx         ← Single agent step: icon + agent name + message + timestamp
│   └── StreamStatusBadge.jsx    ← Shows "Streaming..." / "Complete" / "Error" connection state
│
├── ArmorClawDecision.jsx        ← Renders latest ArmorClaw outcome as a large decision card
│   ├── AllowCard.jsx            ← Green card: shows ticker, amount, order ID on ALLOW
│   └── BlockCard.jsx            ← Red card: shows rule_id(s) and block_reason on BLOCK
│
├── AuditLogTable.jsx            ← Paginated, auto-refreshing table of all audit log entries
│   ├── LogRow.jsx               ← Single log row; row background green=ALLOW, red=BLOCK
│   ├── LogFilters.jsx           ← Dropdown to filter by decision (ALL / ALLOW / BLOCK)
│   └── Pagination.jsx           ← Previous/Next page controls
│
└── PositionsPanel.jsx           ← Displays current Alpaca portfolio positions
    ├── PositionCard.jsx         ← Single stock card: symbol, qty, value, P&L indicator
    └── RefreshButton.jsx        ← Manual refresh trigger for positions (GET /get-positions)
```

---

## 14. Setup & Run Instructions

> **You're new to this — here is a complete, step-by-step beginner guide.**

---

### Step 0 — What You're Installing

| Technology | What It Is | Why You Need It |
|------------|-----------|-----------------|
| **Python 3.11+** | Programming language | Runs the backend agents and ArmorClaw |
| **LangGraph** | Framework for building AI agent pipelines | Powers the Analyst, Risk, and Trader agents |
| **OpenClaw / ArmorClaw SDK** | Safety enforcement library | The 5-check engine that gates all trades |
| **FastAPI** | Python web framework | Serves the 3 API endpoints |
| **Gemini 2.5 Flash** | LLM powering the agents (free tier) | The intelligence layer for all three agents |
| **Alpaca Paper Trading** | Free fake-money trading API | Executes simulated trades (no real money) |
| **Node.js + npm** | JavaScript runtime | Runs the React/Vite frontend |
| **React + Vite** | Frontend framework | The UI dashboard |

> **Multi-LLM Support:** The system uses LangChain's provider abstraction, so you can swap the LLM by changing two lines of code and one `.env` variable. See the [Multi-LLM Support](#multi-llm-support) section for all supported providers.

---

### Step 1 — Install Prerequisites

#### Python 3.11+
```bash
# Windows: Download from https://www.python.org/downloads/
# During install: CHECK "Add Python to PATH" checkbox!
python --version   # Should show Python 3.11.x or higher
```

#### Node.js (v18+)
```bash
# Download from https://nodejs.org/en/download  (choose LTS version)
node --version   # Should show v18.x or higher
npm --version
```

#### Git
```bash
# Download from https://git-scm.com/downloads
git --version
```

---

### Step 2 — Get Alpaca Paper Trading API Keys (Free, No Real Money)

```
1. Go to: https://alpaca.markets/
2. Click "Get started for free" → sign up with email
3. After logging in, go to: https://app.alpaca.markets/paper/dashboard/overview
   (Make sure the toggle at the top left says PAPER, not LIVE)
4. Click "Generate API Keys" in the top-right corner
5. Copy and save your:
   ALPACA_API_KEY    (looks like: PKXXXXXXXXXXXXXXXX)
   ALPACA_SECRET_KEY (a long random string)
6. The correct base URL for paper trading is:
   https://paper-api.alpaca.markets
```

---

### Step 3 — Get a Google Gemini API Key (Free Tier)

AuraTrade defaults to **Gemini 2.5 Flash** — which has a generous **free tier** via Google AI Studio. No credit card required.

```
1. Go to: https://aistudio.google.com/
2. Sign in with your Google account
3. Click "Get API key" in the top-left sidebar
4. Click "Create API key in new project"
5. Copy your GEMINI_API_KEY (looks like: AIzaSy...)

Free tier limits (as of 2025):
  - 15 requests per minute
  - 1,500 requests per day
  - 1 million tokens per minute
  → More than enough for AuraTrade development and testing
```

> **Want to use a different LLM?** See the [Multi-LLM Support](#multi-llm-support) section — you can use OpenAI, Anthropic Claude, Groq, Mistral, or any other LangChain-supported provider by changing two lines and one `.env` key.

---

### Step 4 — Clone & Set Up the Project

```powershell
# Open PowerShell and run:
git clone https://github.com/your-org/armorclaw-finance-orchestrator.git
cd armorclaw-finance-orchestrator

# Create a Python virtual environment (isolates dependencies)
python -m venv .venv

# Activate it (Windows PowerShell):
.venv\Scripts\Activate.ps1

# If you get an execution policy error on Windows, run this first:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# You should now see (.venv) at the start of your prompt
```

---

### Step 5 — Install Python Dependencies

```bash
# With .venv active, from the project root:
pip install -r requirements.txt
```

**Full `requirements.txt`:**
```txt
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
langgraph>=0.1.0
langchain>=0.1.0
langchain-google-genai>=1.0.0     # Gemini 2.5 Flash (default)
langchain-openai>=0.0.5            # Optional: if switching to OpenAI
langchain-anthropic>=0.1.0         # Optional: if switching to Claude
langchain-groq>=0.1.0              # Optional: if switching to Groq
alpaca-trade-api>=3.0.0
sqlalchemy>=2.0.0
pydantic>=2.0.0
python-dotenv>=1.0.0
httpx>=0.26.0
google-generativeai>=0.5.0         # Gemini SDK
```

**Installing OpenClaw / ArmorClaw SDK:**

> OpenClaw is the open-source multi-agent orchestration layer. ArmorClaw is the enforcement SDK built on top of it. They are installed as a single package:

```bash
# Option A: If published to PyPI
pip install armorclaw-sdk

# Option B: Install directly from GitHub (if not on PyPI yet)
pip install git+https://github.com/armorclaw/armorclaw-sdk.git

# Verify installation
python -c "import armorclaw; print(armorclaw.__version__)"
```

**What OpenClaw gives you:**
- `OpenClawAgent` class — wraps a LangGraph node with tool permission enforcement
- `Role` enum — `ANALYST`, `RISK`, `TRADER` with pre-configured tool allowlists
- `OpenClawOrchestrator` — state machine runner with ArmorClaw integration
- `ToolAccessDeniedError` — raised automatically if an agent calls a forbidden tool

---

### Step 6 — Configure Environment Variables

```powershell
# In the project root, copy the example file:
copy .env.example .env

# Open .env in Notepad (or any editor) and fill in your real values:
notepad .env
```

**Complete `.env` file:**
```env
# ── Alpaca Paper Trading ──────────────────────────────────
ALPACA_API_KEY=PKXXXXXXXXXXXXXXXX
ALPACA_SECRET_KEY=your_alpaca_secret_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# ── LLM Provider (default: Gemini 2.5 Flash — FREE) ──────
# Get your free key at: https://aistudio.google.com/
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
LLM_PROVIDER=gemini                 # Options: gemini | openai | anthropic | groq
LLM_MODEL=gemini-2.5-flash-preview  # The specific model to use

# ── Optional: Other LLM providers (uncomment if switching) ─
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── ArmorClaw / System Security ──────────────────────────
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
ARMORCLAW_SECRET_KEY=paste_your_generated_32_char_hex_here
INTENT_FILE_PATH=./intent.json

# ── Database ─────────────────────────────────────────────
DATABASE_URL=sqlite:///./auratrade_audit.db

# ── FastAPI Server ────────────────────────────────────────
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173
```

**Generate `ARMORCLAW_SECRET_KEY`:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Copy the output and paste it into .env
```

---

### Step 7 — Install Frontend Dependencies

```powershell
cd frontend
npm install
cd ..
```

---

### Step 8 — Start the Backend

```powershell
# From project root, with .venv active:
uvicorn backend.main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     AuraTrade backend started
INFO:     intent.json loaded and hash verified ✓
INFO:     ArmorClaw engine initialized — 14 policy rules active ✓
INFO:     SQLite audit log ready at auratrade_audit.db ✓
```

Test the API is working:
```powershell
# In a new terminal:
curl http://localhost:8000/get-positions
# Expected: {"positions":[],"total_equity":"100000.00",...}
```

---

### Step 9 — Start the Frontend

```powershell
# In a new terminal (from project root):
cd frontend
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 312 ms
  ➜  Local:   http://localhost:5173/
```

Open your browser at: **http://localhost:5173**

---

### Step 10 — Test the Full System

| Test | Button | Expected Result |
|------|--------|----------------|
| Happy path | "Run allowed trade" | 🟢 ALLOW card, new row in audit log, NVDA position appears |
| Blocked path | "Trigger blocked trade" | 🔴 BLOCK card, `trade-size-limits` rule shown, positions unchanged |

---

### Troubleshooting Table

| Problem | Fix |
|---------|-----|
| `cannot import name 'armorclaw'` | Run `pip install armorclaw-sdk` with `.venv` active |
| `403 Forbidden from Alpaca` | Your API key is for LIVE trading — switch to PAPER keys |
| `CORS error in browser console` | Confirm `CORS_ORIGINS=http://localhost:5173` in `.env` exactly |
| `intent.json hash mismatch` | You edited `intent.json` after startup — restart the backend |
| PowerShell execution policy error | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Frontend shows blank page | Run `npm install` inside the `frontend/` folder |
| `ModuleNotFoundError: No module named 'dotenv'` | Run `pip install python-dotenv` with `.venv` active |

---

## 15. Security Assumptions & Limitations

### ✅ What This System Protects Against

- **Oversized individual orders** — Hard `max_order_usd: $5,000` cap enforced by ArmorClaw Check 1; no agent can bypass this regardless of what it proposes
- **Daily spend overrun** — Cumulative daily spend tracked per calendar day; blocked once `$20,000` is reached
- **Unauthorized tickers** — Trades for tickers not in `[NVDA, AAPL, GOOGL, MSFT]` are blocked at the first check
- **Intent tampering** — If `intent.json` is modified after startup, the hash mismatch blocks all subsequent orders
- **Token forgery** — HMAC-SHA256 signed delegation tokens; any tampered token fails signature verification
- **Token replay attacks** — Used token IDs are tracked in memory; a replayed token is rejected immediately
- **Token relay/chain attacks** — `handoff_count == 1` and `sub_delegation_allowed: false` prevent multi-hop delegation
- **Agent privilege escalation** — Tool bindings enforced by LangGraph's registry; unauthorized tool calls raise errors before reaching any API
- **Off-hours trading** — NYSE market hours enforced by Check 4 (09:30–16:00 ET, Mon–Fri)
- **Portfolio overconcentration** — Single-ticker (40%) and sector (60%) concentration limits prevent dangerous position buildup
- **Audit log tampering** — SHA-256 proof hash chaining means modifying any past entry invalidates all subsequent hashes

### ⚠️ What This System Explicitly Does NOT Cover

- **Real money risk** — This is **paper trading only**. It has NOT been audited for real-capital deployment. Never connect live Alpaca credentials.
- **Secure secret management** — `.env` stores secrets in plaintext. Production requires AWS Secrets Manager, HashiCorp Vault, or equivalent.
- **Prompt injection** — Malicious content in market data or news that manipulates an agent's reasoning is not caught by ArmorClaw, which only evaluates final order payloads.
- **LLM analytical errors** — If the LLM produces a wrong valuation or flawed rationale, ArmorClaw cannot detect it — only structural rule violations are caught.
- **Multi-instance / distributed safety** — The `used_tokens` set is in-memory. Running multiple backend instances without shared Redis creates token replay windows.
- **Network-level security** — No mTLS, no request signing between internal services, no API rate limiting in this reference implementation.
- **Full regulatory compliance** — The earnings-blackout and wash-sale rules are simplified approximations, not SEC-compliant legal implementations.
- **Market and execution risk** — The system enforces policy rules but does not model slippage, liquidity, volatility, or real-world execution risk.
- **User authentication** — The frontend has no login/auth. Anyone who can reach `localhost:5173` can trigger trades. Add OAuth2/JWT before any deployment.
- **Token persistence across restarts** — The in-memory `used_tokens` set is cleared on restart, creating a brief window where recently used tokens could be replayed.
- **Earnings data freshness** — The blackout window check depends on an external earnings calendar. If that source is stale or wrong, the check may pass erroneously.

---

## How OpenClaw Works — A Beginner's Visual Guide

```
Traditional LangGraph Agent:          OpenClaw-Wrapped Agent:
────────────────────────────          ──────────────────────────────────────────
Agent sees all tools ever             Agent DECLARES its role upfront
registered in the graph.   →          OpenClaw reads that declaration and
Agent calls any tool                   BLOCKS any tool call not in the allowlist
it "wants" to call.                    before the LLM can execute it.
No built-in logging.                   Every allowed tool call is logged for audit.
```

**Registering an OpenClaw agent — using Gemini 2.5 Flash (simplified code):**
```python
from openclaw import OpenClawAgent, Role
from langchain_google_genai import ChatGoogleGenerativeAI

# Create the Gemini LLM (reads GEMINI_API_KEY from environment automatically)
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-preview",
    google_api_key=os.environ["GEMINI_API_KEY"]
)

analyst = OpenClawAgent(
    name="AnalystAgent",
    role=Role.ANALYST,
    llm=llm,  # ← Gemini 2.5 Flash
    allowed_tools=["market-data", "research"],  # Only these two tools allowed
    system_prompt="You are a market analyst. Propose trades based on data only."
)
# If analyst tries to call get_positions → ToolAccessDeniedError is raised automatically
```

**Learning Resources:**

| Resource | URL |
|----------|-----|
| **Gemini AI Studio (free API key)** | https://aistudio.google.com/ |
| **Gemini 2.5 Flash docs** | https://ai.google.dev/gemini-api/docs/models/gemini |
| LangChain Google GenAI integration | https://python.langchain.com/docs/integrations/chat/google_generative_ai |
| LangGraph beginner tutorial | https://langchain-ai.github.io/langgraph/tutorials/introduction/ |
| LangGraph official docs | https://langchain-ai.github.io/langgraph/ |
| Alpaca paper trading quickstart | https://docs.alpaca.markets/docs/getting-started |
| FastAPI tutorial (beginner) | https://fastapi.tiangolo.com/tutorial/ |
| React + Vite getting started | https://vitejs.dev/guide/ |
| Pydantic v2 docs | https://docs.pydantic.dev/latest/ |

---

## Multi-LLM Support

AuraTrade is **LLM-agnostic**. The three agents (Analyst, Risk, Trader) are built on LangChain's chat model interface, which means you can swap the underlying LLM by:
1. Installing the provider's LangChain package
2. Changing the LLM object in `backend/config.py`
3. Setting the API key in `.env`

**Nothing else changes** — ArmorClaw, tool bindings, and the audit log are all LLM-independent.

### Supported Providers at a Glance

| Provider | Model | Free Tier? | `.env` Key | pip package |
|----------|-------|-----------|-----------|-------------|
| **Google Gemini** *(default)* | `gemini-2.5-flash-preview` | ✅ Yes — 1500 req/day | `GEMINI_API_KEY` | `langchain-google-genai` |
| OpenAI | `gpt-4o`, `gpt-4o-mini` | ❌ No (pay-per-use) | `OPENAI_API_KEY` | `langchain-openai` |
| Anthropic Claude | `claude-3-5-sonnet-latest` | ❌ No (pay-per-use) | `ANTHROPIC_API_KEY` | `langchain-anthropic` |
| Groq (ultra-fast) | `llama-3.3-70b-versatile` | ✅ Yes — free tier | `GROQ_API_KEY` | `langchain-groq` |
| Mistral | `mistral-large-latest` | ❌ No (pay-per-use) | `MISTRAL_API_KEY` | `langchain-mistralai` |
| Ollama (local, no API) | `llama3.2`, `mistral`, etc. | ✅ Completely free | None | `langchain-ollama` |

### How to Switch — Step by Step

**Example: Switching from Gemini → Groq (also free)**

**Step 1 — Install the package:**
```bash
pip install langchain-groq
```

**Step 2 — Update `.env`:**
```env
# Comment out Gemini:
# GEMINI_API_KEY=...

# Add Groq:
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
```

**Step 3 — `backend/config.py` reads the provider and returns the right LLM:**
```python
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_groq import ChatGroq

def get_llm():
    """Factory: returns the LLM configured in .env. Agents call this."""
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    model    = os.getenv("LLM_MODEL", "gemini-2.5-flash-preview")

    if provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=os.environ["GEMINI_API_KEY"]
        )
    elif provider == "openai":
        return ChatOpenAI(
            model=model,
            api_key=os.environ["OPENAI_API_KEY"]
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            model=model,
            api_key=os.environ["ANTHROPIC_API_KEY"]
        )
    elif provider == "groq":
        return ChatGroq(
            model=model,
            api_key=os.environ["GROQ_API_KEY"]
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
```

**Step 4 — All agents use `get_llm()` — no other changes needed:**
```python
# In analyst_agent.py, risk_agent.py, trader_agent.py:
from backend.config import get_llm

llm = get_llm()  # ← automatically uses whatever is in .env

analyst = OpenClawAgent(
    name="AnalystAgent",
    role=Role.ANALYST,
    llm=llm,         # ← works with ANY provider
    ...
)
```

### Why Gemini 2.5 Flash is the Default

| Reason | Detail |
|--------|--------|
| **Free to use** | 1,500 requests/day, no credit card, no billing setup |
| **Fast** | Flash variant is optimized for low-latency responses |
| **Long context** | 1M token context window (handles large market data dumps) |
| **Tool calling** | Native function/tool calling support — required for LangGraph agents |
| **Beginner-friendly** | Google AI Studio signup is simple — no waitlist, immediate access |

> **Important:** Regardless of which LLM you choose, ArmorClaw's enforcement is **100% deterministic and LLM-independent**. The LLM only produces a trade proposal — ArmorClaw always makes the final allow/block decision using hard-coded rules.

---

*Architecture version 1.0 — AuraTrade*
