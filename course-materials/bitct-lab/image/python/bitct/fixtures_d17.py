"""Deterministic D17 fixture for LAB-IOT-ATTEST (cases T01–T19 of the M3–M4 packet).

`d17-fixture /lab/d17` writes:
  keys/            key-A, key-B, key-X secrets (lab-only, derived from fixed labels)
  cases/*.json     wire messages, one per case
  ground-truth.csv independent synthetic meter values (for the false-reading case)
  expected.json    expected verdict per case (used by the self-test)
and prepares checkpoint C0 in the collector database.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

from . import bip340, d17


def key(label: str) -> bytes:
    return hashlib.sha256(f"bitct lab fixture {label}".encode()).digest()


KA, KB, KX = key("D17 key-A"), key("D17 key-B"), key("D17 key-X")
PA, PB, PX = (bip340.pubkey_gen(k) for k in (KA, KB, KX))
ZERO = bytes(32)


def signed(sk, **fields) -> str:
    rb = d17.make_report(**fields).encode()
    return d17.wire(rb, d17.sign_report(sk, rb, ZERO), bip340.pubkey_gen(sk))


def cases() -> dict:
    r42 = signed(KA, seq=42)
    altered = json.loads(r42)
    altered["report"] = altered["report"].replace("value=1200", "value=9000")
    return {
        "R42": r42,
        "R42-altered": json.dumps(altered, separators=(",", ":")),
        "R42-wrong-audience": signed(KA, seq=42, audience="factory-b.billing"),
        "R43": signed(KA, seq=43, value=1180),
        "R43-delayed": signed(KA, seq=43, value=1180),
        "R1000000-badsig": json.dumps({"v": 1, "report": d17.make_report(seq=1000000).encode().decode(),
                                       "sig": json.loads(signed(KX, seq=1000000))["sig"]}, separators=(",", ":")),
        "R0-reboot": signed(KA, seq=0, value=1150),
        "R-self-enrolled-4": signed(KA, enrollment=4, seq=1),
        "R-impostor-keyX": signed(KX, key="key-X", seq=43),
        "RB1": signed(KB, key="key-B", enrollment=4, seq=1),
        "R43-after-cutover": signed(KA, seq=43, value=1210),
        "R42-false-reading": signed(KA, seq=42, value=1200),
    }


EXPECTED = [
    # (case id, checkpoint to start from, list of (file, expected verdict), operator setup)
    ("T01", "C0", [("R42", d17.ACCEPTED)], None),
    ("T02", "C1", [("R42", d17.NO_NEW_EVENT)], None),
    ("T04", "C0", [("R42-altered", d17.REJECT_SIGNATURE)], None),
    ("T05", "C0", [("R42-wrong-audience", d17.REJECT_CONTEXT)], None),
    ("T06", "C0", [("R43-delayed", d17.ACCEPTED)], None),
    ("T07", "C0", [("R43", d17.ACCEPTED), ("R42", d17.NO_NEW_EVENT)], None),
    ("T08", "C0", [("R1000000-badsig", d17.REJECT_SIGNATURE), ("R42", d17.ACCEPTED)], None),
    ("T09", "C0", [("R0-reboot", d17.NO_NEW_EVENT)], None),
    ("T10", "C0", [("R-self-enrolled-4", d17.REJECT_AUTHORITY)], None),
    ("T11", "C0", [("R-impostor-keyX", d17.REJECT_AUTHORITY)], None),
    ("T12", "C0", [("R42", d17.INDETERMINATE)], "authority-offline"),
    ("T13", "C0", [("R42", d17.INDETERMINATE)], "lose-state"),
    ("T14", "C1", [("RB1", d17.ACCEPTED), ("R43-after-cutover", d17.REJECT_AUTHORITY)], "rotate"),
    ("T15", "C1", [("R43-after-cutover", d17.REJECT_AUTHORITY), ("RB1", d17.ACCEPTED)], "revoke-then-replace"),
    ("T18", "C0", [("R42-false-reading", d17.ACCEPTED)], None),
]


def prepare_c0(db):
    db.executescript("DELETE FROM registry; DELETE FROM streams; DELETE FROM reports; DELETE FROM batches; DELETE FROM settings;")
    d17.enroll(db, "D17", "key-A", 3, PA.hex(), last_seq=41, note="C0: authorized by O")


def write(outdir: str):
    os.makedirs(os.path.join(outdir, "cases"), exist_ok=True)
    os.makedirs(os.path.join(outdir, "keys"), exist_ok=True)
    for name, msg in cases().items():
        with open(os.path.join(outdir, "cases", name + ".json"), "w") as f:
            f.write(msg + "\n")
    for label, sk in (("key-A", KA), ("key-B", KB), ("key-X", KX)):
        with open(os.path.join(outdir, "keys", label + ".json"), "w") as f:
            json.dump({"secret": sk.hex(), "pubkey": bip340.pubkey_gen(sk).hex(),
                       "note": "fixed classroom key — public on purpose, never use elsewhere"}, f, indent=2)
    with open(os.path.join(outdir, "ground-truth.csv"), "w") as f:
        f.write("seq,meter_reading_from_independent_clamp_W,device_claim_W\n42,310,1200\n")
    with open(os.path.join(outdir, "expected.json"), "w") as f:
        json.dump([{"case": c, "start": s, "steps": st, "operator": op} for c, s, st, op in EXPECTED], f, indent=2)


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    outdir = argv[0] if argv else "/lab/d17"
    write(outdir)
    print(f"fixture written to {outdir}: {len(cases())} wire messages, keys, ground truth")
    print(f"key-A pubkey {PA.hex()}\nkey-B pubkey {PB.hex()}\nkey-X pubkey {PX.hex()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
