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
- A cooperative close is an ordinary transaction both sides sign: no delay is inherited.
- A force close publishes the latest commitment: the closer's own output waits its negotiated relative delay; in an anchor channel the peer's output needs one confirmation; each side must still sweep and confirm.

## Why this network

Opening, paying and closing need confirmations on demand, and a force-close delay that we can mine through in seconds.

## Goal

Open a channel, pay off-chain, close cooperatively, then force-close and follow each output to a confirmed sweep under the script that released it.

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

Confirmed: the channel is active on both sides.

```sh
mine 3
ln-alice listchannels | jq '.channels[] | {capacity, local_balance, remote_balance, channel_point}'
```

**Checkpoint:** capacity 500000

### L6 · The funding output is a 2-of-2

The 2-of-2 output on chain: the output type alone does not show its script.

```sh
bitcoin-cli getrawtransaction $FUNDTX true | jq -c '.vout[] | {value, type: .scriptPubKey.type}'
```

**Checkpoint:** witness_v0_scripthash

### L6a · What did the two nodes negotiate?

The channel type and the delays are negotiated per channel and per direction: read them, do not assume them. Each delay applies to a side's own output when that side publishes its commitment.

```sh
CH=$(ln-alice listchannels | jq '.channels[0]')
echo $CH | jq '{commitment_type, initiator, local_chan_reserve_sat, remote_chan_reserve_sat}'
echo $CH | jq -c '{alice_delay: .local_constraints.csv_delay, bob_delay: .remote_constraints.csv_delay}'
```

**Checkpoint:** commitment_type ANCHORS; reserves 5,000 sat; alice_delay and bob_delay (144 in this run)

### L7 · Bob invoices, Alice pays

A payment with no on-chain transaction (in this controlled run the mempool stays empty).

```sh
INV=$(ln-bob addinvoice --amt 50000 --memo 'DLAB08 coffee' | jq -r .payment_request)
echo ${INV:0:60}…
ln-alice payinvoice --force --json $INV | jq '{status, value_sat, fee_sat}'      # FAILED? wait a few seconds and pay again
echo "on-chain mempool: $(bitcoin-cli getmempoolinfo | jq .size) transactions"
```

**Checkpoint:** SUCCEEDED; mempool empty

### L8 · Balances moved off-chain

Only the balances inside the channel moved. The funder pays the commitment fee and the 330-sat anchor outputs, so the balances do not add up to the capacity.

```sh
for n in alice bob; do echo "$n: $(ln-$n listchannels | jq -c '.channels[0] | {local_balance, remote_balance}')"; done
# the 500,000 also pay for the commitment fee and two 330-sat anchor outputs
ln-alice listchannels | jq -c '.channels[0] | {capacity, local_balance, remote_balance, commit_fee}' | tee bal.json
jq 'map_values(tonumber) | .capacity - .local_balance - .remote_balance - .commit_fee' bal.json
```

**Checkpoint:** bob 50000; 660 left = 2 anchors

### L9 · Cooperative close

Both sign one closing transaction.

```sh
CP=$(ln-alice listchannels | jq -r '.channels[0].channel_point')
CLOSETX=$(ln-alice closechannel --funding_txid ${CP%:*} --output_index ${CP#*:} | jq -r .closing_txid)
echo $CLOSETX
mine 6
bitcoin-cli getrawtransaction $CLOSETX true | jq -c '.vout[] | {value, type: .scriptPubKey.type}'
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
bitcoin-cli getrawtransaction $FORCETX true | jq -c '.vout[] | {value, type: .scriptPubKey.type}'
mine 6
ln-alice pendingchannels | jq '.pending_force_closing_channels[] | {limbo_balance, maturity_height, blocks_til_maturity}'
```

**Checkpoint:** 4 outputs: two 330-sat anchors, Bob 20,000, Alice's delayed output; blocks_til_maturity ≈ 139

### L12 · Alice waits out her delay

Bob's output needs one confirmation, then his node sweeps it; Alice's own output is locked for her delay. A close-type label alone does not prove that a sweep confirmed.

```sh
ln-bob walletbalance | jq '{confirmed_balance, unconfirmed_balance}'
N=$(ln-alice pendingchannels | jq '.pending_force_closing_channels[0].blocks_til_maturity')
echo "Alice must wait $N blocks"
mine $N
# still listed in pendingchannels? mine 1 more block and check again
ln-alice closedchannels | jq -r '.channels[] | .close_type'
```

**Checkpoint:** LOCAL_FORCE_CLOSE

### L13 · What proves the funds were swept?

A close-type label is not proof of recovery: each node reports the sweep of its own output; the sweep transactions must be confirmed and the wallets show confirmed funds. Sweeping costs fees.

```sh
R='.channels[-1].resolutions[] | select(.resolution_type == "COMMIT")'
ln-alice closedchannels | jq -c "$R | {outcome, amount_sat, sweep_txid}"
ln-bob closedchannels | jq -c "$R | {outcome, amount_sat, sweep_txid}"
ASWEEP=$(ln-alice closedchannels | jq -r "$R | .sweep_txid")
BSWEEP=$(ln-bob closedchannels | jq -r "$R | .sweep_txid")
for t in $ASWEEP $BSWEEP; do bitcoin-cli getrawtransaction $t true | jq -c '{confirmations, swept_btc: .vout[0].value}'; done
for n in alice bob; do echo "$n: $(ln-$n walletbalance | jq -c '{confirmed_balance, unconfirmed_balance}')"; done
```

**Checkpoint:** CLAIMED with a sweep txid for each side; confirmations ≥ 1; unconfirmed_balance 0

### L14 · Which script did each sweep satisfy?

Each sweep reveals the script it satisfied: Alice's output (revocation key OR 144-block delay + her key) and Bob's anchor-channel output (his key + 1-block delay). The input's nSequence matches the delay.

```sh
SEL='.vin[] | select(.txid == $f)'
bitcoin-cli getrawtransaction $ASWEEP true | jq --arg f $FORCETX "$SEL" > alice-in.json
bitcoin-cli getrawtransaction $BSWEEP true | jq --arg f $FORCETX "$SEL" > bob-in.json
jq -c '{spends_output: .vout, sequence}' alice-in.json bob-in.json
bitcoin-cli decodescript $(jq -r '.txinwitness[-1]' alice-in.json) | jq -r .asm
bitcoin-cli decodescript $(jq -r '.txinwitness[-1]' bob-in.json) | jq -r .asm
```

**Checkpoint:** sequence 144 vs 1; OP_ELSE 144 OP_CHECKSEQUENCEVERIFY …; … OP_CHECKSIGVERIFY 1 OP_CHECKSEQUENCEVERIFY

## Submit

Channel type and delays (L6a), balance trace with the fee/anchor arithmetic, funding/closing/sweep txids, and a comparison of the two close paths: who waits, under which script, and what proves the funds were swept.

## What this does not show

- regtest with one implementation (LND v0.21.4): channel type, delays (144 here), reserves and fees are negotiated or implementation choices, not Lightning constants
- no revoked-state breach, watchtower or backup (SCB) recovery is executed here

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
