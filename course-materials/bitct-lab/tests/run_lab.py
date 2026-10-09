#!/usr/bin/env python3
"""Run a lab's student procedure non-interactively and check every checkpoint.

    python3 tests/run_lab.py dlab02-transaction [--keep] [--no-reset]

Each step is the exact text a student types in the lab shell
(`docker compose exec lab bash`). Shell variables persist between steps, as in
an interactive shell. Transcripts are written to tests/out/<lab>/transcript.json
and reused for the slide screenshots.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from labsteps import LABS  # noqa: E402

VARS = "/lab/.labvars"


def sh(args, cwd, check=True, capture=True, timeout=900):
    r = subprocess.run(args, cwd=cwd, text=True, capture_output=capture, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed:\n{r.stdout}\n{r.stderr}")
    return r


def run_step(labdir, service, cmd, timeout=600, ci=""):
    # One step = one fresh `bash`, so the variables a step creates and its working directory are saved
    # to VARS and restored by the next step: the runner behaves like one student shell. `ci` lines run
    # before the step, unechoed (they stand in for actions outside the shell, e.g. Wokwi).
    pre = ("{ " + ci.replace("\n", "; ") + "; } >/dev/null 2>&1; ") if ci else ""
    script = (f"set -o pipefail; [ -f {VARS} ] && source {VARS}; export FORCE_COLOR=; "
              f"__before=$(compgen -v | sort); {pre}set -v; source /tmp/step.sh 2>&1; __rc=$?; set +v; "
              f"__names=$({{ comm -13 <(echo \"$__before\") <(compgen -v | sort); cat {VARS}.names 2>/dev/null; }} | sort -u "
              f"| grep -vE '^(__.*|BASH.*|_|PIPESTATUS|FUNCNAME|COLUMNS|LINES|OLDPWD)$'); echo \"$__names\" > {VARS}.names; "
              f"{{ for v in $__names; do declare -p $v 2>/dev/null; done; printf 'cd %q\\n' \"$PWD\"; }} > {VARS}; exit $__rc")
    subprocess.run(["docker", "compose", "exec", "-T", service, "bash", "-c", "cat > /tmp/step.sh"], cwd=labdir,
                   input=cmd + "\n", text=True, capture_output=True, timeout=60)
    t0 = time.time()
    r = subprocess.run(["docker", "compose", "exec", "-T", service, "bash", "-c", script], cwd=labdir,
                       text=True, capture_output=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr), time.time() - t0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("lab")
    p.add_argument("--keep", action="store_true", help="leave the lab running")
    p.add_argument("--no-reset", action="store_true", help="do not reset before starting")
    p.add_argument("--only", help="comma-separated step ids to run (after reset)")
    p.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                   help="override an environment value of the lab spec (e.g. BATCH_SECONDS=60)")
    p.add_argument("--tag", help="write the transcript to tests/out/<lab>-<tag> instead of tests/out/<lab>")
    a = p.parse_args()
    spec = LABS[a.lab]
    env = dict(spec.get("env", {}))
    env.update(kv.split("=", 1) for kv in a.set)
    os.environ.update(env)
    for k, v in env.items():
        print(f"   env {k}={v}")
    labdir = os.path.join(ROOT, "labs", a.lab)
    outdir = os.path.join(HERE, "out", a.lab + (f"-{a.tag}" if a.tag else ""))
    os.makedirs(outdir, exist_ok=True)
    env_note = ""
    if not a.no_reset:
        sh(["docker", "compose", "--profile", "*", "down", "--volumes", "--remove-orphans"], labdir, check=False)
        t0 = time.time()
        r = sh(["docker", "compose", "up", "-d", "--wait"] + spec.get("up_args", []), labdir, check=False, timeout=900)
        if r.returncode != 0:
            print(r.stdout, r.stderr)
            sh(["docker", "compose", "logs", "--tail", "40"], labdir, check=False, capture=False)
            if not a.keep:  # do not leave half a lab holding ports and memory for the next one
                sh(["docker", "compose", "--profile", "*", "down", "--volumes", "--remove-orphans"], labdir, check=False)
            sys.exit("lab did not start")
        env_note = f"started in {time.time() - t0:.0f}s"
        print(f"== {a.lab}: {env_note}")
        sh(["docker", "compose", "exec", "-T", "lab", "bash", "-c", f"rm -f {VARS} {VARS}.names"], labdir, check=False)
    transcript, failures = [], 0
    for st in spec["steps"]:
        if a.only and st["id"] not in a.only.split(","):
            continue
        if st.get("host"):
            hcmd = st["host"]
            if os.environ.get("RUNNER_IN_CONTAINER"):
                # In a helper container (Windows self-test) 127.0.0.1 is the helper itself: ask the
                # dashboard container instead. The published port is checked from the host by the caller.
                hcmd = hcmd.replace("curl -fsS http://127.0.0.1:${DASHBOARD_PORT:-8080}",
                                    "docker compose exec -T dashboard curl -fsS http://127.0.0.1:8080")
            t0 = time.time()
            r = subprocess.run(hcmd, cwd=labdir, shell=True, text=True, capture_output=True, timeout=900)
            rc, out, dt = r.returncode, r.stdout + r.stderr, time.time() - t0
        else:
            rc, out, dt = run_step(labdir, st.get("service", "lab"), st["cmd"], st.get("timeout", 600), st.get("ci", ""))
        ok = (rc == 0) == (not st.get("fails", False))
        for pat in st.get("expect", []):
            if not re.search(pat, out, re.M):
                ok = False
                out += f"\n[checker] expected pattern not found: {pat}"
        for pat in st.get("absent", []):
            if re.search(pat, out, re.M):
                ok = False
                out += f"\n[checker] unexpected pattern found: {pat}"
        failures += not ok
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {st['id']:<6} {st['title']} ({dt:.1f}s)")
        if not ok or os.environ.get("VERBOSE"):
            print("      " + out.strip().replace("\n", "\n      ")[:4000])
        transcript.append({"id": st["id"], "title": st["title"], "cmd": st.get("cmd", st.get("host")),
                           "show": st.get("show", st.get("cmd", st.get("host"))), "output": out, "rc": rc,
                           "ok": ok, "seconds": round(dt, 1)})
        if st.get("sleep"):
            time.sleep(st["sleep"])
    with open(os.path.join(outdir, "transcript.json"), "w") as f:
        json.dump({"lab": a.lab, "note": env_note, "when": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": transcript}, f, indent=1)
    if not a.keep:
        sh(["docker", "compose", "--profile", "*", "down", "--volumes", "--remove-orphans"], labdir, check=False)
    print(f"== {a.lab}: {len(transcript) - failures}/{len(transcript)} steps passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
