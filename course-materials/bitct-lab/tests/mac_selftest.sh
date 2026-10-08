#!/bin/bash
# Build the course images on this computer and run every lab's student procedure.
# Usage:  bash tests/mac_selftest.sh            (from the bitct-lab folder, or any folder)
# Writes tests/out/selftest.log and one transcript per lab. Takes about 20–30 minutes.
set -u
KIT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$KIT/tests/out"
mkdir -p "$OUT"
LOG="$OUT/selftest.log"
exec > >(tee "$LOG") 2>&1
step() { echo; echo "=================== $* ($(date +%H:%M:%S))"; }

step "system"
sw_vers 2>/dev/null || cat /etc/os-release 2>/dev/null | head -2
uname -m
docker version --format 'Docker client {{.Client.Version}}, engine {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})' || { echo "Docker is not running"; exit 1; }
docker compose version
docker info --format 'CPUs {{.NCPU}}, memory {{.MemTotal}}'

step "build the course image (runtime)"
time docker buildx build --load --target runtime -t ghcr.io/davidepatti/bitct-lab:2026.10 "$KIT/image" || exit 1
step "build the graph-learning image (ml)"
time docker buildx build --load --target ml -t ghcr.io/davidepatti/bitct-lab:2026.10-ml "$KIT/image" || exit 1
docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | grep bitct-lab

step "image contents"
docker run --rm ghcr.io/davidepatti/bitct-lab:2026.10 bash -c 'cat /etc/bitct/version; bitcoind -version | head -1; lnd --version; mosquitto -h | head -1; python3 --version; pip freeze' | tee "$OUT/image-versions.txt"
docker run --rm ghcr.io/davidepatti/bitct-lab:2026.10-ml bash -c 'pip freeze' > "$OUT/image-ml-freeze.txt"

# Python for the test runner: use the host's if real, otherwise run the runner in a container
PY=""
if xcode-select -p >/dev/null 2>&1 || [ -x /opt/homebrew/bin/python3 ] || [ "$(uname)" = Linux ]; then PY=python3; fi
run_lab() {
  if [ -n "$PY" ]; then $PY "$KIT/tests/run_lab.py" "$@"
  else docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$KIT:$KIT" -w "$KIT" --add-host=host.docker.internal:host-gateway \
       docker:cli sh -c "apk add --no-cache python3 bash curl >/dev/null && python3 tests/run_lab.py $*"; fi
}

for lab in dlab00-setup dlab01-auth dlab02-transaction dlab03-structures dlab04-consensus dlab05-wallet \
           dlab06-attest dlab07-anchor dlab08-channel dlab09-routing dlab11-esp32; do
  step "lab $lab"
  run_lab "$lab"
  echo "result $lab: $?"
done

step "lab dlab10-graph (JupyterLab)"
cd "$KIT/labs/dlab10-graph"
docker compose down --volumes >/dev/null 2>&1
docker compose up -d --wait && curl -fsS -o /dev/null -w "JupyterLab answers HTTP %{http_code}\n" http://127.0.0.1:8888/lab
docker compose cp "$KIT/tests/run_notebook.py" notebook:/tmp/run_notebook.py
docker compose exec -T notebook python3 /tmp/run_notebook.py /lab/dlab10-graph-learning.ipynb | tail -25
echo "result dlab10-graph: $?"
docker compose down --volumes >/dev/null 2>&1

step "leave DLAB 11 running for the dashboard and Wokwi (public broker, group bitct-demo)"
cd "$KIT/labs/dlab11-esp32"
GROUP=bitct-demo docker compose --profile sim down --volumes >/dev/null 2>&1
GROUP=bitct-demo docker compose up -d --wait
# demo meter key used by the teacher's Wokwi demonstration (public on purpose, lab only)
GROUP=bitct-demo docker compose exec -T lab d17 enroll --enrollment 1 --pubkey 1c817fc6614a63ff11e23c3ed94aaacd097527051bad1498894c0ca66ecd7a3d
GROUP=bitct-demo docker compose ps
step "done — results: grep 'steps passed' $LOG"
grep -E "steps passed|result dlab10" "$LOG"
