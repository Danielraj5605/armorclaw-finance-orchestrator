# Modular Autonomous Trading Architecture
## Zero-Trust Multi-Agent System Design

**Document Version:** 1.0  
**Date:** Q1 2026  
**Classification:** Architecture & Design  
**Audience:** System architects, compliance engineers, trading operations teams

---

## Executive Summary

This document describes a **three-tier autonomous trading agent architecture** engineered on zero-trust security principles. The system enforces strict role separation between intelligence (analysis), risk governance, and execution—with policy enforcement **orthogonal** to agent logic.

**Core Design Philosophy:**
- Agents propose trades; they never execute them
- A dedicated enforcement layer (ArmorClaw) is the sole authorization authority
- Policy rules are declarative, external to agent code
- Every order undergoes cryptographic validation and audit
- Read-only separation prevents information leakage and unintended execution

**Architecture Layers:**
```
User Intent
    ↓
[Analytics → Risk → Trader] Agents (reasoning only)
    ↓
ArmorClaw Enforcement (authorization & policy validation)
    ↓
Broker API (Alpaca) — executes only approved orders
```

---

## 1. Three-Agent Architecture

### 1.1 Agent Roles & Responsibilities

#### **Analytics Agent (Market Intelligence)**

**Role:** Perform market analysis, identify trade opportunities, and propose trading actions based on quantitative and qualitative signals.

**Authority:**
- Read-only access to market data tools
- No portfolio access
- No execution capability
- Cannot influence downstream decisions directly

**Operational Scope:**
- Ticker universe is predetermined and immutable (`authorized_tickers` in intent)
- Proposes trades with confidence scores and justification
- Emits recommendations without expecting obligate execution

**Tools Available:**
```
market-data(ticker) → {price, OHLC, volume, % change}
research(ticker)    → {headline, sentiment_score, rating}
```

**Decision Inputs:**
- Real-time price and volume data
- Historical price trends (if available)
- News sentiment and fundamental catalysts
- Configurable thresholds for signal strength (e.g., sentiment > 0.3 = BUY)

**Output Format:**
```json
{
  "proposal_id": "uuid",
  "action": "BUY" | "SELL",
  "ticker": "NVDA",
  "rationale": "AI chip demand surge; analyst upgrades",
  "confidence": 0.82,
  "suggested_amount_usd": 5000,
  "market_context": {
    "current_price": 875.40,
    "sentiment": 0.81,
    "volume_trend": "increasing"
  }
}
```

---

#### **Risk Agent (Portfolio Governance & Delegated Authority)**

**Role:** Validate proposed trades against portfolio constraints, calculate exposure limits, and issue cryptographically-signed delegation tokens that authorize the Trader Agent.

**Authority:**
- Read-only access to portfolio and account data
- **Cannot execute trades** (all execution tools forbidden)
- Issues delegation tokens with explicit scopes (action, ticker, amount, expiry)
- Enforces policy rules: concentration limits, sector exposure, position sizing

**Core Responsibility: Gatekeeping Execution**

The Risk Agent is the **only entity authorized to issue delegation tokens**. A token consists of:
- The proposed action (BUY/SELL)
- Target ticker
- Maximum amount in USD
- Time-to-live (TTL, typically 60 seconds)
- Cryptographic signature (HMAC-SHA256)
- Nonce for replay prevention

**Tools Available:**
```
get_positions()             → {holdings, market_value, P&L}
get_account()               → {equity, cash, buying_power}
calculate_exposure(ticker, amount) → {post_trade_concentration, sector_exposure}
```

**Decision Logic:**

The Risk Agent applies cascading validation rules:

1. **Portfolio Concentration Limit**
   ```
   post_trade_allocation = (order_amount + current_position) / portfolio_value
   if post_trade_allocation > 40% → REJECT
   ```

2. **Sector Exposure Limit**
   ```
   tech_tickers = {NVDA, AAPL, GOOGL, MSFT, AMZN, META, TSLA}
   if ticker in tech_tickers:
     tech_allocation = sum(tech_holdings) / portfolio_value
     if tech_allocation > 60% → REJECT
   
   if ticker in {BTC/USD, ETH/USD}:  # crypto
     if crypto_allocation > 20% → REJECT
   ```

3. **Daily Aggregate Spend Ceiling**
   ```
   daily_spent = sum(all orders today)
   if daily_spent + amount_usd > max_daily_usd → REJECT
   ```

4. **Single Order Size Ceiling**
   ```
   if amount_usd > max_order_usd → REJECT
   ```

**Output: Delegation Token**

```json
{
  "token_id": "uuid",
  "approved_by": "RiskAgent",
  "action": "BUY",
  "ticker": "NVDA",
  "max_amount_usd": 5000,
  "issued_at": "2026-04-04T14:32:15.123Z",
  "expiry": "2026-04-04T14:33:15.123Z",
  "handoff_count": 1,
  "sub_delegation_allowed": false,
  "intent_token_id": "parent_intent_uuid",
  "signature": "hmac_sha256_hex_digest"
}
```

**Rejection Response (when rules fail):**
```json
{
  "approved": false,
  "reason": "Post-trade {ticker} concentration 52% exceeds 40% limit",
  "blocked_rules": ["portfolio-concentration-limit"],
  "remediation": "Reduce order size to <3500 USD or close existing position"
}
```

---

#### **Trader (Execution) Agent**

**Role:** Accept delegation tokens from the Risk Agent and submit approved orders to ArmorClaw for final enforcement, then to Alpaca for broker execution.

**Authority:**
- Only tool: `alpaca-trading:execute`
- Cannot read portfolio, positions, or account details
- Cannot issue its own authorization; **must** receive delegation token from Risk Agent
- Cannot modify or bypass delegation token constraints

**Operational Constraints:**
- **Information asymmetry by design:** Trader does not have visibility into portfolio state
- Must operate on trust in the delegation token
- Each execution request must include the token in the request envelope
- All execution attempts are logged and audited

**Tools Available:**
```
alpaca-trading:execute(token, action, ticker, amount_usd, market_or_limit)
  → {order_id, status, created_at, filled_qty, avg_price} | ERROR
```

**Execution Flow:**

1. **Receive Delegation Token** from Risk Agent
2. **Construct Alpaca Order Request:**
   ```json
   {
     "delegation_token": {...},        # token from Risk Agent
     "run_id": "execution_uuid",
     "action": "BUY",
     "ticker": "NVDA",
     "amount_usd": 5000,
     "order_type": "market",           # or "limit" with price
     "submitting_agent": "TraderAgent",
     "intent_token_id": "parent_intent_uuid"
   }
   ```

3. **Submit to ArmorClaw** (not directly to Alpaca)
   - ArmorClaw performs 5 sequential checks (see Section 4)
   - If all checks pass: forward to Alpaca
   - If any check fails: reject with audit trail

4. **Alpaca Response Processing:**
   - Capture order_id, filled_qty, execution_price
   - Store execution result in audit log
   - Report status back to orchestrator

**Non-Negotiable Constraints:**
- **Cannot re-execute if token expires** (typcal TTL 60 seconds)
- **Cannot execute amount > token max_amount_usd**
- **Cannot change action or ticker from token**
- **Must include immutable intent_token_id in request**

---

### 1.2 Agent Isolation & Tool Restrictions

| Agent | Tools Allowed | Tools Forbidden |
|-------|---|---|
| **Analytics** | `market-data`, `research` | `get_positions`, `alpaca-trading:*`, `modify_account` |
| **Risk** | `get_positions`, `get_account`, `calculate_exposure` | `alpaca-trading:*`, `research`, `modify_account` |
| **Trader** | `alpaca-trading:execute` | `get_positions`, `get_account`, `research` |

**Enforcement Mechanism:** Policy rule `tool_restrictions(agent, tools_used)` validates every tool call against the allowed set. Any violation → **immediate audit event + rejection**.

---

## 2. Decision Rules by Agent

### 2.1 Analytics Agent Decision Rules

The Analytics Agent does **not** enforce rules; it **proposes** based on signals. Rules are suggestions, not hard constraints—the Risk Agent enforces hard limits.

**Built-in Signal Logic:**

```python
def should_buy(ticker, sentiment, price_trend):
    # Sentiment-driven decision (customizable thresholds)
    if sentiment > 0.3:
        confidence = min(0.95, 0.5 + sentiment)  # cap at 0.95
        return True, confidence
    
    # Price momentum (if data available)
    if price_trend == "uptrend" and sentiment > 0.0:
        return True, 0.65
    
    return False, 0.0

def should_sell(ticker, sentiment, news_impact):
    if sentiment < -0.2:
        confidence = min(0.95, 0.5 - abs(sentiment))
        return True, confidence
    
    if news_impact == "negative_catalyst":
        return True, 0.70
    
    return False, 0.0
```

**Proposal Confidence Scoring:**
- Range: `[0.0, 1.0]`
- Combines: `base_signal × sentiment_weight × trend_multiplier`
- Used for UI display and optionally for sizing (lower confidence → smaller position)

**No Binding Decision Authority:** The Analytics Agent's recommendation does not obligate execution. The Risk Agent makes the binding decision.

---

### 2.2 Risk Agent Decision Rules (14 Named Policy Rules)

The Risk Agent is the **decision gate**. It evaluates the Trade Proposal against 14 named policy rules, organized in 5 sequential checks.

#### **Policy Rule Set**

**Rule 1: ticker-universe-restriction**
```python
authorized_tickers = intent.get("authorized_tickers")
if ticker not in authorized_tickers:
    → REJECT: "Ticker {ticker} not in authorized universe"
```
**Purpose:** Prevent accidental or malicious orders on unauthorized instruments.

---

**Rule 2: trade-size-limits**
```python
max_order_usd = intent.get("max_order_usd", 5000)
max_daily_usd = intent.get("max_daily_usd", 20000)
daily_spent = sum(executed_orders_today)

if amount_usd > max_order_usd:
    → REJECT: "Order ${amount_usd} exceeds max_order_usd ${max_order_usd}"

if daily_spent + amount_usd > max_daily_usd:
    → REJECT: "Daily spend would exceed ${max_daily_usd}"
```
**Purpose:** Prevent runaway losses from cascading bad decisions.

---

**Rule 3: portfolio-concentration-limit**
```python
post_trade_pct = (order_amount + existing_position) / portfolio_value
if post_trade_pct > 40%:
    → REJECT: "Concentration {pct}% exceeds 40% limit"
```
**Purpose:** Enforce portfolio diversification; prevent single-stock blow-up risk.

---

**Rule 4: sector-exposure-limit**
```python
tech_tickers = {NVDA, AAPL, GOOGL, MSFT, AMZN, META, TSLA}
tech_exposure = sum(tech_holdings) / portfolio_value

if ticker in tech_tickers and tech_exposure > 60%:
    → REJECT: "Tech sector exposure {pct}% exceeds 60% limit"

crypto_exposure = sum(crypto_holdings) / portfolio_value
if ticker in {BTC/USD, ETH/USD} and crypto_exposure > 20%:
    → REJECT: "Crypto exposure {pct}% exceeds 20% limit"
```
**Purpose:** Prevent over-concentration in macro risk factors (sector, asset class).

---

**Rule 5: market-hours-only**
```python
if ticker in {BTC/USD, ETH/USD}:
    → PASS (crypto trades 24/7)

current_time_et = datetime.now(timezone=ET)
if current_time_et.weekday >= 5:  # weekend
    → REJECT: "Market closed — weekend"

if not (09:30 ≤ current_time_et.time ≤ 16:00):
    → REJECT: "Market closed — current time outside 09:30–16:00 ET"
```
**Purpose:** Prevent orders during illiquid market hours (except crypto).

---

**Rule 6: earnings-blackout-window**
```python
# Requires live earnings calendar (not available in paper trading demo)
# In production: cross-reference with earnings database
if ticker_earnings_within_24h(ticker):
    → REJECT: "Earnings announcement within 24h; trading blackout active"
```
**Purpose:** Avoid gap risk from earnings surprises.

---

**Rule 7: wash-sale-prevention**
```python
recent_sells = get_sells(ticker, lookback_days=31)
if action == "BUY" and recent_sells exist:
    realized_loss = sum([s.loss for s in recent_sells if s.loss < 0])
    if realized_loss > 0:
        → REJECT: "Wash sale — cannot rebuy within 30 days of loss"
```
**Purpose:** Enforce IRS wash sale rules (paper trading demo simplified).

---

**Rule 8: data-class-protection**
```python
# Simplified in demo; production requires data classification system
if data_is_restricted():
    → REJECT: "Cannot trade on restricted data source"
```
**Purpose:** Prevent material non-public information violations.

---

**Rule 9: directory-scoped-access**
```python
# Enforce that orders only touch authorized accounts/brokers
if (request_account_id != authorized_account_id):
    → REJECT: "Request references unauthorized account"
```
**Purpose:** Prevent cross-user or cross-account violations.

---

**Rule 10: tool-restrictions**
```python
allowed_tools = {
    "AnalystAgent": {"market-data", "research"},
    "RiskAgent": {"get_positions", "get_account", "calculate_exposure"},
    "TraderAgent": {"alpaca-trading:execute"},
}

for tool in tools_used_in_request:
    if tool not in allowed_tools[submitting_agent]:
        → REJECT: "{agent} called forbidden tool '{tool}'"
```
**Purpose:** Enforce strict tool separation; prevent privilege escalation.

---

**Rule 11: delegation-scope-enforcement**
```python
token = delegation_token

if token.action != order_action:
    → REJECT: "Token action {token.action} ≠ order action {order_action}"

if token.ticker != order_ticker:
    → REJECT: "Token ticker {token.ticker} ≠ order ticker {order_ticker}"

if order_amount > token.max_amount_usd:
    → REJECT: "Order ${order_amount} > token max ${token.max_amount_usd}"

if datetime.now() > token.expiry:
    → REJECT: "Token expired at {token.expiry}"

if token.token_id in used_tokens:  # replay protection
    → REJECT: "Token already used (replay attack)"
```
**Purpose:** Enforce cryptographic scope binding; prevent token reuse or modification.

---

**Rule 12: agent-role-binding**
```python
if submitting_agent != "TraderAgent":
    → REJECT: "Orders must originate from TraderAgent, got {submitting_agent}"
```
**Purpose:** Prevent unauthorized agents from executing trades.

---

**Rule 13: intent-token-binding**
```python
# Parent intent establishes immutable context
request_intent_id = request.get("intent_token_id")
loaded_intent_id = intent.get("intent_token_id")

if request_intent_id != loaded_intent_id:
    → REJECT: "intent_token_id mismatch — possible tampering or wrong intent"
```
**Purpose:** Ensure all requests belong to the same immutable intent context.

---

**Rule 14: risk-agent-read-only**
```python
forbidden_write_tools = {
    "alpaca-trading:execute",
    "place_order",
    "modify_order",
    "cancel_order"
}

if agent == "RiskAgent":
    for tool in tools_used:
        if tool in forbidden_write_tools:
            → REJECT: "RiskAgent called write tool {tool} — violates read-only"
```
**Purpose:** Physically prevent Risk Agent from placing or modifying orders (defense in depth).

---

---

## 3. Validation Checkpoints Between Agents

The system enforces **five sequential checkpoint layers** before any order reaches the broker. Each checkpoint is **atomic**—all rules in a checkpoint must pass; a single failure blocks the entire trade.

### 3.1 Checkpoint Architecture

```
Trade Proposal (from Analyst)
    ↓
    ┌─────────────────────────────────────┐
    │ CHECK 1: Intent Binding & Universe  │
    │ (ticker universe, size limits, intent binding)
    │ Risk Agent validates...              │
    └─────────────────────────────────────┘
    ↓ PASS → Issues delegation token
    │ FAIL → Return error to CLI
    ↓
    ┌─────────────────────────────────────┐
    │ CHECK 2: Token Validation           │
    │ (expiry, signature, replay protection) │
    │ ArmorClaw enforces...                 │
    └─────────────────────────────────────┘
    ↓ PASS
    │ FAIL → Audit & reject
    ↓
    ┌─────────────────────────────────────┐
    │ CHECK 3: Concentration & Exposure   │
    │ (portfolio %, sector %, risk metrics) │
    │ ArmorClaw enforces...                 │
    └─────────────────────────────────────┘
    ↓ PASS
    │ FAIL → Audit & reject
    ↓
    ┌─────────────────────────────────────┐
    │ CHECK 4: Market Hours & Calendar    │
    │ (NYSE hours, earnings blackout)      │
    │ ArmorClaw enforces...                 │
    └─────────────────────────────────────┘
    ↓ PASS
    │ FAIL → Audit & reject
    ↓
    ┌─────────────────────────────────────┐
    │ CHECK 5: Broker Integration         │
    │ (Alpaca API submission & confirm)    │
    │ Broker enforces...                    │
    └─────────────────────────────────────┘
    ↓ PASS → Order placed
    │ FAIL → Alpaca error captured
    ↓
Execution Complete (logged in audit trail)
```

### 3.2 Checkpoint Details

#### **CHECK 1: Intent Binding & Universe (Risk Agent)**

**Trigger:** Analyst proposes trade

**Rules Evaluated:**
1. `ticker-universe-restriction`: Ticker in authorized list?
2. `trade-size-limits`: Order ≤ max_order_usd AND daily total ≤ max_daily_usd?
3. `intent-token-binding`: Request intent_token_id matches loaded intent?

**Outcome:**
- **PASS:** Issue signed delegation token to Trader
- **FAIL:** Reject with remediation advice

**Example:**
```
Trade Proposal: BUY NVDA $6000
Check: max_order_usd = $5000
Result: BLOCKED — "Order $6000 exceeds max_order_usd $5000"
Advice: "Reduce order to $5000 or modify intent"
```

---

#### **CHECK 2: Token Validation (ArmorClaw)**

**Trigger:** Trader submits execution request with delegation token

**Rules Evaluated:**
1. `delegation-scope-enforcement`: Token signature valid? Token expired? Token reused?
2. `agent-role-binding`: Request from TraderAgent only?

**Cryptographic Validation:**
```
received_signature = token.pop("signature")
payload = json.dumps(token, sort_keys=True)
expected_signature = hmac_sha256(secret_key, payload)
if hmac.compare_digest(received_sig, expected_sig) == False:
    → REJECT: "Token signature invalid — tampering detected"
```

**Replay Protection:**
```
if token.token_id in used_tokens_cache:
    → REJECT: "Token already used; replay attack blocked"
used_tokens.add(token.token_id)
```

**Outcome:**
- **PASS:** Proceed to CHECK 3
- **FAIL:** Audit as security event; reject immediately

---

#### **CHECK 3: Portfolio Concentration & Sector Exposure (ArmorClaw)**

**Trigger:** Token validated; now validate against live portfolio state

**Rules Evaluated:**
1. `portfolio-concentration-limit`: post-trade allocation ≤ 40%?
2. `sector-exposure-limit`: sector/asset-class exposure within limits?

**Live Portfolio Query:**
```
current_nvda_position = get_positions("NVDA")
portfolio_value = get_account().portfolio_value
post_trade_pct = (order_amount + current_nvda_position) / portfolio_value

if post_trade_pct > 0.40:
    → REJECT with detailed exposure breakdown
```

**Outcome:**
- **PASS:** Proceed to CHECK 4
- **FAIL:** Audit; reject with "reduce order size to X USD"

**Example:**
```
Trade Proposal: BUY NVDA $5000
Current NVDA Holdings: $4000
Portfolio Value: $100,000
Post-Trade: $9,000 / $100,000 = 9% ✓ (< 40%)
Result: PASS
```

---

#### **CHECK 4: Market Hours & Calendar (ArmorClaw)**

**Trigger:** Concentration check passed

**Rules Evaluated:**
1. `market-hours-only`: NYSE open (Mon–Fri, 09:30–16:00 ET)?
2. `earnings-blackout-window`: Ticker not in earnings announcement window?

**Market Hours Check:**
```
import zoneinfo
et = zoneinfo.ZoneInfo("America/New_York")
now_et = datetime.now(et)
market_open = time(9, 30)
market_close = time(16, 0)

if now_et.weekday() >= 5:  # Sat (5) or Sun (6)
    → REJECT: "Market closed — {day_name}"

if not (market_open ≤ now_et.time() ≤ market_close):
    → REJECT: "Market closed — current ET {time}, outside 09:30–16:00"
```

**Outcome:**
- **PASS:** Proceed to CHECK 5 (submit to Alpaca)
- **FAIL:** Audit; reject with "market closed; retry during 09:30–16:00 ET"

---

#### **CHECK 5: Broker Integration (Alpaca)**

**Trigger:** All ArmorClaw checks passed; submit to Alpaca

**Alpaca Order Construction:**
```json
{
  "symbol": "NVDA",
  "qty": 5.714,  // amount_usd / current_price
  "side": "buy",
  "type": "market",
  "time_in_force": "day",
  "extended_hours": false
}
```

**Alpaca Validation & Execution:**
- Alpaca rates account for buying power
- Alpaca validates order size and symbol
- Alpaca executes in real-time or rejects with reason

**Response Capture:**
```json
{
  "order_id": "alpaca_order_uuid",
  "symbol": "NVDA",
  "qty": 5.714,
  "filled_qty": 5.714,
  "filled_avg_price": 875.40,
  "status": "filled",
  "created_at": "2026-04-04T14:32:15Z"
}
```

**Outcome:**
- **FULFILLED:** Audit as "FILLED"; report execution to user
- **REJECTED by Alpaca:** Audit as "ALPACA_REJECTION"; report error
- **PARTIAL FILL:** Audit as "PARTIALLY_FILLED"; report status

---

---

## 4. Trade Approval Workflow

### 4.1 End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: User Initiates Trade (via CLI or Dashboard)               │
│ Input: action=BUY, ticker=NVDA, amount_usd=5000                   │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: Orchestrator Spawns Three-Agent Pipeline                  │
│ Run ID: uuid (unique identifier for this trade flow)              │
└──────────────────────────────────────────────────────────────────┘
                            ↓
        ╔═══════════════════════════════════════════════════════╗
        ║         AGENT 1: ANALYTICS                             ║
        ║  Query Tools: market-data, research                    ║
        ║  Output: Trade proposal with confidence 0.82           ║
        ╚═══════════════════════════════════════════════════════╝
         │
         │ Proposal: {action: BUY, ticker: NVDA, amount: 5000,
         │            confidence: 0.82, rationale: "..."}
         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: Risk Agent Evaluates Against Portfolio Constraints        │
│ CHECK 1: Intent binding + ticker universe + size limits           │
│  Rules: ticker-universe-restriction, trade-size-limits, etc       │
│ Result: All pass                                                   │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: Risk Agent Issues Delegation Token (Allows Execution)    │
│ Token includes:                                                    │
│  • action: BUY                                                     │
│  • ticker: NVDA                                                    │
│  • max_amount_usd: 5000                                            │
│  • expiry: now + 60 seconds                                        │
│  • signature: HMAC-SHA256(secret_key, token_body)                 │
│  • token_id: uuid (prevents replay)                               │
└──────────────────────────────────────────────────────────────────┘
                            ↓
        ╔═══════════════════════════════════════════════════════╗
        ║         AGENT 3: TRADER (EXECUTOR)                    ║
        ║  Receives delegation token from Risk Agent            ║
        ║  Constructs execution request with token              ║
        ║  Submits to ArmorClaw (NOT directly to Alpaca)        ║
        ╚═══════════════════════════════════════════════════════╝
         │
         │ Execution Request: {
         │   delegation_token: {...},
         │   action: BUY,
         │   ticker: NVDA,
         │   amount_usd: 5000,
         │   submitting_agent: TraderAgent
         │ }
         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: ArmorClaw Performs 4 Sequential Checks                    │
│                                                                    │
│ CHECK 2: Token Validation                                         │
│   • Verify HMAC signature                                          │
│   • Check expiry time                                              │
│   • Check for replay (token_id not in used_tokens)               │
│   • Verify submitting_agent = TraderAgent                         │
│   Result: PASS                                                     │
│                                                                    │
│ CHECK 3: Portfolio Concentration & Sector Exposure                │
│   • Query Alpaca: get NVDA position + portfolio value             │
│   • Calculate: post_trade_pct = new_position / portfolio_value    │
│   • Enforce: post_trade_pct ≤ 40%                                 │
│   Result: current NVDA $4000 + order $5000 = $9000 →             │
│          $9000 / $100,000 = 9% ✓                                  │
│                                                                    │
│ CHECK 4: Market Hours & Calendar                                  │
│   • Check current time in ET timezone                              │
│   • Verify NYSE open (Mon–Fri, 09:30–16:00 ET)                    │
│   • Result: Friday 14:32 ET ✓                                     │
│                                                                    │
│ All Checks: PASS ✓                                                │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 6: ArmorClaw Submits to Alpaca (Broker)                      │
│ Request: {symbol: NVDA, qty: 5.714, side: buy, type: market}     │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 7: Alpaca Executes & Responds                                │
│ Response: {                                                        │
│   order_id: "alpaca_uuid",                                         │
│   status: "filled",                                                │
│   filled_qty: 5.714,                                               │
│   filled_avg_price: 875.40,                                        │
│   created_at: "2026-04-04T14:32:15Z"                              │
│ }                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 8: Audit Log Entry Created                                   │
│ Fields:                                                            │
│  • run_id, timestamp, agent_chain, decision, reason                │
│  • order_id, filled_qty, filled_price, status                      │
│  • portfolio_state_before, portfolio_state_after                   │
│  • all_check_results with rule_ids                                 │
│  • error_stack (if error occurred)                                 │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ STEP 9: Result Returned to User                                   │
│ Output: {                                                          │
│   status: "FILLED",                                                │
│   order_id: "alpaca_uuid",                                         │
│   filled_qty: 5.714,                                               │
│   filled_avg_price: 875.40,                                        │
│   execution_time_ms: 287,                                          │
│   audit_url: "http://localhost:8000/audit/{run_id}"               │
│ }                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Trade Rejection Flow (Example: Order Size Limit)

```
Trade Proposal: BUY NVDA $6000 (exceeds max_order_usd = $5000)
                            ↓
Risk Agent CHECK 1: Intent Binding & Universe
  • Rule: trade-size-limits
  • Check: $6000 ≤ $5000?
  • Result: FAIL ✗
                            ↓
Risk Agent Response: {
  "approved": false,
  "reason": "Order $6000 exceeds max_order_usd $5000",
  "blocked_rules": ["trade-size-limits"],
  "remediation": "Reduce order to $5000 or modify intent"
}
                            ↓
Audit Log: {
  "decision": "REJECTED_BY_RISK_AGENT",
  "failed_rules": ["trade-size-limits"],
  "checkpoint": 1,
  "timestamp": "2026-04-04T14:32:15Z"
}
                            ↓
User Response: Order rejected; no delegation token issued
              (Trader Agent never invoked)
```

---

## 5. Policy Enforcement Logic

### 5.1 Enforcement Architecture

ArmorClaw is a **standalone enforcement engine**, orthogonal to agent code. This design enables:

1. **Policy as Configuration:** Rules are declarative, not hard-coded
2. **Auditability:** Every rule evaluation is logged with rule_id, passed/failed
3. **Agility:** Modify policy without changing agent code
4. **Separation of Concerns:** Agents focus on intelligence; ArmorClaw focuses on compliance

### 5.2 Policy Lifecycle

```
┌────────────────────────────────────────┐
│ intent.json (User Configuration)        │
│  • authorized_tickers                   │
│  • max_order_usd                         │
│  • max_daily_usd                         │
│  • intent_token_id (immutable)          │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ ArmorClaw Engine Initialization         │
│  • Load intent                           │
│  • Read secret_key for token signing    │
│  • Initialize daily_tracker             │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ On Each Trade Proposal:                  │
│  1. Extract action, ticker, amount_usd   │
│  2. Call engine.run() with all inputs    │
│  3. Engine applies 5 sequential checks   │
│  4. Each check evaluates subset of rules │
│  5. If any rule fails → reject           │
│  6. If all pass → issue delegation token │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ Audit Log (Immutable Record)             │
│  • All rule evaluations logged           │
│  • Decision (APPROVED/REJECTED)          │
│  • Remediation hints                     │
│  • Portfolio state snapshots             │
└────────────────────────────────────────┘
```

### 5.3 Policy Rule Evaluation Example

**Scenario:** Risk Agent evaluates `BUY NVDA $9,000`

```python
# CHECK 3: Portfolio Concentration & Sector Exposure
def check_concentration_and_exposure(
    action="BUY",
    ticker="NVDA",
    amount_usd=9000,
    portfolio_value=100_000,
    current_nvda_position=5000,
):
    fail_rules = []
    fail_reasons = []

    # Rule: portfolio-concentration-limit
    post_trade_allocation = (current_nvda_position + amount_usd) / portfolio_value
    if post_trade_allocation > 0.40:
        fail_rules.append("portfolio-concentration-limit")
        fail_reasons.append(
            f"Post-trade NVDA {post_trade_allocation*100:.1f}% exceeds 40%"
        )

    # Rule: sector-exposure-limit
    tech_tickers = {NVDA, AAPL, GOOGL, ...}
    if ticker in tech_tickers:
        tech_holdings = sum([pos for pos in positions if pos.symbol in tech_tickers])
        tech_exposure = (tech_holdings + amount_usd) / portfolio_value
        if tech_exposure > 0.60:
            fail_rules.append("sector-exposure-limit")
            fail_reasons.append(
                f"Tech sector {tech_exposure*100:.1f}% exceeds 60%"
            )

    if fail_rules:
        return {
            "passed": False,
            "check_num": 3,
            "rule_ids": fail_rules,
            "reason": "; ".join(fail_reasons),
            "recommendation": "Reduce order size to < $4,000"
        }
    
    return {"passed": True, "check_num": 3, "rule_ids": []}

# Result:
# Post-trade NVDA: (5000 + 9000) / 100,000 = 14% ✓ (< 40%)
# Tech exposure: (15,000 other tech + 14,000 NVDA) / 100,000 = 29% ✓ (< 60%)
# CHECK 3: PASS
```

---

## 6. Failure Handling Mechanisms

### 6.1 Failure Categories & Responses

| Failure Type | Detection Point | Response | Audit Event |
|---|---|---|---|
| **Unauthorized Ticker** | CHECK 1 | Reject; no token issued | BLOCKED_TICKER_UNIVERSE |
| **Oversized Order** | CHECK 1 | Reject; suggest smaller size | BLOCKED_ORDER_SIZE |
| **Token Signature Invalid** | CHECK 2 | Reject as security threat | SECURITY_TOKEN_SIGNATURE_FAILED |
| **Token Expired** | CHECK 2 | Reject; suggest re-request | BLOCKED_TOKEN_EXPIRED |
| **Token Replayed** | CHECK 2 | Reject as security threat | SECURITY_REPLAY_ATTACK |
| **Over-concentrated** | CHECK 3 | Reject; suggest position reduction | BLOCKED_CONCENTRATION |
| **Sector Overexposed** | CHECK 3 | Reject; suggest diversification | BLOCKED_SECTOR_EXPOSURE |
| **Market Closed** | CHECK 4 | Reject; suggest retry during market hours | BLOCKED_MARKET_HOURS |
| **Alpaca Insufficient Buying Power** | CHECK 5 | Reject; suggest smaller order | BLOCKED_ALPACA_BUYING_POWER |
| **Alpaca Duplicate Order** | CHECK 5 | Reject (Alpaca); return order_id if exists | ALPACA_DUPLICATE_ORDER |
| **Network Timeout (Alpaca)** | CHECK 5 | Retry with exponential backoff (max 3×) | ALPACA_NETWORK_TIMEOUT |
| **Agent Crash / Exception** | Any | Catch; audit as AGENT_ERROR; reject trade | AGENT_EXCEPTION |

---

### 6.2 Retry Mechanism

**For transient failures only** (network timeouts, Alpaca rate limits):

```python
def execute_with_retry(
    delegation_token,
    action,
    ticker,
    amount_usd,
    max_retries=3,
    backoff_factor=2.0,  # exponential: 1s, 2s, 4s
):
    for attempt in range(1, max_retries + 1):
        try:
            result = alpaca_execute(delegation_token, action, ticker, amount_usd)
            return result
        except AlpacaNetworkError as e:
            if attempt >= max_retries:
                audit_event("ALPACA_NETWORK_TIMEOUT_EXHAUSTED", attempt, e)
                raise
            sleep_time = backoff_factor ** (attempt - 1)
            audit_event("ALPACA_NETWORK_RETRY", attempt, sleep_time)
            time.sleep(sleep_time)
        except AlpacaInsufficientBuyingPower as e:
            # Not transient — reject immediately
            audit_event("BLOCKED_ALPACA_BUYING_POWER", e)
            raise
```

---

### 6.3 Circuit Breaker (Safety Valve)

If the system experiences cascading failures, a **circuit breaker** engages:

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, reset_timeout_seconds=300):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout_seconds
        self.last_failure_time = None
        self.state = "CLOSED"  # normal operation

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"  # stop accepting orders
            audit_event("CIRCUIT_BREAKER_OPENED")

    def check_state(self):
        if self.state == "OPEN":
            elapsed = (datetime.now() - self.last_failure_time).total_seconds()
            if elapsed > self.reset_timeout:
                self.state = "HALF_OPEN"  # attempt recovery
                self.failure_count = 0
        
        if self.state == "OPEN" or self.state == "HALF_OPEN":
            return False  # reject new orders
        return True  # accept new orders

# Usage
if not circuit_breaker.check_state():
    return {
        "status": "CIRCUIT_BREAKER_OPEN",
        "message": "System in recovery mode; no new orders accepted",
        "retry_after_seconds": 300
    }
```

---

### 6.4 Graceful Degradation

If critical systems fail:

| Component | Failure | Fallback | Impact |
|---|---|---|---|
| Alpaca API | Down | Queued orders; retry on recovery | Delayed execution, no real losses |
| Sentiment API | Down | Use last cached sentiment | Conservative decision (no buy signal) |
| Market Hours Check | TZ library error | Assume market is open (risky) | Potential off-hours order (Alpaca rejects) |
| ArmorClaw Engine | Crash | Default to REJECT (safe fail) | No trades until system recovers |

**Safe-fail Philosophy:** In case of ambiguity, reject the trade. No execution is better than unguarded execution.

---

## 7. Broker Execution Integration (Alpaca API)

### 7.1 Alpaca API Contract

**Authentication:**
```python
from alpaca_trade_api import REST

alpaca = REST(
    base_url="https://paper-api.alpaca.markets",  # paper trading
    api_key=os.getenv("APCA_API_KEY_ID"),
    api_secret=os.getenv("APCA_API_SECRET_KEY"),
)
```

**Supported Endpoints:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/v2/accounts` | GET | Fetch account equity, cash, buying power |
| `/v2/positions` | GET | Fetch current holdings |
| `/v2/positions/{symbol}` | GET | Fetch single position |
| `/v2/orders` | POST | Place new order |
| `/v2/orders/{order_id}` | GET | Check order status |
| `/v2/orders/{order_id}` | PATCH | Modify order (not used in this system) |
| `/v2/orders/{order_id}` | DELETE | Cancel order (not used in this system) |

---

### 7.2 Order Submission Flow

**Input (from ArmorClaw after all checks pass):**
```json
{
  "action": "BUY",
  "ticker": "NVDA",
  "amount_usd": 5000,
  "order_type": "market"
}
```

**Transformation (Trader Agent → Alpaca):**
```python
current_price = get_live_price("NVDA")  # Call market-data tool
quantity = amount_usd / current_price
order_spec = {
    "symbol": ticker,
    "qty": round(quantity, 3),
    "side": action.lower(),  # "buy" or "sell"
    "type": "market",  # or "limit" if price specified
    "time_in_force": "day",
    "extended_hours": False,  # No pre/after-hours
}
```

**Alpaca Response (Success):**
```json
{
  "id": "alpaca_order_uuid",
  "symbol": "NVDA",
  "qty": 5.714,
  "side": "buy",
  "type": "market",
  "status": "filled",
  "created_at": "2026-04-04T14:32:15.000000Z",
  "updated_at": "2026-04-04T14:32:16.000000Z",
  "filled_qty": 5.714,
  "filled_avg_price": 875.40,
  "submitted_at": "2026-04-04T14:32:15.000000Z",
  "canceled_at": null,
  "expired_at": null
}
```

**Alpaca Response (Failure):**
```json
{
  "code": 40310000,
  "message": "Insufficient buying power"
}
```

---

### 7.3 Position & Account Queries

**Portfolio State Snapshot (before decision):**
```python
def get_portfolio_context():
    account = alpaca.get_account()
    positions = alpaca.get_positions()
    
    return {
        "account": {
            "equity": float(account.equity),
            "cash": float(account.cash),
            "buying_power": float(account.buying_power),
            "portfolio_value": float(account.portfolio_value),
        },
        "positions": [
            {
                "symbol": p.symbol,
                "qty": float(p.qty),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "current_price": float(p.current_price),
            }
            for p in positions
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
```

**Used by:**
- Risk Agent (CHECK 3): Verify concentration & exposure
- Audit Log: Record before/after portfolio state

---

### 7.4 Alpaca Error Handling

**Common Errors & Responses:**

```python
try:
    order = alpaca.submit_order(
        symbol="NVDA",
        qty=5.714,
        side="buy",
        type="market",
        time_in_force="day",
    )
    return {"status": "FILLED", "order_id": order.id}

except InsufficientBuyingPower:
    # Buying power insufficient
    account = alpaca.get_account()
    return {
        "status": "REJECTED",
        "reason": "Insufficient buying power",
        "available": account.buying_power,
        "requested": amount_usd,
        "remediation": "Reduce order size or sell existing position"
    }

except SymbolNotFound:
    # Ticker invalid or not tradeable on Alpaca
    return {
        "status": "REJECTED",
        "reason": f"Invalid symbol",
        "remediation": "Verify ticker symbol"
    }

except MarketNotOpen:
    # Attempted to place order outside market hours (edge case)
    return {
        "status": "REJECTED",
        "reason": "Market closed",
        "remediation": "Retry during 09:30–16:00 ET"
    }

except Timeout:
    # Network timeout — retry eligible
    return {
        "status": "TIMEOUT",
        "reason": "Alpaca API timeout",
        "remediation": "Retry order (may have succeeded)"
    }
```

---

## 8. Safe Autonomous Execution

### 8.1 Core Safety Principles

#### **Principle 1: Agents Propose, Enforcement Disposes**

Agents generate recommendations and execute only what they're explicitly authorized to do. **No agent can circumvent the enforcement layer.**

```
Agent Logic (LLM reasoning)    →   Enforcement (ArmorClaw)   →   Broker (Alpaca)
"I think buy NVDA"                  "Are we allowed to?"          "Execute order"
(proposal)                           (cryptographic Yes/No)        (only if Yes)
```

---

#### **Principle 2: Separation of Concerns**

| Responsibility | Entity | Cannot Do |
|---|---|---|
| Market Intelligence | Analytics Agent | Read portfolio; execute |
| Portfolio Governance | Risk Agent | Execute; bypass policy |
| Execution | Trader Agent | Read portfolio; approve trades |
| Policy Enforcement | ArmorClaw | Delay decision; approve without check |
| Broker Interface | Alpaca | Reverse trades; bypass order validation |

---

#### **Principle 3: Cryptographic Verification**

Every delegation token is **HMAC-signed** to prevent:
- **Tampering:** Attacker modifies token's amount or ticker → signature invalid
- **Forging:** Attacker creates token without secret key → signature invalid
- **Replaying:** Attacker reuses an old token → token_id flagged

```python
# Attacker attempts to modify token
original_token = {
    "token_id": "uuid",
    "action": "BUY",
    "ticker": "NVDA",
    "max_amount_usd": 5000,
    "signature": "valid_hmac"
}

# Attacker modifies the amount
tampered_token = {
    ...,
    "max_amount_usd": 50000,  # MODIFIED
    "signature": "valid_hmac"  # but signature is now INVALID
}

# ArmorClaw verification fails
if not hmac.compare_digest(received_sig, expected_sig):
    → REJECT: "Token signature invalid — security threat"
```

---

#### **Principle 4: Information Asymmetry**

**Trader Agent does not see portfolio state.** This prevents:
- **Logic bugs in Trader:** Even if Trader code has a bug, it can't place a 100% portfolio order (it doesn't know the portfolio size)
- **Informed attacks:** A compromised Trader can't optimize large orders; it's limited by the token
- **Information leakage:** Trader doesn't need to know what other positions exist

```
Risk Agent: "I see NVDA is 10% of portfolio; BUY $5000 is safe"
            → Issues token with max_amount_usd: 5000

Trader Agent: (Never told NVDA is 10% of portfolio)
              "I have a token to BUY $5000 NVDA; proceed"
              (Can't see that portfolio is actually $500K)
```

---

#### **Principle 5: Immutable Intent Context**

The user's intent is loaded once at startup and **never changed**. All trades must reference the same intent_token_id.

```python
# At startup
intent = load_intent_from_file("intent.json")
intent_token_id = intent.get("intent_token_id")

# For every trade request
request_intent_id = request.get("intent_token_id")
if request_intent_id != intent_token_id:
    → REJECT: "Different intent — possible injection attack"
```

**Prevents:** Swapping in a different intent with higher limits mid-execution.

---

#### **Principle 6: All-or-Nothing Execution**

An order either:
1. **Passes all 5 checks and executes**, OR
2. **Fails any check and is rejected outright**

No partial approvals; no "mostly safe" orders.

---

### 8.2 Attack Scenarios & Defenses

#### **Scenario A: Compromised Analytics Agent**

**Attack:** Malicious Analytics Agent repeatedly proposes huge BUY orders.

**Defense:**
1. **Ticker Universe Restriction** (CHECK 1): Proposals can only mention authorized tickers
2. **Trade Size Limits** (CHECK 1): Daily spending capped by intent (e.g., $20K/day)
3. **Token Expiry** (CHECK 2): Even if Risk Agent is non-responsive, tokens expire in 60s

**Outcome:** Analytics Agent can spam proposals; nothing executes without Risk Agent approval.

---

#### **Scenario B: Compromised Risk Agent**

**Attack:** Malicious Risk Agent issues tokens for unauthorized amounts (e.g., $50,000 when limit is $5,000).

**Defense:**
1. **Signature Verification** (CHECK 2): Token must be signed with secret_key; attacker can't forge
2. **delegation-scope-enforcement** (CHECK 3): Token max_amount_usd is validated against order amount
3. **intent-token-binding** (CHECK 1): Token must reference immutable parent intent

**Outcome:** Attacker can't issue valid tokens; ArmorClaw rejects any token outside scope.

---

#### **Scenario C: Compromised Trader Agent**

**Attack:** Malicious Trader Agent attempts to place order without delegation token or with an expired token.

**Defense:**
1. **Delegation Token Requirement** (CHECK 2): ArmorClaw rejects any order without a valid token
2. **Replay Protection** (CHECK 2): Reused tokens are blocked
3. **Agent Role Binding** (CHECK 2): Only TraderAgent can submit execution requests

**Outcome:** Trader Agent can't place orders; it must receive a valid token from Risk Agent.

---

#### **Scenario D: Network-in-the-Middle (MITM) Attack**

**Attack:** Attacker intercepts delegation token and modifies ticker or amount.

**Defense:**
1. **HMAC Signature** (CHECK 2): Token is cryptographically signed
2. **Hash-based verification:** Modifying any field invalidates the signature
3. **No mutual TLS needed in demo:** But in production, HTTPS enforces channel security

**Outcome:** Attacker can't modify token; signature verification fails.

---

#### **Scenario E: Replay Attack**

**Attack:** Attacker captures an old, approved token (e.g., "BUY NVDA $5000") and replays it multiple times.

**Defense:**
1. **Token ID Tracking** (CHECK 2): Each used token_id is added to `used_tokens` set
2. **Replay Detection:** On second submission, token_id is already in used_tokens
3. **Audit Event:** Logged as "SECURITY_REPLAY_ATTACK"

**Outcome:** Token executes once; all subsequent replays are blocked.

---

#### **Scenario F: Alpaca Account Hijacking**

**Attack:** Attacker gains access to Alpaca credentials and places orders directly.

**Defense:**
1. **API Rate Limiting** (Alpaca's responsibility): Alpaca rate-limits by API key
2. **Order Audit Trail:** All legitimate orders have ArmorClaw audit events with signatures
3. **Monitoring:** Anomalous orders (not originated via ArmorClaw) trigger alerts

**Outcome:** Direct Alpaca orders bypass the agent system; detectable in audit logs.

---

### 8.3 Safety Metrics & Monitoring

**Proposed Monitoring Dashboard:**

```
┌─────────────────────────────────────────┐
│ SAFETY METRICS (Real-time)               │
├─────────────────────────────────────────┤
│ • Orders Approved / Rejected Ratio       │
│ • Average Time from Proposal to Final    │
│ •  Token Expiry Rate (unused tokens)     │
│ • ArmorClaw Check Success Rates          │
│   - CHECK 1: 99.2% (intent binding)      │
│   - CHECK 2: 100% (signature valid)      │
│   - CHECK 3: 98.5% (concentration ok)    │
│   - CHECK 4: 96.1% (market hours ok)     │
│   - CHECK 5: 97.8% (alpaca accept)       │
│ • Audit Event Breakdown                  │
│   - APPROVED: 245 (87.5%)                │
│   - REJECTED: 28 (10%)                   │
│   - SECURITY_THREAT: 2 (0.7%)            │
│   - ERROR: 3 (1.1%)                      │
│ • Circuit Breaker Status: CLOSED         │
│ • Last Failure: 2h ago (transient)       │
└─────────────────────────────────────────┘
```

**Alerting Rules:**

1. **Security Event:** Any SECURITY_* audit event → immediate alert
2. **Circuit Breaker Open:** System halts orders → escalate
3. **High Rejection Rate:** > 50% rejection in 1h window → investigate
4. **Alpaca Connectivity:** > 3 timeouts in 5 min → degrade to read-only

---

## 9. Implementation Reference

### 9.1 Directory Structure

```
backend/
├── agents/
│   ├── orchestrator.py          ← Three-agent pipeline (Analyst → Risk → Trader)
│   ├── tools/
│   │   ├── analyst_tools.py     ← market-data, research (READ tools)
│   │   └── risk_tools.py        ← positions, account, exposure (READ tools)
│   └── openclaw.py              ← OpenClaw node.js integration
├── armorclaw/
│   ├── engine.py                ← 5-check ArmorClaw enforcement
│   ├── policy_rules.py          ← 14 Named policy rules
│   └── audit_logger.py          ← Immutable audit log
├── alpaca/
│   └── client.py                ← Alpaca REST API wrapper
├── routes/
│   └── *.py                     ← FastAPI endpoints (CLI bridges)
└── config/
    └── armoriq.policy.json      ← Policy rule weights (if applicable)

docs/
├── ARCHITECTURE.md              ← This document
└── MODULAR_AGENT_ARCHITECTURE.md
```

### 9.2 Code Examples

**Three-Agent Pipeline:**
```python
async def run_pipeline(action, ticker, amount_usd, intent, alpaca_client):
    # AGENT 1: Analytics
    proposal = await analytics_agent.analyze(ticker, market_data, research)
    
    # AGENT 2: Risk (apply policy)
    approval, token = await risk_agent.approve(proposal, portfolio_context)
    if not approval:
        return {"status": "REJECTED", "reason": ...}
    
    # AGENT 3: Trader (execute with token)
    order_result = await trader_agent.execute(token, alpaca_client)
    
    # Audit
    audit_logger.log(action, proposal, token, order_result)
    return order_result
```

**Policy Enforcement:**
```python
class ArmorClawEngine:
    def run(self, run_id, action, ticker, amount_usd, delegation_token):
        # CHECK 1
        if not self._check_intent_binding(ticker, amount_usd):
            return self._block(run_id, ..., check_num=1)
        
        # CHECK 2
        if not self._check_token_validity(delegation_token):
            return self._block(run_id, ..., check_num=2)
        
        # CHECK 3 & 4
        if not self._check_portfolio_and_market(ticker, amount_usd):
            return self._block(run_id, ..., check_num=3)
        
        # CHECK 5: Submit to Alpaca
        alpaca_result = alpaca.submit_order(...)
        audit_logger.log("APPROVED", run_id, alpaca_result)
        return alpaca_result
```

---

## 10. Conclusion

This modular autonomous trading architecture achieves safe autonomous execution through:

1. **Strict Role Separation** — Agents cannot bypass their authority boundaries
2. **Cryptographic Verification** — Tokens prevent tampering and replay
3. **Enforcement Orthogonality** — Policy is external to agent code
4. **Information Asymmetry** — Agents have minimal visibility across silos
5. **Immutable Intent Context** — Intent cannot be swapped mid-execution
6. **Audit Trail** — Every decision is logged with full context
7. **Fail-Safe Defaults** — System rejects on ambiguity

The architecture is **zero-trust by design**: no agent is trusted to self-enforce its constraints. ArmorClaw is the sole authority for authorization, independent of agent reasoning.

---

**Document Prepared:** Q1 2026  
**For:** Zero-Trust AI Trading System Architecture Review  
**Audience:** Architects, Compliance, Trading Operations
