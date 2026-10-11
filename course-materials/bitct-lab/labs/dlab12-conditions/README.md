# DLAB 12 — Spending Conditions: Multisig, Timelocks, Taproot

| | |
|---|---|
| Stable ID | `LAB-BTC-CONDITIONS (new)` |
| Session | additional (outside the 10-session plan) |
| Time | 150 min |
| Lecture | M 2.1 / M 3.1 |
| Network | **regtest** |

## What this experience means

- A locking script states who must sign and when; a descriptor writes it in a form that wallets can share.
- Every node checks timelocks: a transaction spent too early is not valid yet, whoever signed it.
- Taproot hides unused conditions: a key-path spend looks like a single-key payment; a script-path spend reveals only the branch used.

## Why this network

Timelocks count blocks: regtest mines the 5 or 10 blocks a condition needs in a second, where signet would take hours. All keys and coins stay on your laptop.

## Goal

Lock coins under four conditions written as descriptors (2-of-3, a relative timelock, an absolute timelock, a Taproot tree), try every spending path, and read what the chain enforces and what each spend reveals.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab12-conditions
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### K1 · Three keyholders

Three people, three wallets. Each shares one public key with its origin: the wallet fingerprint and derivation path that let a signer find the private key.

```sh
for w in alice bob carol; do bitcoin-cli createwallet $w; done
mine 101
A=$(lab-key alice); B=$(lab-key bob); C=$(lab-key carol)
echo "A=$A"; echo "B=$B"; echo "C=$C"
DEST=$(bitcoin-cli -rpcwallet=carol getnewaddress)
```

**Checkpoint:** A=[fingerprint/84h/1h/0h/0/0]02… (or 03…)

### M1 · A 2-of-3 output

`lab-watch` creates a watch-only wallet for one descriptor: it tracks the output and builds transactions, but holds no private key.

```sh
SHARED=$(lab-watch shared "wsh(multi(2,$A,$B,$C))")
echo $SHARED
INFO=$(bitcoin-cli -rpcwallet=shared getaddressinfo $SHARED)
echo $INFO | jq -c '{script, sigsrequired, pubkeys: (.pubkeys | length)}'
bitcoin-cli decodescript $(echo $INFO | jq -r .hex) | jq -r .asm
```

**Checkpoint:** multisig, 2 of 3; asm `2 <A> <B> <C> 3 OP_CHECKMULTISIG`

### M2 · Fund it

Pay 1 BTC into the 2-of-3 output.

```sh
bitcoin-cli -rpcwallet=miner sendtoaddress $SHARED 1
mine 1
bitcoin-cli -rpcwallet=shared getbalance
```

**Checkpoint:** 1.00000000

### M3 · One signature is not enough

`lab-spend` builds an unsigned PSBT that sends everything to `$DEST`. Alice signs; the PSBT still waits for one more signer, Bob or Carol.

```sh
PSBT=$(lab-spend shared $DEST)
PSBT=$(bitcoin-cli -rpcwallet=alice walletprocesspsbt $PSBT | jq -r .psbt)
bitcoin-cli analyzepsbt $PSBT | jq -c '{next, missing: .inputs[0].missing}'
```

**Checkpoint:** next: signer; two candidate keys missing

### M4 · Bob adds the second signature

Bob's signature completes the input. The witness holds an empty item (CHECKMULTISIG consumes one extra element), two signatures and the whole 105-byte script.

```sh
PSBT=$(bitcoin-cli -rpcwallet=bob walletprocesspsbt $PSBT | jq -r .psbt)
TX=$(bitcoin-cli finalizepsbt $PSBT | jq -r .hex)
bitcoin-cli decoderawtransaction $TX > tx.json
jq -c '.vin[0] | {sequence, witness: [.txinwitness[] | length / 2]}' tx.json
bitcoin-cli sendrawtransaction $TX
mine 1
bitcoin-cli -rpcwallet=shared getbalance
```

**Checkpoint:** witness [0,71,71,105] (a signature can be 70–72 bytes); shared balance 0

### T1 · A vault: Alice now, Carol after 10 blocks

A vault: Alice spends at any time; Carol, the recovery key, only 10 blocks after the coin confirms. Read the script that every spender must reveal.

```sh
VAULT=$(lab-watch vault "wsh(or_d(pk($A),and_v(v:pk($C),older(10))))")
HEX=$(bitcoin-cli -rpcwallet=vault getaddressinfo $VAULT | jq -r .hex)
bitcoin-cli decodescript $HEX | jq -r .asm
bitcoin-cli -rpcwallet=miner sendtoaddress $VAULT 1
mine 1
bitcoin-cli -rpcwallet=vault getbalance
```

**Checkpoint:** `… OP_CHECKSIG OP_IFDUP OP_NOTIF … OP_CHECKSIGVERIFY 10 OP_CHECKSEQUENCEVERIFY OP_ENDIF`; 1.00000000

### T2 · Alice spends at once

Alice's branch: no waiting. `testmempoolaccept` asks the node whether it would accept the transaction, without broadcasting it.

```sh
P=$(lab-spend vault $DEST)
P=$(bitcoin-cli -rpcwallet=alice walletprocesspsbt $P | jq -r .psbt)
TXA=$(bitcoin-cli finalizepsbt $P | jq -r .hex)
bitcoin-cli testmempoolaccept "[\"$TXA\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli decoderawtransaction $TXA > tx.json
jq -c '.vin[0] | {sequence, witness: [.txinwitness[] | length / 2]}' tx.json
```

**Checkpoint:** allowed true; witness [71,75]

### T3 · Carol signs a normal transaction

A normal transaction has nSequence 0xfffffffd. Carol's branch needs nSequence ≥ 10, so her signature cannot complete it.

```sh
P=$(lab-spend vault $DEST)
bitcoin-cli -rpcwallet=carol walletprocesspsbt $P | jq -c '{complete}'
```

**Checkpoint:** complete: false

### T4 · Carol sets nSequence = 10, too early

With nSequence = 10 Carol's transaction is complete, but the coin has only one confirmation.

```sh
P=$(lab-spend vault $DEST --sequence 10)
P=$(bitcoin-cli -rpcwallet=carol walletprocesspsbt $P | jq -r .psbt)
TXC=$(bitcoin-cli finalizepsbt $P | jq -r .hex)
bitcoin-cli -rpcwallet=vault listunspent | jq '.[0].confirmations'
bitcoin-cli testmempoolaccept "[\"$TXC\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** 1 confirmation; non-BIP68-final

### T5 · Ten confirmations later

Nine more blocks make ten confirmations. Carol's witness reveals the whole script, Alice's unused key included. Once Carol's transaction confirms, Alice's earlier one spends a coin that no longer exists.

```sh
mine 9
bitcoin-cli -rpcwallet=vault listunspent | jq '.[0].confirmations'
bitcoin-cli testmempoolaccept "[\"$TXC\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli decoderawtransaction $TXC > tx.json
jq -c '.vin[0] | {sequence, witness: [.txinwitness[] | length / 2]}' tx.json
bitcoin-cli sendrawtransaction $TXC
mine 1
bitcoin-cli testmempoolaccept "[\"$TXA\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** allowed true; sequence 10, witness [71,0,75]; then missing-inputs

### L1 · An absolute timelock: Bob from block H

An absolute timelock: Bob, not before block H. The transaction carries nLockTime = H.

```sh
H=$(( $(bitcoin-cli getblockcount) + 5 ))
LOCK=$(lab-watch lock "wsh(and_v(v:pk($B),after($H)))")
bitcoin-cli -rpcwallet=miner sendtoaddress $LOCK 1
mine 1
P=$(lab-spend lock $DEST --locktime $H)
P=$(bitcoin-cli -rpcwallet=bob walletprocesspsbt $P | jq -r .psbt)
TXL=$(bitcoin-cli finalizepsbt $P | jq -r .hex)
echo "height $(bitcoin-cli getblockcount), H = $H"
bitcoin-cli testmempoolaccept "[\"$TXL\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** non-final

### L2 · At height H

At height H the same signed transaction becomes valid.

```sh
mine $(( H - $(bitcoin-cli getblockcount) ))
bitcoin-cli testmempoolaccept "[\"$TXL\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli decoderawtransaction $TXL | jq -c '{locktime, sequence: .vin[0].sequence}'
```

**Checkpoint:** allowed true; locktime = H

### P1 · A Taproot output with a hidden branch

A Taproot output: Alice's key is the key path; Carol-after-10-blocks is a script leaf hidden in the output key.

```sh
TAP=$(lab-watch tap "tr($A,and_v(v:pk($C),older(10)))")
echo $TAP
bitcoin-cli -rpcwallet=miner sendtoaddress $TAP 1
mine 1
bitcoin-cli -rpcwallet=tap getbalance
```

**Checkpoint:** a bcrt1p… address; 1.00000000

### P2 · Key path: Alice alone

Key path: a single 64-byte Schnorr signature. Nothing shows that another branch exists.

```sh
P=$(lab-spend tap $DEST)
P=$(bitcoin-cli -rpcwallet=alice walletprocesspsbt $P | jq -r .psbt)
TXK=$(bitcoin-cli finalizepsbt $P | jq -r .hex)
bitcoin-cli testmempoolaccept "[\"$TXK\"]" | jq -c '.[0] | {allowed, vsize}'
bitcoin-cli decoderawtransaction $TXK > tx.json
jq -c '.vin[0] | {sequence, witness: [.txinwitness[] | length / 2]}' tx.json
```

**Checkpoint:** allowed true, vsize 99; witness [64]

### P3 · Script path: Carol after 10 blocks

Script path: Carol's signature, the leaf script and a 33-byte control block (the internal key; no Merkle path because there is one leaf). Only the leaf used is revealed.

```sh
P=$(lab-spend tap $DEST --sequence 10)
P=$(bitcoin-cli -rpcwallet=carol walletprocesspsbt $P | jq -r .psbt)
TXS=$(bitcoin-cli finalizepsbt $P | jq -r .hex)
mine 9
bitcoin-cli testmempoolaccept "[\"$TXS\"]" | jq -c '.[0] | {allowed, vsize}'
bitcoin-cli decoderawtransaction $TXS > tx.json
jq -c '.vin[0] | {sequence, witness: [.txinwitness[] | length / 2]}' tx.json
bitcoin-cli decodescript $(jq -r '.vin[0].txinwitness[1]' tx.json) | jq -r .asm
```

**Checkpoint:** allowed true, vsize 117; witness [64,36,33]; `<C> OP_CHECKSIGVERIFY 10 OP_CHECKSEQUENCEVERIFY`

## Submit

A table of the spends (M4, T2, T5, L2, P2, P3): path, signer(s), from when it is valid, witness sizes, what it reveals; the analyzepsbt output of M3; and three lines on which conditions the chain enforced.

## What this does not show

- regtest keys and coins: never reuse these descriptors with real funds
- a timelock limits when coins can move, not who holds the keys: a stolen recovery key still works after the delay
- a real vault also needs a way to claw back a theft (pre-signed transactions, or covenant proposals such as BIP 345); this script only delays the recovery key

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
