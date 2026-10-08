#!/bin/bash
# Build the course images on this computer and run every lab's student procedure.
# Usage:  bash tests/mac_selftest.sh            (always start it with 'bash'; works from any folder)
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

IMG=ghcr.io/davidepatti/bitct-lab:2026.10
pull() {  # large layers are sometimes cut by the network: retry before giving up
  for i in 1 2 3; do
    docker pull "$1" && return 0
    echo "pull of $1 failed (attempt $i of 3); retrying in 10 s"; sleep 10
  done
  return 1
}
build() { time docker buildx build --load --target "$1" -t "$2" "$KIT/image"; }

step "stop labs that are still running (all labs use port 8080)"
for p in $(docker ps --format '{{.Label "com.docker.compose.project"}}' | grep '^bitct-' | sort -u); do
  echo "stopping $p"; (cd "$OUT" && docker compose -p "$p" down --remove-orphans >/dev/null 2>&1)
done

step "pull the published images (what students download)"
if pull "$IMG"; then
  docker image inspect "$IMG" --format 'published image {{index .RepoDigests 0}}  {{.Os}}/{{.Architecture}}  {{.Size}} bytes'
elif [ "${BUILD_LOCAL:-0}" = 1 ]; then
  step "build the course image locally (BUILD_LOCAL=1)"; build runtime "$IMG" || exit 1
else
  echo "Could not download $IMG. Check the network (Wi-Fi, VPN, proxy) and run the self-test again,"
  echo "or build the images on this Mac with:  BUILD_LOCAL=1 bash $0"
  exit 1
fi
HAVE_ML=1
if ! pull "$IMG-ml"; then
  if [ "${BUILD_LOCAL:-0}" = 1 ]; then
    step "build the graph-learning image locally (BUILD_LOCAL=1)"; build ml "$IMG-ml" || HAVE_ML=0
  else
    HAVE_ML=0; echo "Could not download $IMG-ml: the DLAB 10 notebook test will be skipped (the other labs do not need it)."
  fi
fi
docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | grep bitct-lab
for i in "$IMG" "$IMG-ml"; do
  docker image inspect "$i" --format "$i: {{len .RootFS.Layers}} layers, built {{.Created}}" 2>/dev/null
done

step "image contents"
docker run --rm "$IMG" bash -c 'cat /etc/bitct/version; bitcoind -version | head -1; lnd --version; mosquitto -h | head -1; python3 --version; pip freeze' | tee "$OUT/image-versions.txt"
[ "$HAVE_ML" = 1 ] && docker run --rm "$IMG-ml" bash -c 'pip freeze' > "$OUT/image-ml-freeze.txt"

# Python for the test runner: use the host's if real, otherwise run the runner in a container
PY=""
if xcode-select -p >/dev/null 2>&1 || [ -x /opt/homebrew/bin/python3 ] || [ "$(uname)" = Linux ]; then PY=python3; fi
run_lab() {
  if [ -n "$PY" ]; then $PY "$KIT/tests/run_lab.py" "$@"
  else docker run --rm -e RUNNER_IN_CONTAINER=1 -v /var/run/docker.sock:/var/run/docker.sock -v "$KIT:$KIT" -w "$KIT" \
       docker:cli sh -c "apk add --no-cache python3 bash curl >/dev/null && python3 tests/run_lab.py $*"; fi
}

for lab in dlab00-setup dlab01-auth dlab02-transaction dlab03-structures dlab04-consensus dlab05-wallet \
           dlab06-attest dlab07-anchor dlab08-channel dlab09-routing dlab11-esp32; do
  step "lab $lab"
  run_lab "$lab"
  echo "result $lab: $?"
done

if [ "$HAVE_ML" = 1 ]; then
  step "lab dlab10-graph (JupyterLab)"
  cd "$KIT/labs/dlab10-graph"
  docker compose down --volumes >/dev/null 2>&1
  docker compose up -d --wait && curl -fsS -o /dev/null -w "JupyterLab answers HTTP %{http_code}\n" http://127.0.0.1:8888/lab
  docker compose cp "$KIT/tests/run_notebook.py" notebook:/tmp/run_notebook.py
  docker compose exec -T notebook python3 /tmp/run_notebook.py /lab/dlab10-graph-learning.ipynb | tail -25
  echo "result dlab10-graph: ${PIPESTATUS[0]}"
  docker compose down --volumes >/dev/null 2>&1
else
  step "lab dlab10-graph skipped (no -ml image)"
fi

step "leave DLAB 11 running for the dashboard and Wokwi (public broker, group bitct-demo)"
cd "$KIT/labs/dlab11-esp32"
GROUP=bitct-demo docker compose --profile sim down --volumes >/dev/null 2>&1
GROUP=bitct-demo docker compose up -d --wait
# demo meter key used by the teacher's Wokwi demonstration (public on purpose, lab only)
GROUP=bitct-demo docker compose exec -T lab d17 enroll --enrollment 1 --pubkey 1c817fc6614a63ff11e23c3ed94aaacd097527051bad1498894c0ca66ecd7a3d
GROUP=bitct-demo docker compose ps
step "done — results: grep 'steps passed' $LOG"
grep -E "steps passed|^result " "$LOG"   # result 0 = passed; any other number = look at that lab above
