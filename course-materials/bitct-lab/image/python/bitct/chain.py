"""Chain access for anchoring and auditing.

Two interchangeable backends expose the few operations a receipt needs:

* CoreBackend   — a Bitcoin Core node over JSON-RPC (regtest in the labs);
* EsploraBackend — a public Esplora REST API (signet, e.g. mempool.space).

The Esplora path trusts that server for chain data unless the auditor runs
their own node: the audit report states this boundary explicitly.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from typing import List, Optional

from .rpc import BitcoinRPC, RPCError

MAGIC = b"BITCT"
VERSION_ROOT = 0x01


def anchor_payload(root: bytes) -> bytes:
    """OP_RETURN data: b'BITCT' || 0x01 || 32-byte Merkle root (38 bytes)."""
    if len(root) != 32:
        raise ValueError("root must be 32 bytes")
    return MAGIC + bytes([VERSION_ROOT]) + root


def parse_payload(data: bytes) -> Optional[bytes]:
    if len(data) == 38 and data[:5] == MAGIC and data[5] == VERSION_ROOT:
        return data[6:]
    return None


def op_return_data(script_hex: str) -> Optional[bytes]:
    """Return the pushed bytes of a single-push OP_RETURN script, else None."""
    s = bytes.fromhex(script_hex)
    if not s or s[0] != 0x6A:
        return None
    if len(s) == 1:
        return b""
    op = s[1]
    if 1 <= op <= 75:
        return s[2:2 + op] if len(s) == 2 + op else None
    if op == 0x4C and len(s) >= 3:
        return s[3:3 + s[2]] if len(s) == 3 + s[2] else None
    return None


def dsha256(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def bits_to_target(bits: int) -> int:
    exp = bits >> 24
    mant = bits & 0x007FFFFF
    return mant << (8 * (exp - 3)) if exp > 3 else mant >> (8 * (3 - exp))


class CoreBackend:
    name = "bitcoin-core"

    def __init__(self, rpc: Optional[BitcoinRPC] = None):
        self.rpc = rpc or BitcoinRPC()
        self.network = self.rpc.getblockchaininfo()["chain"]

    def tx(self, txid: str, blockhash: Optional[str] = None) -> dict:
        if blockhash:
            return self.rpc.getrawtransaction(txid, True, blockhash)
        return self.rpc.getrawtransaction(txid, True)

    def tx_inclusion(self, txid: str, blockhash: str) -> dict:
        proof = self.rpc.gettxoutproof([txid], blockhash)
        ok = self.rpc.verifytxoutproof(proof) == [txid]
        hdr = self.rpc.getblockheader(blockhash)
        return {"ok": ok, "method": "gettxoutproof + verifytxoutproof", "proof_bytes": len(proof) // 2,
                "header": hdr, "in_best_chain": hdr.get("confirmations", -1) > 0,
                "confirmations": hdr.get("confirmations", 0), "height": hdr.get("height"),
                "time": hdr.get("time")}

    def broadcast(self, raw_hex: str) -> str:
        return self.rpc.sendrawtransaction(raw_hex)

    def utxos(self, address: str) -> List[dict]:
        res = self.rpc.scantxoutset("start", [f"addr({address})"])
        return [{"txid": u["txid"], "vout": u["vout"], "value": int(round(float(u["amount"]) * 1e8))}
                for u in res.get("unspents", [])]


class EsploraBackend:
    name = "esplora"

    def __init__(self, base_url: Optional[str] = None, network: str = "signet"):
        self.base = (base_url or os.environ.get("ESPLORA_URL", "https://mempool.space/signet/api")).rstrip("/")
        self.network = network

    def _get(self, path: str, raw: bool = False):
        req = urllib.request.Request(self.base + path, headers={"User-Agent": "bitct-lab"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
        return body.decode() if raw else json.loads(body)

    def tx(self, txid: str, blockhash: Optional[str] = None) -> dict:
        t = self._get(f"/tx/{txid}")
        st = t.get("status", {})
        return {"txid": t["txid"], "blockhash": st.get("block_hash"),
                "vout": [{"n": i, "value": o["value"] / 1e8,
                          "scriptPubKey": {"hex": o["scriptpubkey"], "type": o.get("scriptpubkey_type")}}
                         for i, o in enumerate(t["vout"])]}

    def tx_inclusion(self, txid: str, blockhash: str) -> dict:
        mp = self._get(f"/tx/{txid}/merkle-proof")
        header_hex = self._get(f"/block/{blockhash}/header", raw=True).strip()
        header = bytes.fromhex(header_hex)
        computed_hash = dsha256(header)[::-1].hex()
        merkle_root = header[36:68]
        h = bytes.fromhex(txid)[::-1]
        pos = mp["pos"]
        for sib_hex in mp["merkle"]:
            sib = bytes.fromhex(sib_hex)[::-1]
            h = dsha256(sib + h) if pos & 1 else dsha256(h + sib)
            pos >>= 1
        bits = int.from_bytes(header[72:76], "little")
        pow_ok = int(computed_hash, 16) <= bits_to_target(bits)
        status = self._get(f"/block/{blockhash}/status")
        tip = int(self._get("/blocks/tip/height", raw=True))
        height = mp.get("block_height")
        return {"ok": computed_hash == blockhash and h == merkle_root and pow_ok,
                "method": "Esplora merkle-proof checked against the block header",
                "in_best_chain": bool(status.get("in_best_chain")),
                "confirmations": (tip - height + 1) if status.get("in_best_chain") else 0,
                "height": height, "time": int.from_bytes(header[68:72], "little"),
                "trust_note": f"chain data served by {self.base}"}

    def broadcast(self, raw_hex: str) -> str:
        req = urllib.request.Request(self.base + "/tx", data=raw_hex.encode(), method="POST",
                                     headers={"Content-Type": "text/plain", "User-Agent": "bitct-lab"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode().strip()
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"broadcast rejected: {exc.read().decode(errors='replace')}") from None

    def utxos(self, address: str) -> List[dict]:
        return [{"txid": u["txid"], "vout": u["vout"], "value": u["value"],
                 "confirmed": u.get("status", {}).get("confirmed", False)}
                for u in self._get(f"/address/{address}/utxo")]


def backend_for(network: str):
    if network == "regtest":
        return CoreBackend()
    if network == "signet":
        return EsploraBackend(network="signet")
    raise ValueError(f"unsupported network {network}")


# ---------------------------------------------------------------------------
# Anchoring with a Bitcoin Core wallet (regtest labs)
# ---------------------------------------------------------------------------

def anchor_with_core_wallet(wallet_rpc: BitcoinRPC, payload: bytes, fee_rate_sat_vb: float = 2.0) -> dict:
    res = wallet_rpc.send([{"data": payload.hex()}], None, "unset", fee_rate_sat_vb)
    txid = res["txid"]
    tx = wallet_rpc.getrawtransaction(txid, True)
    vout = next(o["n"] for o in tx["vout"] if o["scriptPubKey"]["hex"].startswith("6a"))
    return {"txid": txid, "vout": vout}


# ---------------------------------------------------------------------------
# Anchoring with a single-key P2WPKH wallet built with embit (signet step)
# ---------------------------------------------------------------------------

def _embit():
    from embit import ec, script
    from embit.networks import NETWORKS
    from embit.transaction import Transaction, TransactionInput, TransactionOutput
    return ec, script, NETWORKS, Transaction, TransactionInput, TransactionOutput


def load_or_create_key(path: str):
    ec = _embit()[0]
    if os.path.exists(path):
        with open(path) as f:
            return ec.PrivateKey(bytes.fromhex(json.load(f)["secret"]))
    key = ec.PrivateKey(os.urandom(32))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump({"secret": key.secret.hex(), "note": "lab-only test key; never send real bitcoin"}, f)
    os.chmod(path, 0o600)
    return key


def p2wpkh_address(key, network: str) -> str:
    _, script, NETWORKS, *_ = _embit()
    return script.p2wpkh(key.get_public_key()).address(NETWORKS[network])


def build_anchor_tx(key, network: str, utxos: List[dict], payload: bytes, fee_rate: float = 2.0) -> dict:
    """Spend all given P2WPKH UTXOs: one OP_RETURN output and change back to the same address."""
    ec, script, NETWORKS, Transaction, TransactionInput, TransactionOutput = _embit()
    if not utxos:
        raise ValueError("no spendable coins at the anchor address — fund it first")
    pub = key.get_public_key()
    spk = script.p2wpkh(pub)
    total = sum(u["value"] for u in utxos)
    op_ret = script.Script(b"\x6a" + bytes([len(payload)]) + payload)
    vsize = 11 + 68 * len(utxos) + (9 + len(op_ret.data)) + 31
    fee = int(vsize * fee_rate + 0.999)
    change = total - fee
    if change < 330:
        raise ValueError(f"not enough funds: have {total} sat, need fee {fee} + dust limit")
    vin = [TransactionInput(bytes.fromhex(u["txid"]), u["vout"]) for u in utxos]
    vout = [TransactionOutput(0, op_ret), TransactionOutput(change, spk)]
    tx = Transaction(vin=vin, vout=vout)
    script_code = script.p2pkh(pub)
    for i, u in enumerate(utxos):
        h = tx.sighash_segwit(i, script_code, u["value"])
        sig = key.sign(h).serialize() + b"\x01"
        tx.vin[i].witness = script.Witness([sig, pub.sec()])
    return {"raw": tx.serialize().hex(), "txid": tx.txid().hex(), "fee": fee, "vsize": vsize,
            "vout": 0, "change": change}
