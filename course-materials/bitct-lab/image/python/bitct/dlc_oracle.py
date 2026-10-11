"""dlc-oracle — a teaching oracle for Discreet Log Contracts (DLCs).

The oracle commits in advance to ONE nonce point R for an event. For every
possible outcome m anyone can then compute the point it will reveal:

    S_m = R + e_m * P      with  e_m = H_BIP340/challenge(R.x || P.x || m)

When the event happens the oracle publishes one BIP340 signature (R, s) on
the true outcome, and s * G = S_m. In a DLC, Alice and Bob pre-sign one payout
transaction per outcome, each locked to its S_m (an adaptor signature): only
the published s completes the matching payout. The oracle never learns that
the contract exists. Signing two outcomes with the same R leaks its secret key.

Teaching code built on bitct.bip340 (not constant-time; never for real funds).
State lives in ./oracle/: event.json is public, secret.json is the oracle's.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

from bitct import bip340 as b

STATE = "oracle"
PUB = os.path.join(STATE, "event.json")
SEC = os.path.join(STATE, "secret.json")


def _hex(i: int) -> str:
    return b._bytes_from_int(i).hex()


def _compressed(pt) -> str:
    return ("02" if pt[1] % 2 == 0 else "03") + _hex(pt[0])


def _even(k: int):
    """Secret scalar adjusted so that k*G has an even y (BIP340 convention)."""
    pt = b.point_mul(b.G, k)
    return (k, pt) if b._has_even_y(pt) else (b.N - k, b.point_mul(b.G, b.N - k))


def message(event: str, outcome: str) -> bytes:
    """32-byte message the oracle signs: SHA256(event || '/' || outcome)."""
    return hashlib.sha256(f"{event}/{outcome}".encode()).digest()


def challenge(r_x: int, p_x: int, msg: bytes) -> int:
    return b._int_from_bytes(b.tagged_hash("BIP0340/challenge", b._bytes_from_int(r_x) + b._bytes_from_int(p_x) + msg)) % b.N


def anticipation_point(r_pt, p_pt, msg: bytes):
    return b._add(r_pt, b.point_mul(p_pt, challenge(r_pt[0], p_pt[0], msg)))


def _load(path: str) -> dict:
    if not os.path.exists(path):
        sys.exit(f"no {path}: run 'dlc-oracle announce' first")
    with open(path) as f:
        return json.load(f)


def cmd_announce(a) -> None:
    os.makedirs(STATE, exist_ok=True)
    d, p_pt = _even(b._int_from_bytes(os.urandom(32)) % (b.N - 1) + 1)
    k, r_pt = _even(b._int_from_bytes(os.urandom(32)) % (b.N - 1) + 1)
    points = {o: _compressed(anticipation_point(r_pt, p_pt, message(a.event, o))) for o in a.outcomes}
    pub = {"event": a.event, "outcomes": a.outcomes, "oracle_key": _hex(p_pt[0]), "nonce_R": _hex(r_pt[0]),
           "anticipation_points": points, "attestations": {}}
    with open(SEC, "w") as f:
        json.dump({"d": _hex(d), "k": _hex(k)}, f, indent=1)
    os.chmod(SEC, 0o600)
    with open(PUB, "w") as f:
        json.dump(pub, f, indent=1)
    print(f"event:       {a.event}")
    print(f"oracle key P {pub['oracle_key']}")
    print(f"nonce R      {pub['nonce_R']}   (committed before the event)")
    for o, s in points.items():
        print(f"S({o}) = R + e·P = {s}")
    print("public announcement written to oracle/event.json; the oracle keeps oracle/secret.json")


def cmd_attest(a) -> None:
    pub, sec = _load(PUB), _load(SEC)
    if a.outcome not in pub["outcomes"]:
        sys.exit(f"unknown outcome {a.outcome!r}; announced: {', '.join(pub['outcomes'])}")
    if pub["attestations"] and a.outcome not in pub["attestations"] and not a.force:
        sys.exit("already attested another outcome with this nonce:\nan honest oracle stops here (use --force to equivocate)")
    d, k = b._int_from_bytes(bytes.fromhex(sec["d"])), b._int_from_bytes(bytes.fromhex(sec["k"]))
    msg = message(pub["event"], a.outcome)
    e = challenge(b._int_from_bytes(bytes.fromhex(pub["nonce_R"])), b._int_from_bytes(bytes.fromhex(pub["oracle_key"])), msg)
    s = (k + e * d) % b.N
    sig = bytes.fromhex(pub["nonce_R"]) + b._bytes_from_int(s)
    ok = b.verify(bytes.fromhex(pub["oracle_key"]), msg, sig)
    pub["attestations"][a.outcome] = _hex(s)
    with open(PUB, "w") as f:
        json.dump(pub, f, indent=1)
    print(f"attestation for '{a.outcome}': s = {_hex(s)}")
    print(f"BIP340 signature (R, s) on SHA256('{pub['event']}/{a.outcome}'): {'valid' if ok else 'INVALID'}")


def cmd_check(_a) -> None:
    pub = _load(PUB)
    if not pub["attestations"]:
        sys.exit("no attestation yet")
    for att, s_hex in pub["attestations"].items():
        sg = _compressed(b.point_mul(b.G, b._int_from_bytes(bytes.fromhex(s_hex))))
        print(f"s('{att}')·G = {sg}")
        for o, pt in pub["anticipation_points"].items():
            print(f"   {'=' if sg == pt else '≠'} S({o})" + ("   → this payout can be completed" if sg == pt else ""))


def cmd_extract(_a) -> None:
    pub = _load(PUB)
    atts = list(pub["attestations"].items())
    if len(atts) < 2:
        sys.exit("needs two attestations with the same nonce R")
    (o1, s1), (o2, s2) = atts[0], atts[1]
    r_x, p_x = b._int_from_bytes(bytes.fromhex(pub["nonce_R"])), b._int_from_bytes(bytes.fromhex(pub["oracle_key"]))
    e1 = challenge(r_x, p_x, message(pub["event"], o1))
    e2 = challenge(r_x, p_x, message(pub["event"], o2))
    d = ((b._int_from_bytes(bytes.fromhex(s1)) - b._int_from_bytes(bytes.fromhex(s2))) * pow(e1 - e2, -1, b.N)) % b.N
    match = b.point_mul(b.G, d)[0] == p_x
    print(f"d = (s1 − s2) / (e1 − e2) mod n = {_hex(d)}")
    print(f"d·G matches the oracle key P: {'yes — anyone can now sign as the oracle' if match else 'no'}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="dlc-oracle", description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("announce", help="commit to an event, its outcomes and one nonce R")
    p.add_argument("event")
    p.add_argument("outcomes", nargs="+")
    p.set_defaults(fn=cmd_announce)
    p = sub.add_parser("attest", help="sign the outcome that happened")
    p.add_argument("outcome")
    p.add_argument("--force", action="store_true", help="sign a second outcome with the same nonce (equivocation)")
    p.set_defaults(fn=cmd_attest)
    sub.add_parser("check", help="compare s·G with every anticipation point").set_defaults(fn=cmd_check)
    sub.add_parser("extract", help="recover the oracle key from two attestations").set_defaults(fn=cmd_extract)
    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
