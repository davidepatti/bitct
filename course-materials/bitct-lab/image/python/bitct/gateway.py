"""D17 gateway/collector service: MQTT in, verified events out, Merkle batches anchored on Bitcoin.

Environment:
  D17_DB            SQLite path shared with the lab shell and dashboard
  MQTT_HOST/PORT    broker (public broker for Wokwi, 'broker' for the local one)
  GROUP             topic namespace: bitct/<GROUP>/d17/report
  BATCH_SECONDS     how often accepted reports are batched and anchored
  ANCHOR_NETWORK    regtest (automatic) or none (batch only; signet is a manual step)
"""
from __future__ import annotations

import os
import signal
import sys
import threading
import time

from . import chain, d17
from .rpc import BitcoinRPC, RPCError, ensure_wallet

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
COLOR = {d17.ACCEPTED: GREEN, d17.NO_NEW_EVENT: YELLOW, d17.INDETERMINATE: YELLOW}


def log(msg: str):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def topic() -> str:
    return f"bitct/{os.environ.get('GROUP', 'demo')}/d17/report"


class Anchorer:
    def __init__(self, db_path: str):
        self.db = d17.connect(db_path)
        self.network = os.environ.get("ANCHOR_NETWORK", "regtest")
        self.wallet = None

    def _wallet(self):
        if self.wallet is None:
            rpc = BitcoinRPC()
            w = ensure_wallet(rpc, "gateway")
            if w.getbalance() < 1:
                addr = w.getnewaddress("gateway-funding")
                rpc.generatetoaddress(101, addr)
                log(f"{DIM}funded the gateway's regtest wallet (mined 101 blocks){RESET}")
            self.wallet = w
        return self.wallet

    def tick(self):
        bid = d17.make_batch(self.db)
        if bid is not None:
            b = self.db.execute("SELECT * FROM batches WHERE id=?", (bid,)).fetchone()
            log(f"batch #{bid}: {b['size']} accepted report(s) → Merkle root {b['root'][:16]}…")
            if self.network == "regtest":
                try:
                    res = chain.anchor_with_core_wallet(self._wallet(), chain.anchor_payload(bytes.fromhex(b["root"])))
                    self.db.execute("UPDATE batches SET network='regtest', txid=?, vout=?, status='anchored' WHERE id=?",
                                    (res["txid"], res["vout"], bid))
                    log(f"batch #{bid}: anchored in tx {res['txid'][:16]}… (OP_RETURN), waiting for a block")
                except (RPCError, OSError) as exc:
                    log(f"{RED}batch #{bid}: anchoring failed: {exc}{RESET}")
        self.update_confirmations()

    def update_confirmations(self):
        if self.network != "regtest":
            return
        rows = self.db.execute("SELECT * FROM batches WHERE network='regtest' AND txid IS NOT NULL "
                               "AND (blockhash IS NULL OR status!='confirmed')").fetchall()
        for b in rows:
            try:
                t = self._wallet().gettransaction(b["txid"])
            except (RPCError, OSError):
                continue
            if t.get("confirmations", 0) > 0:
                self.db.execute("UPDATE batches SET blockhash=?, height=?, block_time=?, status='confirmed' WHERE id=?",
                                (t["blockhash"], t["blockheight"], t["blocktime"], b["id"]))
                log(f"{GREEN}batch #{b['id']}: confirmed in block {t['blockheight']}{RESET}")


def run():
    import paho.mqtt.client as mqtt

    db_path = os.environ.get("D17_DB", "/data/d17/collector.sqlite")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = d17.connect(db_path)
    host = os.environ.get("MQTT_HOST", "broker")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    t = topic()
    period = float(os.environ.get("BATCH_SECONDS", "60"))
    lock = threading.Lock()

    def on_connect(client, userdata, flags, reason_code, properties=None):
        log(f"connected to MQTT {host}:{port} — subscribed to {t}")
        client.subscribe(t, qos=1)

    def on_disconnect(client, userdata, flags, reason_code, properties=None):
        log(f"{YELLOW}MQTT disconnected ({reason_code}); retrying…{RESET}")

    def on_message(client, userdata, msg):
        raw = msg.payload.decode("utf-8", "replace")
        try:
            with lock:
                dec = d17.submit(db, raw, source=f"mqtt:{msg.topic}")
            log(f"#{dec.report_id:<4} {COLOR.get(dec.verdict, RED)}{dec.line()}{RESET}")
        except Exception as exc:  # noqa: BLE001 - never kill the MQTT loop
            log(f"{RED}could not process a message: {exc}{RESET}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id=f"bitct-gw-{os.environ.get('GROUP', 'demo')}-{os.getpid()}")
    client.on_connect, client.on_disconnect, client.on_message = on_connect, on_disconnect, on_message
    client.reconnect_delay_set(1, 30)
    log(f"D17 gateway starting: broker {host}:{port}, topic {t}, batch every {period:.0f}s, anchor={os.environ.get('ANCHOR_NETWORK', 'regtest')}")
    while True:
        try:
            client.connect(host, port, keepalive=30)
            break
        except OSError as exc:
            log(f"{YELLOW}cannot reach {host}:{port} ({exc}); retrying in 5s{RESET}")
            time.sleep(5)
    client.loop_start()

    anchorer = Anchorer(db_path)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    while not stop.is_set():
        stop.wait(period)
        with lock:
            try:
                anchorer.tick()
            except Exception as exc:  # noqa: BLE001 - keep the service alive in class
                log(f"{RED}batcher error: {exc}{RESET}")
    client.loop_stop()
    return 0


if __name__ == "__main__":
    sys.exit(run())
