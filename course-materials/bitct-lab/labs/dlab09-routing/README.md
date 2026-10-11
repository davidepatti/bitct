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
- A sender knows its own channels; about remote liquidity it learns mainly by trying: failures become local evidence (Mission Control).
- The cheapest advertised route is not always a route that can carry the payment.

## Why this network

We need a frozen four-node topology whose private balances we know as evaluators; public networks never reveal them.

## Goal

Predict a route from public gossip, watch it fail on hidden liquidity, inspect the retry and Alice's memory, then separate two interventions: refilling liquidity and resetting memory.

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

Predicted route: compare the two hop keys with `lnview names` before paying.

```sh
DAVE=$(ln-dave getinfo | jq -r .identity_pubkey)
ln-alice queryroutes --dest $DAVE --amt 300000 | jq -c '.routes[0] | {total_fees_msat, hops: [.hops[].pub_key[0:8]]}'
lnview names
```

**Checkpoint:** 4000 msat; hops bob, dave

### R3 · Pay 300,000 sat to Dave

Attempt, failure, retry. TEMPORARY_CHANNEL_FAILURE can have several causes; it is not an exact balance measurement.

```sh
INV=$(ln-dave addinvoice --amt 300000 --memo 'DLAB09' | jq -r .payment_request)
ln-alice payinvoice --force --json $INV > /lab/pay1.json
lnview payment /lab/pay1.json
```

**Checkpoint:** bob route FAILED (TEMPORARY_CHANNEL_FAILURE), carol route SUCCEEDED, fee 601 sat

### R4 · The hidden state (evaluator only)

Evaluator only: local balances as LND reports them. A local balance is an upper bound, not the exact amount that side can send.

```sh
lnview balances
```

**Checkpoint:** bob local 96,530 toward dave (reserve 6,000)

### R5 · What Alice learned

What Alice remembers, and the probability model that turns memory into route choices.

```sh
ln-alice querymc | jq -c '.pairs[] | {from: .node_from[0:8], to: .node_to[0:8], fail_amt: .history.fail_amt_sat, success_amt: .history.success_amt_sat}'
# which probability model turns this memory into route choices?
ln-alice getmccfg | jq -c '.config | {model, half_life_seconds, hop_probability, weight}'
```

**Checkpoint:** bob→dave failed at 300000; model APRIORI, half-life 3600 s

### R6 · Two interventions: refill Bob's side, reset Alice's memory

Two interventions at once: liquidity (Dave refills Bob's side) and memory (Alice resets Mission Control).

```sh
# intervention 1 (liquidity): Dave pays Bob 400,000 sat over their channel
BINV=$(ln-bob addinvoice --amt 400000 | jq -r .payment_request)
ln-dave payinvoice --force --json $BINV | jq -r .status
# intervention 2 (memory): Alice forgets what Mission Control learned
ln-alice resetmc
lnview balances
```

**Checkpoint:** SUCCEEDED; bob local 496,530

### R7 · Retry the same payment

Same payment again. Both conditions changed, so this success cannot be attributed to either one alone.

```sh
INV2=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV2 > /lab/pay2.json
lnview payment /lab/pay2.json
```

**Checkpoint:** one attempt via bob, fee 4 sat

### R8 · Optional: fail and learn again

Optional controlled comparison, step 1: Bob's side is short again, so Alice fails and learns again.

```sh
INV3=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV3 > /lab/pay3.json
lnview payment /lab/pay3.json
```

**Checkpoint:** bob route FAILED, carol route SUCCEEDED

### R9 · Optional: refill only, memory kept

Step 2: refill Bob's side only; Alice keeps her memory.

```sh
BINV2=$(ln-bob addinvoice --amt 300000 | jq -r .payment_request)
ln-dave payinvoice --force --json $BINV2 | jq -r .status
lnview balances | grep bob–dave
ln-alice querymc | jq -c '.pairs[] | select(.history.fail_amt_sat != "0") | {from: .node_from[0:8], to: .node_to[0:8], fail_amt: .history.fail_amt_sat}'
```

**Checkpoint:** bob local 496,530 again; memory still holds the 300000 failure

### R10 · Optional: the same payment, memory kept

Step 3: the same payment with memory kept. Liquidity is back, yet Alice avoids Bob: memory, not liquidity, decided R10.

```sh
INV4=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)
ln-alice payinvoice --force --json $INV4 > /lab/pay4.json
lnview payment /lab/pay4.json
```

**Checkpoint:** one attempt via carol, fee 601 sat; no attempt via bob

## Submit

Topology snapshot, your prediction, the attempt traces (R3, R7 and, if done, R8–R10), and a short interpretation separating public graph, local feedback and hidden state, and naming which intervention changed each outcome.

## What this does not show

- retry and route choice are LND-specific (Mission Control, apriori model, 1-hour half-life); other implementations differ
- four nodes and one run illustrate the mechanism: they are not a dataset or a success-rate estimate (see DLAB 10)

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
