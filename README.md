# bitct — Bitcoin course tools and labs

Public, hands-on materials for learning Bitcoin, Lightning, and verifiable IoT data. Start a local lab, explore a transaction visually, or reconstruct historical content from the blockchain.

You do not need real bitcoin or a GitHub account to use these materials. The lab images are public and support Intel/AMD computers and Apple-silicon Macs.

## What is here?

| Collection | What you can do |
|---|---|
| [Docker lab kit](course-materials/bitct-lab/README.md) | Run Bitcoin Core, Lightning nodes, sensor experiments, and a graph-learning notebook in a reproducible local environment. |
| [Bitcoin Playground](course-materials/bitcoin-playground/README.md) | Follow the life of a transaction in an interactive, offline visual walkthrough. The portable HTML edition needs only a browser. |
| [Blockchain trivia toolkit](course-materials/bitcoin-blockchain-trivia/README.md) | Use 52 small tools to recover historical messages and other content from public chain data. The [trivia guide](course-materials/bitcoin-blockchain-trivia/trivia-guide.md) describes each example. |

## Start your first lab

1. Install Docker with Docker Compose. The DLAB 00 instructions in the lab guide below cover setup. With Docker Desktop, allow at least **4 GB of memory**; keep at least **10 GB of free disk space**.
2. [Download the course ZIP](https://github.com/davidepatti/bitct/archive/refs/heads/main.zip) and extract it. You can also use a Git clone if you prefer.
3. Open a terminal in the folder containing the extracted `bitct-main` directory, then run:

```sh
docker version
docker compose version
cd bitct-main/course-materials/bitct-lab/labs/dlab00-setup
docker compose up -d --wait
docker compose exec lab bash
```

The first start downloads the course image. Inside the lab shell, check the network:

```sh
bitcoin-cli getblockchaininfo
```

The output should contain `"chain": "regtest"`. Open `http://localhost:8080` for the read-only dashboard. Continue with the lab's README; its commands and checkpoints guide the exercise.

When finished, leave the lab shell and stop the lab:

```sh
exit
docker compose down
```

Run **one lab at a time**: stop the previous lab from its own folder before starting another, because they share the dashboard port. Stopping a lab keeps its saved data.

## Lab guide

The kit includes setup, core experiences, and extensions. Follow your instructor's selection; these folders are not a single mandatory course schedule.

| Lab | What you explore |
|---|---|
| [DLAB 00 — Setup](course-materials/bitct-lab/labs/dlab00-setup/README.md) | Docker, the lab shell, the dashboard, and your first regtest node. |
| [DLAB 01 — Signatures and addresses](course-materials/bitct-lab/labs/dlab01-auth/README.md) | Spending authorization and address encodings. |
| [DLAB 02 — Transaction lifecycle](course-materials/bitct-lab/labs/dlab02-transaction/README.md) | Two nodes, transaction relay, mining, and confirmation. |
| [DLAB 03 — Blockchain structures](course-materials/bitct-lab/labs/dlab03-structures/README.md) | Hashes, block headers, and Merkle roots. |
| [DLAB 04 — Competing histories](course-materials/bitct-lab/labs/dlab04-consensus/README.md) | Chain selection and a controlled reorganization. |
| [DLAB 05 — Wallet coordination](course-materials/bitct-lab/labs/dlab05-wallet/README.md) | Watch-only wallets and recovery. |
| [DLAB 06 — Device evidence](course-materials/bitct-lab/labs/dlab06-attest/README.md) | Signed device records in a simulation, without a blockchain. |
| [DLAB 07 — Merkle anchoring](course-materials/bitct-lab/labs/dlab07-anchor/README.md) | Commit sensor records to Bitcoin; optional Signet publication. |
| [DLAB 08 — Lightning channels](course-materials/bitct-lab/labs/dlab08-channel/README.md) | Open, use, and close channels with LND on regtest. |
| [DLAB 09 — Lightning routing](course-materials/bitct-lab/labs/dlab09-routing/README.md) | Routes, fees, and hidden liquidity with LND on regtest. |
| [DLAB 10 — Graph learning](course-materials/bitct-lab/labs/dlab10-graph/README.md) | A notebook using simulated hidden liquidity; uses the larger `-ml` image. |
| [DLAB 11 — ESP32 sensor anchoring](course-materials/bitct-lab/labs/dlab11-esp32/README.md) | A Wokwi sensor demo and Bitcoin anchoring; optional Signet publication. |
| [DLAB 12 — Spending conditions](course-materials/bitct-lab/labs/dlab12-conditions/README.md) | Multisignatures, timelocks, and Taproot on regtest. |
| [DLAB 13 — Oracles and federations](course-materials/bitct-lab/labs/dlab13-oracles/README.md) | Who must sign? Cryptographic and script teaching models on regtest, not production DLC or bridge implementations. |

## Try the tools without Docker

**Playground:** download the portable HTML file using the instructions in its collection README, then open it locally in a browser. It works offline and uses no real keys, funds, or network connections.

**Trivia:** you need a Unix-like shell, Python 3.10 or newer, and access to public blockchain data. From the repository root, try:

```sh
cd course-materials/bitcoin-blockchain-trivia/scripts
./run-trivia.sh genesis-headline
```

The toolkit uses a public API by default and can also read from Bitcoin Core. Recovered payloads are **untrusted data**: inspect them, never execute them. They are not bundled with this repository.

## Update an existing lab

Get the latest repository files first. The current images use the tags `2026.10` and `2026.10-ml`; these tags can be refreshed, so an image already in Docker's cache may be out of date. In your lab folder, run:

```sh
docker compose down
docker compose pull
docker compose up -d --wait
```

**DLAB 10 notebook updates need a fresh volume.** Export any work you want to keep, then replace the first command above with `docker compose down --volumes`. This deletes that lab's saved data. Do not use it merely to stop a lab.

## Scope and safety

Bitcoin and Lightning exercises use local **regtest**, not mainnet. Optional Signet steps use test coins. The Playground and DLAB 06/10 are teaching simulations; DLAB 13 does not implement full DLC settlement, a production federation, or BitVM.

Do not send real funds to lab addresses, reuse lab keys, or expose lab services to the internet. The public lab credentials are for this isolated teaching environment only.

## Maintenance and license

The lab kit README contains build, test, and instructor instructions. Image publication is handled by the [course image workflow](https://github.com/davidepatti/bitct/actions/workflows/bitct-lab-image.yml).

Files under `course-materials/` are curated distribution snapshots: direct edits there may be replaced by the next publication. This root README is maintained directly in this repository and is preserved by course-material publication.

Original repository code and documentation are covered by the [MIT license](LICENSE). Third-party software and any reconstructed blockchain payloads retain their respective rights.
