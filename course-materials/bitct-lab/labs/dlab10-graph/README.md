# DLAB 10 — Graph Learning with Hidden Liquidity

| | |
|---|---|
| Stable ID | `LAB-LN-GRAPH` |
| Session | 10 |
| Time | 180 min |
| Lecture | M 5.2 |
| Network | **none (simulation)** |

## What this experience means

- Only observable columns may enter a model; hidden balances are for evaluation.
- Train on earlier periods, test on later ones; choose settings on validation only.
- A small or negative gain is a valid scientific result; leakage makes a fake large one.

## Why this network

No live probing: a deterministic simulator provides observations, hidden balances and labels in separate tables.

## Goal

Test whether a small message-passing model beats simpler baselines at predicting directed liquidity, and diagnose leakage.

## Start

```sh
cd bitct-lab/labs/dlab10-graph
docker compose up -d --wait      # then open http://localhost:8888

```




## Steps

Open **http://localhost:8888** and run `dlab10-graph-learning.ipynb` top to bottom:

| Minutes | Notebook section | Evidence |
|---:|---|---|
| 20 | 1 · Observable or hidden? | feature / hidden / label classification |
| 25 | 2 · Chronological split and class balance | split table |
| 45 | 3 · Baselines and models on the same test periods | metric table (balanced accuracy, PR-AUC, Brier) and calibration plot |
| 35 | 4 · Leakage diagnosis | why each "improvement" is invalid |
| 30 | 5 · One failure case, 6 · variability across seeds | one wrong prediction explained |
| 25 | 7 · Conclusion | written conclusion with limits |

Expected shape of the results with seed 7: the capacity heuristic beats the majority baseline, the edge-only
model beats the heuristic, and the 2-hop message-passing model adds a small improvement that changes
from seed to seed. The two "LEAKY" rows look better and are invalid.

## Submit

Dataset/seed, permitted features, split boundaries, metric table, one failure case, leakage explanation, conclusion with limits.

## What this does not show

- one synthetic simulator and topology: no claim about the live Lightning Network
- no routing improvement is shown: that needs a separate controlled routing experiment

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```
