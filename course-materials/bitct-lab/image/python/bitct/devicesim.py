"""Virtual D17 meter: publishes the same signed reports as the Wokwi ESP32.

Use it when Wokwi or the public broker is unavailable, or to inject the
misbehaviours studied in M4.1/M4.2 (replay, tampering, wrong audience, reboot,
impostor key).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time

from . import bip340, d17

DEFAULT_KEY_FILE = "/data/d17/sim-device-key.json"


def load_key(path: str) -> bytes:
    if os.path.exists(path):
        with open(path) as f:
            return bytes.fromhex(json.load(f)["secret"])
    sk = os.urandom(32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"secret": sk.hex(), "note": "virtual D17 device key (lab only)"}, f)
    return sk


def main(argv=None):
    p = argparse.ArgumentParser(prog="d17-sim", description=__doc__)
    p.add_argument("--host", default=os.environ.get("MQTT_HOST", "broker"))
    p.add_argument("--port", type=int, default=int(os.environ.get("MQTT_PORT", "1883")))
    p.add_argument("--group", default=os.environ.get("GROUP", "demo"))
    p.add_argument("--key-file", default=os.environ.get("SIM_KEY_FILE", DEFAULT_KEY_FILE))
    p.add_argument("--key-id", default="key-A")
    p.add_argument("--enrollment", type=int, default=1)
    p.add_argument("--interval", type=float, default=10.0)
    p.add_argument("--count", type=int, default=0, help="stop after N reports (0 = run forever)")
    p.add_argument("--seq", type=int, default=None, help="first sequence number (default: boot epoch seconds)")
    p.add_argument("--watts", type=int, default=1200)
    p.add_argument("--audience", default="factory-a.audit")
    p.add_argument("--misbehave", choices=["none", "replay", "tamper", "wrong-audience", "reboot", "impostor"],
                   default="none", help="inject one misbehaviour every third report")
    p.add_argument("--print-pubkey", action="store_true", help="print the x-only public key and exit")
    p.add_argument("--resend-last", choices=["replay", "tamper"],
                   help="like the Wokwi REPLAY/TAMPER buttons: re-send the last accepted message unchanged, "
                        "or with its value changed after signing, then exit (the counter does not advance)")
    a = p.parse_args(argv)

    sk = load_key(a.key_file)
    pub = bip340.pubkey_gen(sk)
    if a.print_pubkey:
        print(pub.hex())
        return 0

    import paho.mqtt.client as mqtt
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"d17-sim-{a.group}-{os.getpid()}")
    client.connect(a.host, a.port, keepalive=30)
    client.loop_start()
    topic = f"bitct/{a.group}/d17/report"
    if a.resend_last:
        db = d17.connect(os.environ.get("D17_DB", "/data/d17/collector.sqlite"))
        row = db.execute("SELECT id, raw FROM reports WHERE verdict='ACCEPTED' ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            sys.exit("no accepted report yet: nothing to re-send")
        msg = row["raw"]
        if a.resend_last == "tamper":
            obj = json.loads(msg)
            lines = obj["report"].split("\n")
            for i, line in enumerate(lines):
                if line.startswith("value="):
                    lines[i] = f"value={int(line[6:]) + 1000}"
            obj["report"] = "\n".join(lines)
            msg = json.dumps(obj, separators=(",", ":"))
        info = client.publish(topic, msg, qos=1)
        info.wait_for_publish(10)
        what = "unchanged (REPLAY)" if a.resend_last == "replay" else "value +1000 W, old signature (TAMPER)"
        print(f"re-sent report #{row['id']} {what}", flush=True)
        client.loop_stop()
        return 0
    seq = a.seq if a.seq is not None else int(time.time())
    print(f"virtual D17 → {a.host}:{a.port} topic {topic}\npublic key (x-only): {pub.hex()}", flush=True)
    last = None
    n = 0
    while a.count == 0 or n < a.count:
        n += 1
        watts = max(0, int(a.watts + 150 * math.sin(n / 5) + random.randint(-20, 20)))
        rep = d17.make_report(key=a.key_id, enrollment=a.enrollment, seq=seq, value=watts, audience=a.audience)
        rb = rep.encode()
        sig = d17.sign_report(sk, rb)
        msg = d17.wire(rb, sig, pub)
        tag = "normal"
        if a.misbehave != "none" and n % 3 == 0:
            if a.misbehave == "replay" and last:
                msg, tag = last, "replay of previous report"
            elif a.misbehave == "tamper":
                obj = json.loads(msg)
                obj["report"] = obj["report"].replace(f"value={watts}", f"value={watts + 5000}")
                msg, tag = json.dumps(obj, separators=(",", ":")), "value changed after signing"
            elif a.misbehave == "wrong-audience":
                rb2 = d17.make_report(key=a.key_id, enrollment=a.enrollment, seq=seq, value=watts,
                                      audience="factory-b.billing").encode()
                msg, tag = d17.wire(rb2, d17.sign_report(sk, rb2), pub), "signed for another audience"
            elif a.misbehave == "reboot":
                rb2 = d17.make_report(key=a.key_id, enrollment=a.enrollment, seq=0, value=watts).encode()
                msg, tag = d17.wire(rb2, d17.sign_report(sk, rb2), pub), "counter restarted at 0"
            elif a.misbehave == "impostor":
                other = os.urandom(32)
                msg, tag = d17.wire(rb, d17.sign_report(other, rb), bip340.pubkey_gen(other)), "impostor key"
        client.publish(topic, msg, qos=1)
        print(f"published seq={seq} value={watts} W ({tag})", flush=True)
        last = msg
        seq += 1
        time.sleep(a.interval)
    client.loop_stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
