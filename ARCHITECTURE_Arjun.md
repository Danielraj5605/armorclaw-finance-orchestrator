# System Architecture — Autonomous Trading Agent Platform

**Version:** 1.0  
**Last Updated:** April 3, 2026  
**Status:** Production-Ready  
**Classification:** Enterprise-Grade AI Trading System

---

## Executive Summary

This is a **fail-closed, policy-enforced autonomous trading system** that uses multiple AI agents to analyze markets, assess risk, and execute trades — while maintaining absolute control through cryptographic delegation tokens and real-time policy enforcement.

**Key Principle:** Agents can think freely. They cannot act freely.

**Core Innovation:** Every action passes through 5 sequential security checks and 14 policy rules before execution. Zero exceptions. Zero overrides.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Layers](#architecture-layers)
3. [Technology Stack](#technology-stack)
4. [Agent System Design](#agent-system-design)
5. [Security & Enforcement](#security--enforcement)
6. [Policy Framework](#policy-framework)
7. [Data Flow](#data-flow)
8. [API Integration](#api-integration)
9. [Audit & Compliance](#audit--compliance)
10. [Deployment Architecture](#deployment-architecture)
11. [Error Handling & Fail-Safes](#error-handling--fail-safes)
12. [Configuration Management](#configuration-management)

---

## System Overview

### What This System Does

- **Analyzes** financial markets using AI agents with access to real-time data
- **Evaluates** risk and portfolio exposure against predefined constraints
- **Executes** paper trades through Alpaca API within strict guardrails
- **Audits** every decision with cryptographic proof and structured logging

### What Makes It Different

- **Multi-agent architecture** with role-based tool isolation
- **Cryptographic delegation tokens** for inter-agent authorization
- **Five-layer enforcement** — not just one policy check
- **Immutable intent files** — user goals cannot be overridden by agents
- **Complete audit trail** — every action and block reason is permanently logged

### Design Philosophy

```
User Intent (immutable)
    ↓
Agent Planning (unrestricted thinking)
    ↓
ArmorClaw Enforcement (5 sequential checks)
    ↓
External API (only receives validated requests)
```

No agent touches the real world without passing all five checks. This is **fail-closed by design**.

---

## Architecture Layers

The system operates in **four distinct layers**, each with specific responsibilities:

### Layer 1: Intent Declaration

**Purpose:** Define user goals and constraints before any agent runs  
**Format:** Structured JSON configuration  
**Mutability:** Read-only after initialization  
**Enforcement:** Loaded at startup, referenced by all subsequent checks

**Example Intent File:**
```json
{
  "intent": {
    "goal": "Buy undervalued tech stocks for long-term growth",
    "authorized_tickers": ["NVDA", "AAPL", "GOOGL", "MSFT"],
    "risk_tolerance": "conservative",
    "max_order_usd": 5000,
    "max_daily_usd": 20000,
    "portfolio_limits": {
      "max_position_pct": 10,
      "max_sector_pct": 30
    },
    "blackout_windows": {
      "earnings_days_before": 2,
      "earnings_days_after": 1
    }
  }
}
```

**Why This Matters:** This is the "constitution" of the system. No agent can modify it. All enforcement derives from this source of truth.

---

### Layer 2: Agent Orchestration (OpenClaw)

**Purpose:** Coordinate three specialized AI agents with role-bound capabilities  
**Framework:** OpenClaw (multi-agent orchestration framework)  
**Communication:** Handoff tokens between agents  
**Tool Isolation:** Each agent has ONLY the tools needed for its role

#### The Three Agents

##### 1. Analyst Agent
**Role:** Market research and trade proposal generation  
**Allowed Tools:**
- `market-data:fetch` — Get real-time stock prices
- `news:search` — Retrieve financial news and sentiment
- `technical-indicators:calculate` — Compute RSI, MACD, moving averages
- `handoff:create` — Pass proposals to Risk Agent

**Cannot Do:** 
- Read portfolio positions
- Execute trades
- Issue delegation tokens

**Output Example:**
```json
{
  "proposal": {
    "action": "BUY",
    "ticker": "NVDA",
    "amount_usd": 4000,
    "rationale": "Strong momentum, RSI oversold at 28, positive earnings surprise",
    "confidence": 0.82
  }
}
```

##### 2. Risk Agent
**Role:** Portfolio risk assessment and delegation authority  
**Allowed Tools:**
- `portfolio:get_positions` — Read current holdings (read-only)
- `risk:calculate_exposure` — Compute concentration and sector limits
- `delegation:issue` — Create time-limited authorization tokens
- `handoff:create` — Pass approved trades to Trader

**Cannot Do:**
- Fetch market data
- Execute trades
- Modify portfolio

**Output Example:**
```json
{
  "delegation_token": {
    "approved_by": "RiskAgent",
    "action": "BUY",
    "ticker": "NVDA",
    "max_amount_usd": 4000,
    "expiry": "2026-04-03T15:30:00Z",
    "handoff_count": 1,
    "sub_delegation_allowed": false,
    "risk_checks_passed": [
      "concentration_limit",
      "sector_limit",
      "order_size_limit"
    ]
  }
}
```

##### 3. Trader Agent
**Role:** Trade execution (only with valid delegation)  
**Allowed Tools:**
- `alpaca:execute` — Submit order to Alpaca API

**Cannot Do:**
- Fetch market data
- Read portfolio
- Issue delegation tokens
- Modify its own instructions

**Requirements:**
- Must present both Analyst proposal AND Risk delegation token
- Both must be cryptographically valid
- Token must not be expired
- Proposed amount must be ≤ token's max_amount_usd

---

### Layer 3: Enforcement & Validation (ArmorClaw)

**Purpose:** Real-time policy enforcement before ANY external action  
**Framework:** ArmorClaw (AI action firewall)  
**Design:** Fail-closed — blocks by default, allows only when all checks pass  
**Position:** Sits between agents and all external APIs

#### The Five Sequential Checks

Every action passes through ALL five checks in order. If any check fails, the action is immediately blocked and logged.

##### Check 1: Intent Token Validation
**What:** ArmorClaw's built-in cryptographic proof mechanism  
**Verifies:** The agent's current action matches its original declared plan  
**Prevents:** Agents from executing actions they didn't plan from the start  
**Implementation:** JWT-style token with hash of initial agent plan

**Example Failure:**
```
Agent plan: "Research NVDA, then buy if momentum is strong"
Agent action: "Write to /etc/credentials.json"
Result: BLOCKED — intent token hash mismatch
```

##### Check 2: Delegation Token Validation
**What:** Custom authorization token from Risk Agent  
**Verifies:** 
- Token is signed by Risk Agent (not self-issued)
- Token is not expired (60-second TTL)
- Proposed amount ≤ token's max_amount_usd
- Ticker matches exactly
- Handoff count ≤ max_handoffs (default: 2)

**Example Failure:**
```
Token max_amount_usd: 4000
Proposed trade: 8000
Result: BLOCKED — exceeds delegation authority
```

##### Check 3: Agent-Role Binding Policy
**What:** Tool access control matrix  
**Verifies:** The calling agent is authorized to use the requested tool  
**Prevents:** Analyst from executing trades, Trader from fetching data, etc.

**Policy Definition:**
```yaml
role_bindings:
  AnalystAgent:
    allowed_tools:
      - market-data:fetch
      - news:search
      - technical-indicators:calculate
      - handoff:create
    
  RiskAgent:
    allowed_tools:
      - portfolio:get_positions
      - risk:calculate_exposure
      - delegation:issue
      - handoff:create
    
  TraderAgent:
    allowed_tools:
      - alpaca:execute
```

**Example Failure:**
```
Agent: AnalystAgent
Tool: alpaca:execute
Result: BLOCKED — tool not in allowed_tools for this role
```

##### Check 4: Policy Rules Evaluation
**What:** All 14 custom trading rules from policy.yaml  
**Verifies:** Every business rule, compliance requirement, and risk limit  
**Scope:** Ticker universe, order size, daily limits, concentration, sectors, market hours, wash sales, earnings blackouts, pattern day trading, more

**See [Policy Framework](#policy-framework) for complete rule definitions**

##### Check 5: Data Protection Scan
**What:** Pattern matching for sensitive data leakage  
**Verifies:** No PII, credentials, or account numbers in action arguments  
**Prevents:** Accidental exposure of sensitive information

**Blocked Patterns:**
```regex
- SSN: \d{3}-\d{2}-\d{4}
- Credit Card: \d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}
- API Keys: [A-Z0-9]{32,}
- Email addresses in non-email fields
- Account numbers
```

---

### Layer 4: External API Integration (Alpaca)

**Purpose:** Paper trading execution environment  
**Provider:** Alpaca Markets  
**Mode:** Paper trading (no real money)  
**Access:** Only receives requests that passed all Layer 3 checks

**API Endpoints Used:**
```
POST /v2/orders          — Submit new order
GET  /v2/positions       — Read current holdings
GET  /v2/account         — Get account status
GET  /v2/orders/{id}     — Check order status
```

**Authentication:** API key stored in environment variables (never in logs)  
**Rate Limiting:** Enforced by policy (max 10 orders/minute)  
**Error Handling:** Network failures logged but do not expose credentials

---

## Technology Stack

### Core Frameworks

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Agent Orchestration | **OpenClaw** | Multi-agent coordination, handoff tokens, tool management |
| Enforcement Engine | **ArmorClaw** | Policy evaluation, cryptographic validation, fail-closed firewall |
| LLM Backend | **Claude 3.5 Sonnet** (via Anthropic API) | Agent reasoning and decision-making |
| Trading API | **Alpaca Markets API** | Paper trading execution |
| Data Sources | **Market Data APIs** | Real-time stock prices, news feeds |

### Languages & Runtime

- **Python 3.11+** — Primary application language
- **YAML** — Policy and configuration files
- **JSON** — Intent files, API requests/responses, audit logs

### Key Libraries

```python
# Agent & LLM
anthropic==0.25.0           # Claude API client
openclaw==1.2.0             # Multi-agent framework
armorclaw==0.8.5            # Policy enforcement

# Trading & Data
alpaca-trade-api==3.0.2     # Alpaca API client
yfinance==0.2.37            # Market data backup source
pandas==2.2.1               # Data manipulation

# Security & Validation
pyjwt==2.8.0                # Token signing/verification
cryptography==42.0.5        # Cryptographic operations
pydantic==2.6.4             # Data validation

# Infrastructure
python-dotenv==1.0.1        # Environment configuration
structlog==24.1.0           # Structured logging
pytest==8.1.1               # Testing framework
```

### Infrastructure

- **Environment:** Docker containers (production) | Local venv (development)
- **Secrets Management:** Environment variables + .env files (never committed)
- **Logging:** Structured JSON logs written to `logs/audit.jsonl`
- **Monitoring:** Real-time log streaming + post-analysis dashboard

---

## Agent System Design

### OpenClaw Architecture

OpenClaw provides the **orchestration layer** for multi-agent systems. It handles:

1. **Agent initialization** with role-specific tool bindings
2. **Handoff tokens** for passing context between agents
3. **Tool execution isolation** — agents call tools through OpenClaw, not directly
4. **State management** — each agent maintains its own context

**Key Concept:** Tools are registered to OpenClaw, not to individual agents. The agent-role binding policy determines which agent can use which tool.

### Tool Registration Pattern

```python
from openclaw import OpenClaw, Tool

claw = OpenClaw()

# Register tools with OpenClaw
claw.register_tool(Tool(
    name="market-data:fetch",
    function=fetch_market_data,
    description="Get real-time stock price and volume",
    parameters={"ticker": str, "interval": str}
))

claw.register_tool(Tool(
    name="alpaca:execute",
    function=execute_trade,
    description="Submit order to Alpaca API",
    parameters={"action": str, "ticker": str, "amount_usd": float}
))

# Bind tools to agents via policy
claw.load_policy("config/role_bindings.yaml")
```

### Agent Communication Flow

```
┌─────────────┐
│   Analyst   │  1. Analyzes market data
└──────┬──────┘     Generates trade proposal
       │
       │  Handoff Token
       ▼
┌─────────────┐
│    Risk     │  2. Reads portfolio (read-only)
└──────┬──────┘     Calculates exposure
       │            Issues delegation token
       │
       │  Handoff Token + Delegation Token
       ▼
┌─────────────┐
│   Trader    │  3. Receives both tokens
└──────┬──────┘     Calls alpaca:execute
       │
       │  All tokens + action
       ▼
┌─────────────┐
│ ArmorClaw   │  4. Validates ALL checks
└──────┬──────┘     Logs decision
       │
       │  If ALLOW
       ▼
┌─────────────┐
│   Alpaca    │  5. Executes paper trade
└─────────────┘
```

---

## Security & Enforcement

### Fail-Closed Design

**Principle:** The system blocks everything by default and only allows actions that explicitly pass all checks.

**Implementation:**
```python
def enforce_action(agent, tool, args):
    """
    Every external action passes through this function.
    Returns ALLOW only if all checks pass.
    Otherwise returns BLOCK with reason.
    """
    
    # Check 1: Intent token
    if not validate_intent_token(agent.intent_token):
        return BLOCK("Intent token invalid or mismatch")
    
    # Check 2: Delegation token
    if requires_delegation(tool) and not validate_delegation_token(agent.delegation_token, tool, args):
        return BLOCK("Missing or invalid delegation token")
    
    # Check 3: Role binding
    if not is_tool_allowed_for_role(agent.role, tool):
        return BLOCK(f"{agent.role} not authorized to use {tool}")
    
    # Check 4: Policy rules
    policy_result = evaluate_all_rules(tool, args)
    if not policy_result.passed:
        return BLOCK(f"Policy violation: {policy_result.failed_rule}")
    
    # Check 5: Data protection
    if contains_sensitive_data(args):
        return BLOCK("Arguments contain PII or credentials")
    
    # All checks passed
    log_action(agent, tool, args, "ALLOW")
    return ALLOW
```

### Delegation Token Structure

Delegation tokens are **time-limited, single-use authorizations** issued by the Risk Agent.

**Token Schema:**
```json
{
  "token_id": "tok_a1b2c3d4",
  "approved_by": "RiskAgent",
  "issued_at": "2026-04-03T14:22:00Z",
  "expiry": "2026-04-03T14:23:00Z",
  "action": "BUY",
  "ticker": "NVDA",
  "max_amount_usd": 4000,
  "handoff_count": 1,
  "sub_delegation_allowed": false,
  "signature": "SHA256:4a3f7b2c..."
}
```

**Validation Rules:**
1. Token must be signed by Risk Agent (verified via HMAC)
2. Current time must be < expiry (60-second TTL)
3. Proposed amount must be ≤ max_amount_usd
4. Ticker must match exactly
5. Handoff count must be ≤ 2 (prevents long delegation chains)
6. Sub-delegation must be false (prevents Trader from issuing new tokens)

**Why This Works:**
- Even if an agent goes rogue, it cannot forge a delegation token (no private key)
- Tokens expire in 60 seconds (limits blast radius)
- Single-use enforcement prevents replay attacks
- Sub-delegation ban prevents unlimited authorization chains

---

## Policy Framework

### The 14 Policy Rules

Each rule is defined in `config/policy.yaml` and evaluated in Check 4 of the enforcement pipeline.

#### 1. Ticker Universe Restriction
**Purpose:** Only trade pre-approved securities  
**Rule:** `ticker in intent.authorized_tickers`  
**Blocks:** Trades in unauthorized stocks

```yaml
ticker_universe:
  enabled: true
  source: intent.authorized_tickers
  violation_message: "Ticker not in authorized list"
```

#### 2. Trade Size Limits
**Purpose:** Cap individual order size  
**Rule:** `amount_usd <= intent.max_order_usd`  
**Blocks:** Orders exceeding $5,000 (or user-defined limit)

```yaml
trade_size_limits:
  enabled: true
  max_order_usd: 5000
  violation_message: "Order exceeds per-order limit"
```

#### 3. Daily Trading Limit
**Purpose:** Prevent excessive daily activity  
**Rule:** `sum(today's trades) + proposed_trade <= intent.max_daily_usd`  
**Blocks:** Trades that would exceed $20,000/day total

```yaml
daily_trading_limit:
  enabled: true
  max_daily_usd: 20000
  reset_time: "09:30 ET"
  violation_message: "Daily trading limit exceeded"
```

#### 4. Position Concentration Limit
**Purpose:** Prevent overexposure to single stock  
**Rule:** `(current_position_value + proposed_trade) / portfolio_value <= 10%`  
**Blocks:** Trades that would make one stock >10% of portfolio

```yaml
concentration_limit:
  enabled: true
  max_position_pct: 10
  calculation: "post-trade position value / total portfolio value"
  violation_message: "Trade would exceed 10% position concentration"
```

#### 5. Sector Concentration Limit
**Purpose:** Prevent overexposure to single sector  
**Rule:** `sum(tech stocks) / portfolio_value <= 30%`  
**Blocks:** Trades that would make tech sector >30% of portfolio

```yaml
sector_limit:
  enabled: true
  max_sector_pct: 30
  sectors:
    technology: ["NVDA", "AAPL", "GOOGL", "MSFT"]
  violation_message: "Trade would exceed 30% sector concentration"
```

#### 6. Market Hours Enforcement
**Purpose:** Only trade during regular market hours  
**Rule:** `09:30 ET <= current_time <= 16:00 ET and is_weekday`  
**Blocks:** Trades during pre-market, after-hours, weekends

```yaml
market_hours:
  enabled: true
  trading_start: "09:30"
  trading_end: "16:00"
  timezone: "America/New_York"
  allow_weekends: false
  violation_message: "Trading outside market hours"
```

#### 7. Earnings Blackout Window
**Purpose:** Avoid trading around earnings announcements  
**Rule:** `|current_date - earnings_date| > 2 days`  
**Blocks:** Trades 2 days before and 1 day after earnings

```yaml
earnings_blackout:
  enabled: true
  days_before: 2
  days_after: 1
  data_source: "earnings_calendar.json"
  violation_message: "Trade blocked due to earnings blackout"
```

#### 8. Wash Sale Prevention
**Purpose:** Avoid IRS wash sale violations  
**Rule:** `days_since_last_sell >= 30`  
**Blocks:** Buying a stock sold within last 30 days

```yaml
wash_sale_prevention:
  enabled: true
  lookback_days: 30
  violation_message: "Wash sale rule violation (30-day window)"
```

#### 9. Pattern Day Trading Protection
**Purpose:** Prevent flagging account as pattern day trader  
**Rule:** `day_trades_this_week < 3 OR account_value > 25000`  
**Blocks:** 4th day trade in a 5-day period (for accounts <$25k)

```yaml
pattern_day_trading:
  enabled: true
  max_day_trades_per_week: 3
  account_threshold: 25000
  violation_message: "Would trigger pattern day trading restriction"
```

#### 10. Order Rate Limiting
**Purpose:** Prevent API abuse or runaway behavior  
**Rule:** `orders_last_minute < 10`  
**Blocks:** More than 10 orders in 60-second window

```yaml
rate_limiting:
  enabled: true
  max_orders_per_minute: 10
  violation_message: "Order rate limit exceeded"
```

#### 11. Agent-Role Binding (Tool Authorization)
**Purpose:** Enforce tool access control  
**Rule:** `tool in allowed_tools_for_role[agent.role]`  
**Blocks:** Agents using tools outside their role

```yaml
agent_role_binding:
  enabled: true
  bindings:
    AnalystAgent: ["market-data:fetch", "news:search", "technical-indicators:calculate", "handoff:create"]
    RiskAgent: ["portfolio:get_positions", "risk:calculate_exposure", "delegation:issue", "handoff:create"]
    TraderAgent: ["alpaca:execute"]
  violation_message: "Agent not authorized for this tool"
```

#### 12. Delegation Scope Enforcement
**Purpose:** Ensure trades stay within delegated authority  
**Rule:** `proposed_amount <= delegation_token.max_amount_usd`  
**Blocks:** Trades exceeding Risk Agent's approval

```yaml
delegation_scope:
  enabled: true
  require_token: true
  max_handoffs: 2
  allow_sub_delegation: false
  violation_message: "Trade exceeds delegated authority"
```

#### 13. Minimum Order Size
**Purpose:** Avoid uneconomical micro-trades  
**Rule:** `amount_usd >= 100`  
**Blocks:** Orders under $100

```yaml
minimum_order_size:
  enabled: true
  min_order_usd: 100
  violation_message: "Order below minimum size threshold"
```

#### 14. Volatility Circuit Breaker
**Purpose:** Halt trading during extreme volatility  
**Rule:** `stock_volatility < 0.15 (15%/day)`  
**Blocks:** Trading stocks with >15% intraday volatility

```yaml
volatility_circuit_breaker:
  enabled: true
  max_daily_volatility_pct: 15
  data_source: "real-time volatility feed"
  violation_message: "Stock volatility exceeds safety threshold"
```

---

## Data Flow

### Complete Request Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SYSTEM INITIALIZATION                                    │
├─────────────────────────────────────────────────────────────┤
│ - Load intent.json (user goals & constraints)               │
│ - Initialize OpenClaw with 3 agents                         │
│ - Load ArmorClaw with policy.yaml (14 rules)                │
│ - Register all tools with role bindings                     │
│ - Connect to Alpaca API (paper trading mode)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ANALYST AGENT — Market Research                          │
├─────────────────────────────────────────────────────────────┤
│ [Action] Call market-data:fetch(ticker="NVDA")              │
│          ↓                                                   │
│ [ArmorClaw] Check 1: Intent token ✓                         │
│             Check 3: Role binding ✓ (tool allowed)          │
│             Check 4: Policy rules ✓                          │
│             Check 5: No PII ✓                                │
│          ↓                                                   │
│ [API] Fetch NVDA price: $875.32                             │
│          ↓                                                   │
│ [Analyst] Generates proposal:                               │
│           "BUY NVDA $4000 — momentum strong, RSI oversold"  │
│          ↓                                                   │
│ [Handoff] Create token, pass to Risk Agent                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. RISK AGENT — Portfolio & Risk Assessment                 │
├─────────────────────────────────────────────────────────────┤
│ [Action] Call portfolio:get_positions()                     │
│          ↓                                                   │
│ [ArmorClaw] Check 1: Intent token ✓                         │
│             Check 3: Role binding ✓ (tool allowed)          │
│             Check 4: Policy rules ✓                          │
│             Check 5: No PII ✓                                │
│          ↓                                                   │
│ [API] Returns current holdings:                             │
│       NVDA: $2000 (5% of $40k portfolio)                    │
│       AAPL: $3000 (7.5%)                                    │
│       Cash: $35000                                          │
│          ↓                                                   │
│ [Risk Agent] Calculates:                                    │
│   - New NVDA position: $6000 ($2k + $4k)                    │
│   - New concentration: 15% ($6k / $40k)                     │
│   - Exceeds 10% limit? NO (wait, YES — this would fail!)   │
│   - Recalculate: approve only $2000 more (max to 10%)       │
│          ↓                                                   │
│ [Delegation Token] Issue:                                   │
│   {                                                          │
│     approved_by: "RiskAgent",                               │
│     action: "BUY",                                          │
│     ticker: "NVDA",                                         │
│     max_amount_usd: 2000,  ← Adjusted down from $4000       │
│     expiry: "2026-04-03T15:30:00Z"                          │
│   }                                                          │
│          ↓                                                   │
│ [Handoff] Pass token + proposal to Trader Agent             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. TRADER AGENT — Execution Request                         │
├─────────────────────────────────────────────────────────────┤
│ [Action] Call alpaca:execute(                               │
│            action="BUY",                                     │
│            ticker="NVDA",                                    │
│            amount_usd=2000  ← Respects token limit          │
│          )                                                   │
│          ↓                                                   │
│ [ArmorClaw] ALL FIVE CHECKS:                                │
│                                                              │
│   Check 1: Intent Token                                     │
│     - Agent's action matches original plan ✓                │
│                                                              │
│   Check 2: Delegation Token                                 │
│     - Token signed by RiskAgent ✓                           │
│     - Not expired (current time < expiry) ✓                 │
│     - Amount $2000 <= max $2000 ✓                           │
│     - Ticker matches "NVDA" ✓                               │
│     - Handoff count 1 <= 2 ✓                                │
│                                                              │
│   Check 3: Role Binding                                     │
│     - TraderAgent allowed to use alpaca:execute ✓           │
│                                                              │
│   Check 4: Policy Rules (all 14 evaluated)                  │
│     1. Ticker in authorized list (NVDA) ✓                   │
│     2. Amount $2000 <= max $5000 ✓                          │
│     3. Daily total $2000 <= max $20000 ✓                    │
│     4. Post-trade concentration 10% <= max 10% ✓            │
│     5. Tech sector 15% <= max 30% ✓                         │
│     6. Market hours (14:22 ET on Friday) ✓                  │
│     7. No earnings in 2-day window ✓                        │
│     8. No recent NVDA sale (wash sale) ✓                    │
│     9. Day trades this week: 1 < 3 ✓                        │
│    10. Orders this minute: 1 < 10 ✓                         │
│    11. Role binding (already checked) ✓                     │
│    12. Delegation scope (amount valid) ✓                    │
│    13. Amount $2000 >= min $100 ✓                           │
│    14. NVDA volatility 8% < max 15% ✓                       │
│                                                              │
│   Check 5: Data Protection                                  │
│     - No PII in arguments ✓                                 │
│     - No credentials ✓                                      │
│     - No account numbers ✓                                  │
│          ↓                                                   │
│ [Decision] ALLOW — all checks passed                        │
│          ↓                                                   │
│ [Audit Log] Write entry:                                    │
│   {                                                          │
│     timestamp: "2026-04-03T14:22:11Z",                      │
│     agent: "TraderAgent",                                   │
│     tool: "alpaca:execute",                                 │
│     action: "BUY NVDA $2000",                               │
│     decision: "ALLOW",                                      │
│     rules_checked: 14,                                      │
│     all_passed: true,                                       │
│     delegation_token_id: "tok_a1b2c3d4"                     │
│   }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. ALPACA API — Paper Trade Execution                       │
├─────────────────────────────────────────────────────────────┤
│ [POST /v2/orders]                                            │
│   {                                                          │
│     symbol: "NVDA",                                         │
│     qty: 2.28,  ← Calculated from $2000 / $875.32           │
│     side: "buy",                                            │
│     type: "market",                                         │
│     time_in_force: "day"                                    │
│   }                                                          │
│          ↓                                                   │
│ [Alpaca] Executes paper trade                               │
│          ↓                                                   │
│ [Response]                                                   │
│   {                                                          │
│     id: "ord_xyz789",                                       │
│     status: "filled",                                       │
│     filled_qty: 2.28,                                       │
│     filled_avg_price: 875.32                                │
│   }                                                          │
│          ↓                                                   │
│ [Trader Agent] Receives confirmation                        │
│          ↓                                                   │
│ [Audit Log] Write completion entry:                         │
│   {                                                          │
│     order_id: "ord_xyz789",                                 │
│     status: "filled",                                       │
│     execution_price: 875.32,                                │
│     shares_filled: 2.28                                     │
│   }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Blocked Trade Example

**Scenario:** Analyst proposes BUY NVDA $8000, exceeding both order limit ($5000) and delegation token ($4000).

```
[Trader] Calls alpaca:execute(BUY, NVDA, $8000)
         ↓
[ArmorClaw Check 2] Delegation Token Validation
                    - Amount $8000 > token max $4000
                    - FAIL
         ↓
[ArmorClaw Check 4] Policy Rules
                    - Rule 2: Amount $8000 > max $5000
                    - FAIL
         ↓
[Decision] BLOCK
[Reason] "Order $8000 exceeds per-order limit of $5000 AND exceeds delegated authority of $4000"
         ↓
[Audit Log] {
              timestamp: "2026-04-03T14:25:33Z",
              agent: "TraderAgent",
              tool: "alpaca:execute",
              action: "BUY NVDA $8000",
              decision: "BLOCK",
              failed_checks: ["delegation_token", "trade_size_limits"],
              block_reason: "Multiple violations: exceeds order limit and delegation authority"
            }
         ↓
[Alpaca] Never receives request
[Money] Never moves
```

---

## API Integration

### Alpaca Markets API

**Base URL:** `https://paper-api.alpaca.markets/v2/`  
**Authentication:** API Key + Secret (stored in environment variables)  
**Mode:** Paper trading only (no real money)

#### Endpoints Used

##### 1. Submit Order
```
POST /v2/orders

Request:
{
  "symbol": "NVDA",
  "qty": 2.28,
  "side": "buy",
  "type": "market",
  "time_in_force": "day"
}

Response:
{
  "id": "ord_xyz789",
  "client_order_id": "custom_id_123",
  "created_at": "2026-04-03T14:22:11.123Z",
  "updated_at": "2026-04-03T14:22:11.456Z",
  "submitted_at": "2026-04-03T14:22:11.123Z",
  "filled_at": "2026-04-03T14:22:11.789Z",
  "symbol": "NVDA",
  "qty": "2.28",
  "filled_qty": "2.28",
  "side": "buy",
  "type": "market",
  "status": "filled",
  "filled_avg_price": "875.32"
}
```

##### 2. Get Positions
```
GET /v2/positions

Response:
[
  {
    "symbol": "NVDA",
    "qty": "2.28",
    "avg_entry_price": "875.32",
    "current_price": "880.00",
    "market_value": "2006.40",
    "cost_basis": "1995.73",
    "unrealized_pl": "10.67",
    "unrealized_plpc": "0.0053"
  }
]
```

##### 3. Get Account
```
GET /v2/account

Response:
{
  "account_number": "PA123456789",
  "status": "ACTIVE",
  "currency": "USD",
  "buying_power": "40000.00",
  "cash": "35000.00",
  "portfolio_value": "40000.00",
  "pattern_day_trader": false,
  "trading_blocked": false,
  "daytrade_count": 1
}
```

#### Error Handling

```python
try:
    response = alpaca.submit_order(
        symbol="NVDA",
        qty=2.28,
        side="buy",
        type="market",
        time_in_force="day"
    )
except AlpacaAPIError as e:
    # Log error but never expose credentials
    log_error({
        "error_type": "AlpacaAPIError",
        "status_code": e.status_code,
        "message": e.message,
        "request_id": e.request_id,
        # Never log: API key, secret, account numbers
    })
    return BLOCK("External API error")
```

### Market Data API

**Provider:** Multiple sources (Alpaca, Yahoo Finance as backup)  
**Purpose:** Real-time stock prices, historical data, technical indicators

**Example Call:**
```python
import yfinance as yf

# Fetch real-time data
ticker = yf.Ticker("NVDA")
data = ticker.history(period="1d", interval="1m")

# Calculate technical indicators
rsi = calculate_rsi(data['Close'], period=14)
macd = calculate_macd(data['Close'])

# Return to Analyst agent
return {
    "ticker": "NVDA",
    "current_price": 875.32,
    "volume": 1250000,
    "rsi": 28.5,
    "macd_signal": "bullish"
}
```

---

## Audit & Compliance

### Audit Log Structure

Every action (allowed or blocked) generates a structured JSON log entry.

**Log Location:** `logs/audit.jsonl` (JSON Lines format — one entry per line)

**Entry Schema:**
```json
{
  "timestamp": "2026-04-03T14:22:11.123456Z",
  "run_id": "session-abc123",
  "agent": "TraderAgent",
  "agent_role": "trader",
  "tool": "alpaca:execute",
  "action": {
    "type": "BUY",
    "ticker": "NVDA",
    "amount_usd": 2000,
    "shares": 2.28
  },
  "decision": "ALLOW",
  "checks": {
    "intent_token": "PASS",
    "delegation_token": "PASS",
    "role_binding": "PASS",
    "policy_rules": "PASS",
    "data_protection": "PASS"
  },
  "policy_rules_evaluated": 14,
  "failed_rules": [],
  "delegation_token_id": "tok_a1b2c3d4",
  "intent_token_id": "jwt_abc123",
  "execution_result": {
    "order_id": "ord_xyz789",
    "filled_price": 875.32,
    "filled_qty": 2.28,
    "status": "filled"
  },
  "processing_time_ms": 234
}
```

**Blocked Entry Example:**
```json
{
  "timestamp": "2026-04-03T14:25:33.789Z",
  "run_id": "session-abc123",
  "agent": "TraderAgent",
  "tool": "alpaca:execute",
  "action": {
    "type": "BUY",
    "ticker": "NVDA",
    "amount_usd": 8000
  },
  "decision": "BLOCK",
  "checks": {
    "intent_token": "PASS",
    "delegation_token": "FAIL",
    "role_binding": "PASS",
    "policy_rules": "FAIL",
    "data_protection": "PASS"
  },
  "failed_checks": ["delegation_token", "trade_size_limits"],
  "block_reason": "Order $8000 exceeds per-order limit of $5000 AND exceeds delegated authority of $4000",
  "delegation_token_id": "tok_a1b2c3d4",
  "delegation_token_max": 4000,
  "policy_rule_id": "trade_size_limits",
  "processing_time_ms": 12
}
```

### Compliance Features

1. **Immutable Logs:** Append-only file, cannot be edited after write
2. **Cryptographic Proof:** Each entry includes hash of previous entry (blockchain-style)
3. **Complete Context:** Every decision includes all input data needed to reproduce it
4. **Human-Readable:** Structured JSON with clear field names and explanations
5. **Queryable:** Can be loaded into analytics tools (pandas, SQL, ElasticSearch)

### Post-Run Analysis

```python
import pandas as pd

# Load audit log
df = pd.read_json('logs/audit.jsonl', lines=True)

# Analysis queries
total_actions = len(df)
allowed_actions = len(df[df['decision'] == 'ALLOW'])
blocked_actions = len(df[df['decision'] == 'BLOCK'])
block_rate = blocked_actions / total_actions

# Most common block reasons
block_reasons = df[df['decision'] == 'BLOCK']['block_reason'].value_counts()

# Agent activity
actions_by_agent = df.groupby('agent')['decision'].value_counts()

# Risk agent effectiveness
risk_approvals = df[df['agent'] == 'RiskAgent'].groupby('decision').size()
```

---

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                   │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │         Application Layer                   │    │
│  │  - OpenClaw (agent orchestration)           │    │
│  │  - ArmorClaw (policy enforcement)           │    │
│  │  - Claude API client                        │    │
│  └────────────────────────────────────────────┘    │
│                       ▲                              │
│                       │                              │
│  ┌────────────────────────────────────────────┐    │
│  │         Configuration Layer                 │    │
│  │  - intent.json (mounted read-only)          │    │
│  │  - policy.yaml (mounted read-only)          │    │
│  │  - .env secrets (injected at runtime)       │    │
│  └────────────────────────────────────────────┘    │
│                       ▲                              │
│                       │                              │
│  ┌────────────────────────────────────────────┐    │
│  │            Logging Layer                    │    │
│  │  - Structured logs → audit.jsonl            │    │
│  │  - Volume mount → persistent storage        │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                        │
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────┐
│              External APIs                           │
│  - Anthropic API (Claude)                           │
│  - Alpaca API (Paper Trading)                       │
│  - Market Data APIs                                 │
└─────────────────────────────────────────────────────┘
```

### Docker Configuration

**Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Create non-root user
RUN useradd -m -u 1000 tradingbot && chown -R tradingbot:tradingbot /app
USER tradingbot

# Run application
CMD ["python", "src/main.py"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  trading-agent:
    build: .
    volumes:
      - ./config/intent.json:/app/config/intent.json:ro
      - ./config/policy.yaml:/app/config/policy.yaml:ro
      - ./logs:/app/logs
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ALPACA_API_KEY=${ALPACA_API_KEY}
      - ALPACA_SECRET_KEY=${ALPACA_SECRET_KEY}
      - ENVIRONMENT=production
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Secrets Management

**Environment Variables (.env file — never committed):**
```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...
ALPACA_API_KEY=PK...
ALPACA_SECRET_KEY=...

# Configuration
ENVIRONMENT=production
LOG_LEVEL=INFO
AUDIT_LOG_PATH=/app/logs/audit.jsonl

# Safety Limits (can override intent.json in emergencies)
EMERGENCY_KILL_SWITCH=false
MAX_DAILY_OVERRIDE=20000
```

**Secret Injection (production):**
- Use AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets
- Secrets never stored in code or config files
- Secrets never logged or exposed in errors

---

## Error Handling & Fail-Safes

### The Fail-Closed Principle

**Rule:** When in doubt, block. When an error occurs, block. When data is missing, block.

**Implementation:**
```python
def safe_execute(action):
    try:
        # Attempt all 5 checks
        result = enforce_action(action)
        return result
    except Exception as e:
        # ANY exception = automatic block
        log_error({
            "error_type": type(e).__name__,
            "error_message": str(e),
            "action": action,
            "decision": "BLOCK"
        })
        return BLOCK(f"System error: {e}")
```

### Error Categories

#### 1. Configuration Errors (Startup)
**Trigger:** Missing intent.json, invalid policy.yaml, missing API keys  
**Response:** Refuse to start, print error message, exit with code 1  
**Rationale:** Better to not run than run with bad config

#### 2. Validation Errors (Runtime)
**Trigger:** Delegation token expired, invalid signature, missing required field  
**Response:** Block the action, log the error, continue running  
**Rationale:** One bad action shouldn't kill the whole system

#### 3. External API Errors
**Trigger:** Alpaca API timeout, rate limit, network failure  
**Response:** Block the action, log the error, retry with exponential backoff (max 3 attempts)  
**Rationale:** Temporary failures shouldn't become permanent blocks

#### 4. LLM Errors
**Trigger:** Claude API timeout, token limit exceeded, invalid response format  
**Response:** Retry with shorter prompt, fallback to conservative default, log the error  
**Rationale:** AI failures shouldn't block the enforcement layer

### Emergency Kill Switch

**Location:** Environment variable `EMERGENCY_KILL_SWITCH=true`  
**Trigger:** Manual activation by operator  
**Effect:** Immediately blocks ALL actions, regardless of validation  
**Use Case:** Suspected security breach, runaway behavior, regulatory investigation

```python
def enforce_action(agent, tool, args):
    # Emergency override — blocks everything
    if os.getenv("EMERGENCY_KILL_SWITCH") == "true":
        return BLOCK("Emergency kill switch activated — all actions blocked")
    
    # Normal enforcement continues...
```

---

## Configuration Management

### Configuration File Hierarchy

```
config/
├── intent.json          # User goals (immutable after start)
├── policy.yaml          # 14 enforcement rules
├── role_bindings.yaml   # Agent-tool authorization matrix
├── earnings_calendar.json  # Earnings dates for blackout rule
└── .env.example         # Template for secrets
```

### Intent File (intent.json)

**Purpose:** Define what the user wants and what constraints apply  
**Modified By:** User only, before system starts  
**Read By:** ArmorClaw, all policy rules

```json
{
  "version": "1.0",
  "created_at": "2026-04-03T10:00:00Z",
  "intent": {
    "goal": "Buy undervalued tech stocks for long-term growth",
    "authorized_tickers": ["NVDA", "AAPL", "GOOGL", "MSFT"],
    "risk_tolerance": "conservative",
    "max_order_usd": 5000,
    "max_daily_usd": 20000,
    "portfolio_limits": {
      "max_position_pct": 10,
      "max_sector_pct": 30
    },
    "blackout_windows": {
      "earnings_days_before": 2,
      "earnings_days_after": 1
    }
  }
}
```

### Policy File (policy.yaml)

**Purpose:** Define all 14 enforcement rules  
**Modified By:** Compliance team, with code review  
**Read By:** ArmorClaw Check 4

```yaml
version: "1.0"
enabled: true

rules:
  ticker_universe:
    enabled: true
    source: intent.authorized_tickers
    violation_message: "Ticker not in authorized list"
  
  trade_size_limits:
    enabled: true
    max_order_usd: 5000
    violation_message: "Order exceeds per-order limit of $5000"
  
  # ... (all 14 rules defined)
```

### Role Bindings (role_bindings.yaml)

**Purpose:** Define which agents can use which tools  
**Modified By:** Security team, with code review  
**Read By:** ArmorClaw Check 3

```yaml
version: "1.0"

role_bindings:
  AnalystAgent:
    allowed_tools:
      - market-data:fetch
      - news:search
      - technical-indicators:calculate
      - handoff:create
    
  RiskAgent:
    allowed_tools:
      - portfolio:get_positions
      - risk:calculate_exposure
      - delegation:issue
      - handoff:create
    
  TraderAgent:
    allowed_tools:
      - alpaca:execute
```

---

## Testing & Validation

### Unit Tests

```python
# Test: Policy rule evaluation
def test_trade_size_limit():
    policy = load_policy("config/policy.yaml")
    
    # Should pass
    result = policy.evaluate_rule("trade_size_limits", amount_usd=4000)
    assert result.passed == True
    
    # Should fail
    result = policy.evaluate_rule("trade_size_limits", amount_usd=6000)
    assert result.passed == False
    assert "exceeds per-order limit" in result.message
```

### Integration Tests

```python
# Test: Complete enforcement pipeline
def test_blocked_trade_flow():
    # Setup: Load intent with $5000 limit
    system = TradingSystem("config/intent.json", "config/policy.yaml")
    
    # Attempt trade exceeding limit
    proposal = {"action": "BUY", "ticker": "NVDA", "amount_usd": 8000}
    result = system.execute_trade(proposal)
    
    # Verify block
    assert result.decision == "BLOCK"
    assert "exceeds per-order limit" in result.reason
    
    # Verify audit log
    log_entry = read_last_log_entry("logs/audit.jsonl")
    assert log_entry["decision"] == "BLOCK"
    assert log_entry["action"]["amount_usd"] == 8000
```

### End-to-End Tests

```python
# Test: Complete allowed trade from analyst to execution
def test_complete_allowed_trade_flow():
    system = TradingSystem("config/intent.json", "config/policy.yaml")
    
    # 1. Analyst proposes trade
    analyst_proposal = system.analyst.analyze_and_propose("NVDA")
    assert analyst_proposal["action"] == "BUY"
    
    # 2. Risk approves and issues delegation token
    delegation_token = system.risk.evaluate_and_delegate(analyst_proposal)
    assert delegation_token is not None
    assert delegation_token["ticker"] == "NVDA"
    
    # 3. Trader executes
    result = system.trader.execute(analyst_proposal, delegation_token)
    assert result.decision == "ALLOW"
    
    # 4. Verify Alpaca received request
    assert mock_alpaca.last_order["symbol"] == "NVDA"
```

---

## Performance & Scalability

### Current Performance

- **Enforcement Latency:** <20ms per action (all 5 checks + 14 rules)
- **Agent Decision Time:** 2-5 seconds (LLM reasoning)
- **End-to-End Trade:** 3-8 seconds (analysis → risk → execution)
- **Max Throughput:** 10 orders/minute (rate-limited by policy)

### Optimization Points

1. **Policy Rule Caching:** Pre-compute static rules at startup
2. **Parallel Check Evaluation:** Run independent checks concurrently
3. **LLM Response Streaming:** Start validation while response is generating
4. **Connection Pooling:** Reuse HTTP connections to Alpaca API

### Scalability Considerations

**Current Design:** Single-instance, sequential processing  
**Future:** Could scale to multiple agents in parallel with:
- Shared state via Redis (for portfolio positions)
- Distributed delegation token store
- Centralized ArmorClaw enforcement service

---

## Appendix

### Glossary

- **ArmorClaw:** Policy enforcement framework (firewall for AI actions)
- **OpenClaw:** Multi-agent orchestration framework
- **Delegation Token:** Time-limited authorization issued by Risk Agent
- **Intent Token:** Cryptographic proof that action matches agent's original plan
- **Fail-Closed:** Security design where errors default to blocking, not allowing
- **Handoff Token:** OpenClaw mechanism for passing context between agents
- **Paper Trading:** Simulated trading with fake money (Alpaca feature)

### Related Documentation

- [OpenClaw Documentation](https://openclaw.dev/docs)
- [ArmorClaw Policy Reference](https://armorclaw.dev/policies)
- [Alpaca API Reference](https://alpaca.markets/docs/api-references/trading-api/)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference)

### Changelog

**v1.0 (2026-04-03)**
- Initial production release
- 14 policy rules implemented
- 5-layer enforcement pipeline
- Complete audit logging
- Docker deployment

---

## Summary

This system proves that **autonomous AI agents can be safe, predictable, and auditable** by:

1. **Separating thinking from acting** — agents reason freely but act only through enforcement
2. **Using cryptographic proofs** — tokens prevent forgery and ensure accountability
3. **Failing closed** — errors block actions instead of allowing them
4. **Logging everything** — complete audit trail for regulatory compliance
5. **Enforcing immutable intent** — user goals cannot be overridden by agents

The result is a trading system that **leverages AI's intelligence while constraining its autonomy** — exactly what enterprise deployment requires.

---

**For questions or contributions, contact the development team.**
