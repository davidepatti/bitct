"""Small, transparent command-line helpers used by the Docker labs:

  bip340   keygen | sign | verify | vectors           (LAB-BTC-AUTH)
  addr     decode <address>                           (LAB-BTC-AUTH)
  header   decode <80-byte hex> | block <height|hash>  (LAB-BTC-STRUCTURES)
  merkle   bitcoin | build | proof | anchor | receipt | verify  (STRUCTURES, INTEGRITY-ANCHOR)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys

from . import bip340, chain, merkle
from .rpc import BitcoinRPC, RPCError, ensure_wallet

G, R, Y, B, D, X = "\033[32m", "\033[31m", "\033[33m", "\033[1m", "\033[2m", "\033[0m"
if not sys.stdout.isatty() and not os.environ.get("FORCE_COLOR"):
    G = R = Y = B = D = X = ""
MSG_TAG = "BITCT/lab-message"


# ---------------------------------------------------------------- bip340 ----
def bip340_main(argv=None):
    p = argparse.ArgumentParser(prog="bip340", description="BIP340 Schnorr signatures (teaching implementation)")
    s = p.add_subparsers(dest="cmd", required=True)
    s.add_parser("keygen")
    a = s.add_parser("sign"); a.add_argument("--secret", required=True); a.add_argument("--text", required=True)
    a = s.add_parser("verify"); a.add_argument("--pubkey", required=True); a.add_argument("--text", required=True)
    a.add_argument("--sig", required=True)
    s.add_parser("vectors")
    a = p.parse_args(argv)
    if a.cmd == "keygen":
        sk = os.urandom(32)
        print(f"secret key  {R}{sk.hex()}{X}   (keep private — lab only)")
        print(f"public key  {G}{bip340.pubkey_gen(sk).hex()}{X}   (x-only, 32 bytes)")
    elif a.cmd == "sign":
        sk = bytes.fromhex(a.secret)
        m = bip340.tagged_hash(MSG_TAG, a.text.encode())
        sig = bip340.sign(sk, m)
        print(f"text       {a.text!r} ({len(a.text.encode())} bytes)")
        print(f"m          {m.hex()}   = TaggedHash('{MSG_TAG}', text)")
        print(f"signature  {sig.hex()}")
        print(f"           {D}R.x = {sig[:32].hex()}  s = {sig[32:].hex()}{X}")
    elif a.cmd == "verify":
        m = bip340.tagged_hash(MSG_TAG, a.text.encode())
        ok = bip340.verify(bytes.fromhex(a.pubkey), m, bytes.fromhex(a.sig))
        print(f"{G}VALID{X} — this key signed exactly this text" if ok else
              f"{R}INVALID{X} — wrong key, changed text or changed signature")
        return 0 if ok else 1
    elif a.cmd == "vectors":
        import csv
        path = os.path.join(os.path.dirname(__file__), "data", "bip340-test-vectors.csv")
        n = bad = 0
        for row in csv.DictReader(open(path)):
            pk, msg, sig = (bytes.fromhex(row[k]) for k in ("public key", "message", "signature"))
            ok = bip340.verify(pk, msg, sig) == (row["verification result"] == "TRUE")
            if row["secret key"]:
                ok &= bip340.sign(bytes.fromhex(row["secret key"]), msg, bytes.fromhex(row["aux_rand"])) == sig
            n += 1
            bad += not ok
            print(f"vector {row['index']:>2}: {G + 'ok' + X if ok else R + 'FAIL' + X}  {D}{row['comment']}{X}")
        print(f"{n - bad}/{n} official BIP340 test vectors reproduced")
    return 0


# ------------------------------------------------------------------ addr ----
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
VERSIONS = {0x00: ("mainnet", "P2PKH"), 0x05: ("mainnet", "P2SH"), 0x6F: ("test networks", "P2PKH"),
            0xC4: ("test networks", "P2SH")}
HRPS = {"bc": "mainnet", "tb": "testnet/signet", "bcrt": "regtest"}


def _bech32_polymod(values):
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((b >> i) & 1) else 0
    return chk


def _convertbits(data, frm, to):
    acc = bits = 0
    out = []
    for v in data:
        acc = (acc << frm) | v
        bits += frm
        while bits >= to:
            bits -= to
            out.append((acc >> bits) & ((1 << to) - 1))
    if bits >= frm or ((acc << (to - bits)) & ((1 << to) - 1)):
        return None
    return out


def addr_main(argv=None):
    p = argparse.ArgumentParser(prog="addr", description="Decode a Bitcoin address and check its checksum")
    p.add_argument("cmd", choices=["decode"])
    p.add_argument("address")
    a = p.parse_args(argv)
    s = a.address.strip()
    if s.lower().startswith(("bc1", "tb1", "bcrt1")):
        low = s.lower()
        if s != low and s != s.upper():
            print(f"{R}mixed case is not allowed in bech32{X}")
            return 1
        hrp, _, data = low.rpartition("1")
        try:
            vals = [BECH.index(c) for c in data]
        except ValueError:
            print(f"{R}invalid bech32 character{X}")
            return 1
        poly = _bech32_polymod([ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp] + vals)
        variant = {1: "bech32 (BIP173)", 0x2BC830A3: "bech32m (BIP350)"}.get(poly)
        wv = vals[0]
        prog = _convertbits(vals[1:-6], 5, 8)
        print(f"{B}encoding{X}        {variant or R + 'checksum FAILED' + X}")
        print(f"{B}network (hrp){X}   {hrp} → {HRPS.get(hrp, 'unknown')}")
        print(f"{B}witness version{X} {wv}  ({'SegWit v0' if wv == 0 else 'Taproot (v1)' if wv == 1 else 'future version'})")
        if prog is not None:
            kind = {(0, 20): "P2WPKH: hash160 of a public key", (0, 32): "P2WSH: sha256 of a script",
                    (1, 32): "P2TR: x-only output key"}.get((wv, len(prog)), "unusual program length")
            print(f"{B}program{X}         {bytes(prog).hex()}  ({len(prog)} bytes: {kind})")
        rule_ok = variant == ("bech32 (BIP173)" if wv == 0 else "bech32m (BIP350)")
        print(f"{B}valid{X}           {G + 'yes' + X if variant and rule_ok and prog else R + 'no' + X}"
              + ("" if rule_ok else f"  {Y}(v0 must use bech32, v1+ must use bech32m){X}"))
        return 0 if variant and rule_ok else 1
    n = 0
    for c in s:
        if c not in B58:
            print(f"{R}invalid base58 character {c!r}{X}")
            return 1
        n = n * 58 + B58.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    raw = b"\x00" * (len(s) - len(s.lstrip("1"))) + raw
    payload, chk = raw[:-4], raw[-4:]
    ok = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] == chk
    net, kind = VERSIONS.get(payload[0], ("unknown", "unknown"))
    print(f"{B}encoding{X}        Base58Check")
    print(f"{B}version byte{X}    0x{payload[0]:02x} → {kind} on {net}")
    print(f"{B}payload{X}         {payload[1:].hex()}  ({len(payload) - 1} bytes: {'hash160 of a public key' if kind == 'P2PKH' else 'hash160 of a script'})")
    print(f"{B}checksum{X}        {chk.hex()}  {G + 'matches' + X if ok else R + 'does NOT match' + X}")
    return 0 if ok else 1


# -------------------------------------------------------------- hashdiff ----
def hashdiff_main(argv=None):
    p = argparse.ArgumentParser(prog="hashdiff", description="SHA-256 of two texts and how many bits differ")
    p.add_argument("text1"); p.add_argument("text2")
    a = p.parse_args(argv)
    h1, h2 = (hashlib.sha256(t.encode()).digest() for t in (a.text1, a.text2))
    diff = sum(bin(x ^ y).count("1") for x, y in zip(h1, h2))
    changed = sum(1 for x, y in zip(a.text1.encode(), a.text2.encode()) if x != y) + abs(len(a.text1) - len(a.text2))
    print(f"text 1  {a.text1!r}\nsha256  {h1.hex()}")
    print(f"text 2  {a.text2!r}\nsha256  {h2.hex()}")
    marks = "".join("^" if x != y else " " for x, y in zip(h1.hex(), h2.hex()))
    print(f"        {marks}")
    print(f"{changed} input byte(s) differ → {diff} of 256 output bits differ ({diff / 2.56:.0f}%)")
    return 0


# ---------------------------------------------------------------- header ----
def _decode_header(h: bytes):
    f = {"version": int.from_bytes(h[0:4], "little"), "prev": h[4:36][::-1].hex(), "merkle_root": h[36:68][::-1].hex(),
         "time": int.from_bytes(h[68:72], "little"), "bits": int.from_bytes(h[72:76], "little"),
         "nonce": int.from_bytes(h[76:80], "little")}
    f["hash"] = chain.dsha256(h)[::-1].hex()
    f["target"] = chain.bits_to_target(f["bits"])
    return f


def header_main(argv=None):
    p = argparse.ArgumentParser(prog="header", description="Decode an 80-byte block header field by field")
    s = p.add_subparsers(dest="cmd", required=True)
    a = s.add_parser("decode"); a.add_argument("hex")
    a = s.add_parser("block"); a.add_argument("ref", help="height or block hash"); a.add_argument("--node", default=None)
    a = s.add_parser("replace-root", help="print a header with a different Merkle root (no new proof of work!)")
    a.add_argument("hex"); a.add_argument("root")
    a = s.add_parser("work", help="expected work of blocks with the given compact targets (bits)")
    a.add_argument("bits", nargs="+")
    a = p.parse_args(argv)
    if a.cmd == "replace-root":
        h = bytes.fromhex(a.hex)
        print((h[:36] + bytes.fromhex(a.root)[::-1] + h[68:]).hex())
        return 0
    if a.cmd == "work":
        total = 0
        for b in a.bits:
            bits = int(b, 16)
            w = (1 << 256) // (chain.bits_to_target(bits) + 1)
            total += w
            print(f"bits 0x{bits:08x} → target {chain.bits_to_target(bits):064x}\n               work ≈ {w:,} hashes")
        print(f"{B}total work of these {len(a.bits)} block(s): {total:,}{X}")
        return 0
    if a.cmd == "block":
        r = BitcoinRPC(host=a.node)
        bh = a.ref if len(a.ref) == 64 else r.getblockhash(int(a.ref))
        hexh = r.getblockheader(bh, False)
    else:
        hexh = a.hex
    h = bytes.fromhex(hexh)
    if len(h) != 80:
        print(f"{R}a block header is exactly 80 bytes, got {len(h)}{X}")
        return 1
    f = _decode_header(h)
    spans = [("version", 0, 4), ("previous block hash", 4, 36), ("merkle root", 36, 68), ("time", 68, 72),
             ("bits", 72, 76), ("nonce", 76, 80)]
    print(f"{B}raw header (80 bytes){X}\n{hexh}")
    for name, a0, a1 in spans:
        val = {"version": f"{f['version']} (0x{f['version']:08x})", "previous block hash": f["prev"],
               "merkle root": f["merkle_root"],
               "time": f"{f['time']} = {dt.datetime.fromtimestamp(f['time'], dt.timezone.utc):%Y-%m-%d %H:%M:%S} UTC",
               "bits": f"0x{f['bits']:08x}", "nonce": f["nonce"]}[name]
        print(f"  bytes {a0:>2}–{a1 - 1:<2} {name:<20} {D}{h[a0:a1].hex()}{X}\n  {'':<29}→ {val}")
    ok = int(f["hash"], 16) <= f["target"]
    print(f"{B}block hash{X} = SHA256(SHA256(header)), shown byte-reversed:\n  {f['hash']}")
    print(f"{B}target{X} from bits:\n  {f['target']:064x}")
    print(f"{B}proof of work{X}: hash ≤ target → {G + 'yes' + X if ok else R + 'NO' + X}")
    work = (1 << 256) // (f["target"] + 1)
    print(f"{B}expected work{X} for this target = 2^256 / (target + 1) = {work:,} hashes  (adds to chainwork)")
    return 0


# ---------------------------------------------------------------- merkle ----
def merkle_main(argv=None):
    p = argparse.ArgumentParser(prog="merkle", description="Merkle trees: Bitcoin blocks and course receipts")
    s = p.add_subparsers(dest="cmd", required=True)
    a = s.add_parser("bitcoin", help="rebuild a block's Merkle root from its txids")
    a.add_argument("ref", help="height or block hash"); a.add_argument("--node"); a.add_argument("--change", type=int,
                                                                                               help="flip one bit of txid #N first")
    a = s.add_parser("build", help="Merkle root of files (RFC 9162 conventions)"); a.add_argument("files", nargs="+")
    a = s.add_parser("receipt", help="write a receipt for one file of a batch")
    a.add_argument("--index", type=int, required=True); a.add_argument("--txid"); a.add_argument("-o", "--out")
    a.add_argument("files", nargs="+")
    a = s.add_parser("anchor", help="commit a root in an OP_RETURN transaction (regtest wallet 'anchor')")
    a.add_argument("root")
    a = s.add_parser("verify", help="check a file against its receipt and the chain")
    a.add_argument("receipt"); a.add_argument("file")
    a = p.parse_args(argv)

    if a.cmd == "bitcoin":
        r = BitcoinRPC(host=a.node)
        bh = a.ref if len(a.ref) == 64 else r.getblockhash(int(a.ref))
        blk = r.getblock(bh, 1)
        txids = list(blk["tx"])
        if a.change is not None:
            t = bytearray(bytes.fromhex(txids[a.change]))
            t[-1] ^= 1
            txids[a.change] = t.hex()
            print(f"{Y}changed one bit of txid #{a.change}{X}")
        layer = [bytes.fromhex(t)[::-1] for t in txids]
        lvl = 0
        print(f"{B}level 0 (txids, {len(layer)} leaves){X}")
        for i, t in enumerate(txids):
            print(f"  [{i}] {t}")
        while len(layer) > 1:
            if len(layer) % 2:
                layer.append(layer[-1])
                print(f"  {D}odd count: duplicate the last hash{X}")
            layer = [chain.dsha256(layer[i] + layer[i + 1]) for i in range(0, len(layer), 2)]
            lvl += 1
            print(f"{B}level {lvl}{X}")
            for i, x in enumerate(layer):
                print(f"  [{i}] {x[::-1].hex()}")
        got = layer[0][::-1].hex()
        ok = got == blk["merkleroot"]
        print(f"{B}computed root{X} {got}\n{B}header root  {X} {blk['merkleroot']}  → "
              f"{G + 'MATCH' + X if ok else R + 'DIFFERENT' + X}")
        return 0 if ok else 1

    if a.cmd in ("build", "receipt"):
        leaves = [open(f, "rb").read() for f in a.files]
        hs = [merkle.leaf_hash(x) for x in leaves]
        root = merkle.root_from_hashes(hs)
        if a.cmd == "build":
            for i, (f, h) in enumerate(zip(a.files, hs)):
                print(f"  leaf {i}: {h.hex()}  {D}{f} ({len(leaves[i])} bytes){X}")
            print(f"{B}root{X} {G}{root.hex()}{X}  ({len(leaves)} leaves, leaf=SHA256(0x00||bytes), node=SHA256(0x01||L||R))")
            return 0
        path = merkle.proof(hs, a.index)
        rc = {"type": "bitct.file.receipt.v1", "file": os.path.basename(a.files[a.index]),
              "sha256": hashlib.sha256(leaves[a.index]).hexdigest(), "leaf_index": a.index, "tree_size": len(leaves),
              "path": merkle.path_to_json(path), "root": root.hex()}
        if a.txid:
            r = BitcoinRPC()
            t = r.getrawtransaction(a.txid, True)
            rc["anchor"] = {"network": "regtest", "txid": a.txid, "blockhash": t.get("blockhash")}
        out = json.dumps(rc, indent=2)
        if a.out:
            open(a.out, "w").write(out + "\n")
            print(f"wrote {a.out}")
        else:
            print(out)
        return 0

    if a.cmd == "anchor":
        root = bytes.fromhex(a.root)
        rpc = BitcoinRPC()
        w = ensure_wallet(rpc, "anchor")
        if w.getbalance() < 1:
            rpc.generatetoaddress(101, w.getnewaddress())
            print(f"{D}funded wallet 'anchor' with 101 regtest blocks{X}")
        res = chain.anchor_with_core_wallet(w, chain.anchor_payload(root))
        print(f"anchor transaction {G}{res['txid']}{X}\n  OP_RETURN payload = 'BITCT' 01 {root.hex()}")
        print(f"{D}it is only in the mempool: mine a block to confirm it{X}")
        return 0

    if a.cmd == "verify":
        rc = json.load(open(a.receipt))
        data = open(a.file, "rb").read()
        ok_hash = hashlib.sha256(data).hexdigest() == rc["sha256"]
        print(f"[{'PASS' if ok_hash else 'FAIL'}] file bytes      sha256 {'matches' if ok_hash else 'differs from'} the receipt")
        got = merkle.root_from_proof(merkle.leaf_hash(data), merkle.path_from_json(rc["path"]))
        ok_root = got.hex() == rc["root"]
        print(f"[{'PASS' if ok_root else 'FAIL'}] Merkle path     leaf {rc['leaf_index']} → {got.hex()[:16]}… {'= receipt root' if ok_root else '≠ receipt root'}")
        anc = rc.get("anchor")
        if not anc:
            print("[----] anchor          receipt has no anchor transaction")
            return 0 if ok_hash and ok_root else 1
        be = chain.CoreBackend()
        t = be.tx(anc["txid"], anc.get("blockhash"))
        committed = None
        for o in t["vout"]:
            d = chain.op_return_data(o["scriptPubKey"]["hex"])
            if d is not None and chain.parse_payload(d):
                committed = chain.parse_payload(d)
        ok_tx = committed == got
        print(f"[{'PASS' if ok_tx else 'FAIL'}] anchor tx       OP_RETURN {'commits to the recomputed root' if ok_tx else 'does not match'}")
        ok_blk = False
        if anc.get("blockhash"):
            inc = be.tx_inclusion(anc["txid"], anc["blockhash"])
            ok_blk = inc["ok"] and inc["in_best_chain"]
            print(f"[{'PASS' if ok_blk else 'FAIL'}] block inclusion block {inc['height']}, {inc['confirmations']} confirmation(s)")
        else:
            print("[----] block inclusion not confirmed when the receipt was written")
        allok = ok_hash and ok_root and ok_tx and ok_blk
        print(f"{B}{G + 'VERIFIED' + X if allok else R + 'NOT VERIFIED' + X}{X}")
        return 0 if allok else 1
    return 0
