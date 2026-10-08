# DLAB 02 — Two Nodes and a Transaction Lifecycle

| | |
|---|---|
| Stable ID | `LAB-BTC-NETWORK + LAB-BTC-TRANSACTION` |
| Session | 2 |
| Time | 180 min |
| Lecture | M 2.1 |
| Network | **regtest** |

## What this experience means

- Nodes relay transactions (mempool) before any miner confirms them.
- A PSBT separates building, signing and broadcasting: three roles that can live on different devices.
- A failure can come from the signature (consensus) or from node policy (relay fee): different layers.

## Why this network

Confirmation must happen when we decide; regtest mines instantly and both nodes are ours. Signet is used in LAB01–LAB07 for the public experience.

## Goal

Connect two nodes, follow a payment from wallet to mempool to block, then build, sign and broadcast PSBTs for P2WPKH and P2TR outputs.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab02-transaction
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### N1 · Two empty, isolated nodes

Two fresh nodes, no peers.

```sh
btc-a getblockcount
btc-b getblockcount
btc-a getconnectioncount
```

**Checkpoint:** 0 0 0

### N2 · Connect A to B

Make them peers.

```sh
btc-a addnode node-b:18444 add
btc-a getpeerinfo | jq -r '.[].addr'
btc-b getconnectioncount
```

**Checkpoint:** node-b:18444 and 1 connection

### N3 · Wallets and 101 blocks

101 blocks: the first reward matures after 100 more.

```sh
btc-a createwallet miner
btc-b createwallet receiver
MINER=$(btc-a -rpcwallet=miner getnewaddress)
btc-a generatetoaddress 101 $MINER
btc-b getblockcount
btc-a -rpcwallet=miner getbalance
```

**Checkpoint:** both at 101, balance 50

### N4 · Send 1 BTC and watch both mempools

A payment travels through the network before it is confirmed.

```sh
RECV=$(btc-b -rpcwallet=receiver getnewaddress)
TX1=$(btc-a -rpcwallet=miner sendtoaddress $RECV 1)
echo $TX1
btc-a getrawmempool
btc-b getrawmempool      # repeat after a few seconds if empty
```

**Checkpoint:** the same txid in both mempools

### N5 · Confirm with one block

One block confirms it on both nodes.

```sh
btc-a generatetoaddress 1 $MINER
btc-b getblockcount
btc-b -rpcwallet=receiver getbalance
```

**Checkpoint:** 102 and 1.00000000

### P1 · Fund a P2WPKH output for Alice

A P2WPKH coin for Alice: this is the UTXO she will spend.

```sh
btc-a createwallet alice
A_WPKH=$(btc-a -rpcwallet=alice getnewaddress '' bech32)
FUND=$(btc-a -rpcwallet=miner sendtoaddress $A_WPKH 0.5)
mine 1
VOUT=$(btc-a -rpcwallet=alice listunspent | jq '.[0].vout')
btc-a -rpcwallet=alice listunspent | jq '.[] | {txid, vout, amount, address}'
```

**Checkpoint:** one UTXO of 0.5

### P2 · Build an unsigned PSBT

An unsigned proposal: inputs, outputs (payment + change) and fee.

```sh
DEST=$(btc-b -rpcwallet=receiver getnewaddress)
PSBT=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \
  '[{"txid":"'$FUND'","vout":'$VOUT'}]' '[{"'$DEST'":0.2}]' 0 \
  '{"add_inputs":false,"fee_rate":5}' | jq -r .psbt)
btc-a decodepsbt $PSBT | jq '{outputs: [.tx.vout[] | {value, address: .scriptPubKey.address}], fee, signatures: .inputs[0].partial_signatures}'
```

**Checkpoint:** fee 0.00000705, no signature yet

### P3 · Sign, finalize, test and broadcast

Sign, finalize, ask the node before broadcasting.

```sh
SIGNED=$(btc-a -rpcwallet=alice walletprocesspsbt $PSBT | jq -r .psbt)
RAW=$(btc-a finalizepsbt $SIGNED | jq -r .hex)
btc-a testmempoolaccept '["'$RAW'"]' | jq '.[0] | {allowed, vsize, fees: .fees.base}'
TX2=$(btc-a sendrawtransaction $RAW)
echo $TX2
```

**Checkpoint:** allowed: true, vsize 141

### P4 · Witness of a P2WPKH spend

P2WPKH witness = signature + public key.

```sh
btc-a getrawtransaction $TX2 true | jq '{vsize, weight, witness: .vin[0].txinwitness}'
```

**Checkpoint:** two witness items

### P5 · The same with a Taproot (P2TR) output

Taproot key-path spend: one 64-byte Schnorr signature, smaller vsize.

```sh
A_TR=$(btc-a -rpcwallet=alice getnewaddress '' bech32m)
FUND_TR=$(btc-a -rpcwallet=miner sendtoaddress $A_TR 0.5)
mine 1
VOUT_TR=$(btc-a -rpcwallet=alice listunspent 1 9999 '["'$A_TR'"]' | jq '.[0].vout')
PSBT_TR=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \
  '[{"txid":"'$FUND_TR'","vout":'$VOUT_TR'}]' '[{"'$DEST'":0.2}]' 0 \
  '{"add_inputs":false,"fee_rate":5}' | jq -r .psbt)
SIGNED_TR=$(btc-a -rpcwallet=alice walletprocesspsbt $PSBT_TR | jq -r .psbt)
RAW_TR=$(btc-a finalizepsbt $SIGNED_TR | jq -r .hex)
TX3=$(btc-a sendrawtransaction $RAW_TR)
btc-a getrawtransaction $TX3 true | jq '{vsize, witness: .vin[0].txinwitness}'
```

**Checkpoint:** vsize ≈ 130, one witness item

### P6 · Confirm both

Confirm both on node B.

```sh
mine 1
btc-b getrawtransaction $TX2 true | jq '{txid, confirmations}'
btc-b getrawtransaction $TX3 true | jq '{txid, confirmations}'
```

**Checkpoint:** confirmations=1

### F1 · Change a signed transaction

The signature covers the outputs.

```sh
# change one output amount after signing, then:
btc-a testmempoolaccept '["'$TAMPERED'"]'
```

**Checkpoint:** Invalid Schnorr signature (consensus)

### F2 · An unsigned PSBT cannot be finalized

An unsigned PSBT is not a transaction yet.

```sh
btc-a finalizepsbt $P
```

**Checkpoint:** complete: false

### F3 · A fee below the relay policy

Valid, but below the node's relay policy.

```sh
# a PSBT built with fee_rate 0.01 sat/vB
btc-a testmempoolaccept '["'$RL'"]'
```

**Checkpoint:** min relay fee not met (policy)

## Submit

Decoded PSBT summaries (before/after signing), txids, fee and change, the P2WPKH vs P2TR witness comparison, and the classified failures.

## What this does not show

- regtest fees and timing do not represent mainnet economics
- testmempoolaccept reports this node's policy; another node may differ

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
