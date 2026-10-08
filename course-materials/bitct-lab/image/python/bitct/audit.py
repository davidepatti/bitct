"""Independent receipt audit: what can an auditor check, step by step?"""
from __future__ import annotations

import datetime as dt
from typing import List, Optional

from . import chain, d17, merkle

OK, FAIL, SKIP = "PASS", "FAIL", "----"


class Step:
    def __init__(self, name: str, status: str, detail: str):
        self.name, self.status, self.detail = name, status, detail

    def __repr__(self):
        return f"[{self.status}] {self.name}: {self.detail}"


def audit_receipt(rcpt: dict, registry: Optional[List[dict]] = None, backend=None,
                  min_conf: int = 1) -> List[Step]:
    steps: List[Step] = []
    report_bytes = rcpt["report"].encode("utf-8")
    sig = bytes.fromhex(rcpt["sig"])

    # 1. exact bytes parse
    try:
        rep = d17.parse(report_bytes)
        steps.append(Step("Report bytes", OK, f"{rep.device}/{rep.key}/e{rep.enrollment} seq={rep.seq} {rep.value} {rep.unit}"))
    except d17.MalformedReport as exc:
        steps.append(Step("Report bytes", FAIL, str(exc)))
        return steps

    # 2. signature under the operator's registry key (never a key supplied by the device)
    if registry is None:
        steps.append(Step("Device signature", SKIP, "no registry supplied — cannot attribute the report"))
    else:
        b = next((x for x in registry if x["device"] == rep.device and x["key_id"] == rep.key
                  and int(x["enrollment"]) == rep.enrollment), None)
        if b is None:
            steps.append(Step("Device signature", FAIL, "binding not found in the registry export"))
        else:
            ok = d17.bip340.verify(bytes.fromhex(b["pubkey"]), d17.message(report_bytes), sig)
            steps.append(Step("Device signature", OK if ok else FAIL,
                              f"BIP340 under registered key {b['pubkey'][:16]}… (binding now {b['status']})"))

    # 3. application Merkle proof -> batch root
    m = rcpt["merkle"]
    leaf = merkle.leaf_hash(d17.leaf_bytes(report_bytes, sig))
    got_root = merkle.root_from_proof(leaf, merkle.path_from_json(m["path"]))
    root_ok = got_root.hex() == m["root"]
    steps.append(Step("Merkle path", OK if root_ok else FAIL,
                      f"leaf {m['leaf_index']} of {m['tree_size']}, {len(m['path'])} hashes → {got_root.hex()[:16]}…"
                      + ("" if root_ok else f" ≠ receipt root {m['root'][:16]}…")))

    a = rcpt.get("anchor") or {}
    if not a.get("txid"):
        steps.append(Step("Anchor transaction", SKIP, "batch not anchored yet"))
        return steps
    if backend is None:
        backend = chain.backend_for(a["network"])

    # 4. the transaction commits to the root (OP_RETURN)
    try:
        tx = backend.tx(a["txid"], a.get("blockhash"))
    except Exception as exc:  # noqa: BLE001
        steps.append(Step("Anchor transaction", FAIL, f"cannot fetch {a['txid'][:16]}…: {exc}"))
        return steps
    committed = None
    for o in tx["vout"]:
        data = chain.op_return_data(o["scriptPubKey"]["hex"])
        if data is not None and chain.parse_payload(data):
            committed = chain.parse_payload(data)
    if committed is None:
        steps.append(Step("Anchor transaction", FAIL, "no BITCT OP_RETURN output in the transaction"))
        return steps
    steps.append(Step("Anchor transaction", OK if committed == got_root else FAIL,
                      f"OP_RETURN commits to {committed.hex()[:16]}…" +
                      ("" if committed == got_root else " — does NOT match the recomputed root")))

    # 5. the transaction is in a block of the best chain
    bh = a.get("blockhash") or tx.get("blockhash")
    if not bh:
        steps.append(Step("Block inclusion", SKIP, "transaction not confirmed yet"))
        return steps
    inc = backend.tx_inclusion(a["txid"], bh)
    when = dt.datetime.fromtimestamp(inc["time"], dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    good = inc["ok"] and inc["in_best_chain"] and inc["confirmations"] >= min_conf
    steps.append(Step("Block inclusion", OK if good else FAIL,
                      f"block {inc['height']} ({when}), {inc['confirmations']} confirmation(s) via {inc['method']}"))
    if inc.get("trust_note"):
        steps.append(Step("Trust boundary", SKIP, inc["trust_note"]))
    return steps


def verdict(steps: List[Step]) -> str:
    if any(s.status == FAIL for s in steps):
        return "NOT VERIFIED"
    if any(s.status == SKIP and s.name in ("Device signature", "Anchor transaction", "Block inclusion") for s in steps):
        return "INCOMPLETE"
    return "VERIFIED"


CLAIM_LIMITS = [
    "proves: these exact bytes were committed no later than the block time",
    "does not prove: the reading is physically true",
    "does not prove: no other reading was omitted from the batch",
    "does not prove: when the device actually measured the value",
]
