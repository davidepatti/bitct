# DLAB 05 — Watch-Only Coordination and Recovery

| | |
|---|---|
| Stable ID | `LAB-BTC-WALLET` |
| Session | 5 |
| Time | 180 min |
| Lecture | M 3.1 |
| Network | **regtest** |

## What this experience means

- Public descriptors let a coordinator see funds and build transactions without any private key.
- An offline signer approves a PSBT without network access or chain data.
- A backup is complete only if it restores both keys and the derivation paths that found the coins.

## Why this network

Recovery tests need a wallet history we create and can reset; the signer is an offline regtest node.

## Goal

Separate watching from signing with descriptors and PSBTs, then compare a complete and an incomplete backup.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab05-wallet
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### W1 · The signer is offline

Node B never talks to the network.

```sh
btc-b getnetworkinfo | jq '{networkactive, connections}'
btc-b getblockcount
btc-b createwallet signer
```

**Checkpoint:** networkactive false, height 0

### W2 · Export public descriptors

Public descriptors: xpub + derivation path, receive /0/* and change /1/*.

```sh
btc-b -rpcwallet=signer listdescriptors | jq -r '.descriptors[] | select(.desc|startswith("wpkh(")) | .desc'
```

**Checkpoint:** wpkh([fingerprint/84h/1h/0h]tpub…/0/*)

### W3 · Import them into a watch-only wallet

The coordinator imports only public information.

```sh
btc-a -named createwallet wallet_name=watch disable_private_keys=true blank=true
DESCS=$(btc-b -rpcwallet=signer listdescriptors | jq -c '[.descriptors[] | select(.desc|startswith("wpkh(")) | {desc, active: true, internal, timestamp: "now", range: [0,999]}]')
btc-a -rpcwallet=watch importdescriptors "$DESCS" | jq -c '[.[].success]'
```

**Checkpoint:** [true, true]

### W4 · Same addresses on both sides

Both compute the same address.

```sh
W=$(btc-a -rpcwallet=watch getnewaddress); S=$(btc-b -rpcwallet=signer getnewaddress)
echo "watch:  $W"; echo "signer: $S"; [ "$W" = "$S" ] && echo SAME
```

**Checkpoint:** SAME

### W5 · Fund the watched address

The coordinator sees the funds; the signer cannot (no chain).

```sh
btc-a createwallet miner
mine 101
btc-a -rpcwallet=miner sendtoaddress $W 1
mine 1
btc-a -rpcwallet=watch getbalance; btc-b -rpcwallet=signer getbalance
```

**Checkpoint:** 1.0 vs 0.0

### W6 · The coordinator cannot sign

Build the PSBT where the chain is known.

```sh
DEST=$(btc-a -rpcwallet=miner getnewaddress)
PSBT=$(btc-a -rpcwallet=watch walletcreatefundedpsbt '[]' '[{"'$DEST'":0.3}]' 0 '{"fee_rate":5}' | jq -r .psbt)
btc-a -rpcwallet=watch walletprocesspsbt $PSBT | jq '{complete}'
```

**Checkpoint:** complete: false

### W7 · The offline signer signs

Sign where the keys are.

```sh
SIGNED=$(btc-b -rpcwallet=signer walletprocesspsbt $PSBT | jq -r .psbt)
btc-a decodepsbt $SIGNED | jq '.inputs[0] | has("final_scriptwitness")'
btc-b getblockcount
```

**Checkpoint:** final witness present, signer height still 0

### W8 · Broadcast from the coordinator

Broadcast from the online side.

```sh
TX=$(btc-a sendrawtransaction $(btc-a finalizepsbt $SIGNED | jq -r .hex))
mine 1
btc-a -rpcwallet=watch getbalance
```

**Checkpoint:** watch balance ≈ 0.6999

### W9 · Restore from the complete backup

Restore keys + both descriptors into a clean wallet.

```sh
FULL=$(btc-b -rpcwallet=signer listdescriptors true | jq -c '[.descriptors[] | select(.desc|startswith("wpkh(")) | {desc, active: true, internal, timestamp: 0, range: [0,999]}]')
btc-a -named createwallet wallet_name=restored blank=true
btc-a -rpcwallet=restored importdescriptors "$FULL" | jq -c '[.[].success]'
btc-a -rpcwallet=restored getbalance; btc-a -rpcwallet=restored listtransactions | jq length
```

**Checkpoint:** balance ≈ 0.6999

### W10 · Restore from an incomplete backup

Restore without the change descriptor.

```sh
PART=$(echo "$FULL" | jq -c '[.[] | select(.internal == false)]')
btc-a -named createwallet wallet_name=partial blank=true
btc-a -rpcwallet=partial importdescriptors "$PART" | jq -c '[.[].success]'
btc-a -rpcwallet=partial getbalance
```

**Checkpoint:** balance 0.00000000: the change is invisible

## Submit

Role diagram (who holds what), a sanitized PSBT trace, and the complete-versus-incomplete recovery comparison.

## What this does not show

- the lab descriptors are regtest test keys
- real hardware signers add display verification and key protection that a regtest node does not

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
