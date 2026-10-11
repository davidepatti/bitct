# DLAB 13 — Oracles and Federations: Who Must Sign?

| | |
|---|---|
| Stable ID | `LAB-ORACLE-FEDERATION (new)` |
| Session | additional (outside the 10-session plan) |
| Time | 180 min |
| Lecture | M 5.3 / M 5.4 |
| Network | **regtest** |

## What this experience means

- Bitcoin checks signatures and timelocks, never facts: an oracle turns a fact into a signature.
- An escrow oracle sees the contract and can collude with a player; a DLC oracle only signs the outcome and never learns who bets on it.
- A federation's 2-of-3 rule is enforced by the chain, its honesty is not. A timeout exit protects against a silent federation, not against a dishonest one.

## Why this network

Contracts that wait for an event or a timeout need blocks on demand; regtest mines them instantly. Every key and coin is local, including the oracle's.

## Goal

Settle a bet through an escrow oracle, recover the stakes when the oracle stays silent, run a DLC-style oracle (announce, attest, equivocate), and test what a 2-of-3 federation can and cannot do.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab13-oracles
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### O0 · Two players, one oracle

Alice bets on rain, Bob on dry weather; the oracle will sign the result. Each player gets 1 BTC.

```sh
for w in alice bob oracle; do bitcoin-cli createwallet $w; done
mine 101
bitcoin-cli -rpcwallet=miner sendtoaddress $(bitcoin-cli -rpcwallet=alice getnewaddress) 1
bitcoin-cli -rpcwallet=miner sendtoaddress $(bitcoin-cli -rpcwallet=bob getnewaddress) 1
mine 1
A=$(lab-key alice); B=$(lab-key bob); O=$(lab-key oracle)
echo "A=$A"; echo "B=$B"; echo "O=$O"
```

**Checkpoint:** three keys with their origins

### O1 · The bet: a 2-of-3 output

The stakes go into a 2-of-3 output: any two of Alice, Bob and the oracle can move them.

```sh
BET=$(lab-watch bet "wsh(multi(2,$A,$B,$O))")
bitcoin-cli -rpcwallet=alice sendtoaddress $BET 0.1
bitcoin-cli -rpcwallet=bob sendtoaddress $BET 0.1
mine 1
bitcoin-cli -rpcwallet=bet getbalance
```

**Checkpoint:** 0.20000000

### O2 · A refund, valid only from block H

Both players sign a refund valid only from block H. In a real contract they sign it before funding the bet, so neither can hold the other's stake hostage.

```sh
H=$(( $(bitcoin-cli getblockcount) + 12 ))
RA=$(bitcoin-cli -rpcwallet=alice getnewaddress)
RB=$(bitcoin-cli -rpcwallet=bob getnewaddress)
REFUND=$(lab-spend bet $RA $RB --locktime $H)
REFUND=$(bitcoin-cli -rpcwallet=alice walletprocesspsbt $REFUND | jq -r .psbt)
REFUND=$(bitcoin-cli -rpcwallet=bob walletprocesspsbt $REFUND | jq -r .hex)
bitcoin-cli decoderawtransaction $REFUND | jq -c '{locktime, outputs: [.vout[].value]}'
bitcoin-cli testmempoolaccept "[\"$REFUND\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** two outputs of ≈0.1; non-final

### O3 · It was dry: the oracle and Bob sign

The result is 'dry': the oracle and Bob sign the payout. Alice's signature is not needed.

```sh
PAY=$(lab-spend bet $(bitcoin-cli -rpcwallet=bob getnewaddress))
PAY=$(bitcoin-cli -rpcwallet=oracle walletprocesspsbt $PAY | jq -r .psbt)
PAY=$(bitcoin-cli -rpcwallet=bob walletprocesspsbt $PAY | jq -r .hex)
bitcoin-cli sendrawtransaction $PAY
mine 1
bitcoin-cli -rpcwallet=alice getbalance
bitcoin-cli -rpcwallet=bob getbalance
```

**Checkpoint:** Alice ≈0.8999, Bob ≈1.0999

### O4 · The refund comes too late

At block H the refund is valid in time, but its input is already spent.

```sh
mine $(( H - $(bitcoin-cli getblockcount) ))
bitcoin-cli testmempoolaccept "[\"$REFUND\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** missing-inputs

### O5 · A second bet; the oracle stays silent

A second bet with fresh keys (a new contract, a new address) and a new refund.

```sh
A2=$(lab-key alice); B2=$(lab-key bob); O2=$(lab-key oracle)
BET2=$(lab-watch bet2 "wsh(multi(2,$A2,$B2,$O2))")
bitcoin-cli -rpcwallet=alice sendtoaddress $BET2 0.1
bitcoin-cli -rpcwallet=bob sendtoaddress $BET2 0.1
mine 1
H2=$(( $(bitcoin-cli getblockcount) + 12 ))
RA2=$(bitcoin-cli -rpcwallet=alice getnewaddress)
RB2=$(bitcoin-cli -rpcwallet=bob getnewaddress)
R2=$(lab-spend bet2 $RA2 $RB2 --locktime $H2)
R2=$(bitcoin-cli -rpcwallet=alice walletprocesspsbt $R2 | jq -r .psbt)
R2=$(bitcoin-cli -rpcwallet=bob walletprocesspsbt $R2 | jq -r .hex)
bitcoin-cli testmempoolaccept "[\"$R2\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** non-final

### O6 · After H2 the refund settles it

The oracle never answers. After H2 either player broadcasts the refund.

```sh
mine 12
bitcoin-cli testmempoolaccept "[\"$R2\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli sendrawtransaction $R2
mine 1
bitcoin-cli -rpcwallet=bet2 getbalance
```

**Checkpoint:** allowed true; bet2 balance 0

### D1 · A DLC oracle announces the event

A DLC oracle commits to the event and to one nonce R. Anyone can compute the point S that each outcome will reveal; in a DLC each payout transaction is locked to one S.

```sh
dlc-oracle announce rain-catania-2026-11-02 rain dry
jq -c '{event, outcomes}' oracle/event.json
```

**Checkpoint:** S(rain) and S(dry)

### D2 · It rains: the oracle attests

It rains: the oracle publishes s, a BIP340 signature on the outcome.

```sh
dlc-oracle attest rain
```

**Checkpoint:** valid

### D3 · Which payout can be completed?

s·G equals exactly one announced point: only the 'rain' payout can be completed. The oracle never saw the contract.

```sh
dlc-oracle check
```

**Checkpoint:** = S(rain) → this payout can be completed

### D4 · An honest oracle signs once

Signing a second outcome with the same R is refused.

```sh
dlc-oracle attest dry
```

**Checkpoint:** already attested another outcome

### D5 · A cheating oracle signs both

A cheating oracle signs both outcomes. Two signatures with one nonce reveal its secret key: d = (s1 − s2)/(e1 − e2).

```sh
dlc-oracle attest dry --force
dlc-oracle extract
```

**Checkpoint:** d·G matches the oracle key P: yes

### F0 · A federation and its user

Three federation members and a user. The federation address: 2-of-3 members, or the user alone 20 blocks after a deposit. Part F reuses only the coins mined in O0.

```sh
for w in fed1 fed2 fed3 user; do bitcoin-cli createwallet $w; done
bitcoin-cli -rpcwallet=miner sendtoaddress $(bitcoin-cli -rpcwallet=user getnewaddress) 3
mine 1
F1=$(lab-key fed1); F2=$(lab-key fed2); F3=$(lab-key fed3); U=$(lab-key user)
FED=$(lab-watch fed "wsh(or_d(multi(2,$F1,$F2,$F3),and_v(v:pk($U),older(20))))")
echo $FED
```

**Checkpoint:** a bcrt1q… address

### F1 · Peg-in: the user deposits

Peg-in: the user deposits 0.5 BTC.

```sh
bitcoin-cli -rpcwallet=user sendtoaddress $FED 0.5
mine 1
bitcoin-cli -rpcwallet=fed getbalance
```

**Checkpoint:** 0.50000000

### F2 · Peg-out: two members release it

Peg-out: members 1 and 3 return the coins to the user.

```sh
P=$(lab-spend fed $(bitcoin-cli -rpcwallet=user getnewaddress))
P=$(bitcoin-cli -rpcwallet=fed1 walletprocesspsbt $P | jq -r .psbt)
P=$(bitcoin-cli -rpcwallet=fed3 walletprocesspsbt $P | jq -r .hex)
bitcoin-cli sendrawtransaction $P
mine 1
bitcoin-cli -rpcwallet=fed getbalance
bitcoin-cli -rpcwallet=user getbalance
```

**Checkpoint:** fed 0; user ≈2.9999

### F3 · Two members collude

Members 1 and 2 collude and pay themselves. The node accepts: it checks signatures, not honesty.

```sh
bitcoin-cli -rpcwallet=user sendtoaddress $FED 0.5
mine 1
P=$(lab-spend fed $(bitcoin-cli -rpcwallet=fed1 getnewaddress))
P=$(bitcoin-cli -rpcwallet=fed1 walletprocesspsbt $P | jq -r .psbt)
P=$(bitcoin-cli -rpcwallet=fed2 walletprocesspsbt $P | jq -r .hex)
bitcoin-cli testmempoolaccept "[\"$P\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli sendrawtransaction $P
mine 1
bitcoin-cli -rpcwallet=fed1 getbalance
```

**Checkpoint:** allowed true; fed1 ≈0.4999

### F4 · The federation goes silent

The federation goes silent. The user signs the exit path, too early.

```sh
bitcoin-cli -rpcwallet=user sendtoaddress $FED 0.5
mine 1
P=$(lab-spend fed $(bitcoin-cli -rpcwallet=user getnewaddress) --sequence 20)
EXIT=$(bitcoin-cli -rpcwallet=user walletprocesspsbt $P | jq -r .hex)
bitcoin-cli testmempoolaccept "[\"$EXIT\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
```

**Checkpoint:** non-BIP68-final

### F5 · Twenty confirmations later

Twenty confirmations later the exit is valid.

```sh
mine 19
bitcoin-cli testmempoolaccept "[\"$EXIT\"]" | jq -c '.[0] | {allowed, "reject-reason"}'
bitcoin-cli sendrawtransaction $EXIT
mine 1
bitcoin-cli -rpcwallet=fed getbalance
```

**Checkpoint:** allowed true; fed balance 0

## Submit

For O3, O6, F2, F3 and F5: who signed and which rule made it valid; the output of `dlc-oracle check` and `dlc-oracle extract`; one paragraph on which trust assumption each design removes and which it keeps.

## What this does not show

- dlc-oracle shows only the oracle's side: a real DLC locks each payout with adaptor signatures, built here only on paper
- dlc-oracle is teaching cryptography: not constant-time, and its secret sits in a file
- real federations (e.g. Liquid) use more members, hardware security modules and a timelocked emergency path; this is a three-key model

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
