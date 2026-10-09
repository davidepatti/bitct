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
bitcoin-cli createwallet miner
mine 1
for n in alice bob; do ln-$n getinfo | jq -c '{alias, synced_to_chain, num_active_channels, id: .identity_pubkey[0:16]}'; done
```

**Checkpoint:** 0 channels

### L2 · Give Alice on-chain coins

On-chain coins for Alice.

```sh
ln-fund alice 1 | head -1
ln-alice walletbalance | jq '{confirmed_balance}'
```

**Checkpoint:** 100,000,000 sat

### L3 · Connect the peers

Peer connection (no money yet).

```sh
BOB=$(ln-bob getinfo | jq -r .identity_pubkey)
ln-alice connect $BOB@bob:9735
ln-alice listpeers | jq -r '.peers[].address'
```

**Checkpoint:** bob listed as peer

### L4 · Open a 500,000 sat channel

The funding transaction enters the mempool.

```sh
FUNDTX=$(ln-alice openchannel --node_key $BOB --local_amt 500000 | jq -r .funding_txid)
echo $FUNDTX
bitcoin-cli getrawmempool
ln-alice pendingchannels | jq '.pending_open_channels | length'
```

**Checkpoint:** 1 pending channel

### L5 · Confirm the funding transaction

Confirmed: the channel is active.

```sh
mine 3
ln-alice listchannels | jq '.channels[] | {capacity, local_balance, remote_balance, channel_point}'
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
INV=$(ln-bob addinvoice --amt 50000 --memo 'DLAB08 coffee' | jq -r .payment_request)
echo ${INV:0:60}…
ln-alice payinvoice --force --json $INV | jq '{status, value_sat, fee_sat}'
echo "on-chain mempool: $(bitcoin-cli getmempoolinfo | jq .size) transactions"
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
CP=$(ln-alice listchannels | jq -r '.channels[0].channel_point')
CLOSETX=$(ln-alice closechannel --funding_txid ${CP%:*} --output_index ${CP#*:} | jq -r .closing_txid)
echo $CLOSETX
mine 6
bitcoin-cli getrawtransaction $CLOSETX true | jq '.vout[] | {value, type: .scriptPubKey.type}'
ln-alice closedchannels | jq '.channels[-1] | {close_type, settled_balance}'
```

**Checkpoint:** COOPERATIVE_CLOSE

### L10 · A second channel and a payment

A second channel and a payment.

```sh
ln-alice openchannel --node_key $BOB --local_amt 400000 | jq -r .funding_txid
mine 3
INV2=$(ln-bob addinvoice --amt 20000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV2 | jq -r .status      # FAILED? wait a few seconds and pay again
```

**Checkpoint:** SUCCEEDED

### L11 · Alice closes alone (force close)

Alice publishes her commitment alone.

```sh
CP2=$(ln-alice listchannels | jq -r '.channels[0].channel_point')
ln-alice closechannel --force --funding_txid ${CP2%:*} --output_index ${CP2#*:} > /dev/null
FORCETX=$(ln-alice pendingchannels | jq -r '.waiting_close_channels[0].closing_txid')
echo $FORCETX
bitcoin-cli getrawtransaction $FORCETX true | jq '[.vout[] | {value, type: .scriptPubKey.type}]'
mine 6
ln-alice pendingchannels | jq '.pending_force_closing_channels[] | {limbo_balance, maturity_height, blocks_til_maturity}'
```

**Checkpoint:** 4 outputs; blocks_til_maturity ≈ 139

### L12 · Bob is paid at once; Alice waits

Bob was paid at once; Alice's coins return after the delay.

```sh
ln-bob walletbalance | jq '{confirmed_balance, unconfirmed_balance}'
N=$(ln-alice pendingchannels | jq '.pending_force_closing_channels[0].blocks_til_maturity')
echo "Alice must wait $N blocks"
mine $N
# still listed in pendingchannels? mine 1 more block and check again
ln-alice closedchannels | jq -r '.channels[] | .close_type'
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
