"""
backend/armorclaw/audit_logger.py
Writes tamper-evident, proof-hash-chained entries to the SQLite audit log.
"""
import hashlib
import json
from datetime import datetime, timezone
from backend.db.database import AuditLog, SessionLocal

_last_proof_hash = "GENESIS"


def _compute_proof_hash(entry_dict: dict, prev_hash: str) -> str:
    payload = json.dumps({"prev": prev_hash, **entry_dict}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def write_audit(
    run_id: str,
    agent: str,
    tool: str,
    action: str,
    ticker: str,
    amount_usd: float,
    decision: str,
    rule_id: str = None,
    block_reason: str = None,
    check_number: int = None,
    delegation_token_id: str = None,
    intent_token_id: str = None,
    alpaca_order_id: str = None,
) -> AuditLog:
    global _last_proof_hash

    entry_data = {
        "run_id": run_id, "agent": agent, "tool": tool,
        "action": action, "ticker": ticker, "amount_usd": amount_usd,
        "decision": decision, "rule_id": rule_id,
        "block_reason": block_reason, "check_number": check_number,
        "delegation_token_id": delegation_token_id,
        "intent_token_id": intent_token_id,
        "alpaca_order_id": alpaca_order_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    proof = _compute_proof_hash(entry_data, _last_proof_hash)
    _last_proof_hash = proof

    db = SessionLocal()
    try:
        entry = AuditLog(
            run_id=run_id, agent=agent, tool=tool,
            action=action, ticker=ticker, amount_usd=amount_usd,
            decision=decision, rule_id=rule_id,
            block_reason=block_reason, check_number=check_number,
            delegation_token_id=delegation_token_id,
            intent_token_id=intent_token_id,
            alpaca_order_id=alpaca_order_id,
            proof_hash=proof,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry
    finally:
        db.close()
