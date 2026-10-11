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
- Train on earlier periods, test on later ones of the same generated topology; choose K on validation only.
- A gain counts for aggregation only against the endpoint-only control; a small or negative gain is a valid result, leakage makes a fake large one.

## Why this network

No live probing: a deterministic simulator provides observations, hidden balances and labels in separate tables.

## Goal

Test whether fixed neighbour averaging with a trained logistic head beats simpler baselines and an endpoint-only control at predicting directed-edge feasibility, and diagnose leakage.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab10-graph
docker compose up -d --wait      # then open http://localhost:8888

```




## Steps

Open **http://localhost:8888** and run `dlab10-graph-learning.ipynb` top to bottom:

| Minutes | Notebook section | Evidence |
|---:|---|---|
| 20 | 1 · Observable or hidden? | feature / hidden / label classification |
| 25 | 2 · Chronological split and class balance | split table |
| 45 | 3 · Baselines, control and models on the same test periods | metric table (balanced accuracy, average precision, Brier) and calibration plot with bin counts |
| 35 | 4 · Leakage diagnosis | why each "improvement" is invalid |
| 30 | 5 · One failure case, 6 · variability across seeds | one wrong prediction explained |
| 25 | 7 · Conclusion | written conclusion with limits |

Expected shape of the results with seed 7 (balanced accuracy): training-rate constant 0.500, capacity rules
0.609 (ignoring the reserve) and 0.614 (reserve-aware), edge-only 0.754, endpoint-only control 0.760,
neighbour averaging with K = 2 and a logistic head 0.769. Most of the edge-to-graph gap is small and the part
due to aggregation (0.760 → 0.769) changes sign across seeds. The two "LEAKY" rows look better and are invalid.

Read the observation model first: the generator samples arbitrary directed channels and records their labels
directly, so this is not what one real sender could observe. The neighbour averaging has no learned weights;
a trainable GNN is an extension, not part of this lab.

## Submit

Dataset/seed, permitted features, the observation model, split boundaries, metric table with the endpoint-only control, one failure case, leakage explanation, conclusion with limits.

## What this does not show

- one synthetic simulator and topology; observations sample arbitrary channels, not what one sender could reach: no claim about the live Lightning Network
- the averaging has no learned weights: a trainable GNN is an extension, not part of this lab
- no routing improvement is shown: that needs a separate controlled routing experiment

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.
