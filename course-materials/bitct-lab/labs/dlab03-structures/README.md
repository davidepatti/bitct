# DLAB 03 — Hashes, Block Header and Merkle Root

| | |
|---|---|
| Stable ID | `LAB-BTC-STRUCTURES` |
| Session | 3 |
| Time | 180 min |
| Lecture | M 2.2 |
| Network | **regtest** |

## What this experience means

- A hash commits to exact bytes: one byte changes about half the output bits.
- The header commits to all transactions through one 32-byte Merkle root.
- Changing a transaction forces a new root, a new proof of work and a new hash for every later block.

## Why this network

We need a block whose transactions we chose, and the freedom to recompute proof of work: only regtest makes that instant.

## Goal

Hash exact bytes, decode a real 80-byte header, rebuild the Merkle root and see why a change breaks the chain of commitments.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab03-structures
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### H1 · One byte in, half the bits out

Avalanche effect.

```sh
hashdiff 'D17 1200 W' 'D17 1201 W'
```

**Checkpoint:** ≈128 of 256 bits differ

### H2 · A block with several transactions

A block with a coinbase and three payments.

```sh
bitcoin-cli createwallet miner
mine 101
# send three payments, then
mine 1
bitcoin-cli getblock $(bitcoin-cli getbestblockhash) | jq '{height, nTx, merkleroot}'
```

**Checkpoint:** nTx: 4

### H3 · Decode the 80-byte header

Six fields, 80 bytes, one double SHA-256.

```sh
header block $H
```

**Checkpoint:** proof of work: hash ≤ target → yes

### H4 · Rebuild the Merkle root

Pairwise double hashing up to the root (odd levels duplicate the last hash).

```sh
merkle bitcoin $H
```

**Checkpoint:** MATCH

### H5 · Change one transaction

One bit in one txid.

```sh
merkle bitcoin $H --change 2
```

**Checkpoint:** DIFFERENT

### H6 · Redo the proof of work

Regtest proof of work is trivial: the forged header is 'valid' in isolation.

```sh
FORGED=$(bitcoin-util grind $(header replace-root $OLD $NEWROOT))
header decode $FORGED
```

**Checkpoint:** a new block hash

### H7 · The next block still points to the original

But the next block still names the original hash.

```sh
mine 1 >/dev/null
bitcoin-cli getblockheader $(bitcoin-cli getblockhash $((H+1))) | jq -r .previousblockhash
header decode $FORGED | sed -n '/block hash/{n;p}'
```

**Checkpoint:** previousblockhash ≠ forged hash

## Submit

Header field table, the Merkle levels for your block, and one paragraph: why does a changed transaction break the chain?

## What this does not show

- regtest difficulty is minimal: mainnet would need the network's work for every replaced block
- Bitcoin's Merkle rules (double SHA-256, duplicated last hash) differ from the receipt trees in DLAB 07/11

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
