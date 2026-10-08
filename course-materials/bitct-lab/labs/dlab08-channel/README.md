# DLAB 08 — Lightning Channel Lifecycle

| | |
|---|---|
| Stable ID | `LAB-LN-CHANNEL` |
| Session | 8 |
| Time | 180 min |
| Lecture | M 5.1 |
| Network | **regtest** |

## What this experience means

- A channel is a 2-of-2 on-chain output; payments only update who could claim it.
- A cooperative close is an ordinary transaction both sides sign.
- A force close publishes the latest commitment: the closer waits a relative timelock, the peer does not.

## Why this network

Opening, paying and closing need fast confirmations and a long force-close delay we can mine through in seconds.

## Goal

Open a channel, pay off-chain, close cooperatively, then force-close and follow the time-locked return to the chain.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab08-channel
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### L1 · Two Lightning nodes, no channels

Two LND nodes on one regtest node.

```sh
ln-alice getinfo
ln-bob getinfo
```

**Checkpoint:** 0 channels

### L2 · Give Alice on-chain coins

On-chain coins for Alice.

```sh
ln-fund alice 1
```

**Checkpoint:** 100,000,000 sat

### L3 · Connect the peers

Peer connection (no money yet).

```sh
BOB=$(ln-bob getinfo | jq -r .identity_pubkey)
ln-alice connect $BOB@bob:9735
```

**Checkpoint:** bob listed as peer

### L4 · Open a 500,000 sat channel

The funding transaction enters the mempool.

```sh
ln-alice openchannel --node_key $BOB --local_amt 500000
```

**Checkpoint:** 1 pending channel

### L5 · Confirm the funding transaction

Confirmed: the channel is active.

```sh
mine 3
ln-alice listchannels
```

**Checkpoint:** capacity 500000

### L6 · The funding output is a 2-of-2

The 2-of-2 output on chain.

```sh
bitcoin-cli getrawtransaction $FUNDTX true | jq '.vout[] | {value, type: .scriptPubKey.type}'
```

**Checkpoint:** witness_v0_scripthash

### L7 · Bob invoices, Alice pays

A payment with no on-chain transaction.

```sh
INV=$(ln-bob addinvoice --amt 50000 | jq -r .payment_request)
ln-alice payinvoice --force $INV
```

**Checkpoint:** SUCCEEDED; mempool empty

### L8 · Balances moved off-chain

Only the balances inside the channel moved.

```sh
for n in alice bob; do echo "$n: $(ln-$n listchannels | jq -c '.channels[0] | {local_balance, remote_balance}')"; done
```

**Checkpoint:** bob local 50000

### L9 · Cooperative close

Both sign one closing transaction.

```sh
ln-alice closechannel --funding_txid … --output_index …
mine 6
```

**Checkpoint:** COOPERATIVE_CLOSE

### L10 · A second channel and a payment

A second channel and a payment.

```sh
ln-alice openchannel --node_key $BOB --local_amt 400000
mine 3
INV2=$(ln-bob addinvoice --amt 20000 | jq -r .payment_request)
ln-alice payinvoice --force $INV2
```

**Checkpoint:** SUCCEEDED

### L11 · Alice closes alone (force close)

Alice publishes her commitment alone.

```sh
ln-alice closechannel --force --funding_txid … --output_index …
mine 6
ln-alice pendingchannels
```

**Checkpoint:** 4 outputs; blocks_til_maturity ≈ 139

### L12 · Bob is paid at once; Alice waits

Bob was paid at once; Alice's coins return after the delay.

```sh
mine <blocks_til_maturity>
ln-alice closedchannels
```

**Checkpoint:** LOCAL_FORCE_CLOSE

## Submit

Channel ID, balance trace, funding/closing txids, and a comparison of the two close paths (who waits, why).

## What this does not show

- regtest with one implementation (LND v0.21.4): timings and channel types are implementation choices
- no watchtower or breach (old state) case is executed here

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
