"""Read-only lab dashboard (http://localhost:8080): blocks, mempool, transactions,
Lightning channels and D17 anchoring — whatever the current lab runs."""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import subprocess
import time

from flask import Flask, abort, render_template_string, request

from . import audit, chain, d17
from .rpc import BitcoinRPC, RPCError

app = Flask(__name__)
NODES = [n for n in os.environ.get("DASH_NODES", "node-a").split(",") if n]
LN = [n for n in os.environ.get("DASH_LN", "").split(",") if n]
D17_DB = os.environ.get("D17_DB", "/data/d17/collector.sqlite")
TITLE = os.environ.get("LAB_TITLE", "BITCT lab")
REFRESH = int(os.environ.get("DASH_REFRESH", "5"))

BASE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{% if refresh %}<meta http-equiv="refresh" content="{{refresh}}">{% endif %}
<title>{{title}} · BITCT dashboard</title>
<style>
:root{--bg:#f7f1e3;--card:#fffdf8;--ink:#152029;--muted:#5b6670;--line:#e3d7bd;--accent:#00695c;
--blue:#0054c7;--red:#b3261e;--amber:#9a6700;--green:#1b7f3b;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 Arial,Helvetica,sans-serif}
header{background:var(--ink);color:#fff;padding:10px 20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
header b{font-size:17px}header a{color:#ffe7b3;text-decoration:none;font-weight:bold}header a:hover{text-decoration:underline}
header .net{margin-left:auto;background:#00695c;padding:2px 10px;border-radius:12px;font-size:13px}
main{padding:16px 20px;max-width:1280px;margin:0 auto}
h1{font-size:22px;margin:4px 0 12px}h2{font-size:17px;margin:18px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card h3{margin:0 0 6px;font-size:16px}.big{font-size:28px;font-weight:bold}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#efe4cb;font-size:13px;text-transform:uppercase;letter-spacing:.03em}
td.num{text-align:right}code,.mono{font-family:var(--mono);font-size:13px;word-break:break-all}
a{color:var(--blue)}.muted{color:var(--muted)}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:bold;color:#fff}
.ok{background:var(--green)}.warn{background:var(--amber)}.bad{background:var(--red)}.info{background:var(--blue)}
pre{background:#152029;color:#e8f0e8;padding:10px;border-radius:8px;overflow:auto;font-size:13px}
.kv td:first-child{width:180px;color:var(--muted)}
footer{color:var(--muted);font-size:12px;padding:16px 20px;text-align:center}
@media (max-width:640px){main{padding:10px}th,td{padding:4px 5px}}
</style></head><body>
<header><b>BITCT · {{title}}</b>
<a href="/">Overview</a><a href="/blocks">Blocks</a><a href="/mempool">Mempool</a>
{% if ln %}<a href="/lightning">Lightning</a>{% endif %}{% if iot %}<a href="/iot">D17 anchoring</a>{% endif %}
<span class="net">regtest · local</span></header>
<main>{{ body|safe }}</main>
<footer>Read-only view of this lab · refreshed {{now}} · page reloads every {{refresh or '–'}} s</footer>
</body></html>"""


def btc(v) -> str:
    """Format a BTC amount with 8 decimals (avoid '0E-8' for zero-value outputs)."""
    try:
        return f"{float(v):.8f}"
    except (TypeError, ValueError):
        return e(v)


def page(body: str, refresh: int = REFRESH):
    return render_template_string(BASE, body=body, title=TITLE, ln=bool(LN), iot=os.path.exists(D17_DB),
                                  refresh=refresh, now=time.strftime("%H:%M:%S"))


def rpc(node=None):
    return BitcoinRPC(host=node or NODES[0], timeout=10)


def e(x) -> str:
    return html.escape(str(x))


def short(h, n=12):
    return f"{h[:n]}…" if h and len(h) > n else (h or "")


def ago(t):
    if not t:
        return ""
    s = int(time.time() - t)
    return f"{s}s ago" if s < 120 else (f"{s // 60} min ago" if s < 7200 else dt.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M"))


def lncli(node, *args):
    out = subprocess.run([f"ln-{node}", *args], capture_output=True, text=True, timeout=15)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or out.stdout.strip())
    return json.loads(out.stdout)


def has_anchor(tx):
    for o in tx.get("vout", []):
        d = chain.op_return_data(o["scriptPubKey"]["hex"])
        if d is not None and chain.parse_payload(d):
            return True
    return False


@app.route("/")
def overview():
    cards = []
    for n in NODES:
        try:
            r = rpc(n)
            bc = r.getblockchaininfo()
            peers = r.getconnectioncount()
            mp = r.getmempoolinfo()
            cards.append(f"""<div class="card"><h3>{e(n)} <span class="badge ok">online</span></h3>
              <div class="big">{bc['blocks']}</div><div class="muted">block height</div>
              <table class="kv" style="margin-top:8px"><tr><td>best block</td><td class="mono"><a href="/block/{bc['bestblockhash']}">{short(bc['bestblockhash'], 16)}</a></td></tr>
              <tr><td>peers</td><td>{peers}</td></tr><tr><td>mempool</td><td>{mp['size']} tx</td></tr>
              <tr><td>chainwork</td><td class="mono">{short(bc['chainwork'].lstrip('0') or '0', 16)}</td></tr></table></div>""")
        except Exception as exc:  # noqa: BLE001
            cards.append(f'<div class="card"><h3>{e(n)} <span class="badge bad">offline</span></h3><div class="muted">{e(exc)}</div></div>')
    for n in LN:
        try:
            info = lncli(n, "getinfo")
            bal = lncli(n, "channelbalance")
            wb = lncli(n, "walletbalance")
            cards.append(f"""<div class="card"><h3>⚡ {e(n)} <span class="badge {'ok' if info.get('synced_to_chain') else 'warn'}">{'synced' if info.get('synced_to_chain') else 'syncing'}</span></h3>
              <table class="kv"><tr><td>node id</td><td class="mono">{short(info['identity_pubkey'], 20)}</td></tr>
              <tr><td>channels</td><td>{info.get('num_active_channels', 0)} active · {info.get('num_pending_channels', 0)} pending</td></tr>
              <tr><td>on-chain</td><td>{int(wb.get('confirmed_balance', 0)):,} sat</td></tr>
              <tr><td>in channels</td><td>{int(bal.get('local_balance', {}).get('sat', 0)):,} sat local</td></tr></table></div>""")
        except Exception as exc:  # noqa: BLE001
            cards.append(f'<div class="card"><h3>⚡ {e(n)} <span class="badge warn">starting</span></h3><div class="muted">{e(str(exc)[:160])}</div></div>')
    body = f"<h1>{e(TITLE)}</h1><div class='grid'>{''.join(cards)}</div>"
    try:
        body += "<h2>Latest blocks on " + e(NODES[0]) + "</h2>" + blocks_table(8)
    except Exception:  # noqa: BLE001
        pass
    return page(body)


def blocks_table(count):
    r = rpc()
    tip = r.getblockcount()
    rows = []
    for h in range(tip, max(-1, tip - count), -1):
        b = r.getblock(r.getblockhash(h), 2)
        anchors = sum(1 for t in b["tx"] if has_anchor(t))
        flag = f' <span class="badge info">{anchors} anchor</span>' if anchors else ""
        rows.append(f"<tr><td class='num'>{h}</td><td class='mono'><a href='/block/{b['hash']}'>{short(b['hash'], 20)}</a></td>"
                    f"<td>{dt.datetime.fromtimestamp(b['time']).strftime('%H:%M:%S')}</td><td class='num'>{len(b['tx'])}{flag}</td></tr>")
    return "<table><tr><th>height</th><th>block hash</th><th>time</th><th>transactions</th></tr>" + "".join(rows) + "</table>"


@app.route("/blocks")
def blocks():
    return page("<h1>Blocks</h1>" + blocks_table(25))


@app.route("/block/<h>")
def block(h):
    r = rpc(request.args.get("node"))
    try:
        if h.isdigit():          # /block/<height> as well as /block/<hash>
            h = r.getblockhash(int(h))
        b = r.getblock(h, 2)
    except RPCError:
        abort(404)
    kv = [("height", b["height"]), ("hash", b["hash"]), ("previous block", b.get("previousblockhash", "— (genesis)")),
          ("merkle root", b["merkleroot"]), ("time", f"{b['time']} ({dt.datetime.fromtimestamp(b['time'])})"),
          ("bits / target", f"{b['bits']} / {b['target'][:24]}…" if 'target' in b else b["bits"]), ("nonce", b["nonce"]),
          ("confirmations", b["confirmations"]), ("size / weight", f"{b['size']} B / {b['weight']} WU")]
    rows = "".join(f"<tr><td>{e(k)}</td><td class='mono'>{link_hash(k, v)}</td></tr>" for k, v in kv)
    txs = "".join(f"<tr><td class='num'>{i}</td><td class='mono'><a href='/tx/{t['txid']}'>{t['txid']}</a>"
                  f"{' <span class=\"badge info\">BITCT anchor</span>' if has_anchor(t) else ''}{' <span class=\"badge warn\">coinbase</span>' if i == 0 else ''}</td>"
                  f"<td class='num'>{len(t['vin'])} → {len(t['vout'])}</td></tr>" for i, t in enumerate(b["tx"]))
    return page(f"<h1>Block {b['height']}</h1><table class='kv'>{rows}</table><h2>Transactions (Merkle leaves, in order)</h2>"
                f"<table><tr><th>#</th><th>txid</th><th>in → out</th></tr>{txs}</table>", refresh=0)


def link_hash(k, v):
    if k in ("hash", "previous block") and isinstance(v, str) and len(v) == 64:
        return f"<a href='/block/{v}'>{v}</a>"
    return e(v)


@app.route("/tx/<txid>")
def tx(txid):
    r = rpc(request.args.get("node"))
    try:
        t = r.getrawtransaction(txid, 2)
    except RPCError:
        try:
            t = r.getrawtransaction(txid, True)
        except RPCError:
            abort(404)
    vin = []
    for i in t["vin"]:
        if "coinbase" in i:
            vin.append("<tr><td colspan=3><span class='badge warn'>coinbase</span> new coins + fees</td></tr>")
        else:
            val = i.get("prevout", {}).get("value", "")
            vin.append(f"<tr><td class='mono'><a href='/tx/{i['txid']}'>{short(i['txid'], 16)}</a>:{i['vout']}</td>"
                       f"<td class='num'>{btc(val) if val != '' else ''}</td><td class='mono'>{'witness: ' + str(len(i.get('txinwitness', []))) + ' items' if i.get('txinwitness') else short(i.get('scriptSig', {}).get('asm', ''), 40)}</td></tr>")
    vout = []
    for o in t["vout"]:
        spk = o["scriptPubKey"]
        extra = ""
        d = chain.op_return_data(spk["hex"])
        if d is not None:
            root = chain.parse_payload(d)
            extra = (f"<br><span class='badge info'>BITCT root</span> <code>{root.hex()}</code>" if root else f"<br>data: <code>{d.hex()}</code>")
        vout.append(f"<tr><td class='num'>{o['n']}</td><td class='num'>{btc(o['value'])}</td><td>{e(spk.get('type'))}</td>"
                    f"<td class='mono'>{e(spk.get('address', spk.get('asm', '')))}{extra}</td></tr>")
    conf = t.get("confirmations", 0)
    state = f"<span class='badge ok'>{conf} confirmation(s)</span>" if conf else "<span class='badge warn'>in mempool (unconfirmed)</span>"
    blk = f" in block <a href='/block/{t['blockhash']}'>{short(t['blockhash'], 16)}</a>" if t.get("blockhash") else ""
    return page(f"<h1>Transaction</h1><p class='mono'>{txid}</p><p>{state}{blk} · {t['vsize']} vB · version {t['version']}"
                f"{' · fee ' + str(t['fee']) + ' BTC' if 'fee' in t else ''}</p>"
                f"<h2>Inputs (what is spent)</h2><table><tr><th>outpoint</th><th>BTC</th><th>unlocking data</th></tr>{''.join(vin)}</table>"
                f"<h2>Outputs (new locks)</h2><table><tr><th>n</th><th>BTC</th><th>type</th><th>address / script</th></tr>{''.join(vout)}</table>", refresh=0)


@app.route("/mempool")
def mempool():
    parts = ["<h1>Mempools</h1><p class='muted'>Each node keeps its own mempool: relay is not confirmation.</p><div class='grid'>"]
    for n in NODES:
        try:
            mp = rpc(n).getrawmempool(True)
            rows = "".join(f"<tr><td class='mono'><a href='/tx/{k}?node={n}'>{short(k, 16)}</a></td><td class='num'>{v['vsize']}</td>"
                           f"<td class='num'>{float(v['fees']['base']) * 1e8 / v['vsize']:.1f}</td></tr>" for k, v in mp.items())
            parts.append(f"<div><h2>{e(n)} · {len(mp)} tx</h2><table><tr><th>txid</th><th>vB</th><th>sat/vB</th></tr>{rows or '<tr><td colspan=3 class=muted>empty</td></tr>'}</table></div>")
        except Exception as exc:  # noqa: BLE001
            parts.append(f"<div class='card'>{e(n)}: {e(exc)}</div>")
    return page("".join(parts) + "</div>")


@app.route("/lightning")
def lightning():
    if not LN:
        abort(404)
    nodes, edges, names = {}, [], {}
    for n in LN:
        try:
            info = lncli(n, "getinfo")
            names[info["identity_pubkey"]] = n
        except Exception:  # noqa: BLE001
            continue
    graph = None
    for n in LN:
        try:
            graph = lncli(n, "describegraph")
            break
        except Exception:  # noqa: BLE001
            continue
    tables = []
    for n in LN:
        try:
            ch = lncli(n, "listchannels")["channels"]
        except Exception:  # noqa: BLE001
            continue
        rows = "".join(f"<tr><td>{e(names.get(c['remote_pubkey'], short(c['remote_pubkey'], 10)))}</td><td class='num'>{int(c['capacity']):,}</td>"
                       f"<td class='num'>{int(c['local_balance']):,}</td><td class='num'>{int(c['remote_balance']):,}</td>"
                       f"<td>{'active' if c['active'] else 'inactive'}</td><td class='mono'>{short(c['channel_point'], 14)}</td></tr>" for c in ch)
        tables.append(f"<h2>⚡ {e(n)}'s view of its own channels</h2><table><tr><th>peer</th><th>capacity</th><th>local</th><th>remote</th><th>state</th><th>funding outpoint</th></tr>"
                      f"{rows or '<tr><td colspan=6 class=muted>no channels</td></tr>'}</table>")
    svg = ""
    if graph:
        pubs = [nd["pub_key"] for nd in graph["nodes"]]
        import math
        pos = {p: (300 + 210 * math.cos(2 * math.pi * i / max(1, len(pubs)) - math.pi / 2),
                   230 + 170 * math.sin(2 * math.pi * i / max(1, len(pubs)) - math.pi / 2)) for i, p in enumerate(pubs)}
        lines = []
        for ed in graph["edges"]:
            a, b = pos.get(ed["node1_pub"]), pos.get(ed["node2_pub"])
            if a and b:
                lines.append(f"<line x1='{a[0]:.0f}' y1='{a[1]:.0f}' x2='{b[0]:.0f}' y2='{b[1]:.0f}' stroke='#00695c' stroke-width='3'/>"
                             f"<text x='{(a[0] + b[0]) / 2:.0f}' y='{(a[1] + b[1]) / 2 - 6:.0f}' font-size='13' text-anchor='middle' fill='#152029' stroke='#fdfbf5' stroke-width='5' paint-order='stroke'>{int(ed['capacity']):,} sat</text>")
        circles = "".join(f"<circle cx='{x:.0f}' cy='{y:.0f}' r='26' fill='#ffe7b3' stroke='#152029' stroke-width='2'/>"
                          f"<text x='{x:.0f}' y='{y + 5:.0f}' font-size='14' font-weight='bold' text-anchor='middle'>{e(names.get(p, p[:6]))}</text>"
                          for p, (x, y) in pos.items())
        svg = (f"<h2>Public channel graph (gossip): capacities only — balances are private</h2>"
               f"<svg viewBox='0 0 600 460' style='max-width:640px;width:100%;background:#fffdf8;border:1px solid #e3d7bd;border-radius:10px'>{''.join(lines)}{circles}</svg>")
    return page("<h1>Lightning</h1>" + svg + "".join(tables))


@app.route("/iot")
def iot():
    if not os.path.exists(D17_DB):
        return page("<h1>D17 anchoring</h1><p>The D17 gateway is not running in this lab.</p>")
    db = d17.connect(D17_DB)
    reg = "".join(f"<tr><td>{e(r['device'])}</td><td>{e(r['key_id'])}</td><td class='num'>{r['enrollment']}</td>"
                  f"<td><span class='badge {'ok' if r['status'] == 'active' else 'bad'}'>{e(r['status'])}</span></td><td class='mono'>{short(r['pubkey'], 24)}</td></tr>"
                  for r in db.execute("SELECT * FROM registry ORDER BY enrollment"))
    badge = {d17.ACCEPTED: "ok", d17.NO_NEW_EVENT: "warn", d17.INDETERMINATE: "warn"}
    reps = "".join(f"<tr><td class='num'><a href='/iot/report/{r['id']}'>{r['id']}</a></td><td>{ago(r['received_at'])}</td>"
                   f"<td class='num'>{e(r['seq'] if r['seq'] is not None else '?')}</td><td class='num'>{e(r['value'] if r['value'] is not None else '?')} W</td>"
                   f"<td><span class='badge {badge.get(r['verdict'], 'bad')}'>{e(r['verdict'])}</span><br><span class='muted'>{e(r['reason'] or '')}</span></td>"
                   f"<td class='num'>{r['batch_id'] or '–'}</td></tr>"
                   for r in db.execute("SELECT * FROM reports ORDER BY id DESC LIMIT 25"))
    bat = "".join(f"<tr><td class='num'>{b['id']}</td><td>{ago(b['created_at'])}</td><td class='num'>{b['size']}</td><td class='mono'>{short(b['root'], 20)}</td>"
                  f"<td>{e(b['network'] or '–')}</td><td class='mono'>{('<a href=/tx/' + b['txid'] + '>' + short(b['txid'], 14) + '</a>') if b['txid'] and b['network'] == 'regtest' else (short(b['txid'], 14) if b['txid'] else '–')}</td>"
                  f"<td class='num'>{b['height'] or '–'}</td><td><span class='badge {'ok' if b['status'] == 'confirmed' else 'warn'}'>{e(b['status'])}</span></td></tr>"
                  for b in db.execute("SELECT * FROM batches ORDER BY id DESC LIMIT 15"))
    counts = {r["verdict"]: r["n"] for r in db.execute("SELECT verdict, COUNT(*) n FROM reports GROUP BY verdict")}
    tiles = "".join(f"<div class='card'><div class='big'>{counts.get(v, 0)}</div><div class='muted'>{v}</div></div>"
                    for v in (d17.ACCEPTED, d17.NO_NEW_EVENT, d17.REJECT_SIGNATURE, d17.REJECT_AUTHORITY, d17.REJECT_CONTEXT))
    return page(f"<h1>D17 → gateway → Merkle batches → Bitcoin</h1><div class='grid'>{tiles}</div>"
                f"<h2>Operator registry (who is authorized)</h2><table><tr><th>device</th><th>key</th><th>enrollment</th><th>status</th><th>public key</th></tr>{reg or '<tr><td colspan=5 class=muted>no device enrolled yet — run d17 enroll</td></tr>'}</table>"
                f"<h2>Reports received (newest first)</h2><table><tr><th>#</th><th>received</th><th>seq</th><th>value</th><th>collector verdict</th><th>batch</th></tr>{reps or '<tr><td colspan=6 class=muted>waiting for the device…</td></tr>'}</table>"
                f"<h2>Merkle batches and anchors</h2><table><tr><th>#</th><th>made</th><th>leaves</th><th>root</th><th>network</th><th>anchor tx</th><th>block</th><th>status</th></tr>{bat or '<tr><td colspan=8 class=muted>no batch yet</td></tr>'}</table>")


@app.route("/iot/report/<int:rid>")
def iot_report(rid):
    db = d17.connect(D17_DB)
    r = db.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone()
    if not r:
        abort(404)
    body = f"<h1>Report #{rid}</h1><p><span class='badge {'ok' if r['verdict'] == d17.ACCEPTED else 'bad'}'>{e(r['verdict'])}</span> {e(r['reason'])}</p>"
    if r["report"]:
        body += f"<h2>Exact signed bytes</h2><pre>{e(bytes(r['report']).decode())}</pre><h2>BIP340 signature</h2><p class='mono'>{e(r['sig'])}</p>"
    if r["batch_id"]:
        rc = d17.receipt(db, rid)
        steps = audit.audit_receipt(rc, d17.registry_export(db))
        cls = {audit.OK: "ok", audit.FAIL: "bad"}
        body += "<h2>Independent audit of the receipt</h2><table>" + "".join(
            f"<tr><td><span class='badge {cls.get(s.status, 'info')}'>{e(s.status)}</span></td><td>{e(s.name)}</td><td>{e(s.detail)}</td></tr>" for s in steps) + "</table>"
        body += f"<h2>Receipt</h2><pre>{e(json.dumps(rc, indent=2))}</pre>"
    return page(body, refresh=0)


def main():
    app.run(host="0.0.0.0", port=int(os.environ.get("DASH_PORT", "8080")), debug=False, threaded=True)


if __name__ == "__main__":
    main()
