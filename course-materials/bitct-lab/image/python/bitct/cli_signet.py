"""signet-anchor — optional public anchoring of a Merkle root on signet.

The anchor key lives in the lab's disposable volume; fund its address with a
few thousand signet sats (LAB02 wallet or the instructor's reserve). Chain data
comes from a public Esplora server (mempool.space by default): the audit says so.
"""
from __future__ import annotations

import argparse
import os
import sys

from . import chain

KEY = os.environ.get("SIGNET_KEY_FILE", "/data/d17/signet-anchor-key.json")
G, R, D, X = "\033[32m", "\033[31m", "\033[2m", "\033[0m"


def main(argv=None):
    p = argparse.ArgumentParser(prog="signet-anchor", description=__doc__)
    s = p.add_subparsers(dest="cmd", required=True)
    s.add_parser("address")
    s.add_parser("balance")
    a = s.add_parser("publish"); a.add_argument("root"); a.add_argument("--fee-rate", type=float, default=2.0)
    a = s.add_parser("status"); a.add_argument("txid")
    a = p.parse_args(argv)
    key = chain.load_or_create_key(os.environ.get("SIGNET_KEY_FILE", KEY if os.path.isdir(os.path.dirname(KEY)) else "/lab/signet-anchor-key.json"))
    addr = chain.p2wpkh_address(key, "signet")
    be = chain.EsploraBackend(network="signet")
    if a.cmd == "address":
        print(f"signet anchor address: {G}{addr}{X}\n{D}send 2,000–5,000 signet sats to it (never real bitcoin){X}")
    elif a.cmd == "balance":
        us = be.utxos(addr)
        print(f"{addr}: {sum(u['value'] for u in us)} sat in {len(us)} coin(s)")
    elif a.cmd == "publish":
        res = chain.build_anchor_tx(key, "signet", be.utxos(addr), chain.anchor_payload(bytes.fromhex(a.root)), a.fee_rate)
        txid = be.broadcast(res["raw"])
        print(f"{G}root published on signet{X}: {txid}  (fee {res['fee']} sat, {res['vsize']} vB)")
        print(f"https://mempool.space/signet/tx/{txid}")
    elif a.cmd == "status":
        t = be._get(f"/tx/{a.txid}")
        st = t.get("status", {})
        print(f"confirmed in block {st['block_height']} ({st['block_hash']})" if st.get("confirmed") else "not confirmed yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
