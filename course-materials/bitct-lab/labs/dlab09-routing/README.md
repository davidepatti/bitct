# DLAB 09 — Routing with Hidden Liquidity

| | |
|---|---|
| Stable ID | `LAB-LN-ROUTING` |
| Session | 9 |
| Time | 180 min |
| Lecture | M 5.2 |
| Network | **regtest** |

## What this experience means

- Gossip shows capacities and fees, never balances.
- A sender learns liquidity only by trying: failures become local evidence (mission control).
- The cheapest advertised route is not always a route that can carry the payment.

## Why this network

We need a frozen four-node topology whose private balances we know as evaluators; public networks never reveal them.

## Goal

Predict a route from public gossip, watch it fail on hidden liquidity, inspect the retry, then change one condition.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab09-routing
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### R0 · Build the frozen topology

Four nodes, four channels, fixed fees (about 2 minutes).

```sh
ln-topology
```

**Checkpoint:** topology ready

### R1 · What the sender can see

Alice's public view.

```sh
lnview graph
```

**Checkpoint:** bob cheap (10 ppm), carol expensive (2000 ppm)

### R2 · Predict the route

Predicted route.

```sh
DAVE=$(ln-dave getinfo | jq -r .identity_pubkey)
ln-alice queryroutes --dest $DAVE --amt 300000
```

**Checkpoint:** via bob, 4 sat fee

### R3 · Pay 300,000 sat to Dave

Attempt, failure, retry.

```sh
INV=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV > /lab/pay1.json
lnview payment /lab/pay1.json
```

**Checkpoint:** bob route FAILED (TEMPORARY_CHANNEL_FAILURE), carol route SUCCEEDED

### R4 · The hidden state (evaluator only)

Evaluator only: the hidden balances.

```sh
lnview balances
```

**Checkpoint:** bob could send only ~96,000 to dave

### R5 · What Alice learned

What Alice remembers.

```sh
ln-alice querymc
```

**Checkpoint:** bob→dave failed at 300000

### R6 · Change one condition: Dave refills Bob's side

Change one condition: refill bob→dave.

```sh
BINV=$(ln-bob addinvoice --amt 400000 | jq -r .payment_request)
ln-dave payinvoice --force $BINV
ln-alice resetmc
```

**Checkpoint:** SUCCEEDED

### R7 · Retry the same payment

Same payment again.

```sh
INV2=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV2 > /lab/pay2.json
lnview payment /lab/pay2.json
```

**Checkpoint:** one attempt via bob, fee 4 sat

## Submit

Topology snapshot, your prediction, the attempt trace, and a short interpretation separating public graph, local feedback and hidden state.

## What this does not show

- retry and route choice are LND-specific (mission control); other implementations differ
- four nodes illustrate the mechanism; they are not a dataset (see DLAB 10)

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
