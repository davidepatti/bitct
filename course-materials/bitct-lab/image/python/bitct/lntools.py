"""Lightning helpers for DLAB 08/09: funding, the frozen routing topology and readable views.

    ln-fund <node> <btc>      on-chain coins for an LND node (regtest)
    ln-topology               build the DLAB 09 four-node topology (about 2 minutes)
    lnview graph|payment|balances|names
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

from .rpc import BitcoinRPC, ensure_wallet

NODES = ["alice", "bob", "carol", "dave"]


def ln(node, *args, check=True):
    r = subprocess.run([f"ln-{node}", *args], capture_output=True, text=True, timeout=120)
    if check and r.returncode != 0:
        raise RuntimeError(f"ln-{node} {' '.join(args)}: {r.stderr.strip() or r.stdout.strip()}")
    try:
        return json.loads(r.stdout) if r.stdout.strip() else {}
    except json.JSONDecodeError:
        return {"raw": r.stdout}


def miner():
    rpc = BitcoinRPC()
    w = ensure_wallet(rpc, "miner")
    return rpc, w


def mine(n=1):
    rpc, w = miner()
    rpc.generatetoaddress(n, w.getnewaddress())
    return rpc.getblockcount()


def wait_synced(node, height=None, timeout=90):
    for _ in range(timeout * 2):
        i = ln(node, "getinfo", check=False)
        if i.get("synced_to_chain") and (height is None or i.get("block_height", 0) >= height):
            return i
        time.sleep(0.5)
    raise RuntimeError(f"{node} not synced")


def fund(node, btc):
    rpc, w = miner()
    if rpc.getblockcount() < 101 or w.getbalance() < btc + 1:
        rpc.generatetoaddress(101, w.getnewaddress())
    addr = ln(node, "newaddress", "p2tr")["address"]
    w.sendtoaddress(addr, btc)
    h = mine(1)
    wait_synced(node, h)
    for _ in range(60):
        if int(ln(node, "walletbalance").get("confirmed_balance", 0)) >= int(btc * 1e8):
            break
        time.sleep(0.5)
    return addr


def pubkeys():
    return {n: ln(n, "getinfo")["identity_pubkey"] for n in NODES if ln(n, "getinfo", check=False).get("identity_pubkey")}


def names():
    return {v: k for k, v in pubkeys().items()}


def open_channel(a, b, amt, push=0):
    pk = ln(b, "getinfo")["identity_pubkey"]
    ln(a, "connect", f"{pk}@{b}:9735", check=False)
    args = ["openchannel", "--node_key", pk, "--local_amt", str(amt)]
    if push:
        args += ["--push_amt", str(push)]
    for _ in range(30):
        try:
            return ln(a, *args)
        except RuntimeError as exc:
            last = str(exc)
            if "not enough witness outputs" in last or "is not online" in last or "syncing" in last \
                    or "pending" in last or "insufficient" in last:
                time.sleep(1)
                continue
            raise
    raise RuntimeError(f"could not open {a}->{b}: {last}")


def set_policy(node, chan_point, base_msat, ppm, tld=40):
    ln(node, "updatechanpolicy", "--base_fee_msat", str(base_msat), "--fee_rate_ppm", str(ppm),
       "--time_lock_delta", str(tld), "--chan_point", chan_point)


def chan_point(a, b_pub):
    for c in ln(a, "listchannels")["channels"]:
        if c["remote_pubkey"] == b_pub:
            return c["channel_point"]
    return None


def topology():
    print("1/5 funding alice, bob and carol on-chain …", flush=True)
    for n, btc in (("alice", 1.5), ("alice", 1.5), ("bob", 1), ("carol", 1)):
        fund(n, btc)   # alice gets two coins: one per channel she opens
    pk = pubkeys()
    print("2/5 opening four channels …", flush=True)
    open_channel("alice", "bob", 1_000_000)
    open_channel("bob", "dave", 600_000, push=500_000)     # bob keeps only ~100k outbound: hidden!
    open_channel("carol", "dave", 1_000_000)
    mine(1)
    wait_synced("alice", None)
    open_channel("alice", "carol", 1_000_000)
    print("3/5 confirming funding transactions (6 blocks) …", flush=True)
    h = mine(6)
    for n in NODES:
        wait_synced(n, h)
    for _ in range(120):
        if all(ln(n, "getinfo")["num_active_channels"] >= need for n, need in
               (("alice", 2), ("bob", 2), ("carol", 2), ("dave", 2))):
            break
        time.sleep(1)
    print("4/5 setting routing fees (bob cheap, carol expensive) …", flush=True)
    set_policy("alice", chan_point("alice", pk["bob"]), 1000, 1)
    set_policy("alice", chan_point("alice", pk["carol"]), 1000, 1)
    set_policy("bob", chan_point("bob", pk["dave"]), 1000, 10)
    set_policy("bob", chan_point("bob", pk["alice"]), 1000, 10)
    set_policy("carol", chan_point("carol", pk["dave"]), 1000, 2000)
    set_policy("carol", chan_point("carol", pk["alice"]), 1000, 2000)
    for n in ("dave",):
        for peer in ("bob", "carol"):
            set_policy(n, chan_point(n, pk[peer]), 1000, 1)
    mine(1)
    print("5/5 waiting until alice has heard about every channel and fee (gossip) …", flush=True)
    for _ in range(180):
        g = ln("alice", "describegraph")
        edges = g.get("edges", [])
        ok = len(edges) >= 4 and all(e.get("node1_policy") and e.get("node2_policy") for e in edges)
        if ok and any(int(e["node1_policy"]["fee_rate_milli_msat"]) == 2000 or int(e["node2_policy"]["fee_rate_milli_msat"]) == 2000 for e in edges):
            break
        time.sleep(1)
    print("topology ready: alice–bob–dave (cheap) and alice–carol–dave (expensive)")


def view_graph():
    nm = names()
    g = ln("alice", "describegraph")
    print("alice's public view (gossip): capacity and fees per direction — no balances")
    print(f"{'channel':<14}{'capacity':>11}   {'direction':<14}{'base msat':>10}{'ppm':>7}")
    for e in g["edges"]:
        a, b = nm.get(e["node1_pub"], e["node1_pub"][:8]), nm.get(e["node2_pub"], e["node2_pub"][:8])
        for src, dst, pol in ((a, b, e.get("node1_policy")), (b, a, e.get("node2_policy"))):
            if pol:
                print(f"{a + '–' + b:<14}{int(e['capacity']):>11,}   {src + '→' + dst:<14}{int(pol['fee_base_msat']):>10}{int(pol['fee_rate_milli_msat']):>7}")


def view_payment(path=None):
    nm = names()
    if path:
        p = json.load(open(path))
    else:
        pays = ln("alice", "listpayments")["payments"]
        if not pays:
            print("no payments yet")
            return
        p = pays[-1]
    print(f"payment {p['payment_hash'][:16]}…  {p['status']}  amount {p['value_sat']} sat  fee {p['fee_sat']} sat  attempts {len(p['htlcs'])}")
    for i, h in enumerate(p["htlcs"], 1):
        hops = " → ".join(["alice"] + [nm.get(x["pub_key"], x["pub_key"][:8]) for x in h["route"]["hops"]])
        fail = h.get("failure") or {}
        why = f"  {fail.get('code')} at hop {fail.get('failure_source_index')}" if fail else ""
        print(f"  attempt {i}: {hops:<28} {h['status']}{why}  fees {h['route'].get('total_fees')} sat")


def view_balances():
    nm = names()
    print("EVALUATOR VIEW — real balances, hidden from the sender")
    seen = set()
    for n in NODES:
        for c in ln(n, "listchannels").get("channels", []):
            if c["channel_point"] in seen:
                continue
            seen.add(c["channel_point"])
            peer = nm.get(c["remote_pubkey"], c["remote_pubkey"][:8])
            print(f"  {n + '–' + peer:<12} capacity {int(c['capacity']):>9,}   {n} can send {int(c['local_balance']):>9,}   "
                  f"{peer} can send {int(c['remote_balance']):>9,}")


def main_fund(argv=None):
    p = argparse.ArgumentParser(prog="ln-fund")
    p.add_argument("node", choices=NODES); p.add_argument("btc", type=float)
    a = p.parse_args(argv)
    addr = fund(a.node, a.btc)
    print(f"sent {a.btc} BTC to {a.node} ({addr}) and mined 1 block")
    print(json.dumps(ln(a.node, "walletbalance"), indent=1))


def main_topology(argv=None):
    topology()


def main_view(argv=None):
    p = argparse.ArgumentParser(prog="lnview")
    p.add_argument("what", choices=["graph", "payment", "balances", "names"])
    p.add_argument("file", nargs="?", help="payment: JSON saved from 'payinvoice --json' (keeps failed attempts)")
    a = p.parse_args(argv)
    if a.what == "names":
        for k, v in pubkeys().items():
            print(f"{k:<6} {v}")
    else:
        if a.what == "payment":
            view_payment(a.file)
        else:
            {"graph": view_graph, "balances": view_balances}[a.what]()


if __name__ == "__main__":
    main_view()
