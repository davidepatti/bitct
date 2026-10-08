# bitct-lab — Docker lab kit for the Bitcoin course

One course image and one folder per experience. Students install only Docker; every lab
starts with `docker compose up -d --wait` and is used through a Linux shell inside the lab
(`docker compose exec lab bash`) plus a read-only dashboard at http://localhost:8080.

| Image | Contents |
|---|---|
| `ghcr.io/davidepatti/bitct-lab:2026.10` | Debian 13 slim · Bitcoin Core **31.1** · LND **v0.21.4-beta** · Mosquitto · course tools (`bip340`, `addr`, `header`, `merkle`, `hashdiff`, `d17`, `lnview`, dashboard, gateway) |
| `ghcr.io/davidepatti/bitct-lab:2026.10-ml` | the same + JupyterLab, NumPy, pandas, matplotlib (DLAB 10 only) |

Both images are published for `linux/amd64` and `linux/arm64` (Intel/AMD PCs, Apple-silicon Macs, ARM laptops).
Binaries are downloaded from bitcoincore.org and the LND GitHub release and checked against
pinned SHA-256 hashes (`image/Dockerfile`).

**Publication status (`2026-10-08`):** both tags are available from the
[public course package](https://github.com/davidepatti/bitct/pkgs/container/bitct-lab).
Anonymous downloads of every image layer were checksum-verified on both architectures.
Students do not need a GitHub account or registry login.

## Labs

| Folder | Deck | Stable ID | Network |
|---|---|---|---|
| `labs/dlab00-setup` | DLAB 00 — Setting Up the Docker Lab | LAB-SETUP | regtest |
| `labs/dlab01-auth` | DLAB 01 — Signatures and Address Encodings | LAB-BTC-AUTH | regtest |
| `labs/dlab02-transaction` | DLAB 02 — Two Nodes and a Transaction Lifecycle | LAB-BTC-NETWORK + LAB-BTC-TRANSACTION | regtest |
| `labs/dlab03-structures` | DLAB 03 — Hashes, Block Header and Merkle Root | LAB-BTC-STRUCTURES | regtest |
| `labs/dlab04-consensus` | DLAB 04 — Competing Histories and Reorganization | LAB-BTC-CONSENSUS | regtest |
| `labs/dlab05-wallet` | DLAB 05 — Watch-Only Coordination and Recovery | LAB-BTC-WALLET | regtest |
| `labs/dlab06-attest` | DLAB 06 — Device Evidence | LAB-IOT-ATTEST | none (simulation) |
| `labs/dlab07-anchor` | DLAB 07 — Sensor Records and Merkle Anchoring | LAB-INTEGRITY-ANCHOR | regtest + optional signet |
| `labs/dlab08-channel` | DLAB 08 — Lightning Channel Lifecycle | LAB-LN-CHANNEL | regtest |
| `labs/dlab09-routing` | DLAB 09 — Routing with Hidden Liquidity | LAB-LN-ROUTING | regtest |
| `labs/dlab10-graph` | DLAB 10 — Graph Learning with Hidden Liquidity | LAB-LN-GRAPH | none (simulation) |
| `labs/dlab11-esp32` | DLAB 11 — ESP32 Sensor Readings Anchored on Bitcoin | LAB-IOT-ESP32-ANCHOR (new) | regtest + optional signet |

Each folder has a `compose.yaml` and a student `README.md`. The Wokwi project is in `wokwi/d17-esp32/`.

## Student quick start

Download and extract the [course repository ZIP](https://github.com/davidepatti/bitct/archive/refs/heads/main.zip).

```sh
docker version && docker compose version     # both must answer
cd bitct-main/course-materials/bitct-lab/labs/dlab00-setup
docker compose up -d --wait                  # first time: downloads the image (~0.5 GB)
docker compose exec lab bash                 # the lab shell
bitcoin-cli getblockchaininfo                # "chain": "regtest"
exit
docker compose down --volumes                # reset
```

Only one lab at a time: run `docker compose down` in the previous lab folder first (they share port 8080).

## Teacher tasks

**Build locally** (no registry needed):

```sh
docker buildx build --load --target runtime -t ghcr.io/davidepatti/bitct-lab:2026.10 image/
docker buildx build --load --target ml      -t ghcr.io/davidepatti/bitct-lab:2026.10-ml image/
```

**Publish to GHCR**: the [image workflow](https://github.com/davidepatti/bitct/actions/workflows/bitct-lab-image.yml)
is installed at `.github/workflows/bitct-lab-image.yml` in `davidepatti/bitct` and reads
`course-materials/bitct-lab/`. Run it from the Actions tab (*Run workflow*, edition `2026.10`,
push enabled), then make the `bitct-lab` package **Public** once in its GitHub package settings.
Verify anonymous pulls of both tags before telling students the image is available.
Keep this private source kit authoritative; publish changes through the reviewed course allowlist.
To recheck an existing public image, disable *Push to ghcr.io* and enable
*Test the published image without rebuilding*. This runs the student procedures against
the registry image without changing either tag.

**Classroom without Internet**: `docker save ghcr.io/davidepatti/bitct-lab:2026.10 | gzip > bitct-lab.tar.gz`;
students run `docker load -i bitct-lab.tar.gz`.

**Test every lab** (runs each student procedure and checks every checkpoint; writes transcripts to `tests/out/`):

```sh
tests/run_all.sh                 # or: python3 tests/run_lab.py dlab08-channel
```

**Self-test with the published images** on a teacher or volunteer computer (about 15 minutes; leaves no
lab running except the DLAB 11 demo on macOS/Linux):

```sh
bash tests/mac_selftest.sh                                         # macOS or Linux
powershell -ExecutionPolicy Bypass -File tests\windows_selftest.ps1  # Windows (needs only Docker Desktop)
```

Before the course, run the Windows test once on a fresh Windows PC: `tests/WINDOWS-TEST.md` is the
one-page procedure for a colleague or a student volunteer.

**Regenerate derived files** after editing the sources:

| Edit | Then run |
|---|---|
| `tools/gen_compose.py` | `python3 tools/gen_compose.py` (all `compose.yaml`) |
| `tests/labsteps.py`, `tests/labmeta.py` | `python3 tools/gen_docs.py` (READMEs, `lab-help` texts) |
| `tools/make_notebook.py` | `python3 tools/make_notebook.py` |
| `wokwi/d17-esp32/{config.inc,bip340.*,main.inc}` | `python3 wokwi/d17-esp32/make_sketch.py` |

**Version bump** (e.g. Bitcoin Core 32.x): change `BITCOIN_VERSION` and both hashes in `image/Dockerfile`
using hashes that agree across several `guix.sigs` attestations, rebuild, run `tests/run_all.sh`, then
change the image tag in `tools/gen_compose.py` and regenerate.

## Safety rules built into the kit

* Bitcoin nodes run **regtest** on an `internal` Docker network: they cannot reach the Internet.
* Only the dashboard (and JupyterLab in DLAB 10) publish a port, bound to `127.0.0.1`.
* The RPC credential `lab/lab` is public on purpose and lives only inside the lab network.
* Signet is used only in the optional publication steps of DLAB 07 and DLAB 11, with test coins.
* `docker compose down --volumes` deletes only the current lab's containers and data.
