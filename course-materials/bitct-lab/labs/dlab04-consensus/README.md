# DLAB 04 — Competing Histories and Reorganization

| | |
|---|---|
| Stable ID | `LAB-BTC-CONSENSUS` |
| Session | 4 |
| Time | 180 min |
| Lecture | M 2.3 |
| Network | **regtest** |

## What this experience means

- Two valid histories can exist at the same time while nodes cannot talk.
- Nodes choose the valid chain with the most cumulative work, not the first or the longest by count.
- A confirmed transaction can return to the mempool after a reorganization; it does not become invalid.

## Why this network

A reorganization needs two private miners and a network we can cut and restore. Signet's block production is controlled by its signers.

## Goal

Split two nodes, let each extend its own valid history, reconnect them and observe which chain wins and what happens to a transaction.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab04-consensus
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### C1 · One shared history

One shared history.

```sh
btc-a getpeerinfo | jq -r '.[].addr'
btc-a createwallet miner
btc-b createwallet bob
mine 101
btc-b getblockcount
btc-a getconnectioncount
```

**Checkpoint:** both at 101

### C2 · A payment T in both mempools

Payment T is known to both nodes.

```sh
BOB=$(btc-b -rpcwallet=bob getnewaddress)
T=$(btc-a -rpcwallet=miner sendtoaddress $BOB 2)
echo $T
btc-b getrawmempool
```

**Checkpoint:** T in both mempools

### C3 · Isolate node B

Cut the network.

```sh
btc-b setnetworkactive false
btc-a getconnectioncount
btc-b getnetworkinfo | jq .networkactive
```

**Checkpoint:** 0 connections

### C4 · A mines one block with T

A confirms T in block 102.

```sh
mine 1
btc-a -rpcwallet=miner gettransaction $T | jq '{confirmations}'
```

**Checkpoint:** 1 confirmation

### C5 · B mines two empty blocks

B mines two blocks without T.

```sh
BADDR=$(btc-b -rpcwallet=bob getnewaddress)
btc-b generateblock $BADDR '[]' | jq -r .hash
btc-b generateblock $BADDR '[]' | jq -r .hash
btc-b getblockcount
btc-b getrawmempool | grep -c $T
```

**Checkpoint:** B at height 103

### C6 · Two valid tips

Two different active tips.

```sh
btc-a getchaintips | jq -c '.[] | {height, status}'
btc-b getchaintips | jq -c '.[] | {height, status}'
for n in a b; do echo "$n chainwork $(btc-$n getblockheader $(btc-$n getbestblockhash) | jq -r .chainwork | sed 's/^0*//')"; done
```

**Checkpoint:** 102 on A, 103 on B

### C7 · Reconnect: the most-work chain wins

Reconnect: A switches to B's chain.

```sh
btc-b setnetworkactive true
btc-a addnode node-b:18444 onetry
btc-a getchaintips | jq -c '.[] | {height, status}'
```

**Checkpoint:** 103 active, 102 valid-fork

### C8 · T is unconfirmed again

T was un-confirmed, not cancelled.

```sh
btc-a -rpcwallet=miner gettransaction $T | jq '{confirmations}'
btc-a getrawmempool | grep -c $T
```

**Checkpoint:** 0 confirmations, back in the mempool

### C9 · Mined again on the winning branch

T is confirmed again, in a different block.

```sh
mine 1
btc-a -rpcwallet=miner gettransaction $T | jq '{confirmations, blockheight}'
```

**Checkpoint:** blockheight 104

### C10 · Worksheet: fewer blocks, more work

Worksheet: two harder blocks can outweigh three easier ones.

```sh
header work 1d00ffff 1d00ffff 1d00ffff
header work 1c7fffff 1c7fffff
```

**Checkpoint:** 2 blocks > 3 blocks in work

## Submit

Tip records before/after, the state of T at each step, and the chainwork worksheet.

## What this does not show

- regtest blocks all have the same minimal target: unequal-work races are a worksheet here
- a reorganization never makes an invalid transaction valid

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
