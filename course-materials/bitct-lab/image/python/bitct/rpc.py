"""Minimal Bitcoin Core JSON-RPC client (standard library only)."""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Any, Optional

DEFAULT_PORTS = {"regtest": 18443, "signet": 38332, "testnet4": 48332, "main": 8332}


class RPCError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(f"RPC error {code}: {message}")
        self.code = code
        self.message = message


class BitcoinRPC:
    def __init__(self, host: Optional[str] = None, port: Optional[int] = None,
                 user: Optional[str] = None, password: Optional[str] = None,
                 wallet: Optional[str] = None, timeout: float = 60.0):
        chain = os.environ.get("BITCOIN_CHAIN", "regtest")
        self.host = host or os.environ.get("BTC_RPC_HOST", "node-a")
        self.port = int(port or os.environ.get("BTC_RPC_PORT", DEFAULT_PORTS.get(chain, 18443)))
        self.user = user or os.environ.get("BTC_RPC_USER", "lab")
        self.password = password or os.environ.get("BTC_RPC_PASSWORD", "lab")
        self.wallet = wallet
        self.timeout = timeout
        self._id = 0

    def with_wallet(self, wallet: str) -> "BitcoinRPC":
        return BitcoinRPC(self.host, self.port, self.user, self.password, wallet, self.timeout)

    def call(self, method: str, *params: Any) -> Any:
        self._id += 1
        url = f"http://{self.host}:{self.port}/"
        if self.wallet is not None:
            url += f"wallet/{self.wallet}"
        body = json.dumps({"jsonrpc": "1.0", "id": self._id, "method": method,
                           "params": list(params)}, default=str).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        token = base64.b64encode(f"{self.user}:{self.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read(), parse_float=Decimal)
        except urllib.error.HTTPError as exc:  # Core returns 500 with a JSON error body
            try:
                data = json.loads(exc.read(), parse_float=Decimal)
            except Exception:
                raise RPCError(exc.code, str(exc)) from None
        if data.get("error"):
            raise RPCError(data["error"].get("code", -1), data["error"].get("message", "?"))
        return data["result"]

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        return lambda *params: self.call(name, *params)


def ensure_wallet(rpc: BitcoinRPC, name: str) -> BitcoinRPC:
    """Load or create a descriptor wallet and return an RPC bound to it."""
    loaded = rpc.listwallets()
    if name not in loaded:
        try:
            rpc.loadwallet(name)
        except RPCError:
            rpc.createwallet(name)
    return rpc.with_wallet(name)
