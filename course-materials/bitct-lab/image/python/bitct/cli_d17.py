"""d17 — operator, collector and auditor commands for the D17 labs."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

from . import audit, bip340, chain, d17
from .rpc import BitcoinRPC, ensure_wallet

DB = os.environ.get("D17_DB", "/data/d17/collector.sqlite")
CKPT_DIR = os.environ.get("D17_CHECKPOINTS", "/data/d17/checkpoints")
SIGNET_KEY = os.environ.get("SIGNET_KEY_FILE", "/data/d17/signet-anchor-key.json")

G, R, Y, B, D, X = "\033[32m", "\033[31m", "\033[33m", "\033[1m", "\033[2m", "\033[0m"
if not sys.stdout.isatty() and not os.environ.get("FORCE_COLOR"):
    G = R = Y = B = D = X = ""


def colour(verdict: str) -> str:
    return {d17.ACCEPTED: G, d17.NO_NEW_EVENT: Y, d17.INDETERMINATE: Y}.get(verdict, R)


def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    return d17.connect(DB)


def ts(t):
    return time.strftime("%H:%M:%S", time.localtime(t)) if t else "-"


# --- device-side helpers ----------------------------------------------------

def cmd_keygen(a):
    sk = os.urandom(32)
    pk = bip340.pubkey_gen(sk)
    obj = {"secret": sk.hex(), "pubkey": pk.hex()}
    if a.out:
        with open(a.out, "w") as f:
            json.dump(obj, f, indent=2)
        os.chmod(a.out, 0o600)
        print(f"wrote {a.out}")
    print(f"secret key (device only!): {R}{sk.hex()}{X}")
    print(f"public key (x-only):       {G}{pk.hex()}{X}")


def cmd_pubkey(a):
    print(bip340.pubkey_gen(bytes.fromhex(a.secret)).hex())


def cmd_sign(a):
    sk = bytes.fromhex(a.secret)
    rep = d17.make_report(device=a.device, key=a.key, enrollment=a.enrollment, seq=a.seq,
                          quantity=a.quantity, value=a.value, unit=a.unit, audience=a.audience)
    rb = rep.encode()
    print(d17.wire(rb, d17.sign_report(sk, rb, bytes(32) if a.deterministic else None), bip340.pubkey_gen(sk)))


def cmd_explain(a):
    raw = open(a.file).read() if a.file != "-" else sys.stdin.read()
    obj = json.loads(raw)
    rb = obj["report"].encode()
    print(f"{B}Exact signed bytes ({len(rb)} bytes):{X}")
    for line in rb.decode().split("\n"):
        print(f"  {line}")
    m = d17.message(rb)
    print(f"{B}m = TaggedHash(schema, bytes):{X} {m.hex()}")
    print(f"{B}signature (R.x || s):{X} {obj['sig'][:64]}\n                       {obj['sig'][64:]}")
    if obj.get("pub"):
        ok = bip340.verify(bytes.fromhex(obj["pub"]), m, bytes.fromhex(obj["sig"]))
        print(f"{B}diagnostic check under the key the message *claims*:{X} {G+'valid'+X if ok else R+'invalid'+X}")
        print(f"{D}(the collector ignores this key and uses the operator's registry){X}")


# --- operator ---------------------------------------------------------------

def cmd_enroll(a):
    c = db()
    d17.enroll(c, a.device, a.key, a.enrollment, a.pubkey, last_seq=a.last_seq, audience=a.audience,
               close_previous=not a.keep_previous)
    print(f"{G}operator O authorized ({a.device}, {a.key}, enrollment {a.enrollment}); "
          f"accepted maximum initialised to {a.last_seq}{X}")
    cmd_registry(argparse.Namespace(export=None))


def cmd_status(a):
    c = db()
    d17.set_status(c, a.device, a.key, a.enrollment, a.status, a.note or f"set {a.status} by operator O")
    print(f"binding ({a.device}, {a.key}, {a.enrollment}) is now {a.status}")


def cmd_registry(a):
    c = db()
    rows = d17.registry_export(c)
    if a.export:
        with open(a.export, "w") as f:
            json.dump(rows, f, indent=2)
        print(f"wrote {a.export} ({len(rows)} binding(s))")
        return
    print(f"{B}{'device':<6} {'key':<7} {'enr':>3}  {'status':<8} {'pubkey':<18} audience{X}")
    for r in rows:
        col = G if r["status"] == "active" else R
        print(f"{r['device']:<6} {r['key_id']:<7} {r['enrollment']:>3}  {col}{r['status']:<8}{X} {r['pubkey'][:16]}…  {r['audience']}")
    print(f"{B}replay state:{X}")
    for s in c.execute("SELECT * FROM streams ORDER BY device, enrollment"):
        last = "unknown" if s["last_seq"] is None else s["last_seq"]
        print(f"  {s['device']} enrollment {s['enrollment']}: last accepted seq = {last}"
              + ("" if s["trusted"] else f" {R}(untrusted){X}"))


def cmd_authority(a):
    d17.set_setting(db(), "registry_offline", "1" if a.mode == "offline" else "0")
    print(f"current-authority service is now {a.mode}")


def cmd_lose_state(a):
    c = db()
    c.execute("UPDATE streams SET last_seq=NULL WHERE device=? AND enrollment=?", (a.device, a.enrollment))
    print(f"replay state for {a.device}/e{a.enrollment} is now unknown (not zero!)")


# --- collector ----------------------------------------------------------------

def cmd_submit(a):
    raw = sys.stdin.read() if a.file == "-" else open(a.file).read()
    dec = d17.submit(db(), raw.strip(), source=f"cli:{a.file}")
    print(f"#{dec.report_id} {colour(dec.verdict)}{dec.verdict}{X} — {dec.reason}")


def cmd_reports(a):
    c = db()
    rows = c.execute("SELECT * FROM reports ORDER BY id DESC LIMIT ?", (a.last,)).fetchall()[::-1]
    print(f"{B}{'#':>4} {'time':<8} {'device':<6} {'key':<6} {'enr':>3} {'seq':>11} {'value':>6}  {'verdict':<17} batch{X}")
    for r in rows:
        print(f"{r['id']:>4} {ts(r['received_at']):<8} {str(r['device'] or '?'):<6} {str(r['key_id'] or '?'):<6} "
              f"{str(r['enrollment'] if r['enrollment'] is not None else '?'):>3} {str(r['seq'] if r['seq'] is not None else '?'):>11} "
              f"{str(r['value'] if r['value'] is not None else '?'):>6}  {colour(r['verdict'])}{r['verdict']:<17}{X} "
              f"{r['batch_id'] if r['batch_id'] else '-'}")


def cmd_show(a):
    r = db().execute("SELECT * FROM reports WHERE id=?", (a.id,)).fetchone()
    if not r:
        sys.exit(f"no report #{a.id}")
    print(f"{B}report #{r['id']}{X} received {ts(r['received_at'])} via {r['source']}")
    print(f"{B}verdict:{X} {colour(r['verdict'])}{r['verdict']}{X} — {r['reason']}")
    if r["report"]:
        print(f"{B}exact signed bytes:{X}")
        for line in bytes(r["report"]).decode().split("\n"):
            print(f"  {line}")
        print(f"{B}signature:{X} {r['sig']}")
    if r["batch_id"]:
        print(f"{B}batch:{X} #{r['batch_id']} leaf {r['leaf_index']}")


def cmd_gaps(a):
    c = db()
    for s in c.execute("SELECT DISTINCT device, enrollment FROM reports WHERE verdict=?", (d17.ACCEPTED,)):
        seqs = [r[0] for r in c.execute("SELECT seq FROM reports WHERE verdict=? AND device=? AND enrollment=? ORDER BY seq",
                                         (d17.ACCEPTED, s["device"], s["enrollment"]))]
        gaps = [(x, y) for x, y in zip(seqs, seqs[1:]) if y != x + 1]
        print(f"{s['device']}/e{s['enrollment']}: {len(seqs)} accepted, seq {seqs[0]}…{seqs[-1]}")
        for x, y in gaps:
            print(f"  {Y}gap: {x} → {y} ({y - x - 1} sequence number(s) never accepted){X}")
        if not gaps:
            print(f"  {G}no gaps{X}")


# --- batches, receipts, audit ----------------------------------------------------

def cmd_batches(a):
    c = db()
    print(f"{B}{'#':>3} {'time':<8} {'size':>4}  {'root':<18} {'network':<8} {'txid':<18} {'height':>6} status{X}")
    for b in c.execute("SELECT * FROM batches ORDER BY id"):
        print(f"{b['id']:>3} {ts(b['created_at']):<8} {b['size']:>4}  {b['root'][:16]}…  {str(b['network'] or '-'):<8} "
              f"{(b['txid'][:16] + '…') if b['txid'] else '-':<18} {str(b['height'] or '-'):>6} {b['status']}")


def cmd_batch_now(a):
    from .gateway import Anchorer
    an = Anchorer(DB)
    an.network = a.network
    an.tick()
    cmd_batches(a)


def cmd_receipt(a):
    r = d17.receipt(db(), a.id)
    out = json.dumps(r, indent=2)
    if a.out:
        with open(a.out, "w") as f:
            f.write(out + "\n")
        print(f"wrote {a.out}")
    else:
        print(out)


def cmd_audit(a):
    rcpt = json.load(open(a.receipt))
    reg = None
    if a.registry:
        reg = json.load(open(a.registry))
    elif os.path.exists(DB) and not a.no_db:
        reg = d17.registry_export(db())
    backend = None
    if a.network:
        backend = chain.backend_for(a.network)
    steps = audit.audit_receipt(rcpt, reg, backend, min_conf=a.min_conf)
    print(f"{B}Audit of {a.receipt}{X}")
    for s in steps:
        col = G if s.status == audit.OK else (R if s.status == audit.FAIL else D)
        print(f"  {col}[{s.status}]{X} {s.name:<18} {s.detail}")
    v = audit.verdict(steps)
    print(f"{B}Result: {G if v == 'VERIFIED' else R}{v}{X}")
    if v == "VERIFIED":
        for line in audit.CLAIM_LIMITS:
            print(f"  {D}{line}{X}")
    sys.exit(0 if v == "VERIFIED" else 1)


def cmd_tamper(a):
    c = db()
    r = c.execute("SELECT * FROM reports WHERE id=?", (a.id,)).fetchone()
    if not r or not r["report"]:
        sys.exit(f"no stored report #{a.id}")
    text = bytes(r["report"]).decode()
    new = "\n".join((f"value={a.value}" if line.startswith("value=") else line) for line in text.split("\n"))
    c.execute("UPDATE reports SET report=?, value=? WHERE id=?", (new.encode(), a.value, a.id))
    print(f"{R}collector database edited: report #{a.id} value {r['value']} → {a.value} (signature untouched){X}")


def cmd_drop(a):
    c = db()
    c.execute("UPDATE reports SET verdict='DROPPED', reason='removed by a dishonest collector', batch_id=NULL WHERE id=?",
              (a.id,))
    print(f"{R}report #{a.id} dropped before batching{X}")


def cmd_prepare_c0(a):
    from . import fixtures_d17
    c = db()
    fixtures_d17.prepare_c0(c)
    print("checkpoint C0 prepared: operator authorized (D17, key-A, enrollment 3); last accepted seq = 41")
    cmd_checkpoint(argparse.Namespace(action="save", name="C0"))


def cmd_checkpoint(a):
    os.makedirs(CKPT_DIR, exist_ok=True)
    path = os.path.join(CKPT_DIR, a.name + ".sqlite")
    if a.action == "save":
        c = db()
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        shutil.copyfile(DB, path)
        print(f"saved checkpoint {a.name}")
    else:
        if not os.path.exists(path):
            sys.exit(f"no checkpoint {a.name}")
        for ext in ("-wal", "-shm"):
            if os.path.exists(DB + ext):
                os.remove(DB + ext)
        shutil.copyfile(path, DB)
        print(f"restored checkpoint {a.name}")


# --- signet publication --------------------------------------------------------

def cmd_signet(a):
    key = chain.load_or_create_key(SIGNET_KEY)
    addr = chain.p2wpkh_address(key, "signet")
    be = chain.EsploraBackend(network="signet")
    if a.action == "address":
        print(f"anchor address (signet P2WPKH): {G}{addr}{X}")
        print(f"{D}fund it with a few thousand signet sats from your LAB02 wallet or the instructor's reserve{X}")
        return
    utxos = be.utxos(addr)
    if a.action == "balance":
        tot = sum(u["value"] for u in utxos)
        print(f"{addr}: {tot} sat in {len(utxos)} UTXO(s)")
        for u in utxos:
            print(f"  {u['txid']}:{u['vout']}  {u['value']} sat  {'confirmed' if u['confirmed'] else 'unconfirmed'}")
        return
    if a.action == "publish":
        c = db()
        b = c.execute("SELECT * FROM batches WHERE id=?", (a.batch,)).fetchone()
        if not b:
            sys.exit(f"no batch #{a.batch}")
        res = chain.build_anchor_tx(key, "signet", utxos, chain.anchor_payload(bytes.fromhex(b["root"])), a.fee_rate)
        txid = be.broadcast(res["raw"])
        c.execute("UPDATE batches SET network='signet', txid=?, vout=?, blockhash=NULL, height=NULL, status='anchored' WHERE id=?",
                  (txid, res["vout"], a.batch))
        print(f"{G}published batch #{a.batch} root on signet: {txid}{X} (fee {res['fee']} sat)")
        print(f"explorer: https://mempool.space/signet/tx/{txid}")
        return
    if a.action == "refresh":
        c = db()
        for b in c.execute("SELECT * FROM batches WHERE network='signet' AND txid IS NOT NULL"):
            t = be._get(f"/tx/{b['txid']}")
            st = t.get("status", {})
            if st.get("confirmed"):
                c.execute("UPDATE batches SET blockhash=?, height=?, block_time=?, status='confirmed' WHERE id=?",
                          (st["block_hash"], st["block_height"], st["block_time"], b["id"]))
                print(f"batch #{b['id']}: confirmed in signet block {st['block_height']}")
            else:
                print(f"batch #{b['id']}: still unconfirmed")


def main(argv=None):
    p = argparse.ArgumentParser(prog="d17", description="D17 device-evidence lab tool")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("keygen", help="create a device key pair"); s.add_argument("--out"); s.set_defaults(f=cmd_keygen)
    s = sub.add_parser("pubkey", help="x-only public key of a secret"); s.add_argument("secret"); s.set_defaults(f=cmd_pubkey)
    s = sub.add_parser("sign", help="sign a report and print the wire JSON")
    s.add_argument("--secret", required=True); s.add_argument("--device", default="D17"); s.add_argument("--key", default="key-A")
    s.add_argument("--enrollment", type=int, default=3); s.add_argument("--seq", type=int, default=42)
    s.add_argument("--quantity", default="active-power"); s.add_argument("--value", type=int, default=1200)
    s.add_argument("--unit", default="W"); s.add_argument("--audience", default="factory-a.audit")
    s.add_argument("--deterministic", action="store_true", help="aux_rand = 32 zero bytes (reproducible)")
    s.set_defaults(f=cmd_sign)
    s = sub.add_parser("explain", help="show exact bytes, message and signature of a wire message")
    s.add_argument("file"); s.set_defaults(f=cmd_explain)

    s = sub.add_parser("enroll", help="operator O authorizes a device key")
    s.add_argument("--device", default="D17"); s.add_argument("--key", default="key-A")
    s.add_argument("--enrollment", type=int, required=True); s.add_argument("--pubkey", required=True)
    s.add_argument("--last-seq", type=int, default=0); s.add_argument("--audience", default="factory-a.audit")
    s.add_argument("--keep-previous", action="store_true"); s.set_defaults(f=cmd_enroll)
    for name, status in (("revoke", "revoked"), ("retire", "retired"), ("reactivate", "active")):
        s = sub.add_parser(name, help=f"operator sets a binding to {status}")
        s.add_argument("--device", default="D17"); s.add_argument("--key", default="key-A")
        s.add_argument("--enrollment", type=int, required=True); s.add_argument("--note")
        s.set_defaults(f=cmd_status, status=status)
    s = sub.add_parser("registry", help="show (or export) bindings and replay state")
    s.add_argument("--export"); s.set_defaults(f=cmd_registry)
    s = sub.add_parser("authority", help="simulate the registry service being offline/online")
    s.add_argument("mode", choices=["offline", "online"]); s.set_defaults(f=cmd_authority)
    s = sub.add_parser("lose-state", help="forget the accepted maximum for a stream")
    s.add_argument("--device", default="D17"); s.add_argument("--enrollment", type=int, required=True)
    s.set_defaults(f=cmd_lose_state)

    s = sub.add_parser("submit", help="give one wire message to the collector"); s.add_argument("file"); s.set_defaults(f=cmd_submit)
    s = sub.add_parser("reports", help="list received reports and verdicts"); s.add_argument("--last", type=int, default=20); s.set_defaults(f=cmd_reports)
    s = sub.add_parser("show", help="show one stored report"); s.add_argument("id", type=int); s.set_defaults(f=cmd_show)
    s = sub.add_parser("gaps", help="look for missing sequence numbers"); s.set_defaults(f=cmd_gaps)

    s = sub.add_parser("batches", help="list Merkle batches and anchors"); s.set_defaults(f=cmd_batches)
    s = sub.add_parser("batch-now", help="batch accepted reports and anchor now")
    s.add_argument("--network", default=os.environ.get("ANCHOR_NETWORK", "regtest")); s.set_defaults(f=cmd_batch_now)
    s = sub.add_parser("receipt", help="export the receipt of a report"); s.add_argument("id", type=int)
    s.add_argument("-o", "--out"); s.set_defaults(f=cmd_receipt)
    s = sub.add_parser("audit", help="independently verify a receipt"); s.add_argument("receipt")
    s.add_argument("--registry"); s.add_argument("--network", choices=["regtest", "signet"])
    s.add_argument("--min-conf", type=int, default=1); s.add_argument("--no-db", action="store_true")
    s.set_defaults(f=cmd_audit)
    s = sub.add_parser("tamper", help="(dishonest collector) edit a stored report"); s.add_argument("id", type=int)
    s.add_argument("--value", type=int, required=True); s.set_defaults(f=cmd_tamper)
    s = sub.add_parser("drop", help="(dishonest collector) drop a report before batching"); s.add_argument("id", type=int); s.set_defaults(f=cmd_drop)
    s = sub.add_parser("prepare-c0", help="reset the collector to the classroom checkpoint C0"); s.set_defaults(f=cmd_prepare_c0)
    s = sub.add_parser("checkpoint", help="save/load collector state (C0, C1 …)")
    s.add_argument("action", choices=["save", "load"]); s.add_argument("name"); s.set_defaults(f=cmd_checkpoint)

    s = sub.add_parser("signet", help="optional public anchoring on signet")
    s.add_argument("action", choices=["address", "balance", "publish", "refresh"])
    s.add_argument("--batch", type=int); s.add_argument("--fee-rate", type=float, default=2.0)
    s.set_defaults(f=cmd_signet)

    a = p.parse_args(argv)
    return a.f(a)


if __name__ == "__main__":
    sys.exit(main())
