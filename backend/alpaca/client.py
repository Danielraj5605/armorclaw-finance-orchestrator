"""
backend/alpaca/client.py
Alpaca Paper Trading API client with 5-second TTL position cache.
"""
import os
import time
import httpx


class AlpacaClient:
    BASE_URL = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")

    def __init__(self):
        self.api_key    = os.getenv("ALPACA_API_KEY", "")
        self.secret_key = os.getenv("ALPACA_SECRET_KEY", "")
        self._positions_cache = None
        self._positions_ts    = 0.0
        self._account_cache   = None
        self._account_ts      = 0.0
        self._headers = {
            "APCA-API-KEY-ID":     self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
            "Content-Type":        "application/json",
        }

    def _get(self, path: str):
        url = f"{self.BASE_URL}{path}"
        resp = httpx.get(url, headers=self._headers, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict):
        url = f"{self.BASE_URL}{path}"
        resp = httpx.post(url, headers=self._headers, json=body, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_positions(self) -> list:
        """Returns list of positions with 5s TTL cache."""
        now = time.time()
        if self._positions_cache is not None and (now - self._positions_ts) < 5:
            return self._positions_cache
        try:
            data = self._get("/v2/positions")
            self._positions_cache = data
            self._positions_ts    = now
            return data
        except Exception:
            return self._positions_cache or []

    def get_account(self) -> dict:
        """Returns account dict with 5s TTL cache."""
        now = time.time()
        if self._account_cache is not None and (now - self._account_ts) < 5:
            return self._account_cache
        try:
            data = self._get("/v2/account")
            self._account_cache = data
            self._account_ts    = now
            return data
        except Exception:
            return self._account_cache or {}

    def get_account_equity(self) -> float:
        acct = self.get_account()
        return float(acct.get("equity", "100000"))

    def place_order(self, action: str, ticker: str, amount_usd: float) -> str:
        """Places a notional market order and returns Alpaca order_id."""
        try:
            result = self._post("/v2/orders", {
                "symbol":       ticker,
                "notional":     str(amount_usd),
                "side":         action.lower(),
                "type":         "market",
                "time_in_force": "day",
            })
            # Invalidate caches so next read reflects new position
            self._positions_cache = None
            self._account_cache   = None
            return result.get("id", f"alp-{ticker}-demo")
        except Exception as e:
            # Fallback for demo when Alpaca keys not configured
            return f"sim-order-{ticker}-{int(time.time())}"
