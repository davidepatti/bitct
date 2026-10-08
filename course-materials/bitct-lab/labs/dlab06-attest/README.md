# DLAB 06 — Device Evidence

| | |
|---|---|
| Stable ID | `LAB-IOT-ATTEST` |
| Session | 6 |
| Time | 180 min |
| Lecture | M 4.1 / M 4.2 |
| Network | **none (simulation)** |

## What this experience means

- The verifier checks exact bytes under the operator's registered key, never a key carried by the report.
- Counter + enrollment version decide whether a valid report is a new event.
- A perfectly signed reading can still be false: no digital check establishes physical truth.

## Why this network

The collector's decision needs no blockchain: this is a local simulation of D17 and its verifier. Anchoring comes in DLAB 07/11.

## Goal

Run the D17 collector rule on fixed, signed reports and separate signature validity, authorization, freshness, context and truth.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab06-attest
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### D0 · Checkpoint C0

Checkpoint C0: (D17, key-A, enrollment 3), last accepted 41.

```sh
cd /lab/d17
d17 prepare-c0
d17 registry
```

**Checkpoint:** key-A 3 active, last 41

### D1 · What exactly was signed (R42)

The exact signed bytes and m = TaggedHash(schema, bytes).

```sh
d17 explain cases/R42.json
```

**Checkpoint:** 9 lines, seq=42

### T01 · Accept R42 once → C1

Accepted once; state C1.

```sh
d17 submit cases/R42.json
d17 checkpoint save C1
```

**Checkpoint:** ACCEPTED — seq 41 -> 42

### T02 · Exact retry

Exact retry.

```sh
cd /lab/d17 && d17 submit cases/R42.json
```

**Checkpoint:** NO_NEW_EVENT

### T04 · Value changed after signing (from C0)

Bytes changed after signing.

```sh
d17 checkpoint load C0
d17 submit cases/R42-altered.json
```

**Checkpoint:** REJECT_SIGNATURE

### T05 · Signed for another audience

Validly signed for the wrong audience.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R42-wrong-audience.json
d17 explain cases/R42-wrong-audience.json | tail -2
```

**Checkpoint:** REJECT_CONTEXT

### T06 · Sequence 43 after a long delay

Delayed but unseen: ordering passes, age unknown.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R43-delayed.json
```

**Checkpoint:** ACCEPTED (gap of 1)

### T07 · Out of order: 43 then 42

Late lower sequence.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R43.json && d17 submit cases/R42.json
```

**Checkpoint:** NO_NEW_EVENT

### T08 · Huge counter, bad signature

A bad signature cannot poison the counter.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R1000000-badsig.json && d17 submit cases/R42.json
```

**Checkpoint:** REJECT_SIGNATURE, then R42 still ACCEPTED

### T09 · Reboot: sequence 0

Reboot does not reset the collector.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R0-reboot.json
```

**Checkpoint:** NO_NEW_EVENT

### T10 · Self-declared enrollment 4

A device cannot enrol itself.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R-self-enrolled-4.json
```

**Checkpoint:** REJECT_AUTHORITY

### T11 · Impostor key-X

Possession of a key ≠ authorized binding.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R-impostor-keyX.json
```

**Checkpoint:** REJECT_AUTHORITY

### T12 · Authority service offline

Authority unknown → queue, do not accept.

```sh
d17 authority offline
d17 submit cases/R42.json
d17 authority online
```

**Checkpoint:** INDETERMINATE

### T13 · Replay state lost

Unknown replay state is not zero.

```sh
cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 lose-state --enrollment 3 && d17 submit cases/R42.json
```

**Checkpoint:** INDETERMINATE

### T14 · Routine rotation to key-B (from C1)

Routine rotation decided by operator O.

```sh
d17 checkpoint load C1
d17 enroll --key key-B --enrollment 4 --pubkey $(jq -r .pubkey keys/key-B.json)
d17 submit cases/RB1.json
d17 submit cases/R43-after-cutover.json
```

**Checkpoint:** RB1 ACCEPTED; old key REJECT_AUTHORITY

### T15 · Compromise: revoke key-A, then replace (from C1)

Compromise branch: revoke first.

```sh
d17 checkpoint load C1
d17 revoke --enrollment 3
d17 submit cases/R43-after-cutover.json
# then enrol key-B and submit RB1
```

**Checkpoint:** REJECT_AUTHORITY, then RB1 ACCEPTED

### T17 · History after revocation

History keeps the original decision.

```sh
d17 reports
d17 show 1
```

**Checkpoint:** #1 ACCEPTED is still recorded

### T18 · A perfectly signed false reading

A signed lie passes every digital check.

```sh
d17 submit cases/R42-false-reading.json
cat ground-truth.csv
```

**Checkpoint:** ACCEPTED; clamp says 310 W

## Submit

Verdict table T01–T18 (signature / authority / context / freshness / truth columns), the two lifecycle traces and the R42 evidence bundle.

## What this does not show

- simulation of a classroom protocol, not an IoT standard and not hardware attestation
- acceptance never proves the reading's age or physical truth

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
