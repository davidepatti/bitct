# DLAB 00 — Setting Up the Docker Lab

| | |
|---|---|
| Stable ID | `LAB-SETUP` |
| Session | before the first Docker lab (at home) |
| Time | 30–45 min |
| Lecture | all Docker labs |
| Network | **regtest** |

## What this experience means

- Every Docker lab uses the same course image: Bitcoin Core, LND and the course tools are already inside.
- Your laptop only runs Docker; nothing else is installed or changed.
- Each lab folder is a small, disposable network of containers that you can reset at any time.

## Why this network

A private regtest chain starts at block 0 on your laptop, mines blocks on demand and is deleted by a reset.

## Goal

Install Docker, start the course image once, open the lab shell and the dashboard, and practise stop/reset.

## Start

```sh
cd bitct-lab/labs/dlab00-setup
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### S1 · The node runs regtest

Ask the node which chain it follows.

```sh
bitcoin-cli getblockchaininfo
```

**Checkpoint:** "chain": "regtest", "blocks": 0

### S2 · Mine one block

Create a block on demand: only possible on regtest.

```sh
mine 1
```

**Checkpoint:** height now 1

### S3 · Status line

One line per node of the running lab.

```sh
lab-status
```

**Checkpoint:** node-a chain=regtest height=1

### S4 · Dashboard answers

The dashboard shows the same chain in your browser.

```sh
open http://localhost:8080
```

**Checkpoint:** block height 1 on the Overview page

## Submit

Nothing to submit: show the dashboard with height 1 to the teacher at the start of the first lab.

## What this does not show

- regtest coins have no value and exist only on your computer
- the lab RPC password is public on purpose; never reuse it

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```
