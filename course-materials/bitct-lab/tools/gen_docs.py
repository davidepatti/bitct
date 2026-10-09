#!/usr/bin/env python3
"""Generate labs/<lab>/README.md and the in-container lab-help texts from tests/labmeta.py + tests/labsteps.py."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "tests"))
from labmeta import META  # noqa: E402
from labsteps import LABS, student_lines  # noqa: E402

EXTRA = {}

EXTRA["dlab11-esp32"] = """
## Before the lab: the Wokwi meter

1. Open the course Wokwi project (link on the DLAB 11 slides), or create a new **ESP32** project on
   [wokwi.com](https://wokwi.com) and replace its files with `wokwi/d17-esp32/sketch.ino`,
   `diagram.json` and `libraries.txt` from this kit.
2. In the lab shell run `d17 keygen`. Copy the **secret** into `DEVICE_SECRET_HEX` at the top of
   `sketch.ino`; set `GROUP` to the same value as `GROUP` in this folder's `.env` file.
3. Press ▶. The serial monitor prints the meter's public key, then every 15 s the exact report bytes,
   the BIP340 signature and `published reading … OK`.

Wokwi's free virtual Wi-Fi reaches the Internet but not your laptop, so the meter publishes to the public
broker `broker.hivemq.com` on topic `bitct/<GROUP>/d17/report`, and the lab's gateway subscribes to it.
Anyone can read or inject messages on a public topic: that is exactly why every reading is signed.

Keep the Wokwi tab in front while the meter runs: in a background tab the browser slows the simulator
and the broker drops the idle connection. If the serial monitor keeps printing `MQTT connect failed`,
restart the simulation; the counter continues from the new boot time (the gateway notes a gap).

## Optional: publish one root on signet (public evidence)

```sh
d17 signet address            # fund it with 2,000–5,000 signet sats (LAB02 wallet or the teacher's reserve)
d17 signet balance
d17 signet publish --batch <n>
d17 signet refresh            # after the next signet block (~10 min)
d17 receipt <id> -o /lab/public-receipt.json
d17 registry --export /lab/registry.json
```

Copy both files out with `docker compose cp lab:/lab/public-receipt.json .` (and `registry.json`) and send
them to a classmate, who runs on their own laptop:

```sh
d17 audit public-receipt.json --registry registry.json --network signet
```

The audit fetches the transaction and its Merkle proof from a public Esplora server (mempool.space):
it trusts that server for chain data unless the auditor runs a signet node.

## No Internet or no Wokwi?

`docker compose --profile sim up -d` starts a virtual D17 meter that publishes the same signed reports.
For a fully offline run set `MQTT_HOST=broker` in `.env` (local broker) before `docker compose up`.
Stop everything, including the virtual meter, with `docker compose --profile sim down`.
"""

EXTRA["dlab00-setup"] = """## Install and check Docker

Install [Docker Desktop](https://docs.docker.com/desktop/) (Windows 10/11 with WSL 2, macOS) or Docker Engine
with the Compose plugin (Linux); leave it at least 4 GB of memory and 10 GB of disk. Start it, then in a
terminal (PowerShell on Windows):

```sh
docker version
docker compose version
```

**Checkpoint:** `docker version` shows a **Server** section: the engine is running.

Get the kit: download the [course ZIP](https://github.com/davidepatti/bitct/archive/refs/heads/main.zip), unzip
it and use the folder `course-materials/bitct-lab` (one folder per lab under `labs/`).
"""

EXTRA["dlab10-graph"] = """
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
"""

EXTRA["dlab07-anchor"] = """
## Optional: publish the root on signet

```sh
signet-anchor address            # fund with a few thousand signet sats
signet-anchor publish $ROOT
signet-anchor status <txid>
```
Anyone can now look up the transaction on mempool.space/signet and check your receipt's root against it.
"""


def cmd_for(lab, st):
    """What the student does for one step: an explicit override for actions outside the lab shell
    (browser, Wokwi), otherwise exactly the lines the automated test types (minus its plumbing)."""
    meta = META[lab]["steps"].get(st["id"])
    if meta and meta[0]:
        return meta[0]
    if st.get("cmd"):
        return "\n".join(student_lines(st["cmd"]))
    return st.get("host")


def readme(lab):
    m = META[lab]
    steps = LABS.get(lab, {}).get("steps", [])
    out = [f"# {m['deck']}", "",
           f"| | |\n|---|---|\n| Stable ID | `{m['stable']}` |\n| Session | {m['session']} |\n| Time | {m['minutes']} min |\n"
           f"| Lecture | {m['lecture']} |\n| Network | **{m['network']}** |", "",
           "## What this experience means", ""] + [f"- {x}" for x in m["meaning"]] + [
           "", "## Why this network", "", m["network_why"], "", "## Goal", "", m["goal"], "",
           EXTRA[lab] if lab == "dlab00-setup" else None, "## Start", "",
           "Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: "
           "`bitct-main/course-materials/bitct-lab`), then:", "", "```sh",
           f"cd labs/{lab}",
           "docker compose up -d --wait" + ("" if lab != "dlab10-graph" else "      # then open http://localhost:8888"),
           "docker compose exec lab bash" if lab != "dlab10-graph" else "", "```", "",
           "All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as "
           "`$TX` keep their value until you `exit`." if lab != "dlab10-graph" else "", ""]
    if lab in ("dlab11-esp32",):
        out.append(EXTRA[lab])
    if steps:
        out += ["## Steps", ""]
        for st in steps:
            meta = m["steps"].get(st["id"], (None, "", ""))
            out += [f"### {st['id']} · {st['title']}", ""]
            if meta[1]:
                out += [meta[1], ""]
            c = cmd_for(lab, st)
            if c.startswith("open http"):  # a browser action, not a shell command (no 'open' on Windows)
                out += [f"In your browser, open <{c[len('open '):]}>.", ""]
            elif c.startswith("Wokwi:"):  # first line happens in Wokwi; any further lines in the lab shell
                first, _, rest = c.partition("\n")
                out += [f"In Wokwi: {' '.join(first[len('Wokwi:'):].split())}.", ""]
                if rest:
                    out += ["Then, in the lab shell:", "", "```sh", rest, "```", ""]
            else:
                out += ["```sh", c, "```", ""]
            if meta[2]:
                out += [f"**Checkpoint:** {meta[2]}", ""]
    if lab == "dlab10-graph":
        out.append(EXTRA[lab])
    if lab == "dlab07-anchor":
        out.append(EXTRA[lab])
    out += ["## Submit", "", m["submit"], "", "## What this does not show", ""] + [f"- {x}" for x in m["limits"]] + [
        "", "## Finish", "", "```sh", "exit                                  # leave the lab shell",
        "docker compose down                   # stop, keep your state",
        "docker compose down --volumes         # reset: next start is a clean lab", "```", "",
        "One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already "
        "allocated`, run `docker compose down` in the other lab's folder first.", ""]
    return "\n".join(x for x in out if x is not None)


def helptext(lab):
    m = META[lab]
    lines = [m["deck"], "=" * len(m["deck"]), m["goal"], "", f"Network: {m['network']}", "", "Steps:"]
    for st in LABS.get(lab, {}).get("steps", []):
        lines.append(f"  {st['id']:<5} {st['title']}")
    return "\n".join(lines) + "\n"


def main():
    helpdir = os.path.join(ROOT, "image", "rootfs", "etc", "bitct", "labs")
    os.makedirs(helpdir, exist_ok=True)
    for lab in META:
        d = os.path.join(ROOT, "labs", lab)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "README.md"), "w") as f:
            f.write(readme(lab))
        with open(os.path.join(helpdir, lab + ".txt"), "w") as f:
            f.write(helptext(lab))
        print("wrote", f"labs/{lab}/README.md")


if __name__ == "__main__":
    main()
