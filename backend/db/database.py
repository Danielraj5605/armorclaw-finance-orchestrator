"""
backend/db/database.py
SQLAlchemy engine, session factory, and audit log table definition.
"""
import os
from sqlalchemy import (
    create_engine, Column, Integer, Float, String, DateTime, Text
)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./auratrade_audit.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


class AuditLog(Base):
    __tablename__ = "audit_log"

    id                  = Column(Integer, primary_key=True, index=True)
    timestamp           = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    run_id              = Column(String(64), index=True)
    agent               = Column(String(50))
    tool                = Column(String(100))
    action              = Column(String(10))
    ticker              = Column(String(20))   # up to 20 chars for crypto (BTC/USD etc.)
    amount_usd          = Column(Float)
    decision            = Column(String(10), index=True)  # ALLOW | BLOCK
    rule_id             = Column(String(255), nullable=True)
    block_reason        = Column(Text, nullable=True)
    check_number        = Column(Integer, nullable=True)
    delegation_token_id = Column(String(64), nullable=True)
    intent_token_id     = Column(String(64), nullable=True)
    proof_hash          = Column(String(64), nullable=True)
    alpaca_order_id     = Column(String(100), nullable=True)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
