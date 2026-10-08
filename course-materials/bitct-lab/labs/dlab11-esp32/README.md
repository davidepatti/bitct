# DLAB 11 — ESP32 Sensor Readings Anchored on Bitcoin

| | |
|---|---|
| Stable ID | `LAB-IOT-ESP32-ANCHOR (new)` |
| Session | extension of 6–7 |
| Time | 180 min |
| Lecture | M 4.1 → M 4.3 |
| Network | **regtest (+ optional signet publication)** |

## What this experience means

- The device signs exact bytes (BIP340); the network and broker are untrusted transport.
- The gateway applies the D17 rule, then commits accepted readings to Bitcoin in periodic Merkle batches.
- A later audit detects altered records; it cannot detect a false reading or a reading never batched.

## Why this network

Regtest anchors every minute with blocks every 30 s, so the whole pipeline is visible in class. A regtest anchor convinces only you: the optional signet step lets an outside auditor check one root later.

## Goal

Make D17 concrete: a Wokwi ESP32 signs each reading; the Docker gateway verifies, batches into a Merkle tree, anchors the root and issues receipts that an auditor can check later.

## Start

```sh
cd bitct-lab/labs/dlab11-esp32
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.


## Before the lab: the Wokwi meter

1. Open the course Wokwi project (link on the DLAB 11 slides), or create a new **ESP32** project on
   [wokwi.com](https://wokwi.com) and replace its files with `wokwi/d17-esp32/sketch.ino`,
   `diagram.json` and `libraries.txt` from this kit.
2. In the lab shell run `d17 keygen`. Copy the **secret** into `DEVICE_SECRET_HEX` at the top of
   `sketch.ino`; set `GROUP` to the same value as `GROUP` in this folder's `.env` file.
3. Press ▶. The serial monitor prints the meter's public key, then every 15 s the exact report bytes,
   the BIP340 signature and `published reading … OK`.

Wokwi's free virtual Wi-Fi reaches the Internet but not your laptop, so the meter publishes to the public
broker `broker.hivemq.com` on topic `bitct/<GROUP>/d17/report`, and the lab's gateway subscribes to it.
Anyone can read or inject messages on a public topic: that is exactly why every reading is signed.

## Optional: publish one root on signet (public evidence)

```sh
d17 signet address            # fund it with 2,000–5,000 signet sats (LAB02 wallet or the teacher's reserve)
d17 signet balance
d17 signet publish --batch <n>
d17 signet refresh            # after the next signet block (~10 min)
d17 receipt <id> -o /lab/public-receipt.json
d17 registry --export /lab/registry.json
```

Copy both files out with `docker compose cp lab:/lab/public-receipt.json .` (and `registry.json`) and send
them to a classmate, who runs on their own laptop:

```sh
d17 audit public-receipt.json --registry registry.json --network signet
```

The audit fetches the transaction and its Merkle proof from a public Esplora server (mempool.space):
it trusts that server for chain data unless the auditor runs a signet node.

## No Internet or no Wokwi?

`docker compose --profile sim up -d` starts a virtual D17 meter that publishes the same signed reports.
For a fully offline run set `MQTT_HOST=broker` in `.env` (local broker) before `docker compose up`.
Stop everything, including the virtual meter, with `docker compose --profile sim down`.

## Steps

### E0 · Gateway subscribed, nothing enrolled

The gateway listens; nobody is enrolled.

```sh
# 1. edit .env: GROUP=<your group code>
docker compose up -d --wait
docker compose exec lab bash
d17 registry
```

**Checkpoint:** empty registry

### E1 · Create the device key

Factory provisioning: create the meter's key.

```sh
d17 keygen
```

**Checkpoint:** secret (paste into Wokwi) and public key

### E2 · Start the meter (virtual stand-in for Wokwi)

The meter signs and publishes every 15 s.

```sh
Wokwi: set GROUP and DEVICE_SECRET_HEX in sketch.ino, press ▶
```

**Checkpoint:** Serial monitor: report bytes, signature, published OK

### E3 · Not enrolled → rejected

Signed, but not authorized.

```sh
d17 reports
```

**Checkpoint:** REJECT_AUTHORITY

### E4 · Operator enrolls the device key

Operator O binds the key to D17.

```sh
d17 enroll --enrollment 1 --pubkey <public key shown by the ESP32>
```

**Checkpoint:** operator O authorized (D17, key-A, enrollment 1)

### E5 · Accepted readings

Readings are now accepted.

```sh
d17 reports
```

**Checkpoint:** ACCEPTED

### E6 · Batches anchored and confirmed

Every minute: Merkle batch → OP_RETURN → block.

```sh
d17 batches
```

**Checkpoint:** anchored → confirmed

### E7 · Export and audit a receipt

An independent four-step audit.

```sh
d17 receipt <id> -o /lab/receipt.json
d17 audit /lab/receipt.json
```

**Checkpoint:** VERIFIED, with its claim limits

### E8 · A dishonest collector edits its database

A dishonest collector rewrites history.

```sh
d17 tamper <id> --value 400
d17 receipt <id> -o /lab/after.json
d17 audit /lab/after.json
d17 audit /lab/receipt.json
```

**Checkpoint:** after: NOT VERIFIED; kept receipt: VERIFIED

### E9 · Replay and tampering on the wire

Attacks on the wire.

```sh
Wokwi: press REPLAY, then TAMPER   (no Wokwi: d17-sim --resend-last replay|tamper)
d17 reports --last 4
```

**Checkpoint:** NO_NEW_EVENT, REJECT_SIGNATURE

### E10 · Look for gaps

Missing sequence numbers are evidence to investigate.

```sh
d17 gaps
```

**Checkpoint:** gaps listed

### E11 · Dashboard D17 page

The whole pipeline on one page.

```sh
open http://localhost:8080/iot
```

**Checkpoint:** registry, reports, batches

## Submit

Your enrolled public key, a verified receipt, the tamper/replay verdicts, the gap list, and a claim-boundary paragraph (what the anchor proves and does not prove).

## What this does not show

- Wokwi is a simulator: the 'current sensor' is a slider
- the counter starts from the boot time because Wokwi forgets flash: a real meter keeps it in secure storage
- a regtest anchor is private evidence; public evidence needs signet (or mainnet)

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```
