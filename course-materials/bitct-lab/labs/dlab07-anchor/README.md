# DLAB 07 — Sensor Records and Merkle Anchoring

| | |
|---|---|
| Stable ID | `LAB-INTEGRITY-ANCHOR` |
| Session | 7 |
| Time | 180 min |
| Lecture | M 4.3 |
| Network | **regtest (+ optional signet step)** |

## What this experience means

- One 32-byte root on chain commits to every record in the batch.
- A receipt (file + Merkle path + transaction) lets anyone check one record independently.
- Inclusion is not completeness: a valid receipt says nothing about records left out of the batch.

## Why this network

Regtest gives a deterministic, instant anchor. An optional final step publishes one root on signet so a classmate can check it from another computer.

## Goal

Batch exact sensor records in a Merkle tree, anchor the root with OP_RETURN, and verify receipts against changed, missing and omitted evidence.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab07-anchor
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### M1 · Hash every record

Exact bytes, exact hashes.

```sh
cd /lab/records
sha256sum r0*.csv
```

**Checkpoint:** 8 hashes

### M2 · Build the Merkle batch

RFC 9162 tree: leaf = SHA256(0x00‖bytes), node = SHA256(0x01‖L‖R).

```sh
merkle build r0*.csv
```

**Checkpoint:** one root

### M3 · Anchor the root (OP_RETURN)

A transaction with OP_RETURN 'BITCT' 01 root.

```sh
merkle anchor $ROOT
```

**Checkpoint:** txid in the mempool

### M4 · Mine and inspect

Mine and read the data output.

```sh
mine 1
bitcoin-cli getrawtransaction $TXID true | jq '.vout[] | select(.scriptPubKey.type=="nulldata") | .scriptPubKey.asm'
```

**Checkpoint:** OP_RETURN 4249544354 01 …

### M5 · Receipt for r03

A receipt for one record.

```sh
merkle receipt --index 2 --txid $TXID -o /lab/r03.receipt.json r0*.csv
```

**Checkpoint:** leaf 2 of 8, 3 path hashes

### M6 · Verify r03

Four independent checks.

```sh
merkle verify /lab/r03.receipt.json r03.csv
```

**Checkpoint:** VERIFIED

### M7 · Change one byte of r03

One changed digit.

```sh
cd /lab && cp records/r03.csv r03-changed.csv && sed -i 's/,1198$/,1199/' r03-changed.csv && merkle verify r03.receipt.json r03-changed.csv
```

**Checkpoint:** FAIL at file bytes → NOT VERIFIED

### M8 · Missing path: unverifiable

No path, no proof: the root cannot rebuild missing evidence.

```sh
cd /lab && jq '.path=[]' r03.receipt.json > r03-nopath.json && merkle verify r03-nopath.json records/r03.csv
```

**Checkpoint:** FAIL at Merkle path

### M9 · Omission: a batch without r05

A batch that silently omits r05 still yields valid receipts.

```sh
cd /lab/records && ROOT7=$(merkle build r01.csv r02.csv r03.csv r04.csv r06.csv r07.csv r08.csv | awk '/^root/{print $2}')
TX7=$(merkle anchor $ROOT7 | awk '/anchor transaction/{print $3}'); mine 1 >/dev/null
merkle receipt --index 4 --txid $TX7 -o /lab/r06.receipt.json r01.csv r02.csv r03.csv r04.csv r06.csv r07.csv r08.csv >/dev/null
merkle verify /lab/r06.receipt.json r06.csv | tail -1
cat expected-set.txt | sed -n '1,8p'
```

**Checkpoint:** VERIFIED — compare with expected-set.txt


## Optional: publish the root on signet

```sh
signet-anchor address            # fund with a few thousand signet sats
signet-anchor publish $ROOT
signet-anchor status <txid>
```
Anyone can now look up the transaction on mempool.space/signet and check your receipt's root against it.

## Submit

Hash list, root, txid, the three verdicts (changed / missing / omitted) and a claim-boundary note.

## What this does not show

- an anchor proves the bytes existed before the block, not when they were measured or that they are true
- regtest anchors are private to your laptop: only the signet step gives third-party evidence

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
