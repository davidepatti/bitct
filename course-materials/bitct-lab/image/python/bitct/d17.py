"""D17 signed device reports and the collector's acceptance rule.

This is the executable version of the M4.1/M4.2 classroom model (factory
electricity meter D17, gateway G, collector C, enrollment operator O).
It is a teaching simulation, not an IoT standard.

Exact signed bytes (UTF-8, LF separators, no trailing newline):

    course.factory-telemetry.v1
    device=D17
    key=key-A
    enrollment=3
    seq=42
    quantity=active-power
    value=1200
    unit=W
    audience=factory-a.audit

Signature: BIP340 Schnorr over m = TaggedHash(schema, report_bytes).
The bytes travel verbatim inside a JSON wrapper; the verifier never
re-serializes them.
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from dataclasses import dataclass
from typing import Optional

from . import bip340, merkle

SCHEMA = "course.factory-telemetry.v1"
FIELDS = ["device", "key", "enrollment", "seq", "quantity", "value", "unit", "audience"]
_TOKEN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_UINT = re.compile(r"^(0|[1-9][0-9]{0,18})$")
_INT = re.compile(r"^-?(0|[1-9][0-9]{0,18})$")

# Verdicts (collector decisions)
ACCEPTED = "ACCEPTED"
NO_NEW_EVENT = "NO_NEW_EVENT"
REJECT_MALFORMED = "REJECT_MALFORMED"
REJECT_AUTHORITY = "REJECT_AUTHORITY"
REJECT_CONTEXT = "REJECT_CONTEXT"
REJECT_SIGNATURE = "REJECT_SIGNATURE"
INDETERMINATE = "INDETERMINATE"


class MalformedReport(ValueError):
    pass


@dataclass(frozen=True)
class Report:
    schema: str
    device: str
    key: str
    enrollment: int
    seq: int
    quantity: str
    value: int
    unit: str
    audience: str

    def encode(self) -> bytes:
        lines = [self.schema] + [f"{f}={getattr(self, f if f != 'key' else 'key')}" for f in FIELDS]
        return "\n".join(lines).encode("utf-8")


def make_report(device="D17", key="key-A", enrollment=3, seq=42, quantity="active-power",
                value=1200, unit="W", audience="factory-a.audit", schema=SCHEMA) -> Report:
    return Report(schema, device, key, int(enrollment), int(seq), quantity, int(value), unit, audience)


def parse(report_bytes: bytes) -> Report:
    """Strict parser: exact field order, no extra whitespace, no duplicates."""
    try:
        text = report_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise MalformedReport("not UTF-8") from exc
    lines = text.split("\n")
    if len(lines) != 1 + len(FIELDS):
        raise MalformedReport(f"expected {1 + len(FIELDS)} lines, got {len(lines)}")
    schema = lines[0]
    if not _TOKEN.match(schema):
        raise MalformedReport("bad schema line")
    vals = {}
    for name, line in zip(FIELDS, lines[1:]):
        prefix = name + "="
        if not line.startswith(prefix):
            raise MalformedReport(f"expected field '{name}'")
        vals[name] = line[len(prefix):]
    for name in ("device", "key", "quantity", "unit", "audience"):
        if not _TOKEN.match(vals[name]):
            raise MalformedReport(f"bad value for {name}")
    for name in ("enrollment", "seq"):
        if not _UINT.match(vals[name]):
            raise MalformedReport(f"{name} must be a non-negative integer")
    if not _INT.match(vals["value"]):
        raise MalformedReport("value must be an integer")
    return Report(schema, vals["device"], vals["key"], int(vals["enrollment"]), int(vals["seq"]),
                  vals["quantity"], int(vals["value"]), vals["unit"], vals["audience"])


def message(report_bytes: bytes, schema: Optional[str] = None) -> bytes:
    """The 32-byte message actually signed: TaggedHash(schema, exact bytes)."""
    if schema is None:
        schema = report_bytes.split(b"\n", 1)[0].decode("utf-8", "replace")
    return bip340.tagged_hash(schema, report_bytes)


def sign_report(seckey: bytes, report_bytes: bytes, aux: Optional[bytes] = None) -> bytes:
    return bip340.sign(seckey, message(report_bytes), aux)


def wire(report_bytes: bytes, sig: bytes, pub: Optional[bytes] = None) -> str:
    """JSON wrapper sent over MQTT. 'pub' is diagnostic only: the collector ignores it."""
    obj = {"v": 1, "report": report_bytes.decode("utf-8"), "sig": sig.hex()}
    if pub is not None:
        obj["pub"] = pub.hex()
    return json.dumps(obj, separators=(",", ":"))


def leaf_bytes(report_bytes: bytes, sig: bytes) -> bytes:
    """What a Merkle leaf commits to: the exact signed bytes followed by the 64-byte signature."""
    return report_bytes + sig


# ---------------------------------------------------------------------------
# Collector state (SQLite) and acceptance rule
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS registry (
  device TEXT NOT NULL, key_id TEXT NOT NULL, enrollment INTEGER NOT NULL,
  pubkey TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  schema TEXT NOT NULL DEFAULT 'course.factory-telemetry.v1',
  quantity TEXT NOT NULL DEFAULT 'active-power', unit TEXT NOT NULL DEFAULT 'W',
  audience TEXT NOT NULL DEFAULT 'factory-a.audit',
  changed_at REAL NOT NULL, note TEXT,
  PRIMARY KEY (device, key_id, enrollment));
CREATE TABLE IF NOT EXISTS streams (
  device TEXT NOT NULL, enrollment INTEGER NOT NULL, last_seq INTEGER,
  trusted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (device, enrollment));
CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, received_at REAL NOT NULL, source TEXT,
  raw TEXT NOT NULL, report BLOB, sig TEXT, device TEXT, key_id TEXT,
  enrollment INTEGER, seq INTEGER, value INTEGER, verdict TEXT NOT NULL, reason TEXT,
  batch_id INTEGER, leaf_index INTEGER);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at REAL NOT NULL, size INTEGER NOT NULL,
  root TEXT NOT NULL, network TEXT, txid TEXT, vout INTEGER, blockhash TEXT,
  height INTEGER, block_time INTEGER, status TEXT NOT NULL DEFAULT 'pending');
"""


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path, timeout=30, isolation_level=None, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA_SQL)
    return db


def setting(db, name, default=None):
    row = db.execute("SELECT value FROM settings WHERE name=?", (name,)).fetchone()
    return row["value"] if row else default


def set_setting(db, name, value):
    db.execute("INSERT INTO settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
               (name, value))


@dataclass
class Decision:
    verdict: str
    reason: str
    report_id: Optional[int] = None
    report: Optional[Report] = None
    signature_valid: Optional[bool] = None

    def line(self) -> str:
        r = self.report
        who = f"{r.device}/{r.key}/e{r.enrollment} seq={r.seq} {r.value} {r.unit}" if r else "?"
        return f"{self.verdict:<17} {who} — {self.reason}"


def submit(db, raw: str, source: str = "cli", now: Optional[float] = None) -> Decision:
    """Apply the collector rule to one wire message and record the decision."""
    now = time.time() if now is None else now

    def record(dec: Decision, report_bytes=None, sig_hex=None):
        r = dec.report
        cur = db.execute(
            "INSERT INTO reports(received_at,source,raw,report,sig,device,key_id,enrollment,seq,value,verdict,reason)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (now, source, raw, report_bytes, sig_hex, r.device if r else None, r.key if r else None,
             r.enrollment if r else None, r.seq if r else None, r.value if r else None,
             dec.verdict, dec.reason))
        dec.report_id = cur.lastrowid
        return dec

    # 1. decode unambiguously (malformed -> reject, nothing else happens)
    try:
        obj = json.loads(raw)
        report_bytes = obj["report"].encode("utf-8")
        sig = bytes.fromhex(obj["sig"])
        if len(sig) != 64:
            raise ValueError("signature must be 64 bytes")
        rep = parse(report_bytes)
    except Exception as exc:  # noqa: BLE001 - every decoding problem is the same verdict
        db.execute("BEGIN IMMEDIATE")
        try:
            dec = record(Decision(REJECT_MALFORMED, f"cannot decode: {exc}"))
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise
        return dec

    db.execute("BEGIN IMMEDIATE")  # serialize with enrollment changes
    try:
        if setting(db, "registry_offline", "0") == "1":
            dec = Decision(INDETERMINATE, "current authority unavailable — queued, nothing accepted", report=rep)
            dec = record(dec, report_bytes, sig.hex())
            db.execute("COMMIT")
            return dec
        b = db.execute("SELECT * FROM registry WHERE device=? AND key_id=? AND enrollment=?",
                       (rep.device, rep.key, rep.enrollment)).fetchone()
        if b is None:
            dec = Decision(REJECT_AUTHORITY, "no operator-authorized binding for this device/key/enrollment", report=rep)
        elif b["status"] != "active":
            dec = Decision(REJECT_AUTHORITY, f"binding is {b['status']}", report=rep)
        elif (rep.schema, rep.quantity, rep.unit, rep.audience) != (b["schema"], b["quantity"], b["unit"], b["audience"]):
            dec = Decision(REJECT_CONTEXT, f"context not allowed (audience={rep.audience}, quantity={rep.quantity}, unit={rep.unit})", report=rep)
        else:
            ok = bip340.verify(bytes.fromhex(b["pubkey"]), message(report_bytes), sig)
            if not ok:
                dec = Decision(REJECT_SIGNATURE, "signature does not verify under the registered key", report=rep,
                               signature_valid=False)
            else:
                st = db.execute("SELECT * FROM streams WHERE device=? AND enrollment=?",
                                (rep.device, rep.enrollment)).fetchone()
                if st is None or st["last_seq"] is None or not st["trusted"]:
                    dec = Decision(INDETERMINATE, "replay state missing or untrusted — queued", report=rep,
                                   signature_valid=True)
                elif rep.seq <= st["last_seq"]:
                    same = db.execute("SELECT id FROM reports WHERE verdict=? AND report=? AND sig=?",
                                      (ACCEPTED, report_bytes, sig.hex())).fetchone()
                    why = (f"exact retry of accepted report #{same['id']}" if same else
                           f"seq {rep.seq} <= last accepted {st['last_seq']} (late or replayed)")
                    dec = Decision(NO_NEW_EVENT, why, report=rep, signature_valid=True)
                else:
                    gap = rep.seq - st["last_seq"] - 1
                    if st["last_seq"] == 0:
                        why = f"first report of this enrollment: seq {rep.seq}"
                    else:
                        why = f"seq {st['last_seq']} -> {rep.seq}" + (f" (gap of {gap} to investigate)" if gap else "")
                    dec = Decision(ACCEPTED, why, report=rep, signature_valid=True)
                    db.execute("UPDATE streams SET last_seq=? WHERE device=? AND enrollment=?",
                               (rep.seq, rep.device, rep.enrollment))
        dec = record(dec, report_bytes, sig.hex())
        db.execute("COMMIT")
        return dec
    except Exception:
        db.execute("ROLLBACK")
        raise


# --- operator actions (O) ---------------------------------------------------

def enroll(db, device, key_id, enrollment, pubkey_hex, last_seq=0, audience="factory-a.audit",
           quantity="active-power", unit="W", note="enrolled by operator O", close_previous=True):
    bytes.fromhex(pubkey_hex)
    if len(pubkey_hex) != 64:
        raise ValueError("x-only public key must be 32 bytes (64 hex characters)")
    db.execute("BEGIN IMMEDIATE")
    try:
        if close_previous:
            db.execute("UPDATE registry SET status='retired', changed_at=?, note='closed at cutover' "
                       "WHERE device=? AND status='active'", (time.time(), device))
        db.execute("INSERT OR REPLACE INTO registry(device,key_id,enrollment,pubkey,status,audience,quantity,unit,changed_at,note)"
                   " VALUES(?,?,?,?, 'active', ?,?,?,?,?)",
                   (device, key_id, int(enrollment), pubkey_hex.lower(), audience, quantity, unit, time.time(), note))
        db.execute("INSERT OR REPLACE INTO streams(device,enrollment,last_seq,trusted) VALUES(?,?,?,1)",
                   (device, int(enrollment), last_seq))
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise


def set_status(db, device, key_id, enrollment, status, note=""):
    cur = db.execute("UPDATE registry SET status=?, changed_at=?, note=? WHERE device=? AND key_id=? AND enrollment=?",
                     (status, time.time(), note, device, key_id, int(enrollment)))
    if cur.rowcount == 0:
        raise KeyError("no such binding")


# --- batches and receipts ---------------------------------------------------

def unbatched(db):
    return db.execute("SELECT * FROM reports WHERE verdict=? AND batch_id IS NULL ORDER BY id",
                      (ACCEPTED,)).fetchall()


def make_batch(db, rows=None) -> Optional[int]:
    rows = unbatched(db) if rows is None else rows
    if not rows:
        return None
    leaves = [leaf_bytes(r["report"], bytes.fromhex(r["sig"])) for r in rows]
    root = merkle.root(leaves)
    db.execute("BEGIN IMMEDIATE")
    try:
        cur = db.execute("INSERT INTO batches(created_at,size,root,status) VALUES(?,?,?, 'pending')",
                         (time.time(), len(rows), root.hex()))
        bid = cur.lastrowid
        for i, r in enumerate(rows):
            db.execute("UPDATE reports SET batch_id=?, leaf_index=? WHERE id=?", (bid, i, r["id"]))
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    return bid


def batch_leaf_hashes(db, batch_id):
    rows = db.execute("SELECT report, sig FROM reports WHERE batch_id=? ORDER BY leaf_index", (batch_id,)).fetchall()
    return [merkle.leaf_hash(leaf_bytes(r["report"], bytes.fromhex(r["sig"]))) for r in rows]


def receipt(db, report_id) -> dict:
    r = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if r is None:
        raise KeyError(f"no report #{report_id}")
    if r["batch_id"] is None:
        raise ValueError(f"report #{report_id} is not in a batch yet (verdict {r['verdict']})")
    b = db.execute("SELECT * FROM batches WHERE id=?", (r["batch_id"],)).fetchone()
    hashes = batch_leaf_hashes(db, b["id"])
    path = merkle.proof(hashes, r["leaf_index"])
    return {
        "type": "bitct.d17.receipt.v1",
        "report_id": r["id"],
        "report": bytes(r["report"]).decode("utf-8"),
        "sig": r["sig"],
        "merkle": {"convention": "RFC9162 sha256, leaf=0x00||report||sig, node=0x01||L||R",
                   "batch": b["id"], "leaf_index": r["leaf_index"], "tree_size": b["size"],
                   "path": merkle.path_to_json(path), "root": b["root"]},
        "anchor": {"network": b["network"], "txid": b["txid"], "vout": b["vout"],
                   "blockhash": b["blockhash"], "height": b["height"], "block_time": b["block_time"]},
    }


def registry_export(db) -> list:
    return [dict(r) for r in db.execute("SELECT device,key_id,enrollment,pubkey,status,schema,quantity,unit,audience,changed_at,note FROM registry ORDER BY device,enrollment")]
