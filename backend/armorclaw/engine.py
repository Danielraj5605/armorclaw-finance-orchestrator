"""
backend/armorclaw/engine.py
The 5-check ArmorClaw enforcement engine.
"""
import hmac
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from backend.armorclaw import policy_rules as rules
from backend.armorclaw.audit_logger import write_audit


class CheckResult:
    def __init__(self, passed: bool, check_num: int, rule_ids: list, reason: str):
        self.passed     = passed
        self.check_num  = check_num
        self.rule_ids   = rule_ids
        self.reason     = reason


def _verify_token_hmac(token: dict, secret: str) -> bool:
    received_sig = token.pop("signature", "")
    payload = json.dumps(token, sort_keys=True, default=str).encode()
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    token["signature"] = received_sig
    return hmac.compare_digest(received_sig, expected)


class ArmorClawEngine:
    def __init__(self, intent: dict, secret_key: str, daily_tracker: dict):
        self.intent        = intent
        self.secret_key    = secret_key
        self.daily_tracker = daily_tracker   # {"date": str, "spent": float}
        self.used_tokens   = set()           # replay protection

    def _get_daily_spent(self) -> float:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self.daily_tracker.get("date") != today:
            self.daily_tracker["date"]  = today
            self.daily_tracker["spent"] = 0.0
        return self.daily_tracker["spent"]

    def _add_daily_spent(self, amount: float):
        self.daily_tracker["spent"] = self._get_daily_spent() + amount

    def run(
        self,
        run_id: str,
        action: str,
        ticker: str,
        amount_usd: float,
        delegation_token: dict,
        portfolio_value: float = 100_000.0,
        submitting_agent: str = "TraderAgent",
        tools_used: list = None,
        intent_token_id_in_request: str = None,
    ) -> dict:
        """
        Run all 5 ArmorClaw checks. Returns a decision dict.
        """
        tools_used = tools_used or ["alpaca-trading:execute"]
        intent_token_id = self.intent.get("intent_token_id", "")
        daily_spent = self._get_daily_spent()

        # ── CHECK 1: Intent Binding ────────────────────────────────
        fail_rules, fail_reasons = [], []

        ok, reason = rules.ticker_universe_restriction(ticker, self.intent)
        if not ok:
            fail_rules.append("ticker-universe-restriction"); fail_reasons.append(reason)

        ok, reason = rules.trade_size_limits(amount_usd, daily_spent, self.intent)
        if not ok:
            fail_rules.append("trade-size-limits"); fail_reasons.append(reason)

        if intent_token_id_in_request and intent_token_id_in_request != intent_token_id:
            fail_rules.append("intent-token-binding")
            fail_reasons.append("intent_token_id mismatch")

        # Also check if token max_amount disagrees with intent cap
        if delegation_token.get("max_amount_usd", 0) > self.intent.get("max_order_usd", 5000):
            fail_rules.append("intent-token-binding")
            fail_reasons.append(f"Token max_amount_usd {delegation_token.get('max_amount_usd')} > intent max_order_usd {self.intent.get('max_order_usd')}")

        if fail_rules:
            return self._block(run_id, action, ticker, amount_usd, fail_rules, "; ".join(fail_reasons), 1, delegation_token, intent_token_id)

        # ── CHECK 2: Delegation Token Validation ───────────────────
        fail_rules, fail_reasons = [], []

        token_id = delegation_token.get("token_id", "")
        if token_id in self.used_tokens:
            fail_rules.append("delegation-scope-enforcement")
            fail_reasons.append("Token already used (replay attack)")

        expiry_str = delegation_token.get("expiry", "")
        try:
            expiry_dt = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > expiry_dt:
                fail_rules.append("delegation-scope-enforcement")
                fail_reasons.append("Delegation token expired")
        except Exception:
            fail_rules.append("delegation-scope-enforcement")
            fail_reasons.append("Invalid token expiry format")

        if delegation_token.get("approved_by") != "RiskAgent":
            fail_rules.append("agent-role-binding")
            fail_reasons.append(f"Token approved_by must be RiskAgent, got '{delegation_token.get('approved_by')}'")

        if delegation_token.get("handoff_count", 0) != 1:
            fail_rules.append("delegation-scope-enforcement")
            fail_reasons.append("handoff_count must be 1")

        if delegation_token.get("sub_delegation_allowed", True):
            fail_rules.append("delegation-scope-enforcement")
            fail_reasons.append("sub_delegation_allowed must be false")

        ok, reason = rules.delegation_scope_enforcement(delegation_token, action, ticker, amount_usd)
        if not ok:
            fail_rules.append("delegation-scope-enforcement"); fail_reasons.append(reason)

        if fail_rules:
            return self._block(run_id, action, ticker, amount_usd, fail_rules, "; ".join(fail_reasons), 2, delegation_token, intent_token_id)

        self.used_tokens.add(token_id)

        # ── CHECK 3: Exposure & Concentration ─────────────────────
        fail_rules, fail_reasons = [], []

        ok, reason = rules.portfolio_concentration_limit(ticker, amount_usd, portfolio_value)
        if not ok:
            fail_rules.append("portfolio-concentration-limit"); fail_reasons.append(reason)

        ok, reason = rules.sector_exposure_limit(ticker, amount_usd, portfolio_value)
        if not ok:
            fail_rules.append("sector-exposure-limit"); fail_reasons.append(reason)

        if daily_spent + amount_usd > self.intent.get("max_daily_usd", 20000):
            fail_rules.append("trade-size-limits")
            fail_reasons.append(f"Daily spend would exceed ${self.intent.get('max_daily_usd')}")

        if fail_rules:
            return self._block(run_id, action, ticker, amount_usd, fail_rules, "; ".join(fail_reasons), 3, delegation_token, intent_token_id)

        # ── CHECK 4: Regulatory & Temporal ─────────────────────────
        fail_rules, fail_reasons = [], []

        ok, reason = rules.market_hours_only(ticker)
        if not ok:
            fail_rules.append("market-hours-only"); fail_reasons.append(reason)

        ok, reason = rules.earnings_blackout_window(ticker)
        if not ok:
            fail_rules.append("earnings-blackout-window"); fail_reasons.append(reason)

        ok, reason = rules.wash_sale_prevention(ticker, action)
        if not ok:
            fail_rules.append("wash-sale-prevention"); fail_reasons.append(reason)

        if fail_rules:
            return self._block(run_id, action, ticker, amount_usd, fail_rules, "; ".join(fail_reasons), 4, delegation_token, intent_token_id)

        # ── CHECK 5: Data & Tool Access Audit ─────────────────────
        fail_rules, fail_reasons = [], []

        ok, reason = rules.agent_role_binding(submitting_agent)
        if not ok:
            fail_rules.append("agent-role-binding"); fail_reasons.append(reason)

        ok, reason = rules.tool_restrictions(submitting_agent, tools_used)
        if not ok:
            fail_rules.append("tool-restrictions"); fail_reasons.append(reason)

        ok, reason = rules.data_class_protection()
        if not ok:
            fail_rules.append("data-class-protection"); fail_reasons.append(reason)

        ok, reason = rules.directory_scoped_access()
        if not ok:
            fail_rules.append("directory-scoped-access"); fail_reasons.append(reason)

        if fail_rules:
            return self._block(run_id, action, ticker, amount_usd, fail_rules, "; ".join(fail_reasons), 5, delegation_token, intent_token_id)

        # ── ALL CHECKS PASSED → ALLOW ──────────────────────────────
        self._add_daily_spent(amount_usd)
        entry = write_audit(
            run_id=run_id, agent="TraderAgent", tool="alpaca-trading:execute",
            action=action, ticker=ticker, amount_usd=amount_usd,
            decision="ALLOW",
            delegation_token_id=delegation_token.get("token_id"),
            intent_token_id=intent_token_id,
        )
        return {
            "decision": "ALLOW",
            "action": action,
            "ticker": ticker,
            "amount_usd": amount_usd,
            "audit_id": entry.id if entry else None,
        }

    def _block(self, run_id, action, ticker, amount_usd, rule_ids, reason, check_num, token, intent_token_id):
        rule_str = ", ".join(set(rule_ids))
        entry = write_audit(
            run_id=run_id, agent="TraderAgent", tool="alpaca-trading:execute",
            action=action, ticker=ticker, amount_usd=amount_usd,
            decision="BLOCK",
            rule_id=rule_str,
            block_reason=reason,
            check_number=check_num,
            delegation_token_id=token.get("token_id"),
            intent_token_id=intent_token_id,
        )
        return {
            "decision": "BLOCK",
            "action": action,
            "ticker": ticker,
            "amount_usd": amount_usd,
            "rule_id": rule_str,
            "block_reason": reason,
            "check_number": check_num,
            "audit_id": entry.id if entry else None,
        }
